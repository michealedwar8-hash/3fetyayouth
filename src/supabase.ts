import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://jkuvkkitkmemqopbrhin.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_2HQxwmwxoaA7jV_H5JUAcQ_N092Uhba";

// Official Cloudflare Worker + D1 + Durable Objects Realtime Endpoints
export const CLOUDFLARE_WORKER_URL = "https://threefetyayouth-api.michealedwar8.workers.dev";
export const CLOUDFLARE_WS_URL = "wss://threefetyayouth-api.michealedwar8.workers.dev/ws?room=main";
export const CLOUDFLARE_ACCOUNT_ID = "5b6ccebc17911a0be08e154a4e7e30a6";
export const CLOUDFLARE_D1_DB_NAME = "threefetyayouth";
export const CLOUDFLARE_D1_DB_ID = "1d13778e-f840-482d-b1e9-02dda36fc9e3";

// Circuit breaker: once Supabase returns 402 exceed_egress_quota, route all cloud operations to Cloudflare D1 + Central API
let isSupabaseQuotaRestricted = true;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

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
const D1_PHOTO_STORAGE_PREFIX = 'three_youths_d1_photo_';

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

export async function pushStateSliceToCloudflareD1(sliceKey: string, data: any): Promise<boolean> {
  try {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `D1_STATE:${sliceKey}`,
        body: serialized
      })
    });
    return res.ok;
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

export async function fetchFullStateFromCloudflareD1(): Promise<Record<string, any> | null> {
  try {
    const [eventsRes, annsRes] = await Promise.allSettled([
      fetch(`${CLOUDFLARE_WORKER_URL}/api/events`),
      fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements`)
    ]);

    const slices: Record<string, { ts: number; raw: string }> = {};

    if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
      const evJson = await eventsRes.value.json();
      const rows = Array.isArray(evJson?.results) ? evJson.results : [];
      for (const row of rows) {
        if (!row || typeof row.title !== 'string') continue;
        const ts = Number(row.created_at || row.event_date || 0);
        if (row.title.startsWith('D1_PHOTO:')) {
          const memberId = row.title.replace('D1_PHOTO:', '').trim();
          if (memberId && row.description && !getCachedD1Photo(memberId)) {
            setCachedD1Photo(memberId, row.description);
          }
        } else if (row.title.startsWith('D1_STATE:')) {
          const key = row.title.replace('D1_STATE:', '').trim();
          if (key && row.description && (!slices[key] || ts > slices[key].ts)) {
            slices[key] = { ts, raw: row.description };
          }
        }
      }
    }

    if (annsRes.status === 'fulfilled' && annsRes.value.ok) {
      const annJson = await annsRes.value.json();
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
    }

    if (Object.keys(slices).length === 0) return null;

    const assembled: Record<string, any> = {};

    if (slices.registrants) {
      try {
        const parsedRegs = JSON.parse(slices.registrants.raw);
        if (Array.isArray(parsedRegs)) {
          assembled.registrants = parsedRegs.map((r: any) => {
            if (!r) return r;
            if (typeof r.photoUrl === 'string' && r.photoUrl.startsWith('__D1_PHOTO_REF__:')) {
              const refId = r.photoUrl.replace('__D1_PHOTO_REF__:', '').trim();
              r.photoUrl = getCachedD1Photo(refId) || (refId === 'reg_owner_main' ? '/owner_portrait.jpg' : null);
            } else if (!r.photoUrl && r.id) {
              const cached = getCachedD1Photo(r.id);
              if (cached) r.photoUrl = cached;
            }
            return r;
          });
        }
      } catch {}
    }

    if (slices.announcements) {
      try {
        assembled.announcements = JSON.parse(slices.announcements.raw);
      } catch {}
    }

    if (slices.events_bundle) {
      try {
        const evB = JSON.parse(slices.events_bundle.raw);
        Object.assign(assembled, evB);
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

    return assembled;
  } catch {
    return null;
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
    'address', 'photoUrl', 'qrData', 'registeredAt', 'lastUpdatedAt',
    'password', 'role', 'permissions', 'status', 'isOnline', 'lastSeen',
    'isVisitedGeneral', 'lastVisitedAt', 'lastVisitedBy', 'needsRealPhoto',
    'faceSignature', 'recoveryCode'
  ]),
  attendance: new Set([
    'id', 'registrantId', 'registrantName', 'registrantPhotoUrl', 'date', 'timestamp', 'method'
  ]),
  announcements: new Set([
    'id', 'title', 'content', 'templateType', 'senderRole', 'senderName',
    'senderPhotoUrl', 'targetAudience', 'createdAt', 'reactions', 'pinned', 'viewers'
  ]),
  blocked_users: new Set([
    'id', 'fullName', 'phone', 'whatsapp', 'uniqueCode', 'reason', 'blockedAt', 'blockedBy'
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
 * Safe upsert into Cloudflare D1 Realtime & Central Server without hitting restricted Supabase egress quota
 */
export async function safeSupabaseUpsert(tableName: string, data: any): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);

    // If member has a base64 photo, cache & store separately in D1 photo table
    if (tableName === 'registrants' && clean.id && typeof clean.photoUrl === 'string' && clean.photoUrl.startsWith('data:')) {
      pushPhotoToCloudflareD1(clean.id, clean.photoUrl).catch(() => {});
    }

    // Broadcast instant delta over Cloudflare Durable Objects WebSocket
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

    if (isSupabaseQuotaRestricted) {
      return true;
    }

    const { error } = await supabase.from(tableName).upsert(clean);
    if (error) {
      isSupabaseQuotaRestricted = true;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe update into Cloudflare D1 Realtime & Central Server
 */
export async function safeSupabaseUpdate(tableName: string, data: any, matchColumn = 'id', matchValue?: any): Promise<boolean> {
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

    if (isSupabaseQuotaRestricted) {
      return true;
    }

    const { id, ...fieldsToUpdate } = clean;
    const payload = matchColumn === 'id' ? fieldsToUpdate : clean;
    const { error } = await supabase.from(tableName).update(payload).eq(matchColumn, targetVal);
    if (error) {
      isSupabaseQuotaRestricted = true;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe delete from Cloudflare D1 Realtime & Central Server
 */
export async function safeSupabaseDelete(tableName: string, id: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    broadcastCloudflareRealtime({
      type: 'd1_mutation',
      action: 'DELETE',
      table: tableName,
      id
    });

    if (isSupabaseQuotaRestricted) {
      return true;
    }

    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) {
      isSupabaseQuotaRestricted = true;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
