// Official Cloudflare Worker + D1 + Durable Objects Realtime Endpoints
export const CLOUDFLARE_WORKER_URL = "https://threefetyayouth-api.michealedwar8.workers.dev";
export const CLOUDFLARE_WS_URL = "wss://threefetyayouth-api.michealedwar8.workers.dev/ws?room=main";
export const CLOUDFLARE_ACCOUNT_ID = "5b6ccebc17911a0be08e154a4e7e30a6";
export const CLOUDFLARE_D1_DB_NAME = "threefetyayouth";
export const CLOUDFLARE_D1_DB_ID = "1d13778e-f840-482d-b1e9-02dda36fc9e3";
export const CLOUDFLARE_API_KEY = "cloudflare_d1_active";

export function isAiStudioPreviewEnv(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const host = (window.location.hostname || '').toLowerCase();
  return host !== '3fetyayouth.online' && host !== 'www.3fetyayouth.online';
}

export function getCloudflareApiUrl(endpoint: string, bustCache = false): string {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${CLOUDFLARE_WORKER_URL}${cleanPath}`;
  if (!bustCache) return fullUrl;
  const sep = fullUrl.includes('?') ? '&' : '?';
  return `${fullUrl}${sep}t=${Date.now()}`;
}

export const NO_CACHE_FETCH_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache'
};

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
let initialFetchCompleted = false;
let serverRegistrantsCount = 0;
const pendingSliceDebounceTimers = new Map<string, any>();
const pendingSlicePayloads = new Map<string, string>();

export function isInitialCloudFetchCompleted(): boolean {
  return initialFetchCompleted;
}

export function getServerRegistrantsCount(): number {
  return serverRegistrantsCount;
}

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

export function removeCachedD1Photo(memberId: string): void {
  if (!memberId) return;
  d1PhotoCache.delete(memberId);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(D1_PHOTO_STORAGE_PREFIX + memberId);
    } catch {}
  }
}

/**
 * Permanently deletes a member from Cloudflare D1 and records their ID in the Tombstone Log (revoked_members_log)
 * so no browser Sync/Merge can ever re-upload or resurrect the cancelled account.
 */
export async function deleteMemberFromCloudflareD1(
  memberId: string,
  meta?: { fullName?: string; phone?: string; uniqueCode?: string }
): Promise<boolean> {
  if (!memberId || memberId === 'reg_owner_main') return false;
  removeCachedD1Photo(memberId);
  invalidateCloudflareEdgeVersion();
  serverRegistrantsCount = Math.max(0, serverRegistrantsCount - 1);
  if (lastFetchedStateSnapshot && Array.isArray(lastFetchedStateSnapshot.registrants)) {
    lastFetchedStateSnapshot.registrants = lastFetchedStateSnapshot.registrants.filter(
      (r: any) => r && String(r.id) !== String(memberId)
    );
  }
  try {
    const res = await fetch(getCloudflareApiUrl(`/api/registrants/${encodeURIComponent(memberId)}`), {
      method: 'DELETE',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: memberId,
        fullName: meta?.fullName || '',
        phone: meta?.phone || '',
        uniqueCode: meta?.uniqueCode || ''
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
    return res.ok;
  } catch {
    return false;
  }
}

export function fetchD1PhotoLazy(memberId: string): void {
  if (!memberId || memberId === 'reg_owner_main') return;
  if (getCachedD1Photo(memberId) || inFlightPhotoFetches.has(memberId)) return;
  inFlightPhotoFetches.add(memberId);
  fetch(getCloudflareApiUrl(`/api/media/photo/${encodeURIComponent(memberId)}`, true), {
    mode: 'cors',
    cache: 'no-store',
    headers: NO_CACHE_FETCH_HEADERS
  })
    .then(async (res) => {
      if (!res.ok) return;
      const text = await res.text();
      if (text && text.includes('data:image/')) {
        const cleanDataUrl = text.startsWith('data:image/') ? text : text.slice(text.indexOf('data:image/'));
        setCachedD1Photo(memberId, cleanDataUrl);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('three_youths_photo_hydrated', {
              detail: { memberId, photoUrl: cleanDataUrl }
            })
          );
          window.dispatchEvent(new CustomEvent('three_youths_session_updated'));
        }
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlightPhotoFetches.delete(memberId);
    });
}

export async function pushStateSliceToCloudflareD1(
  sliceKey: string,
  data: any,
  allowExplicitShrink = false
): Promise<boolean> {
  try {
    // CRITICAL SAFETY RULE (Pull-First / Server-Wins):
    // Never allow any write to Cloudflare D1 before initial GET from Cloudflare has completed
    if (!initialFetchCompleted) {
      return false;
    }

    // No Blind Overwrite for registrants slice: block if local array is smaller than Cloudflare's authoritative count
    if (sliceKey === 'registrants') {
      const arr = typeof data === 'string' ? JSON.parse(data) : data;
      if (Array.isArray(arr) && !allowExplicitShrink && arr.length < serverRegistrantsCount) {
        console.warn(
          `[Cloudflare Safety Guard] Blocked blind overwrite of registrants (${arr.length} < ${serverRegistrantsCount})`
        );
        return false;
      }
    }

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
          const res = await fetch(getCloudflareApiUrl('/api/announcements-add'), {
            method: 'POST',
            mode: 'cors',
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
  fetch(getCloudflareApiUrl(`/api/media/ann/${encodeURIComponent(announcementId)}`, true), {
    mode: 'cors',
    cache: 'no-store',
    headers: NO_CACHE_FETCH_HEADERS
  })
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

export function normalizeArabicName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeArabicKey(name: string): string {
  return normalizeArabicName(name);
}

export function normalizeMember(raw: any, index = 0): any {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `CF-STATIC-${index}-unknown`,
      fullName: 'عضو غير معروف',
      name: 'عضو غير معروف',
      role: 'member',
      status: 'active',
      gender: 'male',
      phone: '',
      whatsapp: '',
      dob: '',
      uniqueCode: '',
      qrData: '',
      photoUrl: '',
      avatar: '',
      registeredAt: '2026-01-01T00:00:00.000Z'
    };
  }
  const cleanFullName = String(raw.fullName || raw.name || 'عضو غير معروف')
    .trim()
    .replace(/\s+/g, ' ');
  const isOwner =
    raw.id === 'reg_owner_main' ||
    raw.role === 'community_owner' ||
    normalizeArabicName(cleanFullName) === normalizeArabicName('ميخائيل ادور راتب') ||
    normalizeArabicName(cleanFullName) === normalizeArabicName('ميخائيل ادوار راتب');
  const rawId = String(raw.id || '').trim();
  const cleanNameSlug = cleanFullName.replace(/\s+/g, '_') || 'member';
  const normalizedId = isOwner
    ? 'reg_owner_main'
    : rawId
      ? (rawId.startsWith('reg_member_reg_')
          ? rawId.replace(/^reg_member_/, '')
          : rawId.startsWith('reg_') || rawId.startsWith('CF-STATIC-')
            ? rawId
            : `reg_member_${rawId}`)
      : `CF-STATIC-${index}-${cleanNameSlug}`;

  let parsedPermissions = raw.permissions;
  if (typeof parsedPermissions === 'string') {
    try {
      parsedPermissions = JSON.parse(parsedPermissions);
    } catch {
      parsedPermissions = undefined;
    }
  }

  return {
    ...raw,
    id: normalizedId,
    fullName: cleanFullName,
    name: cleanFullName,
    role: isOwner ? 'community_owner' : (raw.role || 'member'),
    permissions: parsedPermissions && typeof parsedPermissions === 'object' ? { ...parsedPermissions } : raw.permissions,
    status: raw.status === 'cancelled' ? 'cancelled' : 'active',
    gender: raw.gender === 'female' ? 'female' : 'male',
    phone: String(raw.phone || '').trim(),
    whatsapp: String(raw.whatsapp || raw.phone || '').trim(),
    dob: String(raw.dob || '').trim(),
    photoUrl: String(raw.photoUrl || raw.avatar || raw.image || '').trim(),
    avatar: String(raw.avatar || raw.photoUrl || raw.image || '').trim(),
    registeredAt: raw.registeredAt || raw.createdAt || '2026-01-01T00:00:00.000Z'
  };
}

export function lossLessMembers(rawArray: any[]): any[] {
  if (!Array.isArray(rawArray)) return [];
  const seenIds = new Set<string>();
  return rawArray
    .filter((m) => m && typeof m === 'object')
    .map((member, index) => {
      const normalized = normalizeMember(member, index);
      let safeId = String(normalized.id || '').trim();
      if (!safeId || seenIds.has(safeId)) {
        const cleanNameSlug = String(normalized.fullName || normalized.name || '').trim().replace(/\s+/g, '_');
        safeId = `CF-STATIC-${index}-${cleanNameSlug}`;
      }
      seenIds.add(safeId);
      return {
        ...normalized,
        id: safeId
      };
    });
}

/**
 * Immediately persists the full registrants list and any new/updated member photo to Cloudflare D1
 * so any new registration from any domain is saved in Cloudflare D1 and appears in the Dashboard.
 */
export async function syncRegistrantsSliceToCloudflareD1(
  registrants: any[],
  changedMember?: any,
  isNewRegistration = false,
  allowExplicitShrink = false
): Promise<boolean> {
  try {
    // CRITICAL SAFETY RULE (Pull-First / Server-Wins):
    // 1. Block any write if initial GET from Cloudflare D1 has not completed yet
    if (!initialFetchCompleted) {
      return false;
    }

    // 2. In AI Studio Preview environment, block automatic background bulk overwrites (only allow explicit user mutations)
    if (isAiStudioPreviewEnv() && !changedMember && !allowExplicitShrink) {
      return false;
    }

    // 3. No Blind Overwrite: if local registrants list has fewer members than Cloudflare Database and this is not an explicit deletion, abort!
    const validInputCount = (Array.isArray(registrants) ? registrants : []).filter(
      (r: any) => r && r.id && r.status !== 'cancelled'
    ).length;
    if (!allowExplicitShrink && validInputCount < serverRegistrantsCount) {
      console.warn(
        `[Cloudflare Safety Guard] Refusing to overwrite Cloudflare registrants (${validInputCount} < ${serverRegistrantsCount})`
      );
      return false;
    }

    const changedPhoto = changedMember ? (changedMember.photoUrl || changedMember.avatar || changedMember.image) : '';
    if (changedMember && changedMember.id && typeof changedPhoto === 'string' && changedPhoto.includes('data:image/')) {
      const cleanChangedPhoto = changedPhoto.startsWith('data:image/')
        ? changedPhoto
        : changedPhoto.slice(changedPhoto.indexOf('data:image/'));
      await pushPhotoToCloudflareD1(changedMember.id, cleanChangedPhoto).catch(() => {});
    }
    if (isNewRegistration && changedMember && changedMember.fullName) {
      fetch(getCloudflareApiUrl('/api/members-add'), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: changedMember.id,
          name: changedMember.fullName,
          fullName: changedMember.fullName,
          phone: changedMember.phone || null,
          whatsapp: changedMember.whatsapp || changedMember.phone || null,
          gender: changedMember.gender || 'male',
          dob: changedMember.dob || '',
          uniqueCode: changedMember.uniqueCode || '',
          role: changedMember.role || 'member',
          status: changedMember.status || 'active',
          photoUrl: changedPhoto || ''
        })
      }).catch(() => {});
    }

    // Union-merge with lastFetchedStateSnapshot?.registrants so a partial client list can NEVER drop members on Cloudflare D1
    const revokedSet = new Set<string>(
      Array.isArray(lastFetchedStateSnapshot?.deletedRegistrantIds)
        ? lastFetchedStateSnapshot!.deletedRegistrantIds.map(String)
        : []
    );
    const mergedById = new Map<string, any>();
    const mergedByName = new Map<string, string>();

    const prevCloudRegs = !allowExplicitShrink && Array.isArray(lastFetchedStateSnapshot?.registrants)
      ? lastFetchedStateSnapshot!.registrants
      : [];

    for (const prev of prevCloudRegs) {
      if (!prev || typeof prev !== 'object' || !prev.id) continue;
      const pid = String(prev.id).trim();
      if (revokedSet.has(pid) || prev.status === 'cancelled') continue;
      const pname = String(prev.fullName || prev.name || '').trim();
      if (!pname || pname === 'عضو') continue;
      mergedById.set(pid, prev);
      const nk = normalizeArabicKey(pname);
      if (nk) mergedByName.set(nk, pid);
    }

    for (const r of (Array.isArray(registrants) ? registrants : [])) {
      if (!r || typeof r !== 'object' || !r.id) continue;
      const rid = String(r.id).trim();
      if (revokedSet.has(rid) || r.status === 'cancelled') continue;
      const rname = String(r.fullName || r.name || '').trim();
      if (!rname || rname === 'عضو') continue;
      const nk = normalizeArabicKey(rname);
      const existingIdByName = nk ? mergedByName.get(nk) : undefined;
      const targetId = mergedById.has(rid) ? rid : (existingIdByName || rid);
      const prev = mergedById.get(targetId);
      mergedById.set(targetId, prev ? { ...prev, ...r, id: targetId } : { ...r, id: targetId });
      if (nk) mergedByName.set(nk, targetId);
    }

    if (changedMember && changedMember.id && changedMember.fullName && changedMember.fullName.trim() !== 'عضو') {
      const cid = String(changedMember.id).trim();
      if (!revokedSet.has(cid)) {
        const prev = mergedById.get(cid);
        mergedById.set(cid, prev ? { ...prev, ...changedMember, id: cid } : { ...changedMember, id: cid });
      }
    }

    const usedCodes = new Set<string>(['TY-0001']);
    let nextCodeSeq = 2;
    const allocNextCode = () => {
      while (usedCodes.has(`TY-${String(nextCodeSeq).padStart(4, '0')}`)) nextCodeSeq++;
      const code = `TY-${String(nextCodeSeq).padStart(4, '0')}`;
      usedCodes.add(code);
      return code;
    };

    const lightRegs = Array.from(mergedById.values())
      .filter((r: any) => r && typeof r === 'object' && r.id && typeof r.fullName === 'string' && r.fullName.trim() !== '' && r.fullName.trim() !== 'عضو')
      .map((r: any) => {
        const copy = { ...r };
        if (copy.id === 'reg_owner_main' || copy.role === 'community_owner') {
          copy.uniqueCode = 'TY-0001';
          if (copy.permissions && typeof copy.permissions === 'object') {
            const lightPerms: Record<string, any> = {};
            for (const [k, v] of Object.entries(copy.permissions)) {
              if (!k.startsWith('__system')) lightPerms[k] = v;
            }
            copy.permissions = lightPerms;
          }
        } else {
          const candidateCode = String(copy.uniqueCode || '').trim().toUpperCase();
          if (candidateCode && /^TY-\d+$/i.test(candidateCode) && !usedCodes.has(candidateCode)) {
            usedCodes.add(candidateCode);
            copy.uniqueCode = candidateCode;
          } else {
            copy.uniqueCode = allocNextCode();
          }
        }
        let rawPhoto = String(copy.photoUrl || copy.avatar || copy.image || '').trim();
        if (rawPhoto.startsWith('blob:')) {
          rawPhoto = (copy.id ? getCachedD1Photo(copy.id) : '') || '';
        }
        if (rawPhoto.startsWith('__D1_PHOTO_REF__:')) {
          const refId = rawPhoto.replace('__D1_PHOTO_REF__:', '').trim() || copy.id;
          const cached = getCachedD1Photo(refId);
          if (cached && cached.includes('data:image/')) {
            rawPhoto = cached;
          }
        }
        if (rawPhoto.includes('data:image/')) {
          const cleanDataUrl = rawPhoto.startsWith('data:image/')
            ? rawPhoto
            : rawPhoto.slice(rawPhoto.indexOf('data:image/'));
          if (copy.id) setCachedD1Photo(copy.id, cleanDataUrl);
          if (cleanDataUrl.length <= 65000) {
            copy.photoUrl = cleanDataUrl;
          } else {
            if (copy.id) pushPhotoToCloudflareD1(copy.id, cleanDataUrl).catch(() => {});
            copy.photoUrl = `__D1_PHOTO_REF__:${copy.id}`;
          }
        } else if (rawPhoto) {
          copy.photoUrl = rawPhoto;
        }
        delete copy.avatar;
        delete copy.image;
        return copy;
      });

    serverRegistrantsCount = Math.max(
      allowExplicitShrink ? lightRegs.length : serverRegistrantsCount,
      lightRegs.length
    );

    return await pushStateSliceToCloudflareD1('registrants', lightRegs, allowExplicitShrink);
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
  if (!force && inFlightFetchStatePromise) {
    return inFlightFetchStatePromise;
  }

  // 3. Throttle rapid calls within 1.5s if not forced and snapshot already has full registrants
  const now = Date.now();
  const hasCompleteSnapshot =
    lastFetchedStateSnapshot &&
    Array.isArray(lastFetchedStateSnapshot.registrants) &&
    lastFetchedStateSnapshot.registrants.length > 0 &&
    lastFetchedStateSnapshot.registrants.length >= serverRegistrantsCount;

  if (!force && hasCompleteSnapshot && now - lastCompletedFetchAt < 1500) {
    return { __unchanged: true, ...lastFetchedStateSnapshot };
  }

  inFlightFetchStatePromise = (async () => {
    try {
      const ts = Date.now();
      const canUseVersionCheck = !force && hasCompleteSnapshot && lastSyncedEdgeVersion > 0;
      const versionParam = canUseVersionCheck
        ? `?v=${lastSyncedEdgeVersion}&t=${ts}`
        : `?t=${ts}`;
      const [annsRes, sqlMembersRes] = await Promise.all([
        fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements${versionParam}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: canUseVersionCheck
            ? {
                ...NO_CACHE_FETCH_HEADERS,
                'If-None-Match': `"v-${lastSyncedEdgeVersion}"`,
                'X-Sync-Version': String(lastSyncedEdgeVersion)
              }
            : NO_CACHE_FETCH_HEADERS
        }),
        fetch(`${CLOUDFLARE_WORKER_URL}/api/members?t=${ts}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: NO_CACHE_FETCH_HEADERS
        }).catch(() => null)
      ]);

      if (canUseVersionCheck && annsRes.status === 304) {
        initialFetchCompleted = true;
        lastCompletedFetchAt = Date.now();
        return lastFetchedStateSnapshot ? { __unchanged: true, ...lastFetchedStateSnapshot } : { __unchanged: true };
      }

      if (!annsRes.ok) return lastFetchedStateSnapshot;
      const annJson = await annsRes.json();

      // Fast ETag/Version short-circuit ONLY when we already have the complete snapshot
      if (canUseVersionCheck && annJson && annJson.changed === false) {
        initialFetchCompleted = true;
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
      const revokedIdSet = new Set<string>();
      const revokedNameSet = new Set<string>();

      // Parse active registrants from D1_STATE:registrants first so we know which IDs and names are currently active
      let parsedActiveRegs: any[] = [];
      const activeSliceIdSet = new Set<string>();
      const activeSliceNameSet = new Set<string>();
      if (slices.registrants) {
        try {
          const parsed = JSON.parse(slices.registrants.raw);
          if (Array.isArray(parsed)) {
            parsedActiveRegs = parsed;
            for (const r of parsed) {
              if (!r || typeof r !== 'object' || r.status === 'cancelled') continue;
              const rid = String(r.id || '').trim();
              const rname = normalizeArabicKey(String(r.fullName || r.name || ''));
              if (rid) activeSliceIdSet.add(rid);
              if (rname) activeSliceNameSet.add(rname);
            }
          }
        } catch {}
      }

      if (slices.revoked_members_log) {
        try {
          const parsedRevoked = JSON.parse(slices.revoked_members_log.raw);
          if (Array.isArray(parsedRevoked)) {
            assembled.revokedMembersLog = parsedRevoked;
            for (const entry of parsedRevoked) {
              const revId = typeof entry === 'string' ? entry : entry?.id;
              const revName = typeof entry === 'object' ? (entry?.fullName || entry?.name) : '';
              if (revId && revId !== 'reg_owner_main' && !activeSliceIdSet.has(String(revId))) {
                revokedIdSet.add(String(revId));
              }
              const normRevName = normalizeArabicKey(revName);
              if (
                normRevName &&
                normRevName !== normalizeArabicKey('ميخائيل ادور راتب') &&
                !activeSliceNameSet.has(normRevName)
              ) {
                revokedNameSet.add(normRevName);
              }
            }
          }
        } catch {}
      }

      if (slices.system_bundle) {
        try {
          const sysPre = JSON.parse(slices.system_bundle.raw);
          if (sysPre && Array.isArray(sysPre.deletedRegistrantIds)) {
            for (const delId of sysPre.deletedRegistrantIds) {
              if (delId && delId !== 'reg_owner_main' && !activeSliceIdSet.has(String(delId))) {
                revokedIdSet.add(String(delId));
              }
            }
          }
        } catch {}
      }

      if (revokedIdSet.size > 0) {
        assembled.deletedRegistrantIds = Array.from(revokedIdSet);
      }

      // Unify D1_STATE:registrants + SQL members table + previous snapshot so 100% of registered members are always present
      const unifiedMap = new Map<string, any>();
      const nameToIdMap = new Map<string, string>();

      const hydrateMemberPhoto = (r: any) => {
        if (!r || typeof r !== 'object') return r;
        const normalized = normalizeMember(r);
        Object.assign(r, normalized);

        const rawPhoto = String(r.photoUrl || r.avatar || r.image || '').trim();
        if (rawPhoto.includes('data:image/')) {
          const cleanDataUrl = rawPhoto.startsWith('data:image/')
            ? rawPhoto
            : rawPhoto.slice(rawPhoto.indexOf('data:image/'));
          if (r.id) setCachedD1Photo(r.id, cleanDataUrl);
          r.photoUrl = cleanDataUrl;
          r.avatar = cleanDataUrl;
        } else if (rawPhoto.startsWith('__D1_PHOTO_REF__:')) {
          const refId = rawPhoto.replace('__D1_PHOTO_REF__:', '').trim() || r.id;
          const cached = getCachedD1Photo(refId);
          if (cached) {
            r.photoUrl = cached;
            r.avatar = cached;
          } else {
            fetchD1PhotoLazy(refId);
            r.photoUrl = refId === 'reg_owner_main' ? '/owner_portrait.jpg' : '';
          }
        } else if (!rawPhoto && r.id) {
          const cached = getCachedD1Photo(r.id);
          if (cached) {
            r.photoUrl = cached;
            r.avatar = cached;
          } else {
            fetchD1PhotoLazy(r.id);
          }
        } else if (rawPhoto && !rawPhoto.startsWith('blob:')) {
          r.photoUrl = rawPhoto;
          r.avatar = rawPhoto;
        }
        return r;
      };

      const upsertIntoUnified = (raw: any, preferIncoming = true) => {
        if (!raw || typeof raw !== 'object') return;
        const fullName = String(raw.fullName || raw.name || '').trim().replace(/\s+/g, ' ');
        if (!fullName || fullName === 'عضو' || fullName === 'عضو غير معروف') return;
        const normName = normalizeArabicKey(fullName);
        if (normName && revokedNameSet.has(normName)) return;

        const isOwner =
          raw.id === 'reg_owner_main' ||
          raw.role === 'community_owner' ||
          normName === normalizeArabicKey('ميخائيل ادور راتب') ||
          normName === normalizeArabicKey('ميخائيل ادوار راتب');

        const rawIdClean = String(raw.id ?? '').trim().replace(/^reg_member_reg_/, 'reg_');
        const rawIdStr = isOwner
          ? 'reg_owner_main'
          : (rawIdClean !== ''
              ? (rawIdClean.startsWith('reg_') ? rawIdClean : `reg_member_${rawIdClean}`)
              : `reg_member_${normName.replace(/\s+/g, '_')}`);

        if (!isOwner && (revokedIdSet.has(rawIdStr) || revokedIdSet.has(rawIdClean) || raw.status === 'cancelled')) return;

        const matchedId = unifiedMap.has(rawIdStr)
          ? rawIdStr
          : (normName && nameToIdMap.has(normName) ? nameToIdMap.get(normName)! : rawIdStr);

        if (!isOwner && revokedIdSet.has(matchedId)) return;

        const hydrated = hydrateMemberPhoto({ ...raw, id: matchedId, fullName });
        const existing = unifiedMap.get(matchedId);
        if (!existing) {
          unifiedMap.set(matchedId, hydrated);
          if (normName) nameToIdMap.set(normName, matchedId);
        } else {
          const bestPhoto = (preferIncoming ? (hydrated.photoUrl || existing.photoUrl) : (existing.photoUrl || hydrated.photoUrl)) || '';
          const merged = preferIncoming
            ? {
                ...existing,
                ...hydrated,
                id: existing.id.startsWith('reg_') && !existing.id.startsWith('reg_member_') ? existing.id : hydrated.id,
                dob: hydrated.dob || existing.dob || '',
                address: hydrated.address || existing.address,
                password: hydrated.password || existing.password,
                photoUrl: bestPhoto,
                avatar: bestPhoto
              }
            : {
                ...hydrated,
                ...existing,
                id: existing.id.startsWith('reg_') && !existing.id.startsWith('reg_member_') ? existing.id : hydrated.id,
                dob: existing.dob || hydrated.dob || '',
                address: existing.address || hydrated.address,
                password: existing.password || hydrated.password,
                photoUrl: bestPhoto,
                avatar: bestPhoto
              };
          unifiedMap.set(matchedId, merged);
          if (normName) nameToIdMap.set(normName, matchedId);
        }
      };

      // 1. Seed from previous snapshot first (prevents multi-isolate flickering)
      if (Array.isArray(lastFetchedStateSnapshot?.registrants)) {
        for (const prev of lastFetchedStateSnapshot!.registrants) {
          upsertIntoUnified(prev, false);
        }
      }

      // 2. Apply authoritative D1_STATE:registrants slice
      if (parsedActiveRegs.length > 0) {
        for (const r of parsedActiveRegs) {
          upsertIntoUnified(r, true);
        }
      }

      // 3. Merge all rows from Cloudflare D1 SQL `members` table (/api/members) so any member in `members` is 100% present
      if (sqlMembersRes && sqlMembersRes.ok) {
        try {
          const sqlJson = await sqlMembersRes.json();
          const sqlRows = Array.isArray(sqlJson?.results) ? sqlJson.results : [];
          for (const m of sqlRows) {
            if (!m || !m.name) continue;
            const sqlRawId = String(m.id || '').trim();
            if (revokedIdSet.has(sqlRawId) || revokedIdSet.has(`reg_member_${sqlRawId}`)) continue;
            const cleanSqlId = sqlRawId.startsWith('reg_') ? sqlRawId : `reg_member_${sqlRawId}`;
            upsertIntoUnified(
              {
                id: cleanSqlId,
                fullName: String(m.name).trim().replace(/\s+/g, ' '),
                phone: m.phone ? String(m.phone).trim() : '',
                whatsapp: m.phone ? String(m.phone).trim() : '',
                role: m.role || 'member',
                status: 'active',
                registeredAt: m.created_at ? new Date(Number(m.created_at)).toISOString() : '2026-01-01T00:00:00.000Z'
              },
              false
            );
          }
        } catch {}
      }

      // 4. Ensure every member has a distinct sequential uniqueCode (TY-0001..TY-XXXX) with zero collisions
      const usedCodes = new Set<string>(['TY-0001']);
      let codeSeq = 2;
      const getNextDistinctCode = () => {
        while (usedCodes.has(`TY-${String(codeSeq).padStart(4, '0')}`)) codeSeq++;
        const c = `TY-${String(codeSeq).padStart(4, '0')}`;
        usedCodes.add(c);
        return c;
      };

      const rawUnifiedList: any[] = [];
      let memberIdx = 0;
      for (const r of unifiedMap.values()) {
        if (r.id === 'reg_owner_main' || r.role === 'community_owner') {
          r.uniqueCode = 'TY-0001';
          r.qrData = 'TY-0001';
        } else {
          const c = String(r.uniqueCode || '').trim().toUpperCase();
          if (c && /^TY-\d+$/i.test(c) && !usedCodes.has(c)) {
            usedCodes.add(c);
            r.uniqueCode = c;
            r.qrData = c;
          } else {
            const freshCode = getNextDistinctCode();
            r.uniqueCode = freshCode;
            r.qrData = freshCode;
          }
        }
        rawUnifiedList.push(normalizeMember(r, memberIdx++));
      }

      const finalRegistrants = lossLessMembers(rawUnifiedList);
      assembled.registrants = finalRegistrants;
      serverRegistrantsCount = Math.max(serverRegistrantsCount, finalRegistrants.length);
      initialFetchCompleted = true;

      // Always initialize authoritative arrays to [] so deleted/empty items on Cloudflare D1 replace stale local iOS PWA cache
      assembled.announcements = [];
      assembled.communityEvents = [];
      assembled.kahootQuizzes = [];

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
          const combined = new Set<string>(Array.from(revokedIdSet));
          if (Array.isArray(sysB?.deletedRegistrantIds)) {
            for (const dId of sysB.deletedRegistrantIds) {
              const sId = String(dId || '').trim();
              if (sId && sId !== 'reg_owner_main' && !activeSliceIdSet.has(sId)) {
                combined.add(sId);
              }
            }
          }
          assembled.deletedRegistrantIds = Array.from(combined);
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

export async function fetchMembers(force = true): Promise<any[]> {
  try {
    if (force) {
      invalidateCloudflareEdgeVersion();
    }
    const ts = Date.now();
    // Fetch both full D1 state and lightweight /api/members in parallel with strict cache-busting
    const [d1State, fastMembersRes] = await Promise.all([
      fetchFullStateFromCloudflareD1(force).catch(() => null),
      fetch(`${CLOUDFLARE_WORKER_URL}/api/members?t=${ts}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        headers: NO_CACHE_FETCH_HEADERS
      }).catch(() => null)
    ]);

    const mergedByName = new Map<string, any>();
    const revokedSet = new Set<string>(
      Array.isArray(d1State?.deletedRegistrantIds) ? d1State!.deletedRegistrantIds.map(String) : []
    );

    if (Array.isArray(d1State?.registrants)) {
      for (const r of d1State!.registrants) {
        const norm = normalizeMember(r);
        if (!norm.fullName || norm.fullName === 'عضو' || norm.fullName === 'عضو غير معروف') continue;
        if (norm.status === 'cancelled' || revokedSet.has(norm.id)) continue;
        const key = normalizeArabicName(norm.fullName) || norm.id;
        mergedByName.set(key, norm);
      }
    }

    if (fastMembersRes && fastMembersRes.ok) {
      try {
        const sqlJson = await fastMembersRes.json();
        const sqlRows = Array.isArray(sqlJson?.results)
          ? sqlJson.results
          : (Array.isArray(sqlJson?.members) ? sqlJson.members : (Array.isArray(sqlJson) ? sqlJson : []));
        for (const m of sqlRows) {
          if (!m || !(m.name || m.fullName)) continue;
          const sqlId = String(m.id || '').trim();
          if (revokedSet.has(sqlId) || revokedSet.has(`reg_member_${sqlId}`)) continue;
          const norm = normalizeMember({
            ...m,
            id: sqlId.startsWith('reg_') ? sqlId : `reg_member_${sqlId}`,
            fullName: String(m.fullName || m.name).trim().replace(/\s+/g, ' '),
            status: 'active'
          });
          const key = normalizeArabicName(norm.fullName) || norm.id;
          if (!mergedByName.has(key)) {
            mergedByName.set(key, norm);
          } else {
            const existing = mergedByName.get(key)!;
            mergedByName.set(key, {
              ...norm,
              ...existing,
              phone: existing.phone || norm.phone || '',
              whatsapp: existing.whatsapp || norm.whatsapp || ''
            });
          }
        }
      } catch {}
    }

    const finalMembers = Array.from(mergedByName.values());
    if (finalMembers.length > 0 && typeof localStorage !== 'undefined') {
      try {
        const lightList = finalMembers.map((m) => {
          const copy = { ...m };
          if (typeof copy.photoUrl === 'string' && copy.photoUrl.startsWith('data:') && copy.photoUrl.length > 65000) {
            copy.photoUrl = `__D1_PHOTO_REF__:${copy.id}`;
          }
          delete copy.avatar;
          delete copy.image;
          return copy;
        });
        localStorage.setItem('three_youths_registrants_v1', JSON.stringify(lightList));
      } catch {}
    }
    return finalMembers;
  } catch (err) {
    console.error('Error fetching members from Cloudflare:', err);
    return Array.isArray(lastFetchedStateSnapshot?.registrants) ? lastFetchedStateSnapshot!.registrants : [];
  }
}

export const fetchMembersFromCloudflare = fetchMembers;

export async function syncFromCloudflare(force = true): Promise<Record<string, any> | null> {
  if (force) {
    invalidateCloudflareEdgeVersion();
  }
  return await fetchFullStateFromCloudflareD1(force);
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
