import { DurableObject } from "cloudflare:workers";

// ============================================================================
// IN-MEMORY EDGE CACHE & VERSIONING (Sub-1ms CPU Time Guarantee)
// ============================================================================
let edgeStateVersion = 0;
let isVersionInitialized = false;
const rawSliceCache = new Map(); // key -> { raw: string, ts: number }
const mediaMemCache = new Map(); // title -> string (LRU-capped to 60 items)
let cachedAnnouncementsPayload = { version: -1, json: "" };
let cachedEventsPayload = { version: -1, json: "" };

function setMediaCache(key, val) {
  if (!key || !val) return;
  if (mediaMemCache.size >= 60) {
    const firstKey = mediaMemCache.keys().next().value;
    if (firstKey) mediaMemCache.delete(firstKey);
  }
  mediaMemCache.set(key, val);
}

// Native C++ Web Crypto SHA-256 ETag generator (0ms JS CPU overhead)
async function computeSha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function initDb(env) {
  if (!env.DB || env._dbInitialized) return;
  env._dbInitialized = true;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT, phone TEXT, role TEXT DEFAULT 'member', created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, member_id TEXT, event_id TEXT, status TEXT, recorded_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, event_date INTEGER, created_at INTEGER)")
  ]);
}

async function getEdgeVersion(env) {
  if (isVersionInitialized && edgeStateVersion > 0) {
    return edgeStateVersion;
  }
  if (!env.DB) {
    edgeStateVersion = Date.now();
    isVersionInitialized = true;
    return edgeStateVersion;
  }
  try {
    const [annMax, evMax] = await Promise.all([
      env.DB.prepare("SELECT MAX(created_at) as m FROM announcements").first("m"),
      env.DB.prepare("SELECT MAX(created_at) as m FROM events").first("m")
    ]);
    edgeStateVersion = Math.max(Number(annMax || 0), Number(evMax || 0), 1);
    isVersionInitialized = true;
  } catch {
    if (!edgeStateVersion) edgeStateVersion = Date.now();
  }
  return edgeStateVersion;
}

function bumpEdgeVersion(newTs = Date.now()) {
  edgeStateVersion = Math.max(edgeStateVersion + 1, newTs);
  isVersionInitialized = true;
  cachedAnnouncementsPayload = { version: -1, json: "" };
  cachedEventsPayload = { version: -1, json: "" };
  return edgeStateVersion;
}

// Reads a single D1_STATE:<key> slice as a raw string WITHOUT parsing other tables or Base64 photos
async function getRawSliceFromD1(env, sliceKey, fallbackRaw = "[]") {
  const cached = rawSliceCache.get(sliceKey);
  if (cached && cached.raw) {
    return cached.raw;
  }
  if (!env.DB) return fallbackRaw;
  try {
    const titleKey = `D1_STATE:${sliceKey}`;
    const row = await env.DB.prepare(
      "SELECT body, created_at FROM announcements WHERE title = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(titleKey).first();
    if (row && typeof row.body === "string" && row.body.length > 0) {
      rawSliceCache.set(sliceKey, { raw: row.body, ts: Number(row.created_at || Date.now()) });
      return row.body;
    }
  } catch {}
  return fallbackRaw;
}

async function saveRawSliceToD1(env, sliceKey, rawString, nowTs = Date.now()) {
  rawSliceCache.set(sliceKey, { raw: rawString, ts: nowTs });
  bumpEdgeVersion(nowTs);
  if (!env.DB) return;
  const titleKey = `D1_STATE:${sliceKey}`;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind(titleKey),
    env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(
      crypto.randomUUID(),
      titleKey,
      rawString,
      nowTs
    )
  ]);
}

export class RealtimeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS live_attendance (member_id TEXT PRIMARY KEY, name TEXT, joined_at INTEGER)");
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WS", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    const sessions = this.ctx.getWebSockets();
    if (data.type === "join") {
      ws.serializeAttachment({ memberId: data.memberId, name: data.name, role: data.role });
      ws.send(JSON.stringify({ type: "sync", onlineCount: sessions.length }));
      this._broadcast(sessions, { type: "presence_update", count: sessions.length });
    } else if (data.type === "presence") {
      const att = ws.deserializeAttachment();
      if (!att) return;
      this._broadcast(sessions, { type: "presence", memberId: att.memberId, name: att.name, at: Date.now() });
    } else if (data.type === "quiz_answer") {
      const att = ws.deserializeAttachment();
      if (!att) return;
      this._broadcast(sessions, { type: "quiz_answer", name: att.name, answerId: data.answerId }, true);
    } else {
      this._broadcast(sessions, data);
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (att?.memberId) {
      this.sql.exec("DELETE FROM live_attendance WHERE member_id=?", att.memberId);
    }
    this._broadcast(this.ctx.getWebSockets(), { type: "presence_update", count: this.ctx.getWebSockets().length });
  }

  _broadcast(sessions, msg, leadersOnly = false) {
    const p = JSON.stringify(msg);
    for (const ws of sessions) {
      if (ws.readyState !== 1) continue;
      if (leadersOnly) {
        const a = ws.deserializeAttachment();
        if (a?.role !== "leader" && a?.role !== "admin") continue;
      }
      try {
        ws.send(p);
      } catch {}
    }
  }

  async rpcBroadcast(m) {
    this._broadcast(this.ctx.getWebSockets(), m);
    return { ok: true };
  }

  async rpcGetOnlineCount() {
    return this.ctx.getWebSockets().length;
  }
}

function getClientIpFromRequest(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    request.headers.get("X-Real-IP") ||
    ""
  );
}

async function handleApiRequest(request, env, url) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-None-Match, X-Sync-Version",
    "Access-Control-Expose-Headers": "ETag, X-Sync-Version",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  await initDb(env);
  const path = url.pathname;
  const method = request.method;
  const clientIp = getClientIpFromRequest(request);
  const currentVersion = await getEdgeVersion(env);
  const etag = `"v-${currentVersion}"`;

  // Fast ETag / Version short-circuit helper (< 0.1ms CPU)
  const clientVersion = url.searchParams.get("v") || request.headers.get("X-Sync-Version") || "";
  const ifNoneMatch = request.headers.get("If-None-Match") || "";
  const isUnchangedRequest =
    method === "GET" &&
    ((clientVersion && String(clientVersion) === String(currentVersion)) ||
      (ifNoneMatch && ifNoneMatch === etag));

  if (path === "/api/version" && method === "GET") {
    const hash = await computeSha256Hex(currentVersion);
    return new Response(
      `{"success":true,"version":${currentVersion},"etag":"${hash}","changed":${!isUnchangedRequest}}`,
      { headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) } }
    );
  }

  if (path === "/api/client-ip" && method === "GET") {
    return new Response(`{"success":true,"ip":${JSON.stringify(clientIp)}}`, { headers: cors });
  }

  // ==========================================================================
  // ON-DEMAND MEDIA ENDPOINTS (Separates Heavy Base64 from Polling Loops)
  // ==========================================================================
  if ((path.startsWith("/api/media/photo/") || path.startsWith("/api/media/ann/")) && method === "GET") {
    const isPhoto = path.startsWith("/api/media/photo/");
    const rawId = decodeURIComponent(path.replace(isPhoto ? "/api/media/photo/" : "/api/media/ann/", "").split("/")[0]);
    const titleKey = isPhoto ? `D1_PHOTO:${rawId}` : `D1_ANN_IMAGE:${rawId}`;

    // 1. Check in-memory isolate cache first (0ms CPU)
    if (mediaMemCache.has(titleKey)) {
      return new Response(mediaMemCache.get(titleKey), {
        headers: {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    // 2. Fetch single row from D1 without JSON.parse/stringify
    if (env.DB) {
      const row = await env.DB.prepare(
        "SELECT description FROM events WHERE title = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(titleKey).first();
      if (row && typeof row.description === "string" && row.description.length > 0) {
        setMediaCache(titleKey, row.description);
        return new Response(row.description, {
          headers: {
            ...cors,
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }
    }
    return new Response("", { status: 404, headers: cors });
  }

  // ==========================================================================
  // RAW STREAMING / PASS-THROUGH GET ENDPOINTS (Zero JSON.parse / JSON.stringify)
  // ==========================================================================
  if (path === "/api/data" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(`{"success":true,"changed":false,"version":${currentVersion}}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    const [regsRaw, annsRaw, attRaw, blkRaw, textsRaw] = await Promise.all([
      getRawSliceFromD1(env, "registrants", "[]"),
      getRawSliceFromD1(env, "announcements", "[]"),
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "blocked_users", "[]"),
      getRawSliceFromD1(env, "site_texts", "{}")
    ]);
    const rawBody = `{"success":true,"changed":true,"version":${currentVersion},"clientIp":${JSON.stringify(clientIp)},"data":{"registrants":${regsRaw},"announcements":${annsRaw},"attendance":${attRaw},"blockedUsers":${blkRaw},"siteTextsRaw":${textsRaw}}}`;
    return new Response(rawBody, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/registrants" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const regsRaw = await getRawSliceFromD1(env, "registrants", "[]");
    return new Response(`{"success":true,"version":${currentVersion},"registrants":${regsRaw}}`, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/registrants" && method === "POST") {
    const newMember = await request.json();
    const rawName = String(newMember?.fullName || "").trim();
    if (!rawName || rawName === "عضو") {
      return new Response(JSON.stringify({ success: false, error: "يرجى إدخال الاسم الثلاثي الحقيقي (لا يقبل اسم عضو)." }), { status: 400, headers: cors });
    }
    const effectiveIp = newMember.ipAddress || clientIp || undefined;
    if (effectiveIp) newMember.ipAddress = effectiveIp;

    const [regsRaw, blkRaw] = await Promise.all([
      getRawSliceFromD1(env, "registrants", "[]"),
      getRawSliceFromD1(env, "blocked_users", "[]")
    ]);

    let blockedList = [];
    try { blockedList = JSON.parse(blkRaw); } catch {}
    const cleanDigits = (s) => String(s || "").replace(/\D/g, "");
    const reqDigits = cleanDigits(newMember.phone);
    const reqName = rawName.toLowerCase();

    const isBanned = (Array.isArray(blockedList) ? blockedList : []).some((b) => {
      if (!b) return false;
      if (effectiveIp && b.ipAddress && b.ipAddress.trim() === effectiveIp.trim()) return true;
      const bDigits = cleanDigits(b.phone);
      if (reqDigits.length >= 7 && bDigits && (reqDigits.endsWith(bDigits) || bDigits.endsWith(reqDigits))) return true;
      if (b.fullName && String(b.fullName).trim().toLowerCase() === reqName) return true;
      return false;
    });

    if (isBanned) {
      return new Response(JSON.stringify({
        success: false,
        error: "⚠️ عذراً، هذا الحساب أو الجهاز (IP) محظور نهائياً من التسجيل في النظام بناءً على قرار إدارة ومسؤول المجتمع."
      }), { status: 403, headers: cors });
    }

    // Unify photoUrl / avatar / image and keep compact compressed Base64 directly in registrants slice
    const lightMember = { ...newMember, fullName: rawName };
    const rawNewPhoto = String(lightMember.photoUrl || lightMember.avatar || lightMember.image || "").trim();
    if (rawNewPhoto.includes("data:image/") && lightMember.id) {
      const cleanDataUrl = rawNewPhoto.startsWith("data:image/")
        ? rawNewPhoto
        : rawNewPhoto.slice(rawNewPhoto.indexOf("data:image/"));
      const photoKey = `D1_PHOTO:${lightMember.id}`;
      setMediaCache(photoKey, cleanDataUrl);
      if (env.DB) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
          env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), photoKey, cleanDataUrl, Date.now(), Date.now())
        ]);
      }
      if (cleanDataUrl.length <= 65000) {
        lightMember.photoUrl = cleanDataUrl;
        lightMember.avatar = cleanDataUrl;
      } else {
        lightMember.photoUrl = `__D1_PHOTO_REF__:${lightMember.id}`;
      }
    }

    let list = [];
    try { list = JSON.parse(regsRaw); } catch {}
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex((r) => r && (r.id === lightMember.id || (r.uniqueCode && lightMember.uniqueCode && r.uniqueCode === lightMember.uniqueCode)));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...lightMember, fullName: rawName };
    } else {
      list.unshift(lightMember);
    }

    const nowTs = Date.now();
    await saveRawSliceToD1(env, "registrants", JSON.stringify(list), nowTs);

    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "d1_mutation",
          table: "registrants",
          action: "UPSERT",
          record: lightMember,
          at: nowTs
        });
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, registrant: lightMember, count: list.length, version: edgeStateVersion }), { headers: cors });
  }

  if (path.startsWith("/api/registrants/") && method === "PUT") {
    const id = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
    const updates = await request.json();
    const regsRaw = await getRawSliceFromD1(env, "registrants", "[]");
    let list = [];
    try { list = JSON.parse(regsRaw); } catch {}
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex((r) => r && (r.id === id || r.id === updates?.id));
    if (idx >= 0) {
      const existing = list[idx];
      const safeName = updates.fullName && String(updates.fullName).trim() !== "عضو"
        ? String(updates.fullName).trim()
        : existing.fullName;

      const lightUpdates = { ...updates };
      const rawUpdPhoto = String(lightUpdates.photoUrl || lightUpdates.avatar || lightUpdates.image || "").trim();
      if (rawUpdPhoto.includes("data:image/")) {
        const cleanDataUrl = rawUpdPhoto.startsWith("data:image/")
          ? rawUpdPhoto
          : rawUpdPhoto.slice(rawUpdPhoto.indexOf("data:image/"));
        const targetId = existing.id || id;
        const photoKey = `D1_PHOTO:${targetId}`;
        setMediaCache(photoKey, cleanDataUrl);
        if (env.DB) {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
            env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), photoKey, cleanDataUrl, Date.now(), Date.now())
          ]);
        }
        if (cleanDataUrl.length <= 65000) {
          lightUpdates.photoUrl = cleanDataUrl;
          lightUpdates.avatar = cleanDataUrl;
        } else {
          lightUpdates.photoUrl = `__D1_PHOTO_REF__:${targetId}`;
        }
      }

      list[idx] = {
        ...existing,
        ...lightUpdates,
        fullName: safeName,
        ipAddress: updates.ipAddress || existing.ipAddress || clientIp || undefined,
        lastUpdatedAt: updates.lastUpdatedAt !== undefined ? updates.lastUpdatedAt : existing.lastUpdatedAt
      };

      const nowTs = Date.now();
      await saveRawSliceToD1(env, "registrants", JSON.stringify(list), nowTs);

      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            action: "UPSERT",
            record: list[idx],
            at: nowTs
          });
        } catch {}
      }
      return new Response(JSON.stringify({ success: true, registrant: list[idx], version: edgeStateVersion }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: true, registrant: updates, version: edgeStateVersion }), { headers: cors });
  }

  if (path === "/api/registrants/block" && method === "POST") {
    const b = await request.json();
    const { memberId, reason, ipAddress } = b || {};
    const [regsRaw, blkRaw] = await Promise.all([
      getRawSliceFromD1(env, "registrants", "[]"),
      getRawSliceFromD1(env, "blocked_users", "[]")
    ]);
    let list = [];
    let blockedList = [];
    try { list = JSON.parse(regsRaw); } catch {}
    try { blockedList = JSON.parse(blkRaw); } catch {}

    const member = (Array.isArray(list) ? list : []).find((r) => r && r.id === memberId);
    if (member) {
      const blockedEntry = {
        id: `block_${Date.now()}`,
        fullName: member.fullName,
        phone: member.phone,
        whatsapp: member.whatsapp || member.phone,
        uniqueCode: member.uniqueCode,
        ipAddress: member.ipAddress || ipAddress || undefined,
        reason: reason || "حظر نهائي بواسطة مسؤول المجتمع",
        blockedAt: new Date().toISOString(),
        blockedBy: "مسؤول المجتمع (Community Owner)"
      };
      const nextBlocked = [blockedEntry, ...(Array.isArray(blockedList) ? blockedList : []).filter((x) => x && x.phone !== member.phone && x.fullName !== member.fullName)];
      const nextRegs = (Array.isArray(list) ? list : []).filter((r) => r && r.id !== memberId);
      const nowTs = Date.now();
      await Promise.all([
        saveRawSliceToD1(env, "blocked_users", JSON.stringify(nextBlocked), nowTs),
        saveRawSliceToD1(env, "registrants", JSON.stringify(nextRegs), nowTs)
      ]);
      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "blocked_users_sync",
            blockedUsers: nextBlocked,
            at: nowTs
          });
        } catch {}
      }
      return new Response(JSON.stringify({ success: true, blockedEntry, version: edgeStateVersion }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  if (path === "/api/blocked-users" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const blkRaw = await getRawSliceFromD1(env, "blocked_users", "[]");
    return new Response(`{"success":true,"version":${currentVersion},"blockedUsers":${blkRaw}}`, {
      headers: { ...cors, ETag: etag }
    });
  }

  if (path.startsWith("/api/blocked-users/") && method === "DELETE") {
    const id = decodeURIComponent(path.replace("/api/blocked-users/", ""));
    const blkRaw = await getRawSliceFromD1(env, "blocked_users", "[]");
    let blockedList = [];
    try { blockedList = JSON.parse(blkRaw); } catch {}
    const nextBlocked = (Array.isArray(blockedList) ? blockedList : []).filter((b) => b && b.id !== id);
    const nowTs = Date.now();
    await saveRawSliceToD1(env, "blocked_users", JSON.stringify(nextBlocked), nowTs);
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "blocked_users_sync",
          blockedUsers: nextBlocked,
          at: nowTs
        });
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, blockedUsers: nextBlocked, version: edgeStateVersion }), { headers: cors });
  }

  if (path === "/api/site-texts" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const textsRaw = await getRawSliceFromD1(env, "site_texts", '{"siteTextOverrides":{}}');
    return new Response(textsRaw, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/site-texts" && method === "POST") {
    const b = await request.json();
    const textsRaw = await getRawSliceFromD1(env, "site_texts", "{}");
    let parsedExisting = {};
    try {
      const p = JSON.parse(textsRaw);
      parsedExisting = p && p.siteTextOverrides ? p.siteTextOverrides : (p || {});
    } catch {}
    let merged = { ...parsedExisting };
    const incMap =
      (b?.siteTextOverrides && typeof b.siteTextOverrides === "object" ? b.siteTextOverrides : null) ||
      (b?.overrides && typeof b.overrides === "object" ? b.overrides : null);

    if (b?.action === "reset_all") {
      merged = {};
    } else if (b?.action === "restore_key" && typeof b.key === "string") {
      delete merged[b.key];
    } else if (b?.action === "delete_text" && typeof b.key === "string") {
      merged[b.key] = "__DELETED__";
    } else if (incMap) {
      merged = b?.action === "set_batch" ? { ...incMap } : { ...merged, ...incMap };
    } else if (typeof b?.key === "string" && b?.value !== undefined) {
      merged[b.key] = String(b.value);
    }

    const nowTs = Date.now();
    const sysPayload = JSON.stringify({ success: true, siteTextOverrides: merged, updatedAt: nowTs });
    await saveRawSliceToD1(env, "site_texts", sysPayload, nowTs);

    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "site_text_overrides_sync",
          overrides: merged,
          at: nowTs
        });
      } catch {}
    }
    return new Response(sysPayload, { headers: cors });
  }

  if (path === "/api/members" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM members ORDER BY name LIMIT 100").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/members-add" && method === "POST") {
    const b = await request.json();
    await env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.name, b.phone || null, b.role || "member", Date.now()).run();
    return new Response('{"ok":true}', { headers: cors });
  }

  if (path === "/api/attendance" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const attRaw = await getRawSliceFromD1(env, "attendance_records", "[]");
    return new Response(`{"success":true,"version":${currentVersion},"attendance":${attRaw}}`, {
      headers: { ...cors, ETag: etag }
    });
  }

  if (path === "/api/attendance" && method === "POST") {
    const b = await request.json();
    const attRaw = await getRawSliceFromD1(env, "attendance_records", "[]");
    let current = [];
    try { current = JSON.parse(attRaw); } catch {}
    if (!Array.isArray(current)) current = [];

    const incomingRecords = Array.isArray(b.records) ? b.records : (b.record ? [b.record] : []);

    if (b.mode === "replace" && Array.isArray(b.records)) {
      current = b.records;
    } else if (incomingRecords.length > 0) {
      let hasNew = false;
      for (const rec of incomingRecords) {
        if (!rec || !rec.registrantId || !rec.date) continue;
        const alreadyExistsForDate = current.some(
          (a) => a && a.registrantId === rec.registrantId && a.date === rec.date
        );
        if (!alreadyExistsForDate) {
          current.unshift(rec);
          hasNew = true;
        }
      }
      if (!hasNew && incomingRecords.length === 1) {
        const dup = current.find(
          (a) => a && a.registrantId === incomingRecords[0].registrantId && a.date === incomingRecords[0].date
        );
        return new Response(JSON.stringify({ ok: true, isDuplicate: true, record: dup, attendance: current }), { headers: cors });
      }
    } else if (b.memberId && env.DB) {
      await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run();
    }

    const lightAtt = current.map((r) => ({
      id: r.id,
      registrantId: r.registrantId,
      registrantName: r.registrantName,
      registrantPhotoUrl: typeof r.registrantPhotoUrl === "string" && r.registrantPhotoUrl.startsWith("data:")
        ? `__D1_PHOTO_REF__:${r.registrantId}`
        : r.registrantPhotoUrl,
      date: r.date,
      timestamp: r.timestamp,
      method: r.method
    }));

    const nowTs = Date.now();
    await saveRawSliceToD1(env, "attendance_records", JSON.stringify(lightAtt), nowTs);

    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "attendance_sync",
          records: lightAtt,
          at: nowTs
        });
      } catch {}
    }

    return new Response(JSON.stringify({ ok: true, isDuplicate: false, attendance: lightAtt, version: edgeStateVersion }), { headers: cors });
  }

  if (path.startsWith("/api/attendance/") && method === "DELETE") {
    const recordId = decodeURIComponent(path.replace("/api/attendance/", "").split("/")[0]);
    const attRaw = await getRawSliceFromD1(env, "attendance_records", "[]");
    let current = [];
    try { current = JSON.parse(attRaw); } catch {}
    const nextAtt = (Array.isArray(current) ? current : []).filter((a) => a && a.id !== recordId);
    const lightAtt = nextAtt.map((r) => ({
      id: r.id,
      registrantId: r.registrantId,
      registrantName: r.registrantName,
      registrantPhotoUrl: typeof r.registrantPhotoUrl === "string" && r.registrantPhotoUrl.startsWith("data:")
        ? `__D1_PHOTO_REF__:${r.registrantId}`
        : r.registrantPhotoUrl,
      date: r.date,
      timestamp: r.timestamp,
      method: r.method
    }));
    const nowTs = Date.now();
    await saveRawSliceToD1(env, "attendance_records", JSON.stringify(lightAtt), nowTs);
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "attendance_sync",
          records: lightAtt,
          deletedId: recordId,
          at: nowTs
        });
      } catch {}
    }
    return new Response(JSON.stringify({ ok: true, attendance: lightAtt, version: edgeStateVersion }), { headers: cors });
  }

  if (path === "/api/role-permissions" && method === "POST") {
    const b = await request.json();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "role_permissions_sync",
          role: b.role,
          permissions: b.permissions,
          allPermissions: b.allPermissions,
          at: Date.now()
        });
      } catch {}
    }
    return new Response('{"success":true}', { headers: cors });
  }

  // ==========================================================================
  // LIGHTWEIGHT SYNC ENDPOINTS (/api/events & /api/announcements)
  // Excludes heavy Base64 photos from polling & serves from Edge RAM Cache
  // ==========================================================================
  if (path === "/api/events" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(`{"changed":false,"version":${currentVersion},"results":[]}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    const includePhotos = url.searchParams.get("include_photos") === "1";
    if (!includePhotos && cachedEventsPayload.version === currentVersion && cachedEventsPayload.json) {
      return new Response(cachedEventsPayload.json, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (!env.DB) {
      return new Response(`{"changed":true,"version":${currentVersion},"results":[]}`, { headers: cors });
    }
    // Exclude multi-megabyte D1_PHOTO and D1_ANN_IMAGE Base64 blobs from periodic polling!
    const query = includePhotos
      ? "SELECT id, title, description, event_date, created_at FROM events ORDER BY event_date DESC LIMIT 60"
      : "SELECT id, title, description, event_date, created_at FROM events WHERE title NOT LIKE 'D1_PHOTO:%' AND title NOT LIKE 'D1_ANN_IMAGE:%' ORDER BY event_date DESC LIMIT 50";
    const res = await env.DB.prepare(query).all();
    const payload = JSON.stringify({ changed: true, version: currentVersion, results: res.results || [] });
    if (!includePhotos) {
      cachedEventsPayload = { version: currentVersion, json: payload };
    }
    return new Response(payload, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/events-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    if (typeof b.title === "string") {
      if (b.title.startsWith("D1_PHOTO:") || b.title.startsWith("D1_ANN_IMAGE:")) {
        if (b.delete === true) {
          mediaMemCache.delete(b.title);
          await env.DB.prepare("DELETE FROM events WHERE title = ?").bind(b.title).run();
          return new Response('{"ok":true,"deleted":true}', { headers: cors });
        }
        if (b.description) {
          setMediaCache(b.title, b.description);
        }
        await env.DB.batch([
          env.DB.prepare("DELETE FROM events WHERE title = ?").bind(b.title),
          env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(
            crypto.randomUUID(),
            b.title,
            b.description || null,
            b.eventDate || nowTs,
            nowTs
          )
        ]);
        return new Response('{"ok":true}', { headers: cors });
      }
      if (b.title.startsWith("D1_STATE:")) {
        const sliceKey = b.title.replace("D1_STATE:", "").trim();
        await saveRawSliceToD1(env, sliceKey, b.description || "[]", nowTs);
        return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
      }
    }
    bumpEdgeVersion(nowTs);
    await env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(
      crypto.randomUUID(),
      b.title,
      b.description || null,
      b.eventDate || nowTs,
      nowTs
    ).run();
    return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
  }

  if (path === "/api/announcements" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(`{"changed":false,"version":${currentVersion},"results":[]}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (cachedAnnouncementsPayload.version === currentVersion && cachedAnnouncementsPayload.json) {
      return new Response(cachedAnnouncementsPayload.json, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (!env.DB) {
      return new Response(`{"changed":true,"version":${currentVersion},"results":[]}`, { headers: cors });
    }
    // Deduplicate slices in SQL so only 1 latest row per D1_STATE:<key> is returned
    const res = await env.DB.prepare(
      "SELECT id, title, body, MAX(created_at) as created_at FROM announcements GROUP BY title ORDER BY created_at DESC LIMIT 30"
    ).all();
    const rows = res.results || [];
    for (const row of rows) {
      if (row && typeof row.title === "string" && row.title.startsWith("D1_STATE:") && typeof row.body === "string") {
        const k = row.title.replace("D1_STATE:", "").trim();
        rawSliceCache.set(k, { raw: row.body, ts: Number(row.created_at || currentVersion) });
      }
    }
    const payload = JSON.stringify({ changed: true, version: currentVersion, results: rows });
    cachedAnnouncementsPayload = { version: currentVersion, json: payload };
    return new Response(payload, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/announcements-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    if (typeof b.title === "string" && b.title.startsWith("D1_STATE:")) {
      const sliceKey = b.title.replace("D1_STATE:", "").trim();
      await saveRawSliceToD1(env, sliceKey, typeof b.body === "string" ? b.body : JSON.stringify(b.body || []), nowTs);
    } else {
      bumpEdgeVersion(nowTs);
      await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, b.body, nowTs).run();
    }
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? "d1_mutation" : "announcement",
          title: b.title,
          body: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? undefined : b.body,
          version: edgeStateVersion,
          at: nowTs
        });
      } catch {}
    }
    return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
  }

  if (path === "/api/stats" && method === "GET") {
    const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c");
    const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c");
    return new Response(`{"members":${Number(m || 0)},"attendance":${Number(a || 0)}}`, { headers: cors });
  }

  if (path === "/api/online" && method === "GET") {
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    const online = roomNs
      ? await roomNs.get(roomNs.idFromName("main")).rpcGetOnlineCount()
      : 0;
    return new Response(`{"online":${Number(online || 0)}}`, { headers: cors });
  }

  return new Response('{"success":true,"ok":true}', { headers: cors });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomNs = env.REALTIME_ROOM || env.REALTIME;

    // 1. WebSocket Realtime Room
    if (url.pathname === "/ws" && roomNs) {
      const id = roomNs.idFromName(url.searchParams.get("room") || "main");
      return roomNs.get(id).fetch(request);
    }

    // 2. D1 Database & API Routes
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApiRequest(request, env, url);
      } catch (error) {
        return new Response(JSON.stringify({ error: "Internal server error", message: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 3. Serve the compiled React SPA from ./dist via Cloudflare Assets binding
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404 && !url.pathname.includes(".")) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }
      return assetRes;
    }

    return new Response("Assets binding not configured. Please ensure wrangler build runs npm run build.", {
      status: 503,
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
  }
};
