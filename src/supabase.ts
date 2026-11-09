import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://jkuvkkitkmemqopbrhin.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_2HQxwmwxoaA7jV_H5JUAcQ_N092Uhba";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

/**
 * Strips undefined properties recursively so database mutations never fail
 */
export function sanitizeForDb<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
}

/**
 * Whitelist of known columns per table in Supabase PostgreSQL schema.
 * PostgREST strictly rejects requests that contain columns not present in the table.
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

function isTransientFetchError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : (err.message || err.details || String(err));
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('AbortError') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

/**
 * Safe upsert into Supabase table without crashing or logging noisy warnings on connection issues
 */
export async function safeSupabaseUpsert(tableName: string, data: any): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);

    // Safeguard: if attempting upsert on registrants without mandatory columns, perform update instead or set defaults to avoid violating not-null constraint
    if (tableName === 'registrants') {
      if (clean.id && (!clean.fullName || !clean.phone)) {
        const { id, ...fieldsToUpdate } = clean;
        const { error } = await supabase.from(tableName).update(fieldsToUpdate).eq('id', id);
        if (error) {
          return false;
        }
        return true;
      }
      if (!clean.role) clean.role = 'member';
      if (!clean.status) clean.status = 'active';
    }

    // Safeguard for announcements partial updates
    if (tableName === 'announcements' && clean.id && (!clean.title || !clean.content)) {
      const { id, ...fieldsToUpdate } = clean;
      const { error } = await supabase.from(tableName).update(fieldsToUpdate).eq('id', id);
      if (error) {
        return false;
      }
      return true;
    }

    const { error } = await supabase.from(tableName).upsert(clean);
    if (error) {
      return false;
    }
    return true;
  } catch (err) {
    if (!isTransientFetchError(err)) {
      // Silent fallback to central server
    }
    return false;
  }
}

/**
 * Safe update into Supabase table without crashing or logging noisy fetch warnings
 */
export async function safeSupabaseUpdate(tableName: string, data: any, matchColumn = 'id', matchValue?: any): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);
    const targetVal = matchValue !== undefined ? matchValue : clean[matchColumn];
    const { id, ...fieldsToUpdate } = clean;
    const payload = matchColumn === 'id' ? fieldsToUpdate : clean;
    const { error } = await supabase.from(tableName).update(payload).eq(matchColumn, targetVal);
    if (error) {
      return false;
    }
    return true;
  } catch (err) {
    if (!isTransientFetchError(err)) {
      // Silent fallback to central server
    }
    return false;
  }
}

/**
 * Safe delete from Supabase table without crashing or logging noisy fetch warnings
 */
export async function safeSupabaseDelete(tableName: string, id: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) {
      return false;
    }
    return true;
  } catch (err) {
    if (!isTransientFetchError(err)) {
      // Silent fallback to central server
    }
    return false;
  }
}

