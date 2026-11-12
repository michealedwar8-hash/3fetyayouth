import crypto from 'crypto';

const ONESIGNAL_APP_ID = "195c5a47-9662-45ce-886a-e048636af0c1";

// Permanent VAPID Keypair for Web Push (RFC 8291 / RFC 8292)
const VAPID_PUBLIC_KEY = "BGbv4i2BfU6a-nfOd49_-ykPhchNeGSvSHLNSxt6PhyY2jZNlpsWkUETRyNsm7bSmrOMk5o883cDsqy1aifX6Cw";
const VAPID_PRIVATE_KEY = "E3c1O9xSYx9GW4-Wa0F7R7AO8Wl4n7KMoTdeMuk1_XY";
const VAPID_SUBJECT = "mailto:threeyouths2025@gmail.com";

// Cloud Sync Hubs via OneSignal Identity Records (onesignal_id works without secret REST key)
const VAPID_HUB_V1_EXT_ID = "three_youths_vapid_hub_v1";
const VAPID_HUB_V1_OS_ID = "01c6acdf-fea8-41e0-9f7a-82864c4a51ff";
const VAPID_HUB_V2_EXT_ID = "three_youths_vapid_hub_v2";
const VAPID_HUB_V2_OS_ID = "ce2eaa41-8db7-494e-a8b8-438ab5588354";
const ANNOUNCEMENTS_HUB_EXT_ID = "three_youths_announcements_hub_v1";
const ANNOUNCEMENTS_HUB_OS_ID = "2066d63c-d32e-44ec-8ee4-2ce445c79c38";

// 0ms In-Memory Live Hub Cache (shared across requests in the running Node server)
const g = globalThis;
if (!g.__THREE_YOUTHS_LIVE_HUB__) {
  g.__THREE_YOUTHS_LIVE_HUB__ = {
    announcementsById: new Map(),
    deletedIds: new Set(),
    viewersById: new Map(),
    imageChunksByKey: new Map(),
    vapidSubsByHash: new Map(),
    lastCloudHydrateMs: 0,
    hydratingPromise: null,
  };
}
const liveHub = g.__THREE_YOUTHS_LIVE_HUB__;

function b64UrlDecode(str) {
  let b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function b64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createVapidJwt(audience) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: VAPID_SUBJECT,
  };
  const unsignedToken = `${b64UrlEncode(JSON.stringify(header))}.${b64UrlEncode(JSON.stringify(payload))}`;
  const pubBytes = b64UrlDecode(VAPID_PUBLIC_KEY);
  const x = b64UrlEncode(pubBytes.subarray(1, 33));
  const y = b64UrlEncode(pubBytes.subarray(33, 65));
  const privKey = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d: VAPID_PRIVATE_KEY },
    format: 'jwk',
  });
  const sig = crypto.sign('sha256', Buffer.from(unsignedToken, 'utf8'), {
    key: privKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsignedToken}.${b64UrlEncode(sig)}`;
}

function hkdfExtract(salt, ikm) {
  const key = salt && salt.length > 0 ? salt : Buffer.alloc(32, 0);
  return crypto.createHmac('sha256', key).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  const hmac = crypto.createHmac('sha256', prk);
  hmac.update(info);
  hmac.update(Buffer.from([1]));
  return hmac.digest().subarray(0, length);
}

function encryptWebPushAes128Gcm(payloadString, clientPublicKeyB64, clientAuthB64) {
  const clientPublicKey = b64UrlDecode(clientPublicKeyB64);
  const userAuth = b64UrlDecode(clientAuthB64);

  const serverECDH = crypto.createECDH('prime256v1');
  const serverPublicKey = serverECDH.generateKeys();
  const sharedSecret = serverECDH.computeSecret(clientPublicKey);

  const salt = crypto.randomBytes(16);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    clientPublicKey,
    serverPublicKey,
  ]);
  const prkKey = hkdfExtract(userAuth, sharedSecret);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const prk = hkdfExtract(salt, ikm);
  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'ascii');
  const cek = hkdfExpand(prk, cekInfo, 16);

  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'ascii');
  const nonce = hkdfExpand(prk, nonceInfo, 12);

  const plaintext = Buffer.concat([
    Buffer.from(payloadString, 'utf8'),
    Buffer.from([2]),
  ]);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const keyIdLen = Buffer.from([serverPublicKey.length]);
  const header = Buffer.concat([salt, recordSize, keyIdLen, serverPublicKey]);

  return Buffer.concat([header, encrypted, authTag]);
}

async function sendWebPushToSub(sub, payloadObj, urgency = 'high') {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return { ok: false, status: 0, reason: 'invalid_subscription' };
  }
  try {
    const parsedUrl = new URL(sub.endpoint);
    const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const jwt = createVapidJwt(audience);
    const bodyBuffer = encryptWebPushAes128Gcm(
      JSON.stringify(payloadObj),
      sub.keys.p256dh,
      sub.keys.auth
    );

    const response = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': String(bodyBuffer.length),
        'TTL': '2419200',
        'Urgency': urgency,
        'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      },
      body: bodyBuffer,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      gone: response.status === 404 || response.status === 410,
    };
  } catch (err) {
    return { ok: false, status: 0, reason: String(err?.message || err) };
  }
}

function getEndpointHash(endpoint, len = 8) {
  return crypto.createHash('md5').update(String(endpoint)).digest('hex').slice(0, len);
}

async function fetchOneSignalTags(externalId, fallbackOsId) {
  // Always prioritize onesignal_id endpoint first because GET by/onesignal_id succeeds with 200 OK without a secret key
  const urls = [];
  if (fallbackOsId) {
    urls.push(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/onesignal_id/${encodeURIComponent(fallbackOsId)}`);
  }
  if (externalId) {
    urls.push(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(externalId)}`);
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          exists: true,
          onesignalId: data?.identity?.onesignal_id || fallbackOsId,
          tags: data?.properties?.tags || {},
        };
      }
    } catch {
      // try next
    }
  }
  return { exists: false, tags: {} };
}

async function ensureAndPatchOneSignalTags(externalId, fallbackOsId, tagsToPatch) {
  try {
    // 1. Try PATCH by onesignal_id first (works without secret REST key)
    if (fallbackOsId) {
      const osRes = await fetch(
        `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/onesignal_id/${encodeURIComponent(fallbackOsId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ properties: { tags: tagsToPatch } }),
        }
      );
      if (osRes.ok) return true;
    }

    // 2. Fallback to PATCH by external_id
    if (externalId) {
      const patchRes = await fetch(
        `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(externalId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ properties: { tags: tagsToPatch } }),
        }
      );
      if (patchRes.ok) return true;

      if (patchRes.status === 404) {
        const createRes = await fetch(`https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            identity: { external_id: externalId },
            properties: { tags: tagsToPatch },
          }),
        });
        if (createRes.ok) return true;
      }
    }
  } catch {
    // ignore network error
  }
  return false;
}

function parseVapidSubsFromTags(tags) {
  const subsByHash = new Map();
  if (!tags || typeof tags !== 'object') return subsByHash;

  const grouped = {};
  for (const [k, v] of Object.entries(tags)) {
    if (!v || typeof v !== 'string') continue;

    // 1. 8.11 schema: s_${hash8} -> {"ep":"...","p256":"...","auth":"...","id":"reg_...","name":"ميخائيل","full":"ميخائيل ادور راتب","role":"community_owner","g":"male"}
    if (k.startsWith('s_') && !k.startsWith('s2_')) {
      try {
        const parsed = JSON.parse(v);
        const endpoint = parsed.ep || parsed.e || parsed.endpoint;
        const p256dh = parsed.p256 || parsed.p || parsed?.keys?.p256dh;
        const auth = parsed.auth || parsed.a || parsed?.keys?.auth;
        if (endpoint && p256dh && auth) {
          const h = getEndpointHash(endpoint, 8);
          subsByHash.set(h, {
            hash: h,
            endpoint,
            keys: { p256dh, auth },
            memberId: parsed.id || parsed.m || parsed.memberId || '',
            name: parsed.name || (parsed.full ? String(parsed.full).trim().split(/\s+/)[0] : '') || '',
            fullName: parsed.full || parsed.fullName || parsed.name || '',
            role: parsed.role || parsed.r || 'member',
            gender: parsed.g === 'f' || parsed.g === 'female' ? 'female' : 'male',
            updatedAt: parsed.t || Date.now(),
          });
        }
      } catch {
        // ignore malformed entry
      }
    } else if (k.startsWith('s2_')) {
      const m = k.match(/^s2_([a-f0-9]+)_(e1|e2|k)$/);
      if (m) {
        const [, hash, part] = m;
        grouped[hash] = grouped[hash] || {};
        grouped[hash][part] = v;
      }
    } else if (k.startsWith('sub_')) {
      try {
        const parsed = JSON.parse(v);
        const endpoint = parsed.ep || parsed.e || parsed.endpoint;
        const p256dh = parsed.p256 || parsed.p || parsed?.keys?.p256dh;
        const auth = parsed.auth || parsed.a || parsed?.keys?.auth;
        if (endpoint && p256dh && auth) {
          const h = getEndpointHash(endpoint, 8);
          subsByHash.set(h, {
            hash: h,
            endpoint,
            keys: { p256dh, auth },
            memberId: parsed.id || parsed.m || parsed.memberId || '',
            name: parsed.name || '',
            fullName: parsed.full || '',
            role: parsed.r || parsed.role || 'member',
            gender: parsed.g === 'f' || parsed.g === 'female' ? 'female' : 'male',
            updatedAt: parsed.t || 0,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  for (const [hash, parts] of Object.entries(grouped)) {
    if (parts.e1 && parts.k) {
      try {
        const meta = JSON.parse(parts.k);
        const endpoint = `${parts.e1}${parts.e2 || ''}`;
        if (endpoint && meta.p && meta.a) {
          const h8 = getEndpointHash(endpoint, 8);
          const existing = subsByHash.get(h8);
          subsByHash.set(h8, {
            hash: h8,
            endpoint,
            keys: { p256dh: meta.p, auth: meta.a },
            memberId: meta.m || existing?.memberId || '',
            name: meta.n || existing?.name || '',
            fullName: meta.f || existing?.fullName || '',
            role: meta.r === 's' ? 'servant' : meta.r || existing?.role || 'member',
            gender: meta.g === 'f' || meta.g === 'female' ? 'female' : existing?.gender || 'male',
            updatedAt: meta.t || existing?.updatedAt || 0,
          });
        }
      } catch {
        // ignore malformed entry
      }
    }
  }
  return subsByHash;
}

export async function getAllVapidSubscriptions() {
  try {
    const [hub2, hub1] = await Promise.all([
      fetchOneSignalTags(VAPID_HUB_V2_EXT_ID, VAPID_HUB_V2_OS_ID),
      fetchOneSignalTags(VAPID_HUB_V1_EXT_ID, VAPID_HUB_V1_OS_ID),
    ]);
    for (const [h, sub] of parseVapidSubsFromTags(hub1.tags).entries()) {
      liveHub.vapidSubsByHash.set(h, sub);
    }
    for (const [h, sub] of parseVapidSubsFromTags(hub2.tags).entries()) {
      liveHub.vapidSubsByHash.set(h, sub);
    }
  } catch {
    // fallback to in-memory
  }
  return Array.from(liveHub.vapidSubsByHash.values());
}

export async function saveVapidSubscriptionToHub(subscription, userMeta = {}) {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { saved: false, reason: 'invalid_subscription' };
  }
  const endpoint = String(subscription.endpoint);
  const hash8 = getEndpointHash(endpoint, 8);
  const hash10 = getEndpointHash(endpoint, 10);

  const memberId = String(userMeta.memberId || userMeta.id || '').slice(0, 32);
  const fullName = String(userMeta.fullName || userMeta.full || userMeta.name || '').trim();
  const firstName = String(userMeta.firstName || userMeta.name || (fullName ? fullName.split(/\s+/)[0] : '')).trim();
  const role = String(userMeta.role || 'member');
  const gender = userMeta.gender === 'female' || userMeta.g === 'female' ? 'female' : 'male';

  const subRecord = {
    hash: hash8,
    endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    memberId,
    name: firstName,
    fullName,
    role,
    gender,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  liveHub.vapidSubsByHash.set(hash8, subRecord);

  // Format 1: 8.11 compact single-tag JSON (s_${hash8})
  const compactObj = {
    ep: endpoint,
    p256: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  };
  if (memberId) compactObj.id = memberId;
  if (firstName) compactObj.name = firstName;
  if (fullName) compactObj.full = fullName;
  if (role) compactObj.role = role;
  if (gender) compactObj.g = gender;

  // Format 2: chunked s2_${hash10} for extra long endpoints
  const e1 = endpoint.slice(0, 175);
  const e2 = endpoint.slice(175, 350);
  const metaJson = JSON.stringify({
    p: subscription.keys.p256dh,
    a: subscription.keys.auth,
    r: role,
    m: memberId.slice(0, 24),
    n: firstName.slice(0, 20),
    g: gender === 'female' ? 'f' : 'm',
    t: Math.floor(Date.now() / 1000),
  });

  const tagsToPatch = {
    [`s_${hash8}`]: JSON.stringify(compactObj),
    [`s2_${hash10}_e1`]: e1,
    [`s2_${hash10}_e2`]: e2 || '',
    [`s2_${hash10}_k`]: metaJson,
  };

  await Promise.all([
    ensureAndPatchOneSignalTags(VAPID_HUB_V2_EXT_ID, VAPID_HUB_V2_OS_ID, tagsToPatch),
    ensureAndPatchOneSignalTags(VAPID_HUB_V1_EXT_ID, VAPID_HUB_V1_OS_ID, tagsToPatch),
  ]);

  return { saved: true, hash: hash8 };
}

async function removeDeadSubscriptionsFromHub(deadHashes) {
  if (!deadHashes || deadHashes.length === 0) return;
  const tagsToPatch = {};
  for (const h of deadHashes) {
    liveHub.vapidSubsByHash.delete(h);
    tagsToPatch[`s_${h}`] = '';
    tagsToPatch[`s2_${h}_e1`] = '';
    tagsToPatch[`s2_${h}_e2`] = '';
    tagsToPatch[`s2_${h}_k`] = '';
    tagsToPatch[`sub_${h}`] = '';
  }
  await Promise.all([
    ensureAndPatchOneSignalTags(VAPID_HUB_V2_EXT_ID, VAPID_HUB_V2_OS_ID, tagsToPatch),
    ensureAndPatchOneSignalTags(VAPID_HUB_V1_EXT_ID, VAPID_HUB_V1_OS_ID, tagsToPatch),
  ]);
}

function mergeViewersLists(listA = [], listB = []) {
  const byId = new Map();
  for (const v of [...listA, ...listB]) {
    if (!v || !v.memberId) continue;
    const prev = byId.get(v.memberId);
    if (!prev) {
      byId.set(v.memberId, {
        memberId: String(v.memberId),
        memberName: String(v.memberName || 'شاب / شابة'),
        photoUrl: v.photoUrl || '',
        gender: v.gender || 'male',
        viewedAt: String(v.viewedAt || new Date().toISOString()),
        reaction: v.reaction !== undefined ? (v.reaction || undefined) : undefined,
      });
    } else {
      const nextReaction = v.reaction !== undefined ? (v.reaction || undefined) : prev.reaction;
      byId.set(v.memberId, {
        memberId: prev.memberId,
        memberName: v.memberName || prev.memberName,
        photoUrl: v.photoUrl || prev.photoUrl || '',
        gender: v.gender || prev.gender || 'male',
        viewedAt: v.viewedAt && v.viewedAt < prev.viewedAt ? v.viewedAt : prev.viewedAt,
        reaction: nextReaction,
      });
    }
  }
  return Array.from(byId.values());
}

export async function hydrateAnnouncementsFromCloud(force = false) {
  const now = Date.now();
  if (!force && liveHub.announcementsById.size > 0 && now - liveHub.lastCloudHydrateMs < 3500) {
    return getSortedLiveAnnouncements();
  }
  if (liveHub.hydratingPromise) {
    return liveHub.hydratingPromise;
  }

  liveHub.hydratingPromise = (async () => {
    try {
      const hub = await fetchOneSignalTags(ANNOUNCEMENTS_HUB_EXT_ID, ANNOUNCEMENTS_HUB_OS_ID);
      const tags = hub.tags || {};

      // Parse deleted announcement tombstones from del_ids and idx.d
      if (tags.del_ids) {
        try {
          const parsedDel = JSON.parse(tags.del_ids);
          if (Array.isArray(parsedDel)) {
            parsedDel.forEach((dId) => {
              if (dId) {
                liveHub.deletedIds.add(String(dId));
                liveHub.announcementsById.delete(String(dId));
              }
            });
          }
        } catch {}
      }

      if (tags.idx) {
        try {
          const parsedIdx = JSON.parse(tags.idx);
          if (parsedIdx && Array.isArray(parsedIdx.d)) {
            parsedIdx.d.forEach((dId) => {
              if (dId) {
                liveHub.deletedIds.add(String(dId));
                liveHub.announcementsById.delete(String(dId));
              }
            });
          }
        } catch {}
      }

      const ingestRawAnnouncement = (rawJson) => {
        if (!rawJson || typeof rawJson !== 'string') return;
        try {
          const obj = JSON.parse(rawJson);
          if (!obj || !obj.id) return;
          const sid = String(obj.id);
          if (liveHub.deletedIds.has(sid)) return;
          const existing = liveHub.announcementsById.get(sid);
          const viewers = mergeViewersLists(existing?.viewers || [], obj.viewers || liveHub.viewersById.get(sid) || []);
          liveHub.viewersById.set(sid, viewers);
          liveHub.announcementsById.set(sid, {
            id: sid,
            title: obj.title || obj.t || 'إعلان هام',
            content: obj.content || obj.c || '',
            templateType: obj.templateType || 'custom',
            senderRole: obj.senderRole || 'community_owner',
            senderName: obj.senderName || obj.authorName || obj.a || 'إدارة الاجتماع',
            targetAudience: obj.targetAudience || 'all',
            targetUserId: obj.targetUserId || undefined,
            targetServantName: obj.targetServantName || undefined,
            isVisitationTaskAlert: Boolean(obj.isVisitationTaskAlert),
            targetDate: obj.targetDate || undefined,
            pinned: Boolean(obj.pinned),
            imageUrl: obj.imageUrl || obj.i || existing?.imageUrl || undefined,
            createdAt: obj.createdAt || (obj.d ? new Date(obj.d * 1000).toISOString() : new Date().toISOString()),
            viewers,
            reactions: obj.reactions || existing?.reactions || {},
          });
        } catch {}
      };

      // Parse 8.11 tags: a_${id}, slot_0..slot_9, ann_${id}
      for (const [k, v] of Object.entries(tags)) {
        if (!v || typeof v !== 'string') continue;
        if (k.startsWith('a_') || k.startsWith('slot_') || k.startsWith('ann_')) {
          ingestRawAnnouncement(v);
        }
      }

      liveHub.lastCloudHydrateMs = Date.now();
    } catch {
      // ignore cloud hydration error
    } finally {
      liveHub.hydratingPromise = null;
    }
    return getSortedLiveAnnouncements();
  })();

  return liveHub.hydratingPromise;
}

export function getSortedLiveAnnouncements() {
  const list = [];
  for (const [id, item] of liveHub.announcementsById.entries()) {
    if (liveHub.deletedIds.has(id)) continue;
    const viewers = mergeViewersLists(item.viewers || [], liveHub.viewersById.get(id) || []);
    list.push({ ...item, viewers });
  }
  return list.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export async function saveAnnouncementToCloud(announcement) {
  if (!announcement || !announcement.id) return { saved: false };
  const id = String(announcement.id);
  liveHub.deletedIds.delete(id);

  const existingViewers = liveHub.viewersById.get(id) || [];
  const mergedViewers = mergeViewersLists(existingViewers, announcement.viewers || []);
  liveHub.viewersById.set(id, mergedViewers);

  const cleanItem = {
    id,
    title: String(announcement.title || 'إعلان هام'),
    content: String(announcement.content || ''),
    templateType: announcement.templateType || 'custom',
    senderRole: announcement.senderRole || 'community_owner',
    senderName: String(announcement.senderName || announcement.authorName || 'إدارة الاجتماع'),
    targetAudience: announcement.targetAudience || 'all',
    targetUserId: announcement.targetUserId || undefined,
    targetServantName: announcement.targetServantName || undefined,
    isVisitationTaskAlert: Boolean(announcement.isVisitationTaskAlert),
    targetDate: announcement.targetDate || new Date().toISOString().split('T')[0],
    pinned: Boolean(announcement.pinned),
    imageUrl: announcement.imageUrl ? String(announcement.imageUrl) : undefined,
    createdAt: announcement.createdAt || new Date().toISOString(),
    viewers: mergedViewers,
    reactions: announcement.reactions || {},
  };

  liveHub.announcementsById.set(id, cleanItem);

  // Sync to OneSignal Announcements Hub (2066d63c-d32e-44ec-8ee4-2ce445c79c38) using 8.11 schema
  (async () => {
    try {
      const compactAnn = {
        id: cleanItem.id,
        title: cleanItem.title,
        content: cleanItem.content,
        templateType: cleanItem.templateType,
        senderRole: cleanItem.senderRole,
        senderName: cleanItem.senderName,
        targetAudience: cleanItem.targetAudience,
        isVisitationTaskAlert: cleanItem.isVisitationTaskAlert,
        targetDate: cleanItem.targetDate,
        pinned: cleanItem.pinned,
        createdAt: cleanItem.createdAt,
      };
      const allActive = getSortedLiveAnnouncements().slice(0, 10);
      const activeIds = allActive.map((a) => a.id);
      const delIds = Array.from(liveHub.deletedIds).slice(-30);

      const tagsToPatch = {
        [`a_${id}`]: JSON.stringify(compactAnn),
        latest_ann_ts: String(Date.now()),
        idx: JSON.stringify({ a: activeIds, d: delIds }),
        del_ids: JSON.stringify(delIds),
      };
      allActive.forEach((a, idx) => {
        tagsToPatch[`slot_${idx}`] = JSON.stringify({
          id: a.id,
          title: a.title,
          content: a.content,
          templateType: a.templateType,
          senderRole: a.senderRole,
          senderName: a.senderName,
          targetAudience: a.targetAudience,
          isVisitationTaskAlert: a.isVisitationTaskAlert,
          targetDate: a.targetDate,
          pinned: a.pinned,
          createdAt: a.createdAt,
        });
      });

      await ensureAndPatchOneSignalTags(ANNOUNCEMENTS_HUB_EXT_ID, ANNOUNCEMENTS_HUB_OS_ID, tagsToPatch);
    } catch {
      // ignore background error
    }
  })();

  return { saved: true, announcement: cleanItem };
}

export async function deleteAnnouncementFromCloud(id) {
  if (!id) return { deleted: false };
  const sid = String(id);
  liveHub.deletedIds.add(sid);
  liveHub.announcementsById.delete(sid);
  liveHub.viewersById.delete(sid);

  (async () => {
    try {
      const allActive = getSortedLiveAnnouncements().slice(0, 10);
      const activeIds = allActive.map((a) => a.id);
      const delIds = Array.from(liveHub.deletedIds).slice(-30);

      const tagsToPatch = {
        [`a_${sid}`]: '',
        latest_ann_ts: String(Date.now()),
        idx: JSON.stringify({ a: activeIds, d: delIds }),
        del_ids: JSON.stringify(delIds),
      };
      for (let i = 0; i < 10; i++) {
        const a = allActive[i];
        tagsToPatch[`slot_${i}`] = a
          ? JSON.stringify({
              id: a.id,
              title: a.title,
              content: a.content,
              templateType: a.templateType,
              senderRole: a.senderRole,
              senderName: a.senderName,
              targetAudience: a.targetAudience,
              isVisitationTaskAlert: a.isVisitationTaskAlert,
              targetDate: a.targetDate,
              pinned: a.pinned,
              createdAt: a.createdAt,
            })
          : '';
      }

      await ensureAndPatchOneSignalTags(ANNOUNCEMENTS_HUB_EXT_ID, ANNOUNCEMENTS_HUB_OS_ID, tagsToPatch);
    } catch {
      // ignore
    }
  })();

  return { deleted: true };
}

export async function recordAnnouncementInteraction({ announcementId, memberId, memberName, photoUrl, gender, reaction }) {
  if (!announcementId || !memberId) return { updated: false };
  const sid = String(announcementId);
  const mid = String(memberId);
  const cleanName = String(memberName || 'شاب / شابة');
  const nowIso = new Date().toISOString();

  const currentList = liveHub.viewersById.get(sid) || [];
  const existing = currentList.find((v) => v.memberId === mid);
  const resolvedReaction = reaction !== undefined ? (reaction || undefined) : existing?.reaction;

  const updatedEntry = {
    memberId: mid,
    memberName: cleanName,
    photoUrl: photoUrl || existing?.photoUrl || '',
    gender: gender || existing?.gender || 'male',
    viewedAt: existing?.viewedAt || nowIso,
    reaction: resolvedReaction,
  };

  const merged = mergeViewersLists(
    currentList.filter((v) => v.memberId !== mid),
    [updatedEntry]
  );
  liveHub.viewersById.set(sid, merged);

  const ann = liveHub.announcementsById.get(sid);
  if (ann) {
    liveHub.announcementsById.set(sid, { ...ann, viewers: merged });
  }

  return { updated: true, viewers: merged };
}

function personalizeTextForSubscriber(rawText, sub) {
  if (!rawText) return '';
  const firstName =
    (sub?.name && String(sub.name).trim()) ||
    (sub?.fullName && String(sub.fullName).trim().split(/\s+/)[0]) ||
    'أخي الحبيب';
  return String(rawText)
    .replace(/\[الاسم الأول\]/g, firstName)
    .replace(/\[الاسم الاول\]/g, firstName)
    .replace(/\[الاسم\]/g, firstName)
    .replace(/\bفلان\b/g, firstName);
}

/**
 * @param {Record<string, any>} [opts]
 */
export async function broadcastWebPushNotification(opts = {}) {
  const {
    title,
    message,
    url = '/',
    tag,
    data = {},
    targetAudience = 'all',
    targetRole = 'all',
    targetMemberIds = null,
    targetUserId = null,
    targetServantName = null,
    imageUrl = null,
  } = opts || {};
  const subs = await getAllVapidSubscriptions();
  if (!subs || subs.length === 0) {
    return { totalSubscribers: 0, sentCount: 0 };
  }

  const targetIdSet = Array.isArray(targetMemberIds) && targetMemberIds.length > 0 ? new Set(targetMemberIds) : null;
  const norm = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase();

  const filteredSubs = subs.filter((s) => {
    if (targetAudience === 'servant_personal') {
      if (s.role === 'community_owner') return false;
      if (targetUserId && s.memberId === targetUserId) return true;
      if (targetServantName && s.fullName && (norm(s.fullName) === norm(targetServantName) || norm(s.fullName).includes(norm(targetServantName)))) {
        return true;
      }
      if (targetIdSet && s.memberId && targetIdSet.has(s.memberId)) return true;
      return false;
    }

    if (targetAudience === 'males_only') {
      return (s.gender || 'male') === 'male';
    }
    if (targetAudience === 'females_only') {
      return s.gender === 'female';
    }
    if ((targetAudience === 'absent_today' || targetAudience === 'attended_today') && targetIdSet) {
      // If subscriber has a memberId, check against targetIdSet; if no memberId stored on sub yet, allow delivery
      return !s.memberId || targetIdSet.has(s.memberId);
    }

    if (targetRole === 'servant') {
      return s.role === 's' || s.role === 'servant' || s.role === 'community_owner' || s.role === 'priest';
    }
    return true;
  });

  const deadHashes = [];
  let sentCount = 0;

  await Promise.all(
    filteredSubs.map(async (sub) => {
      const personalizedTitle = 'الثلاثة فتية - اجتماع الشباب السوداني';
      const personalizedBody = personalizeTextForSubscriber(message || '', sub);

      const payloadObj = {
        title: personalizedTitle,
        body: personalizedBody,
        message: personalizedBody,
        // Transparent-exterior monochrome cut-out badge for Android status bar
        badge: '/site-badge.png?v=15',
        // Original colored Three Youths meeting logo for notification icon
        icon: '/notif-logo-color.png?v=15',
        image: imageUrl || undefined,
        tag: tag || `three-youths-${Date.now()}`,
        url: url || '/?tab=announcements',
        timestamp: Date.now(),
        data: {
          ...data,
          url: url || '/?tab=announcements',
          badge: '/site-badge.png?v=15',
          icon: '/notif-logo-color.png?v=15',
          imageUrl: imageUrl || undefined,
        },
      };

      const result = await sendWebPushToSub(sub, payloadObj, 'high');
      if (result.ok) {
        sentCount++;
      } else if (result.gone) {
        deadHashes.push(sub.hash);
      }
    })
  );

  if (deadHashes.length > 0) {
    removeDeadSubscriptionsFromHub(deadHashes).catch(() => {});
  }

  return {
    totalSubscribers: filteredSubs.length,
    sentCount,
    cleanedDeadCount: deadHashes.length,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const action = req.query?.action || 'vapid_public_key';

      if (action === 'vapid_public_key') {
        return res.status(200).json({
          publicKey: VAPID_PUBLIC_KEY,
        });
      }

      if (action === 'get_announcements') {
        const force = req.query?.force === '1';
        const list = await hydrateAnnouncementsFromCloud(force);
        return res.status(200).json({
          ok: true,
          announcements: list,
          deletedAnnouncementIds: Array.from(liveHub.deletedIds),
        });
      }

      if (action === 'status') {
        const subs = await getAllVapidSubscriptions();
        return res.status(200).json({
          ok: true,
          publicKey: VAPID_PUBLIC_KEY,
          subscribersCount: subs.length,
          announcementsCount: liveHub.announcementsById.size,
        });
      }

      return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const action = body.action || 'broadcast';

      if (action === 'subscribe') {
        const saved = await saveVapidSubscriptionToHub(body.subscription, {
          memberId: body.memberId || body.id || '',
          name: body.name || body.firstName || '',
          fullName: body.fullName || body.full || '',
          role: body.role || 'member',
          gender: body.gender || body.g || 'male',
        });
        return res.status(200).json({ ok: true, ...saved, publicKey: VAPID_PUBLIC_KEY });
      }

      if (action === 'save_announcement') {
        const saved = await saveAnnouncementToCloud(body.announcement);
        let pushResult = null;
        if (body.sendPush !== false && body.announcement) {
          pushResult = await broadcastWebPushNotification({
            title: 'الثلاثة فتية - اجتماع الشباب السوداني',
            message: body.announcement.content || '',
            url: '/?tab=announcements',
            tag: `three-youths-ann-${body.announcement.id}`,
            targetAudience: body.announcement.targetAudience || 'all',
            targetUserId: body.announcement.targetUserId || null,
            targetServantName: body.announcement.targetServantName || null,
            data: {
              type: 'announcement',
              announcementId: body.announcement.id,
              targetAudience: body.announcement.targetAudience || 'all',
            },
          });
        }
        return res.status(200).json({
          ok: true,
          ...saved,
          pushResult,
          announcements: getSortedLiveAnnouncements(),
        });
      }

      if (action === 'delete_announcement') {
        const deleted = await deleteAnnouncementFromCloud(body.id);
        return res.status(200).json({
          ok: true,
          ...deleted,
          announcements: getSortedLiveAnnouncements(),
        });
      }

      if (action === 'interact_announcement') {
        const result = await recordAnnouncementInteraction({
          announcementId: body.announcementId || body.id,
          memberId: body.memberId,
          memberName: body.memberName,
          photoUrl: body.photoUrl,
          gender: body.gender,
          reaction: body.reaction,
        });
        return res.status(200).json({
          ok: true,
          ...result,
          announcements: getSortedLiveAnnouncements(),
        });
      }

      // Default action: broadcast push notification
      const pushResult = await broadcastWebPushNotification({
        title: body.title || 'الثلاثة فتية - اجتماع الشباب السوداني',
        message: body.message || body.body || '',
        url: body.url || '/?tab=announcements',
        tag: body.tag || (body.announcementId ? `three-youths-ann-${body.announcementId}` : `three-youths-${Date.now()}`),
        data: body.data || {},
        targetAudience: body.targetAudience || 'all',
        targetRole: body.targetRole || 'all',
        targetMemberIds: body.targetMemberIds || null,
        targetUserId: body.targetUserId || null,
        targetServantName: body.targetServantName || null,
        imageUrl: body.imageUrl || null,
      });

      return res.status(200).json({
        ok: true,
        success: true,
        ...pushResult,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
}
