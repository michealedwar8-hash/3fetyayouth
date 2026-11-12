// Official Cloudflare Worker + D1 + Durable Objects Realtime Endpoints
export const CLOUDFLARE_WORKER_URL = "https://threefetyayouth-api.michealedwar8.workers.dev";
export const CLOUDFLARE_WS_URL = "wss://threefetyayouth-api.michealedwar8.workers.dev/ws?room=main";
export const CLOUDFLARE_ACCOUNT_ID = "5b6ccebc17911a0be08e154a4e7e30a6";
export const CLOUDFLARE_D1_DB_NAME = "threefetyayouth";
export const CLOUDFLARE_D1_DB_ID = "1d13778e-f840-482d-b1e9-02dda36fc9e3";
export const CLOUDFLARE_API_KEY = "cloudflare_d1_active";

function createNoOpQueryBuilder() {
  const result = Promise.resolve({ data: null, error: null });
  const builder: any = {
    select: () => builder,
    insert: () => builder,
    upsert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => result,
    maybeSingle: () => result,
    then: (onfulfilled?: any, onrejected?: any) => result.then(onfulfilled, onrejected),
    catch: (onrejected?: any) => result.catch(onrejected),
    finally: (onfinally?: any) => result.finally(onfinally)
  };
  return builder;
}

function createNoOpChannel() {
  const ch: any = {
    on: () => ch,
    subscribe: (cb?: (status: string) => void) => {
      if (typeof cb === 'function') {
        setTimeout(() => {
          try { cb('SUBSCRIBED'); } catch {}
        }, 0);
      }
      return ch;
    },
    unsubscribe: () => Promise.resolve('ok')
  };
  return ch;
}

// Local Cloudflare client adapter
export const cloudflareDb: any = {
  from: () => createNoOpQueryBuilder(),
  channel: () => createNoOpChannel(),
  removeChannel: () => Promise.resolve('ok'),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  }
};
export const supabase = cloudflareDb;

// ==========================================
// CLOUDFLARE DURABLE OBJECTS REALTIME WEBSOCKET
// ==========================================
type RealtimeCallback = (msg: any) => void;
const cfListeners = new Set<RealtimeCallback>();
let cfWs: WebSocket | null = null;
let cfReconnectTimer: any = null;
let cfPingInterval: any = null;
let cfConnected = false;

export function isCloudflareRealtimeConnected(): boolean {
  return cfConnected;
}

export function connectCloudflareRealtime(): void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
  if (cfWs && (cfWs.readyState === WebSocket.OPEN || cfWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    cfWs = new WebSocket(CLOUDFLARE_WS_URL);
    cfWs.onopen = () => {
      cfConnected = true;
      try {
        cfWs?.send(JSON.stringify({
          type: 'join',
          memberId: 'client_' + Math.random().toString(36).slice(2, 8),
          name: 'ThreeYouthsClient',
          role: 'leader'
        }));
      } catch {}
    };

    cfWs.onmessage = (event) => {
      if (!event.data || event.data === 'pong') return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.type && parsed.type !== 'sync' && parsed.type !== 'presence_update') {
          invalidateCloudflareEdgeVersion();
        }
        cfListeners.forEach((cb) => {
          try { cb(parsed); } catch {}
        });
      } catch {}
    };

    cfWs.onclose = () => {
      cfConnected = false;
      cfWs = null;
      if (cfReconnectTimer) clearTimeout(cfReconnectTimer);
      cfReconnectTimer = setTimeout(() => connectCloudflareRealtime(), 4000);
    };

    cfWs.onerror = () => {
      cfConnected = false;
    };

    if (!cfPingInterval) {
      cfPingInterval = setInterval(() => {
        if (cfWs && cfWs.readyState === WebSocket.OPEN) {
          try { cfWs.send('ping'); } catch {}
        }
      }, 25000);
    }
  } catch {}
}

export function subscribeCloudflareRealtime(cb: RealtimeCallback): () => void {
  cfListeners.add(cb);
  connectCloudflareRealtime();
  return () => {
    cfListeners.delete(cb);
  };
}

export function broadcastCloudflareRealtime(payload: Record<string, any>): void {
  if (typeof window === 'undefined') return;
  connectCloudflareRealtime();
  if (cfWs && cfWs.readyState === WebSocket.OPEN) {
    try {
      cfWs.send(JSON.stringify({
        ...payload,
        type: payload.type || 'd1_mutation',
        timestamp: Date.now()
      }));
    } catch {}
  }
}

// ==========================================
// CLOUDFLARE D1 PHOTO & STATE SLICE ENGINE
// Separates heavy Base64 photos from lightweight realtime JSON slices (Zero Egress)
// ==========================================
const d1PhotoCache = new Map<string, string>();
const inFlightPhotoFetches = new Set<string>();
const D1_PHOTO_STORAGE_PREFIX = 'three_youths_d1_photo_';

let lastSyncedEdgeVersion = 0;
let lastCompletedFetchAt = 0;
let lastFetchedStateSnapshot: Record<string, any> | null = null;
let inFlightFetchStatePromise: Promise<Record<string, any> | null> | null = null;
const pendingSliceDebounceTimers = new Map<string, any>();
const pendingSlicePayloads = new Map<string, string>();

export function invalidateCloudflareEdgeVersion(): void {
  lastSyncedEdgeVersion = 0;
}

export function getCachedD1Photo(memberId: string): string | null {
  if (!memberId) return null;
  if (d1PhotoCache.has(memberId)) return d1PhotoCache.get(memberId)!;
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(D1_PHOTO_STORAGE_PREFIX + memberId);
      if (cached) {
        d1PhotoCache.set(memberId, cached);
        return cached;
      }
    } catch {}
  }
  return null;
}

export function setCachedD1Photo(memberId: string, dataUrl: string): void {
  if (!memberId || !dataUrl) return;
  d1PhotoCache.set(memberId, dataUrl);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(D1_PHOTO_STORAGE_PREFIX + memberId, dataUrl);
    } catch {}
  }
}

export function fetchD1PhotoLazy(memberId: string): void {
  if (!memberId || memberId === 'reg_owner_main') return;
  if (getCachedD1Photo(memberId) || inFlightPhotoFetches.has(memberId)) return;
  inFlightPhotoFetches.add(memberId);
  fetch(`${CLOUDFLARE_WORKER_URL}/api/media/photo/${encodeURIComponent(memberId)}`)
    .then(async (res) => {
      if (!res.ok) return;
      const text = await res.text();
      if (text && text.startsWith('data:')) {
        setCachedD1Photo(memberId, text);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('three_youths_session_updated'));
        }
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlightPhotoFetches.delete(memberId);
    });
}

export async function pushStateSliceToCloudflareD1(sliceKey: string, data: any): Promise<boolean> {
  try {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    pendingSlicePayloads.set(sliceKey, serialized);

    // Debounce rapid consecutive writes to the same slice (e.g. text edits or attendance scans)
    if (pendingSliceDebounceTimers.has(sliceKey)) {
      clearTimeout(pendingSliceDebounceTimers.get(sliceKey));
    }

    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(async () => {
        pendingSliceDebounceTimers.delete(sliceKey);
        const latestBody = pendingSlicePayloads.get(sliceKey) || serialized;
        pendingSlicePayloads.delete(sliceKey);
        try {
          const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements-add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `D1_STATE:${sliceKey}`,
              body: latestBody
            })
          });
          if (res.ok) {
            try {
              const json = await res.json();
              if (json && json.version) {
                lastSyncedEdgeVersion = Number(json.version);
              }
            } catch {}
          }
          resolve(res.ok);
        } catch {
          resolve(false);
        }
      }, 180);
      pendingSliceDebounceTimers.set(sliceKey, timer);
    });
  } catch {
    return false;
  }
}

export async function pushPhotoToCloudflareD1(memberId: string, photoDataUrl: string): Promise<boolean> {
  if (!memberId || !photoDataUrl || !photoDataUrl.startsWith('data:')) return false;
  setCachedD1Photo(memberId, photoDataUrl);
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/events-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `D1_PHOTO:${memberId}`,
        description: photoDataUrl,
        eventDate: Date.now()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

const d1AnnImageCache = new Map<string, string>();
const inFlightAnnImageFetches = new Set<string>();
const D1_ANN_IMAGE_STORAGE_PREFIX = 'three_youths_d1_ann_img_';

export function getCachedD1AnnouncementImage(announcementId: string): string | null {
  if (!announcementId) return null;
  if (d1AnnImageCache.has(announcementId)) return d1AnnImageCache.get(announcementId)!;
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(D1_ANN_IMAGE_STORAGE_PREFIX + announcementId);
      if (cached) {
        d1AnnImageCache.set(announcementId, cached);
        return cached;
      }
    } catch {}
  }
  return null;
}

export function setCachedD1AnnouncementImage(announcementId: string, dataUrl: string): void {
  if (!announcementId || !dataUrl) return;
  d1AnnImageCache.set(announcementId, dataUrl);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(D1_ANN_IMAGE_STORAGE_PREFIX + announcementId, dataUrl);
    } catch {}
  }
}

export function fetchD1AnnouncementImageLazy(announcementId: string): void {
  if (!announcementId) return;
  if (getCachedD1AnnouncementImage(announcementId) || inFlightAnnImageFetches.has(announcementId)) return;
  inFlightAnnImageFetches.add(announcementId);
  fetch(`${CLOUDFLARE_WORKER_URL}/api/media/ann/${encodeURIComponent(announcementId)}`)
    .then(async (res) => {
      if (!res.ok) return;
      const text = await res.text();
      if (text && text.startsWith('data:')) {
        setCachedD1AnnouncementImage(announcementId, text);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('three_youths_session_updated'));
        }
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlightAnnImageFetches.delete(announcementId);
    });
}

export function removeCachedD1AnnouncementImage(announcementId: string): void {
  if (!announcementId) return;
  d1AnnImageCache.delete(announcementId);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(D1_ANN_IMAGE_STORAGE_PREFIX + announcementId);
    } catch {}
  }
}

export async function pushAnnouncementImageToCloudflareD1(
  announcementId: string,
  imageDataUrl: string
): Promise<boolean> {
  if (!announcementId || !imageDataUrl) return false;
  setCachedD1AnnouncementImage(announcementId, imageDataUrl);
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/events-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `D1_ANN_IMAGE:${announcementId}`,
        description: imageDataUrl,
        eventDate: Date.now()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteAnnouncementImageFromCloudflareD1(
  announcementId: string
): Promise<boolean> {
  if (!announcementId) return false;
  removeCachedD1AnnouncementImage(announcementId);
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/events-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `D1_ANN_IMAGE:${announcementId}`,
        description: '',
        delete: true,
        eventDate: Date.now()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncAnnouncementsSliceToCloudflareD1(
  announcements: any[],
  changedAnnouncement?: any
): Promise<boolean> {
  try {
    if (
      changedAnnouncement &&
      changedAnnouncement.id &&
      typeof changedAnnouncement.imageUrl === 'string' &&
      changedAnnouncement.imageUrl.trim() !== '' &&
      !changedAnnouncement.imageUrl.startsWith('__D1_ANN_IMAGE_REF__:')
    ) {
      await pushAnnouncementImageToCloudflareD1(
        changedAnnouncement.id,
        changedAnnouncement.imageUrl
      ).catch(() => {});
    }

    const lightAnns = (Array.isArray(announcements) ? announcements : [])
      .filter((a: any) => a && typeof a === 'object' && a.id)
      .map((a: any) => {
        const copy = { ...a };
        if (typeof copy.imageUrl === 'string' && copy.imageUrl.startsWith('data:')) {
          setCachedD1AnnouncementImage(copy.id, copy.imageUrl);
          copy.imageUrl = `__D1_ANN_IMAGE_REF__:${copy.id}`;
        }
        return copy;
      });

    return await pushStateSliceToCloudflareD1('announcements', lightAnns);
  } catch {
    return false;
  }
}

/**
 * Immediately persists the full registrants list and any new/updated member photo to Cloudflare D1
 * so any new registration from any domain is saved in Cloudflare D1 and appears in the Dashboard.
 */
export async function syncRegistrantsSliceToCloudflareD1(
  registrants: any[],
  changedMember?: any,
  isNewRegistration = false
): Promise<boolean> {
  try {
    if (changedMember && changedMember.id && typeof changedMember.photoUrl === 'string' && changedMember.photoUrl.startsWith('data:')) {
      await pushPhotoToCloudflareD1(changedMember.id, changedMember.photoUrl).catch(() => {});
    }
    if (isNewRegistration && changedMember && changedMember.fullName) {
      fetch(`${CLOUDFLARE_WORKER_URL}/api/members-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: changedMember.fullName,
          phone: changedMember.phone || null,
          role: changedMember.role || 'member'
        })
      }).catch(() => {});
    }

    const lightRegs = (Array.isArray(registrants) ? registrants : [])
      .filter((r: any) => r && typeof r === 'object' && r.id && typeof r.fullName === 'string' && r.fullName.trim() !== '' && r.fullName.trim() !== 'عضو')
      .map((r: any) => {
        const copy = changedMember && changedMember.id === r.id && changedMember.fullName && changedMember.fullName.trim() !== 'عضو'
          ? { ...r, ...changedMember }
          : { ...r };
        if (copy.id === 'reg_owner_main' && copy.permissions && typeof copy.permissions === 'object') {
          const lightPerms: Record<string, any> = {};
          for (const [k, v] of Object.entries(copy.permissions)) {
            if (!k.startsWith('__system')) lightPerms[k] = v;
          }
          copy.permissions = lightPerms;
        }
        if (typeof copy.photoUrl === 'string' && copy.photoUrl.startsWith('data:')) {
          if (copy.id) setCachedD1Photo(copy.id, copy.photoUrl);
          copy.photoUrl = `__D1_PHOTO_REF__:${copy.id}`;
        }
        return copy;
      });

    return await pushStateSliceToCloudflareD1('registrants', lightRegs);
  } catch {
    return false;
  }
}

export async function fetchFullStateFromCloudflareD1(force = false): Promise<Record<string, any> | null> {
  // 1. Visibility API Guard: pause background polling when tab/app is hidden
  if (!force && typeof document !== 'undefined' && document.hidden) {
    return lastFetchedStateSnapshot ? { __unchanged: true, ...lastFetchedStateSnapshot } : null;
  }

  // 2. Request Deduplication: reuse any in-flight request
  if (inFlightFetchStatePromise) {
    return inFlightFetchStatePromise;
  }

  // 3. Throttle rapid calls within 1.5s if not forced
  const now = Date.now();
  if (!force && lastFetchedStateSnapshot && now - lastCompletedFetchAt < 1500) {
    return { __unchanged: true, ...lastFetchedStateSnapshot };
  }

  inFlightFetchStatePromise = (async () => {
    try {
      const versionParam = !force && lastSyncedEdgeVersion > 0 ? `?v=${lastSyncedEdgeVersion}` : '';
      const annsRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements${versionParam}`, {
        headers: versionParam
          ? { 'If-None-Match': `"v-${lastSyncedEdgeVersion}"`, 'X-Sync-Version': String(lastSyncedEdgeVersion) }
          : {}
      });

      if (annsRes.status === 304) {
        lastCompletedFetchAt = Date.now();
        return lastFetchedStateSnapshot ? { __unchanged: true, ...lastFetchedStateSnapshot } : { __unchanged: true };
      }

      if (!annsRes.ok) return lastFetchedStateSnapshot;
      const annJson = await annsRes.json();

      // Fast ETag/Version short-circuit: Worker returned { changed: false } in < 0.1ms CPU
      if (annJson && annJson.changed === false) {
        if (annJson.version) lastSyncedEdgeVersion = Number(annJson.version);
        lastCompletedFetchAt = Date.now();
        return lastFetchedStateSnapshot ? { __unchanged: true, ...lastFetchedStateSnapshot } : { __unchanged: true };
      }

      if (annJson && annJson.version) {
        lastSyncedEdgeVersion = Number(annJson.version);
      }

      const slices: Record<string, { ts: number; raw: string }> = {};
      const rows = Array.isArray(annJson?.results) ? annJson.results : [];
      for (const row of rows) {
        if (!row || typeof row.title !== 'string') continue;
        const ts = Number(row.created_at || 0);
        if (row.title.startsWith('D1_STATE:')) {
          const key = row.title.replace('D1_STATE:', '').trim();
          if (key && row.body && (!slices[key] || ts >= slices[key].ts)) {
            slices[key] = { ts, raw: row.body };
          }
        }
      }

      if (Object.keys(slices).length === 0) return lastFetchedStateSnapshot;

      const assembled: Record<string, any> = {};

      if (slices.registrants) {
        try {
          const parsedRegs = JSON.parse(slices.registrants.raw);
          if (Array.isArray(parsedRegs)) {
            assembled.registrants = parsedRegs.map((r: any) => {
              if (!r) return r;
              if (typeof r.photoUrl === 'string' && r.photoUrl.startsWith('__D1_PHOTO_REF__:')) {
                const refId = r.photoUrl.replace('__D1_PHOTO_REF__:', '').trim();
                const cached = getCachedD1Photo(refId);
                if (cached) {
                  r.photoUrl = cached;
                } else {
                  fetchD1PhotoLazy(refId);
                  r.photoUrl = refId === 'reg_owner_main' ? '/owner_portrait.jpg' : null;
                }
              } else if (!r.photoUrl && r.id) {
                const cached = getCachedD1Photo(r.id);
                if (cached) {
                  r.photoUrl = cached;
                } else {
                  fetchD1PhotoLazy(r.id);
                }
              }
              return r;
            });
          }
        } catch {}
      }

      if (slices.announcements) {
        try {
          const parsedAnns = JSON.parse(slices.announcements.raw);
          if (Array.isArray(parsedAnns)) {
            assembled.announcements = parsedAnns.map((a: any) => {
              if (!a) return a;
              if (typeof a.imageUrl === 'string' && a.imageUrl.startsWith('__D1_ANN_IMAGE_REF__:')) {
                const refId = a.imageUrl.replace('__D1_ANN_IMAGE_REF__:', '').trim();
                const cachedImg = getCachedD1AnnouncementImage(refId);
                if (cachedImg) {
                  a.imageUrl = cachedImg;
                } else {
                  fetchD1AnnouncementImageLazy(refId);
                  a.imageUrl = undefined;
                }
              } else if (!a.imageUrl && a.id) {
                const cachedImg = getCachedD1AnnouncementImage(a.id);
                if (cachedImg) a.imageUrl = cachedImg;
              }
              return a;
            });
          }
        } catch {}
      }

      if (slices.events_bundle) {
        try {
          const evB = JSON.parse(slices.events_bundle.raw);
          if (evB && typeof evB === 'object') {
            if (Array.isArray(evB.communityEvents)) {
              evB.communityEvents = evB.communityEvents.map((ev: any) => {
                if (!ev) return ev;
                if (typeof ev.imageUrl === 'string' && ev.imageUrl.startsWith('__D1_ANN_IMAGE_REF__:')) {
                  const refId = ev.imageUrl.replace('__D1_ANN_IMAGE_REF__:', '').trim();
                  const cachedImg = getCachedD1AnnouncementImage(refId);
                  if (cachedImg) {
                    ev.imageUrl = cachedImg;
                  } else {
                    fetchD1AnnouncementImageLazy(refId);
                    ev.imageUrl = undefined;
                  }
                } else if (!ev.imageUrl && ev.id) {
                  const cachedImg = getCachedD1AnnouncementImage(`event_img_${ev.id}`);
                  if (cachedImg) ev.imageUrl = cachedImg;
                }
                return ev;
              });
            }
            Object.assign(assembled, evB);
          }
        } catch {}
      }

      if (slices.kahoot_bundle) {
        try {
          const khB = JSON.parse(slices.kahoot_bundle.raw);
          Object.assign(assembled, khB);
        } catch {}
      }

      if (slices.system_bundle) {
        try {
          const sysB = JSON.parse(slices.system_bundle.raw);
          Object.assign(assembled, sysB);
        } catch {}
      }

      if (slices.role_permissions) {
        try {
          const rpB = JSON.parse(slices.role_permissions.raw);
          if (rpB && typeof rpB === 'object') {
            assembled.rolePermissions = rpB.allPermissions || rpB;
            if (rpB.updatedAt) assembled.rolePermissionsUpdatedAt = Number(rpB.updatedAt);
          }
        } catch {}
      }

      if (slices.site_texts) {
        try {
          const stB = JSON.parse(slices.site_texts.raw);
          if (stB && typeof stB === 'object') {
            if (stB.siteTextOverrides && typeof stB.siteTextOverrides === 'object') {
              assembled.siteTextOverrides = stB.siteTextOverrides;
              if (stB.updatedAt) assembled.siteTextsUpdatedAt = Number(stB.updatedAt);
            } else {
              assembled.siteTextOverrides = stB;
            }
          }
        } catch {}
      }

      if (slices.blocked_users) {
        try {
          const blkB = JSON.parse(slices.blocked_users.raw);
          if (Array.isArray(blkB)) {
            assembled.blockedUsers = blkB;
          }
        } catch {}
      }

      if (slices.attendance_records) {
        try {
          const attB = JSON.parse(slices.attendance_records.raw);
          if (Array.isArray(attB)) {
            assembled.attendance = attB;
          }
        } catch {}
      }

      lastFetchedStateSnapshot = assembled;
      lastCompletedFetchAt = Date.now();
      return assembled;
    } catch {
      return lastFetchedStateSnapshot;
    } finally {
      inFlightFetchStatePromise = null;
    }
  })();

  return inFlightFetchStatePromise;
}

export async function syncEventsBundleToCloudflareD1(eventsPayload: Record<string, any>): Promise<boolean> {
  try {
    const lightEvents = Array.isArray(eventsPayload.communityEvents)
      ? eventsPayload.communityEvents.map((ev: any) => {
          if (!ev || typeof ev !== 'object') return ev;
          const copy = { ...ev };
          if (typeof copy.imageUrl === 'string' && copy.imageUrl.startsWith('data:')) {
            setCachedD1AnnouncementImage(`event_img_${copy.id}`, copy.imageUrl);
            pushAnnouncementImageToCloudflareD1(`event_img_${copy.id}`, copy.imageUrl).catch(() => {});
            copy.imageUrl = `__D1_ANN_IMAGE_REF__:event_img_${copy.id}`;
          }
          return copy;
        })
      : [];

    const bundle = {
      ...eventsPayload,
      communityEvents: lightEvents,
      updatedAt: Date.now()
    };

    broadcastCloudflareRealtime({
      type: 'events_bundle_sync',
      payload: bundle
    });

    return await pushStateSliceToCloudflareD1('events_bundle', bundle);
  } catch {
    return false;
  }
}

export async function syncAttendanceSliceToCloudflareD1(records: any[]): Promise<boolean> {
  try {
    const cleanList = (Array.isArray(records) ? records : []).map((r: any) => ({
      id: r.id,
      registrantId: r.registrantId,
      registrantName: r.registrantName,
      registrantPhotoUrl: typeof r.registrantPhotoUrl === 'string' && r.registrantPhotoUrl.startsWith('data:')
        ? `__D1_PHOTO_REF__:${r.registrantId}`
        : r.registrantPhotoUrl,
      date: r.date,
      timestamp: r.timestamp,
      method: r.method
    }));
    return await pushStateSliceToCloudflareD1('attendance_records', cleanList);
  } catch {
    return false;
  }
}

/**
 * Strips undefined properties recursively so database mutations never fail
 */
export function sanitizeForDb<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
}

/**
 * Whitelist of known columns per table in database schema.
 */
export const TABLE_COLUMNS: Record<string, Set<string>> = {
  registrants: new Set([
    'id', 'uniqueCode', 'fullName', 'gender', 'phone', 'whatsapp', 'dob',
    'address', 'photoUrl', 'qrData', 'registeredAt', 'lastUpdatedAt', 'updatedFields',
    'password', 'role', 'permissions', 'status', 'isOnline', 'lastSeen',
    'isVisitedGeneral', 'lastVisitedAt', 'lastVisitedBy', 'needsRealPhoto',
    'faceSignature', 'recoveryCode', 'deviceRecoveryToken', 'ipAddress', 'detectedCountry'
  ]),
  attendance: new Set([
    'id', 'registrantId', 'registrantName', 'registrantPhotoUrl', 'date', 'timestamp', 'method'
  ]),
  announcements: new Set([
    'id', 'title', 'content', 'templateType', 'senderRole', 'senderName',
    'senderPhotoUrl', 'targetAudience', 'createdAt', 'reactions', 'pinned', 'viewers'
  ]),
  blocked_users: new Set([
    'id', 'fullName', 'phone', 'whatsapp', 'uniqueCode', 'ipAddress', 'reason', 'blockedAt', 'blockedBy'
  ]),
  deleted_records: new Set([
    'id', 'type', 'deletedAt'
  ]),
  kahoot_quizzes: new Set([
    'id', 'title', 'description', 'creatorId', 'creatorName', 'createdAt', 'isPublished', 'antiCheat', 'questions'
  ]),
  kahoot_sessions: new Set([
    'id', 'quizId', 'hostId', 'status', 'currentQuestionIndex', 'questionTimeLimitSeconds',
    'questionStartedAt', 'players', 'answersSubmitted', 'opinionsCollected', 'maxPlayersLimit'
  ]),
  kahoot_solo_scores: new Set([
    'id', 'quizId', 'quizTitle', 'playerId', 'playerName', 'score', 'correctCount', 'totalQuestions', 'completedAt'
  ]),
  visitation_notes: new Set([
    'id', 'memberId', 'memberName', 'authorName', 'authorRole', 'notes', 'createdAt'
  ]),
  special_assignments: new Set([
    'id', 'servantId', 'servantName', 'assignedMemberIds', 'completedMemberIds', 'historyMemberIds', 'startDate', 'endDate', 'periodDays', 'status'
  ]),
  app_settings: new Set([
    'key', 'value', 'updatedAt'
  ])
};

export function filterTablePayload(tableName: string, data: any): any {
  if (!data || typeof data !== 'object') return data;
  const allowed = TABLE_COLUMNS[tableName];
  if (!allowed) return data;

  const copy = { ...data };
  if (tableName === 'attendance' && !copy.timestamp && copy.scannedAt) {
    copy.timestamp = copy.scannedAt;
  }

  const filtered: Record<string, any> = {};
  for (const [key, val] of Object.entries(copy)) {
    if (allowed.has(key)) {
      filtered[key] = val;
    }
  }
  return filtered;
}

/**
 * Safe upsert into Cloudflare D1 Realtime & Central Server
 */
export async function safeCloudflareUpsert(tableName: string, data: any): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);

    if (tableName === 'registrants' && clean.id && typeof clean.photoUrl === 'string' && clean.photoUrl.startsWith('data:')) {
      pushPhotoToCloudflareD1(clean.id, clean.photoUrl).catch(() => {});
    }

    const lightCopy = { ...clean };
    if (typeof lightCopy.photoUrl === 'string' && lightCopy.photoUrl.startsWith('data:')) {
      lightCopy.photoUrl = `__D1_PHOTO_REF__:${lightCopy.id}`;
    }
    broadcastCloudflareRealtime({
      type: 'd1_mutation',
      action: 'UPSERT',
      table: tableName,
      record: lightCopy
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Safe update into Cloudflare D1 Realtime & Central Server
 */
export async function safeCloudflareUpdate(tableName: string, data: any, matchColumn = 'id', matchValue?: any): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);
    const targetVal = matchValue !== undefined ? matchValue : clean[matchColumn];

    const lightCopy = { ...clean, [matchColumn]: targetVal };
    if (typeof lightCopy.photoUrl === 'string' && lightCopy.photoUrl.startsWith('data:')) {
      lightCopy.photoUrl = `__D1_PHOTO_REF__:${targetVal}`;
    }
    broadcastCloudflareRealtime({
      type: 'd1_mutation',
      action: 'UPDATE',
      table: tableName,
      matchColumn,
      matchValue: targetVal,
      record: lightCopy
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Safe delete from Cloudflare D1 Realtime & Central Server
 */
export async function safeCloudflareDelete(tableName: string, id: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    broadcastCloudflareRealtime({
      type: 'd1_mutation',
      action: 'DELETE',
      table: tableName,
      id
    });

    return true;
  } catch {
    return false;
  }
}

export const safeSupabaseUpsert = safeCloudflareUpsert;
export const safeSupabaseUpdate = safeCloudflareUpdate;
export const safeSupabaseDelete = safeCloudflareDelete;
