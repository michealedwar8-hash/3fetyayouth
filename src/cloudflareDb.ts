import { detectAndRepairGender, getMemberGender, FEMALE_FIRST_NAMES } from './types';
export { detectAndRepairGender, getMemberGender, FEMALE_FIRST_NAMES };

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

export const CF_LIVE_SYNC_MODE_KEY = 'CF_LIVE_SYNC_MODE';
export const CF_LIVE_SYNC_MODE_VERSION = 'smart_never_shrink_v4';
export const SAFE_BACKUP_MEMBERS_KEY = 'SAFE_BACKUP_MEMBERS';
export const CONFIRMED_DELETED_IDS_KEY = 'CONFIRMED_DELETED_IDS';
export const PERMANENT_BLACKLIST_KEY = 'PERMANENT_BLACKLIST';
export const PERMANENT_95_RESTORE_KEY = 'PERMANENT_95_RESTORE_V3';

const RESTORE_FOUR_TARGETS = [
  { id: 'reg_1794592057854_hcqz', altId: 'CF_39', code: 'TY-0086', altCode: 'TY-0038', name: 'دينا اسحق غنامي', variants: ['دينا اسحق غنامي', 'دينا إسحاق غنامي', 'دينا اسحاق غنامي'] },
  { id: 'reg_1794605308722_yuhs', altId: 'CF_72', code: 'TY-0107', altCode: 'TY-0087', name: 'فؤاد فواز يسي', variants: ['فؤاد فواز يسي', 'فؤاد فواز يسى'] },
  { id: 'reg_1794570089486_9210', altId: 'CF_14', code: 'TY-0041', altCode: 'TY-0003', name: 'مارينا جون راشد', variants: ['مارينا جون راشد'] },
  { id: 'reg_1794591919447_u2ra', altId: 'CF_38', code: 'TY-0084', altCode: 'TY-0004', name: 'يوانا صمؤيل صبحي', variants: ['يوانا صمؤيل صبحي', 'يوانا صموئيل صبحي', 'وانا صمؤيل صبحي', 'يوانا صمؤيل صبحى'] },
  { id: 'reg_member_3FY-83c7464b-1577-494b-bab9-ee657c60ccc2', altId: '3FY-83c7464b-1577-494b-bab9-ee657c60ccc2', code: 'TY-0116', altCode: 'TY-0116', name: 'ايناس حنا خليل', variants: ['ايناس حنا خليل', 'إيناس حنا خليل'] }
];

const unblacklistHooks = new Set<() => void>();
export function registerUnblacklistHook(fn: () => void): void {
  unblacklistHooks.add(fn);
}

let cachedPermanent95List: any[] = [];
let permanent95LoadPromise: Promise<any[]> | null = null;

export function unblacklistRestoredFourOnce(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(PERMANENT_95_RESTORE_KEY) === 'done') return;

    const targetIds = new Set<string>();
    const targetNames = new Set<string>();
    const pushIdVariants = (val: any) => {
      const clean = String(val || '').trim();
      if (!clean) return;
      targetIds.add(clean);
      targetIds.add(clean.toUpperCase());
      const bare = clean.replace(/^reg_member_/, '');
      if (bare) {
        targetIds.add(bare);
        targetIds.add(`reg_member_${bare}`);
      }
    };

    for (const t of RESTORE_FOUR_TARGETS) {
      pushIdVariants(t.id);
      if (t.altId) pushIdVariants(t.altId);
      if (t.code) pushIdVariants(t.code);
      if (t.altCode) pushIdVariants(t.altCode);
      targetNames.add(ultraNormalizeArabic(t.name));
      if (Array.isArray(t.variants)) {
        t.variants.forEach((v) => targetNames.add(ultraNormalizeArabic(v)));
      }
    }
    pushIdVariants('reg_member_reg_1794591919447_u2ra');

    if (cachedPermanent95List.length >= 90) {
      for (const pm of cachedPermanent95List) {
        if (!pm || typeof pm !== 'object') continue;
        pushIdVariants(pm.id);
        pushIdVariants(pm.originalId);
        pushIdVariants(pm.uniqueCode);
        pushIdVariants(pm.qrData);
        const nm = ultraNormalizeArabic(pm.fullName || pm.name || '');
        if (nm) targetNames.add(nm);
      }
      for (let i = 1; i <= 95; i++) {
        targetIds.add(`CF_${i}`);
      }
    }

    try {
      const rawBl = JSON.parse(localStorage.getItem(PERMANENT_BLACKLIST_KEY) || '{}');
      if (rawBl && typeof rawBl === 'object') {
        const nextIds = (Array.isArray(rawBl.ids) ? rawBl.ids : []).filter((id: any) => !targetIds.has(String(id || '').trim()));
        const nextNames = (Array.isArray(rawBl.names) ? rawBl.names : []).filter((n: any) => !targetNames.has(ultraNormalizeArabic(n)));
        localStorage.setItem(PERMANENT_BLACKLIST_KEY, JSON.stringify({ ids: nextIds, names: nextNames }));
      }
    } catch {}

    for (const delKey of [CONFIRMED_DELETED_IDS_KEY, 'three_youths_deleted_ids_v2', 'three_youths_deleted_registrants_v1']) {
      try {
        const raw = localStorage.getItem(delKey);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((entry: any) => {
            const s = String(entry || '').trim();
            if (!s) return false;
            if (s.startsWith('NAME:')) return !targetNames.has(ultraNormalizeArabic(s.slice(5)));
            return !targetIds.has(s) && !targetNames.has(ultraNormalizeArabic(s));
          });
          localStorage.setItem(delKey, JSON.stringify(filtered));
        }
      } catch {}
    }

    unblacklistHooks.forEach((fn) => {
      try { fn(); } catch {}
    });

    if (cachedPermanent95List.length >= 90) {
      localStorage.setItem(PERMANENT_95_RESTORE_KEY, 'done');
    }
  } catch {}
}

export function serializeRegistrantsForLocalCache(list: any[], preferLightPhotos = false): string {
  const arr = (Array.isArray(list) ? list : []).filter(Boolean).map((m: any) => {
    const copy = { ...m };
    const idStr = String(copy.id || '').trim();
    const rawPhoto = String(copy.photoUrl || copy.avatar || copy.image || '').trim();
    if (rawPhoto.includes('data:image/')) {
      const cleanDataUrl = rawPhoto.startsWith('data:image/')
        ? rawPhoto
        : rawPhoto.slice(rawPhoto.indexOf('data:image/'));
      if (idStr) setCachedD1Photo(idStr, cleanDataUrl);
      copy.photoUrl = (preferLightPhotos || cleanDataUrl.length > 45000)
        ? `__D1_PHOTO_REF__:${idStr}`
        : cleanDataUrl;
    } else if (rawPhoto) {
      copy.photoUrl = rawPhoto;
    }
    delete copy.avatar;
    delete copy.image;
    return copy;
  });

  let serialized = JSON.stringify(arr);
  if (serialized.length > 1800000) {
    const compact = arr.map((m: any) => {
      if (typeof m.photoUrl === 'string' && m.photoUrl.startsWith('data:image/') && m.id) {
        setCachedD1Photo(m.id, m.photoUrl);
        return { ...m, photoUrl: `__D1_PHOTO_REF__:${m.id}` };
      }
      return m;
    });
    serialized = JSON.stringify(compact);
  }
  return serialized;
}

export function getCachedPermanent95Members(): any[] {
  return cachedPermanent95List;
}

export async function loadPermanent95Members(): Promise<any[]> {
  unblacklistRestoredFourOnce();
  if (cachedPermanent95List.length >= 90) return cachedPermanent95List;
  if (permanent95LoadPromise) return permanent95LoadPromise;
  if (typeof fetch === 'undefined') return [];

  permanent95LoadPromise = (async () => {
    try {
      const res = await fetch('/permanent_members_95.json?v=3', { cache: 'no-cache' });
      if (!res.ok) return cachedPermanent95List;
      const parsed = await res.json();
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedPermanent95List = parsed.map((m, idx) => {
          const norm = normalizeMember(m, idx);
          if (norm.id && typeof norm.photoUrl === 'string' && norm.photoUrl.includes('data:image/')) {
            setCachedD1Photo(norm.id, norm.photoUrl);
          }
          return norm;
        });
        unblacklistRestoredFourOnce();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('three_youths_permanent95_loaded'));
        }
      }
      return cachedPermanent95List;
    } catch {
      return cachedPermanent95List;
    } finally {
      permanent95LoadPromise = null;
    }
  })();

  return permanent95LoadPromise;
}

if (typeof window !== 'undefined') {
  unblacklistRestoredFourOnce();
  loadPermanent95Members().catch(() => {});
}

// ==========================================
// 10-SECOND GLOBAL MUTATION & POLLING FREEZE LOCK
// ==========================================
export let lastUserMutationTime = 0;
export let isMutatingNow = false;

export function lockPollingForMutation(): void {
  isMutatingNow = true;
  lastUserMutationTime = Date.now();
  lockMemberSaveSync(10000);
}

export function unlockPollingAfterMutation(): void {
  isMutatingNow = false;
  lastUserMutationTime = Date.now();
}

export function isPollingFrozen(): boolean {
  return isMutatingNow || (Date.now() - lastUserMutationTime < 10000);
}

export function isGarbageOrGhostMember(m: any): boolean {
  if (!m || typeof m !== 'object') return true;
  const rawName = String(m.name || m.fullName || '').trim();
  if (!rawName || rawName.length < 2) return true;
  if (
    rawName.includes('عضو مسجل') ||
    /^عضو\s*#?\s*\d+$/i.test(rawName) ||
    rawName === 'عضو' ||
    rawName === 'undefined' ||
    rawName === 'null'
  ) {
    return true;
  }
  return false;
}

export function ultraNormalizeArabic(str: any): string {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    .replace(/عبد\s+/g, 'عبد')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPermanentBlacklist(): { ids: string[]; names: string[] } {
  if (typeof localStorage === 'undefined') return { ids: [], names: [] };
  const idSet = new Set<string>();
  const nameSet = new Set<string>();
  try {
    const rawBlacklist = JSON.parse(localStorage.getItem(PERMANENT_BLACKLIST_KEY) || '{}');
    if (Array.isArray(rawBlacklist?.ids)) {
      rawBlacklist.ids.forEach((id: any) => {
        const clean = String(id || '').trim();
        if (clean && clean !== 'reg_owner_main' && clean !== 'TY-0001') idSet.add(clean);
      });
    }
    if (Array.isArray(rawBlacklist?.names)) {
      rawBlacklist.names.forEach((n: any) => {
        const norm = ultraNormalizeArabic(n);
        if (norm && !norm.includes('ميخاييل ادور')) nameSet.add(norm);
      });
    }
  } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIRMED_DELETED_IDS_KEY) || '[]');
    const delV2 = JSON.parse(localStorage.getItem('three_youths_deleted_ids_v2') || '[]');
    [...(Array.isArray(raw) ? raw : []), ...(Array.isArray(delV2) ? delV2 : [])].forEach((item: any) => {
      const s = String(item || '').trim();
      if (!s || s === 'reg_owner_main' || s === 'TY-0001') return;
      if (s.startsWith('NAME:')) {
        const norm = ultraNormalizeArabic(s.slice(5));
        if (norm && !norm.includes('ميخاييل ادور')) nameSet.add(norm);
      } else {
        idSet.add(s);
      }
    });
  } catch {}
  return { ids: Array.from(idSet), names: Array.from(nameSet) };
}

export function getPermanentDeletedIdsSet(serverIds?: any[]): Set<string> {
  const { ids } = getPermanentBlacklist();
  const set = new Set<string>();
  const addIdVariants = (val: any) => {
    const clean = String(val || '').trim();
    if (!clean || clean === 'reg_owner_main' || clean === 'TY-0001' || clean.startsWith('NAME:')) return;
    set.add(clean);
    const bare = clean.replace(/^reg_member_/, '');
    if (bare && bare !== 'reg_owner_main') {
      set.add(bare);
      set.add(`reg_member_${bare}`);
    }
  };
  ids.forEach(addIdVariants);
  if (Array.isArray(serverIds)) {
    serverIds.forEach(addIdVariants);
  }
  return set;
}

export function getPermanentDeletedNamesSet(serverNames?: any[]): Set<string> {
  const { names } = getPermanentBlacklist();
  const set = new Set<string>();
  const addName = (val: any) => {
    const norm = ultraNormalizeArabic(val);
    if (norm && !norm.includes('ميخاييل ادور')) {
      set.add(norm);
    }
  };
  names.forEach(addName);
  if (Array.isArray(serverNames)) {
    serverNames.forEach(addName);
  }
  return set;
}

export function getConfirmedDeletedIds(): Set<string> {
  const ids = getPermanentDeletedIdsSet();
  const names = getPermanentDeletedNamesSet();
  const combined = new Set<string>(ids);
  names.forEach((n) => combined.add(`NAME:${n}`));
  return combined;
}

export function addToPermanentBlacklist(entry: {
  id?: string;
  originalId?: string;
  fullName?: string;
  uniqueCode?: string;
}): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getPermanentBlacklist();
    const idSet = new Set<string>(current.ids);
    const nameSet = new Set<string>(current.names);

    const pushId = (val?: string) => {
      const clean = String(val || '').trim();
      if (!clean || clean === 'reg_owner_main' || clean === 'TY-0001') return;
      idSet.add(clean);
      const bare = clean.replace(/^reg_member_/, '');
      if (bare && bare !== 'reg_owner_main') {
        idSet.add(bare);
        idSet.add(`reg_member_${bare}`);
      }
    };

    if (entry.id) pushId(entry.id);
    if (entry.originalId) pushId(entry.originalId);
    if (entry.uniqueCode) pushId(entry.uniqueCode);
    if (entry.fullName) {
      const normName = ultraNormalizeArabic(entry.fullName);
      if (normName && !normName.includes('ميخاييل ادور')) {
        nameSet.add(normName);
      }
    }

    const nextBlacklist = { ids: Array.from(idSet), names: Array.from(nameSet) };
    localStorage.setItem(PERMANENT_BLACKLIST_KEY, JSON.stringify(nextBlacklist));

    const serializedIdsWithNames = JSON.stringify([
      ...nextBlacklist.ids,
      ...nextBlacklist.names.map((n) => `NAME:${n}`)
    ]);
    localStorage.setItem(CONFIRMED_DELETED_IDS_KEY, serializedIdsWithNames);
    localStorage.setItem('three_youths_deleted_ids_v2', serializedIdsWithNames);

    const allDeletedIds = getPermanentDeletedIdsSet(nextBlacklist.ids);
    const allDeletedNames = getPermanentDeletedNamesSet(nextBlacklist.names);

    const storageKeysToClean = [
      SAFE_BACKUP_MEMBERS_KEY,
      'three_youths_registrants_v3',
      'three_youths_registrants_v2',
      'three_youths_registrants_v1'
    ];
    for (const key of storageKeysToClean) {
      const rawList = localStorage.getItem(key);
      if (!rawList) continue;
      try {
        const parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((m: any) => {
            if (isGarbageOrGhostMember(m)) return false;
            const mid = String(m.id || '').trim();
            const morig = String(m.originalId || '').trim();
            const mcode = String(m.uniqueCode || '').trim();
            const mname = ultraNormalizeArabic(m.fullName || m.name || '');
            return (
              !allDeletedIds.has(mid) &&
              !allDeletedIds.has(morig) &&
              (!mcode || !allDeletedIds.has(mcode)) &&
              (!mname || !allDeletedNames.has(mname))
            );
          });
          localStorage.setItem(key, JSON.stringify(filtered));
        }
      } catch {}
    }
  } catch {}
}

export function filterOutDeletedAndGhosts(list: any[], serverBlacklist: any = {}): any[] {
  const deletedIds = getPermanentDeletedIdsSet(serverBlacklist?.ids);
  const deletedNames = getPermanentDeletedNamesSet(serverBlacklist?.names);
  return (Array.isArray(list) ? list : []).filter((m) => {
    if (isGarbageOrGhostMember(m)) return false;
    if (m.status === 'cancelled' || m.isDeleted === true) return false;
    const idStr = String(m.id || '').trim();
    const origIdStr = String(m.originalId || '').trim();
    const codeStr = String(m.uniqueCode || '').trim();
    const normName = ultraNormalizeArabic(m.name || m.fullName || '');
    if (idStr && deletedIds.has(idStr)) return false;
    if (origIdStr && deletedIds.has(origIdStr)) return false;
    if (codeStr && deletedIds.has(codeStr)) return false;
    if (normName && deletedNames.has(normName)) return false;
    return true;
  });
}

export function addConfirmedDeletedId(
  memberId: string,
  originalId?: string,
  fullName?: string,
  uniqueCode?: string
): void {
  if (!memberId || memberId === 'reg_owner_main') return;
  addToPermanentBlacklist({ id: memberId, originalId, fullName, uniqueCode });
}

export function removeConfirmedDeletedId(memberId: string, originalId?: string): void {
  if (!memberId || typeof localStorage === 'undefined') return;
  try {
    const current = getPermanentBlacklist();
    const cleanId = String(memberId).trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const toRemove = new Set([cleanId, bareId, `reg_member_${bareId}`]);
    if (originalId) toRemove.add(String(originalId).trim());
    const nextIds = current.ids.filter((id) => !toRemove.has(id));
    localStorage.setItem(PERMANENT_BLACKLIST_KEY, JSON.stringify({ ids: nextIds, names: current.names }));
    const serialized = JSON.stringify([
      ...nextIds,
      ...current.names.map((n) => `NAME:${n}`)
    ]);
    localStorage.setItem(CONFIRMED_DELETED_IDS_KEY, serialized);
    localStorage.setItem('three_youths_deleted_ids_v2', serialized);
  } catch {}
}

export function findMemberFlexibly(query: string, allAvailableMembers: any[]): any | undefined {
  if (!query || !Array.isArray(allAvailableMembers) || allAvailableMembers.length === 0) {
    return undefined;
  }
  const deletedSet = getConfirmedDeletedIds();
  const activeMembers = allAvailableMembers.filter(
    (m) =>
      m &&
      typeof m === 'object' &&
      m.status !== 'cancelled' &&
      !deletedSet.has(String(m.id || '').trim()) &&
      !deletedSet.has(String(m.originalId || '').trim())
  );

  const cleanInput = String(query).trim();
  const cleanLower = cleanInput.toLowerCase();
  const normQuery = ultraNormalizeArabic(cleanInput);
  const queryNoSpaces = normQuery.replace(/\s+/g, '');
  const queryWords = normQuery.split(' ').filter(Boolean);
  const queryDigits = normQuery.replace(/\D/g, '');
  const queryLast9 = queryDigits.length >= 7 ? queryDigits.slice(-9) : '';

  // 1. Exact or normalized full name / code / phone match
  for (const m of activeMembers) {
    const rawName = String(m.fullName || m.name || '').trim();
    const normMemberName = ultraNormalizeArabic(rawName);
    const memberNoSpaces = normMemberName.replace(/\s+/g, '');
    const codeLower = String(m.uniqueCode || '').trim().toLowerCase();

    if (normMemberName && normQuery && normMemberName === normQuery) return m;
    if (memberNoSpaces && queryNoSpaces && memberNoSpaces === queryNoSpaces) return m;
    if (codeLower && (codeLower === cleanLower || codeLower.replace(/[^a-z0-9]/g, '') === cleanLower.replace(/[^a-z0-9]/g, ''))) {
      return m;
    }
    if (queryLast9) {
      const mPhoneDigits = ultraNormalizeArabic(m.phone || '').replace(/\D/g, '');
      const mWaDigits = ultraNormalizeArabic(m.whatsapp || '').replace(/\D/g, '');
      if (
        (mPhoneDigits.length >= 7 && mPhoneDigits.slice(-9) === queryLast9) ||
        (mWaDigits.length >= 7 && mWaDigits.slice(-9) === queryLast9)
      ) {
        return m;
      }
    }
  }

  // 2. Prefix / ordered multi-word match (e.g. 3-part or 2-part name matching a 4-part registered name)
  if (queryWords.length >= 2) {
    for (const m of activeMembers) {
      const rawName = String(m.fullName || m.name || '').trim();
      const normMemberName = ultraNormalizeArabic(rawName);
      if (!normMemberName) continue;
      if (normMemberName.startsWith(normQuery) || normQuery.startsWith(normMemberName)) {
        return m;
      }
      const memberWords = normMemberName.split(' ').filter(Boolean);
      let lastIdx = -1;
      const allInOrder = queryWords.every((qw) => {
        const foundIdx = memberWords.findIndex((mw, idx) => idx > lastIdx && (mw === qw || mw.startsWith(qw) || qw.startsWith(mw)));
        if (foundIdx !== -1) {
          lastIdx = foundIdx;
          return true;
        }
        return false;
      });
      if (allInOrder) return m;
    }
  }

  return undefined;
}

/**
 * Smart Stale-Snapshot Purge & Safe Backup Preservation across Phone, Laptop, and AI Studio:
 * - Preserves any rich member list into SAFE_BACKUP_MEMBERS before touching cache keys
 * - Purges stale tombstones (three_youths_deleted_ids_v2, deletedIds, tombstones) that hid the 29 members
 * - Preserves logged-in user session
 */
export function enforceNuclearStaleCacheReset(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const deletedIds = getPermanentDeletedIdsSet();
    const deletedNames = getPermanentDeletedNamesSet();

    const backupMap = new Map<string, any>();
    const backupSources = [
      localStorage.getItem(SAFE_BACKUP_MEMBERS_KEY),
      localStorage.getItem('three_youths_registrants_v3'),
      localStorage.getItem('three_youths_registrants_v2')
    ];
    for (const raw of backupSources) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((m, idx) => {
            if (isGarbageOrGhostMember(m) || m.status === 'cancelled' || m.isDeleted === true) return;
            const idStr = String(m.id || '').trim();
            const origStr = String(m.originalId || '').trim();
            const codeStr = String(m.uniqueCode || '').trim();
            const fullName = String(m.fullName || m.name || '').trim();
            const normName = ultraNormalizeArabic(fullName);
            if (
              (idStr && deletedIds.has(idStr)) ||
              (origStr && deletedIds.has(origStr)) ||
              (codeStr && deletedIds.has(codeStr)) ||
              (normName && deletedNames.has(normName))
            ) {
              return;
            }
            const key = String(m.id || m.uniqueCode || `BK_${idx}`).trim();
            const existing = backupMap.get(key);
            if (!existing) {
              backupMap.set(key, m);
            } else {
              const exName = String(existing.fullName || existing.name || '').trim();
              if (exName && exName !== fullName) {
                backupMap.set(`${key}-ROW-${idx + 1}`, m);
              } else {
                const useExisting = Number(existing.lastModifiedAt || 0) > Number(m.lastModifiedAt || 0);
                backupMap.set(key, useExisting ? { ...m, ...existing } : { ...existing, ...m });
              }
            }
          });
        }
      } catch {}
    }
    if (backupMap.size > 0) {
      try {
        const cleanBackup = filterOutDeletedAndGhosts(Array.from(backupMap.values()));
        localStorage.setItem(SAFE_BACKUP_MEMBERS_KEY, JSON.stringify(cleanBackup));
      } catch {}
    }

    if (localStorage.getItem(CF_LIVE_SYNC_MODE_KEY) !== CF_LIVE_SYNC_MODE_VERSION) {
      const preservedSessionKeys = new Set([
        'currentUser',
        'loggedInUser',
        'auth_token',
        'three_youths_last_login',
        'three_youths_remembered_user',
        'three_youths_member_session_v2',
        'three_youths_admin_session_v2',
        'three_youths_owner_device_auth_v1',
        SAFE_BACKUP_MEMBERS_KEY,
        PERMANENT_BLACKLIST_KEY,
        CONFIRMED_DELETED_IDS_KEY,
        'three_youths_deleted_ids_v2'
      ]);
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || preservedSessionKeys.has(k)) continue;
        if (
          k === 'three_youths_registrants_v1' ||
          k === 'members' ||
          k === 'registrants' ||
          k === 'makhdomeen'
        ) {
          keysToRemove.push(k);
        }
      }
      // If local registrants v3 has <= 25 members (stale phone/AI Studio seed), clear it so it pulls fresh full list from Cloudflare
      try {
        const rawV3 = localStorage.getItem('three_youths_registrants_v3');
        if (rawV3) {
          const parsedV3 = JSON.parse(rawV3);
          if (Array.isArray(parsedV3) && parsedV3.length <= 25) {
            keysToRemove.push('three_youths_registrants_v3');
          }
        }
      } catch {}

      keysToRemove.forEach((k) => {
        try { localStorage.removeItem(k); } catch {}
      });
      localStorage.setItem(CF_LIVE_SYNC_MODE_KEY, CF_LIVE_SYNC_MODE_VERSION);
    }
  } catch {}
}

enforceNuclearStaleCacheReset();

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
let isSavingMemberLockUntil = 0;
const pendingSliceDebounceTimers = new Map<string, any>();
const pendingSlicePayloads = new Map<string, string>();

export function lockMemberSaveSync(durationMs = 8000): void {
  isSavingMemberLockUntil = Math.max(isSavingMemberLockUntil, Date.now() + durationMs);
}

export function isMemberSaveSyncLocked(): boolean {
  return Date.now() < isSavingMemberLockUntil;
}

export function updateCachedSnapshotMember(updatedMember: any): void {
  if (!updatedMember || typeof updatedMember !== 'object' || !updatedMember.id) return;
  const targetId = String(updatedMember.id).trim();
  const bareTargetId = targetId.replace(/^reg_member_/, '');
  const norm = normalizeMember(updatedMember);
  if (norm.photoUrl && norm.photoUrl.startsWith('data:image/')) {
    setCachedD1Photo(targetId, norm.photoUrl);
  }
  if (lastFetchedStateSnapshot && Array.isArray(lastFetchedStateSnapshot.registrants)) {
    const idx = lastFetchedStateSnapshot.registrants.findIndex((r: any) => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      return rid === targetId || rid.replace(/^reg_member_/, '') === bareTargetId;
    });
    if (idx >= 0) {
      lastFetchedStateSnapshot.registrants[idx] = {
        ...lastFetchedStateSnapshot.registrants[idx],
        ...norm,
        id: lastFetchedStateSnapshot.registrants[idx].id || targetId
      };
    } else {
      lastFetchedStateSnapshot.registrants.unshift(norm);
    }
  }
}

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
  meta?: { fullName?: string; phone?: string; uniqueCode?: string; originalId?: string }
): Promise<boolean> {
  if (!memberId || memberId === 'reg_owner_main') return false;
  lockPollingForMutation();
  addToPermanentBlacklist({
    id: memberId,
    originalId: meta?.originalId,
    fullName: meta?.fullName,
    uniqueCode: meta?.uniqueCode
  });
  removeCachedD1Photo(memberId);
  invalidateCloudflareEdgeVersion();
  serverRegistrantsCount = Math.max(0, serverRegistrantsCount - 1);
  if (lastFetchedStateSnapshot && Array.isArray(lastFetchedStateSnapshot.registrants)) {
    lastFetchedStateSnapshot.registrants = filterOutDeletedAndGhosts(
      lastFetchedStateSnapshot.registrants.filter((r: any) => String(r?.id || '').trim() !== String(memberId).trim())
    );
  }

  const payload = JSON.stringify({
    id: memberId,
    targetId: memberId,
    originalId: meta?.originalId || memberId,
    fullName: meta?.fullName || '',
    targetName: meta?.fullName || '',
    normalizedName: meta?.fullName ? ultraNormalizeArabic(meta.fullName) : '',
    phone: meta?.phone || '',
    uniqueCode: meta?.uniqueCode || ''
  });

  const executeFastDelete = async (): Promise<boolean> => {
    try {
      const res = await fetch(getCloudflareApiUrl(`/api/registrants/${encodeURIComponent(memberId)}`), {
        method: 'DELETE',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      if (res.ok) {
        try {
          const json = await res.json();
          if (json && json.version) {
            lastSyncedEdgeVersion = Number(json.version);
          }
        } catch {}
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  executeFastDelete()
    .then((ok) => {
      if (!ok) {
        setTimeout(() => {
          executeFastDelete().catch(() => {});
        }, 1500);
      }
    })
    .finally(() => {
      unlockPollingAfterMutation();
    });

  return true;
}

export async function deleteMembersBatchFromCloudflareD1(
  membersToDelete: Array<{ id: string; originalId?: string; fullName?: string; phone?: string; uniqueCode?: string }>
): Promise<boolean> {
  const validTargets = (Array.isArray(membersToDelete) ? membersToDelete : []).filter(
    (m) => m && m.id && m.id !== 'reg_owner_main'
  );
  if (validTargets.length === 0) return false;

  lockPollingForMutation();
  for (const t of validTargets) {
    addToPermanentBlacklist({
      id: t.id,
      originalId: t.originalId,
      fullName: t.fullName,
      uniqueCode: t.uniqueCode
    });
    removeCachedD1Photo(t.id);
  }
  invalidateCloudflareEdgeVersion();
  serverRegistrantsCount = Math.max(0, serverRegistrantsCount - validTargets.length);

  if (lastFetchedStateSnapshot && Array.isArray(lastFetchedStateSnapshot.registrants)) {
    const batchIdSet = new Set(validTargets.map((t) => String(t.id).trim()));
    lastFetchedStateSnapshot.registrants = filterOutDeletedAndGhosts(
      lastFetchedStateSnapshot.registrants.filter((r: any) => !batchIdSet.has(String(r?.id || '').trim()))
    );
  }

  const executeBatchDelete = async (): Promise<boolean> => {
    try {
      const res = await fetch(getCloudflareApiUrl('/api/members/delete-batch'), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Role': 'community_owner' },
        body: JSON.stringify({
          actorRole: 'community_owner',
          members: validTargets.map((t) => ({
            ...t,
            normalizedName: t.fullName ? ultraNormalizeArabic(t.fullName) : ''
          }))
        })
      });
      if (res.ok) {
        try {
          const json = await res.json();
          if (json && json.version) {
            lastSyncedEdgeVersion = Number(json.version);
          }
        } catch {}
        return true;
      }
      await Promise.allSettled(
        validTargets.map((t) =>
          deleteMemberFromCloudflareD1(t.id, {
            fullName: t.fullName,
            phone: t.phone,
            uniqueCode: t.uniqueCode,
            originalId: t.originalId
          })
        )
      );
      return true;
    } catch {
      return false;
    }
  };

  executeBatchDelete()
    .then((ok) => {
      if (!ok) {
        setTimeout(() => {
          executeBatchDelete().catch(() => {});
        }, 1500);
      }
    })
    .finally(() => {
      unlockPollingAfterMutation();
    });

  return true;
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
    // Allow attendance_session writes immediately even if initialFetchCompleted is still warming up
    if (!initialFetchCompleted && sliceKey !== 'attendance_session') {
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

    // Immediate zero-debounce dispatch for attendance_session so all servants see session start/end in 0ms
    if (sliceKey === 'attendance_session') {
      try {
        const res = await fetch(getCloudflareApiUrl('/api/announcements-add'), {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `D1_STATE:${sliceKey}`,
            body: serialized
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

/**
 * Fetches the live central attendanceSession directly from Cloudflare D1 (D1_STATE:attendance_session & system_bundle)
 * so any servant opening the camera or scanner gets the authoritative cloud session and timer immediately.
 */
export async function fetchAttendanceSessionFromCloudflareD1(): Promise<{
  isActive: boolean;
  startTime?: number;
  endTime: number;
  durationMinutes: number;
  startedBy?: string;
  startedAt?: string;
  updatedAt?: number;
} | null> {
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements?force=1&t=${Date.now()}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: NO_CACHE_FETCH_HEADERS
    });
    if (!res.ok) return null;
    const rawJson = await res.json();
    const rows = Array.isArray(rawJson)
      ? rawJson
      : Array.isArray(rawJson?.results)
        ? rawJson.results
        : [];
    if (rows.length === 0) return null;

    let bestSession: any = null;
    let bestUpdatedAt = 0;

    for (const row of rows) {
      if (!row || typeof row.title !== 'string') continue;
      const rawBody = row.body ?? row.message ?? row.content ?? row.description ?? '';
      if (row.title === 'D1_STATE:attendance_session' && rawBody) {
        try {
          const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
          if (parsed && typeof parsed === 'object') {
            const ts = Number(parsed.updatedAt || row.created_at || row.createdAt || 0);
            if (ts >= bestUpdatedAt) {
              bestUpdatedAt = ts;
              bestSession = parsed;
            }
          }
        } catch {}
      } else if (row.title === 'D1_STATE:system_bundle' && rawBody) {
        try {
          const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
          const sess = parsed?.attendanceSession;
          if (sess && typeof sess === 'object') {
            const ts = Number(sess.updatedAt || row.created_at || row.createdAt || 0);
            if (ts >= bestUpdatedAt) {
              bestUpdatedAt = ts;
              bestSession = sess;
            }
          }
        } catch {}
      }
    }

    return bestSession;
  } catch {
    return null;
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
  if (isGarbageOrGhostMember(raw)) {
    return {
      id: `GHOST-${index + 1}`,
      originalId: '',
      fullName: '',
      name: '',
      role: 'member',
      status: 'cancelled',
      isDeleted: true,
      gender: 'male',
      sex: 'male',
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
  const cleanFullName = String(raw.fullName || raw.name || '')
    .trim()
    .replace(/\s+/g, ' ');
  const isOwner =
    raw.id === 'reg_owner_main' ||
    raw.role === 'community_owner' ||
    normalizeArabicName(cleanFullName) === normalizeArabicName('ميخائيل ادور راتب') ||
    normalizeArabicName(cleanFullName) === normalizeArabicName('ميخائيل ادوار راتب');
  const rawId = String(raw.id || raw.originalId || '').trim();
  const origId = String(raw.originalId || raw.id || '').trim();
  const cleanNameSlug = cleanFullName.replace(/\s+/g, '_') || `member_${index + 1}`;
  const normalizedId = isOwner
    ? 'reg_owner_main'
    : rawId
      ? (rawId.startsWith('reg_member_reg_')
          ? rawId.replace(/^reg_member_/, '')
          : rawId)
      : `CF-STATIC-${index + 1}-${cleanNameSlug}`;

  let parsedPermissions = raw.permissions;
  if (typeof parsedPermissions === 'string') {
    try {
      parsedPermissions = JSON.parse(parsedPermissions);
    } catch {
      parsedPermissions = undefined;
    }
  }

  const finalGender = isOwner ? 'male' : getMemberGender({ ...raw, fullName: cleanFullName, name: cleanFullName });
  const finalDob = String(raw.dob ?? raw.birthDate ?? '').trim();
  const finalAddress = String(raw.address ?? raw.residence ?? '').trim();
  const finalNotes = String(raw.notes ?? raw.talents ?? raw.skills ?? '').trim();
  const finalPhoto = String(raw.photoUrl || raw.avatar || raw.image || '').trim();
  const finalUpdatedAt = Number(
    raw.updatedAt || (raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt).getTime() : 0) || 0
  );
  const finalLastModifiedAt = Number(raw.lastModifiedAt || finalUpdatedAt || 0) || undefined;

  return {
    ...raw,
    id: normalizedId,
    originalId: origId || normalizedId,
    fullName: cleanFullName,
    name: cleanFullName,
    role: isOwner ? 'community_owner' : (raw.role || 'member'),
    permissions: parsedPermissions && typeof parsedPermissions === 'object' ? { ...parsedPermissions } : raw.permissions,
    status: raw.status === 'cancelled' || raw.isDeleted === true ? 'cancelled' : 'active',
    isDeleted: Boolean(raw.isDeleted || raw.status === 'cancelled'),
    gender: finalGender,
    sex: finalGender,
    genderCode: raw.genderCode || (raw.genderLocked ? finalGender : undefined),
    manualGender: raw.manualGender || (raw.genderLocked ? finalGender : undefined),
    genderLabel: raw.genderLabel || (finalGender === 'female' ? 'أنثى' : 'ذكر'),
    type: raw.type || (finalGender === 'female' ? 'شابة' : 'شاب'),
    category: raw.category || (finalGender === 'female' ? 'شابات' : 'شباب'),
    genderLocked: Boolean(raw.genderLocked || raw.manualGender || raw.genderCode),
    phone: String(raw.phone || raw.whatsapp || '').trim(),
    whatsapp: String(raw.whatsapp || raw.phone || '').trim(),
    dob: finalDob,
    birthDate: finalDob,
    address: finalAddress,
    residence: finalAddress,
    notes: finalNotes,
    talents: finalNotes,
    skills: finalNotes,
    photoUrl: finalPhoto,
    stamps: raw.stamps && typeof raw.stamps === 'object' ? raw.stamps : undefined,
    fridayStamps: raw.fridayStamps && typeof raw.fridayStamps === 'object' ? raw.fridayStamps : undefined,
    attendanceDates: Array.isArray(raw.attendanceDates) ? raw.attendanceDates : undefined,
    attendanceHistory: Array.isArray(raw.attendanceHistory) ? raw.attendanceHistory : undefined,
    attendance: Array.isArray(raw.attendance) ? raw.attendance : undefined,
    presentDates: Array.isArray(raw.presentDates) ? raw.presentDates : undefined,
    lastAttendance: raw.lastAttendance || undefined,
    updatedAt: finalUpdatedAt || undefined,
    lastUpdatedAt: raw.lastUpdatedAt || (finalUpdatedAt ? new Date(finalUpdatedAt).toISOString() : undefined),
    lastModifiedAt: finalLastModifiedAt,
    registeredAt: raw.registeredAt || raw.createdAt || '2026-01-01T00:00:00.000Z'
  };
}

const persistedCollisionRepairs = new Set<string>();

/**
 * Explicitly decouples collided accounts:
 * 1. (`جورج ناصر` vs `نونيسيا`)
 * 2. (`كيرلس جوزيف فوزي` vs `مهرائيل حافظ`)
 * and performs a global de-duplication pass across all members in Cloudflare Database.
 */
export function repairDuplicateQRCodesAndIds(rawArray: any[]): {
  repairedList: any[];
  modifiedMembers: any[];
} {
  if (!Array.isArray(rawArray)) return { repairedList: [], modifiedMembers: [] };

  const usedIds = new Map<string, string>();
  const usedCodes = new Set<string>(['TY-0001']);
  const usedQrs = new Set<string>(['TY-0001']);
  let codeSeq = 2;

  const allocNextUniqueCode = () => {
    while (usedCodes.has(`TY-${String(codeSeq).padStart(4, '0')}`)) {
      codeSeq++;
    }
    const c = `TY-${String(codeSeq).padStart(4, '0')}`;
    usedCodes.add(c);
    usedQrs.add(c);
    return c;
  };

  let nonesiaId = '';
  let nonesiaCode = '';
  let mahraelId = '';
  let mahraelCode = '';

  for (const item of rawArray) {
    if (!item || typeof item !== 'object') continue;
    const nName = normalizeArabicName(item.fullName || item.name || '');
    if (nName.includes('نونيسيا') || nName.includes('نونسيا')) {
      nonesiaId = String(item.id || '').trim();
      nonesiaCode = String(item.uniqueCode || '').trim().toUpperCase();
    }
    if (nName.includes('مهراييل حافظ') || nName.includes('مهرائيل حافظ') || nName.includes('مهراييل')) {
      mahraelId = String(item.id || '').trim();
      mahraelCode = String(item.uniqueCode || '').trim().toUpperCase();
    }
  }

  const repairedList: any[] = [];
  const modifiedMembers: any[] = [];

  rawArray.forEach((rawMember, index) => {
    if (isGarbageOrGhostMember(rawMember)) return;
    const member = normalizeMember(rawMember, index);
    if (isGarbageOrGhostMember(member)) return;
    const normName = normalizeArabicName(member.fullName || member.name || '');
    const isOwner = member.id === 'reg_owner_main' || member.role === 'community_owner';

    if (isOwner) {
      member.id = 'reg_owner_main';
      member.uniqueCode = 'TY-0001';
      member.qrData = 'TY-0001';
      usedIds.set('reg_owner_main', normName);
      repairedList.push(member);
      return;
    }

    let needsRepair = false;
    let currentId = String(member.id || '').trim();
    let currentCode = String(member.uniqueCode || '').trim().toUpperCase();
    let currentQr = String(member.qrData || currentCode).trim();

    // Explicit Case 1: جورج ناصر decoupled from نونيسيا
    const isGeorgeNasser = normName.includes('جورج ناصر');
    if (isGeorgeNasser) {
      const dedicatedGeorgeId = '3FY-GEORGE-NASSER-01';
      if (
        !currentId ||
        currentId === nonesiaId ||
        currentId.startsWith('reg_1794592034080') ||
        (usedIds.has(currentId) && usedIds.get(currentId) !== normName)
      ) {
        currentId = dedicatedGeorgeId;
        needsRepair = true;
      }
      if (
        !currentCode ||
        currentCode === 'TY-0001' ||
        currentCode === nonesiaCode ||
        usedCodes.has(currentCode)
      ) {
        currentCode = allocNextUniqueCode();
        currentQr = currentCode;
        needsRepair = true;
      }
    }

    // Explicit Case 2: كيرلس جوزيف فوزي decoupled from مهرائيل حافظ
    const isKirollosJoseph = normName.includes('كيرلس جوزيف');
    if (isKirollosJoseph) {
      const dedicatedKirollosId = '3FY-KIROLLOS-JOSEPH-01';
      if (
        !currentId ||
        currentId === mahraelId ||
        currentId.startsWith('reg_1794592034080') ||
        (usedIds.has(currentId) && usedIds.get(currentId) !== normName)
      ) {
        currentId = dedicatedKirollosId;
        needsRepair = true;
      }
      if (
        !currentCode ||
        currentCode === 'TY-0001' ||
        currentCode === mahraelCode ||
        usedCodes.has(currentCode)
      ) {
        currentCode = allocNextUniqueCode();
        currentQr = currentCode;
        needsRepair = true;
      }
    }

    // Global De-duplication Check for any other collided ID or QR Code
    if (!currentId || usedIds.has(currentId)) {
      let hashAcc = 0;
      const seed = `${normName}_${index + 1}`;
      for (let i = 0; i < seed.length; i++) {
        hashAcc = ((hashAcc << 5) - hashAcc + seed.charCodeAt(i)) | 0;
      }
      const detId = `3FY-${Math.abs(hashAcc).toString(36).toUpperCase()}-${index + 1}`;
      currentId = usedIds.has(detId) ? `${detId}-${Date.now().toString(36)}` : detId;
      needsRepair = true;
    }

    if (!currentCode || currentCode === 'TY-0001' || usedCodes.has(currentCode)) {
      currentCode = allocNextUniqueCode();
      currentQr = currentCode;
      needsRepair = true;
    } else {
      usedCodes.add(currentCode);
      if (!currentQr || usedQrs.has(currentQr)) {
        currentQr = currentCode;
        needsRepair = true;
      }
      usedQrs.add(currentQr);
    }

    usedIds.set(currentId, normName);

    const finalMember = {
      ...member,
      id: currentId,
      originalId: member.originalId || currentId,
      uniqueCode: currentCode,
      qrData: currentQr || currentCode
    };

    if (needsRepair) {
      const nowMs = Date.now();
      finalMember.updatedAt = finalMember.updatedAt || nowMs;
      finalMember.lastUpdatedAt = finalMember.lastUpdatedAt || new Date(nowMs).toISOString();
      modifiedMembers.push(finalMember);
    }

    repairedList.push(finalMember);
  });

  return { repairedList, modifiedMembers };
}

export function lossLessMembers(rawArray: any[]): any[] {
  const { repairedList } = repairDuplicateQRCodesAndIds(rawArray);
  return repairedList;
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

    // 3. No Blind Overwrite & Incomplete Hydration Guard (<= 2 members):
    const validInputCount = (Array.isArray(registrants) ? registrants : []).filter(
      (r: any) => r && r.id
    ).length;
    if (validInputCount <= 2 && !isNewRegistration) {
      console.warn('[Cloudflare Safety Guard] Incomplete hydration (<= 2 members); blocking overwrite.');
      return false;
    }
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

    // Union-merge with lastFetchedStateSnapshot?.registrants while strictly excluding PERMANENT_BLACKLIST (IDs + Names) and Ghost records
    const revokedSet = getPermanentDeletedIdsSet(lastFetchedStateSnapshot?.deletedRegistrantIds);
    const revokedNamesSet = getPermanentDeletedNamesSet(lastFetchedStateSnapshot?.serverTombstones?.names);
    const mergedById = new Map<string, any>();
    const mergedByName = new Map<string, string>();

    const isBlacklistedOrGhost = (item: any) => {
      if (isGarbageOrGhostMember(item) || item.status === 'cancelled' || item.isDeleted === true) return true;
      const iid = String(item.id || '').trim();
      const iorig = String(item.originalId || '').trim();
      const icode = String(item.uniqueCode || '').trim();
      const iname = ultraNormalizeArabic(item.fullName || item.name || '');
      return (
        (iid && revokedSet.has(iid)) ||
        (iorig && revokedSet.has(iorig)) ||
        (icode && revokedSet.has(icode)) ||
        (iname && revokedNamesSet.has(iname))
      );
    };

    const prevCloudRegs = !allowExplicitShrink && Array.isArray(lastFetchedStateSnapshot?.registrants)
      ? lastFetchedStateSnapshot!.registrants
      : [];

    for (const prev of prevCloudRegs) {
      if (!prev || typeof prev !== 'object' || !prev.id || isBlacklistedOrGhost(prev)) continue;
      const pid = String(prev.id).trim();
      const pname = String(prev.fullName || prev.name || '').trim();
      mergedById.set(pid, prev);
      const nk = ultraNormalizeArabic(pname);
      if (nk) mergedByName.set(nk, pid);
    }

    for (const r of (Array.isArray(registrants) ? registrants : [])) {
      if (!r || typeof r !== 'object' || !r.id || isBlacklistedOrGhost(r)) continue;
      const rid = String(r.id).trim();
      const rname = String(r.fullName || r.name || '').trim();
      const nk = ultraNormalizeArabic(rname);
      const existingIdByName = nk ? mergedByName.get(nk) : undefined;
      const targetId = mergedById.has(rid) ? rid : (existingIdByName || rid);
      const prev = mergedById.get(targetId);
      const prevTs = Number(prev?.lastModifiedAt || prev?.updatedAt || (prev?.lastUpdatedAt ? new Date(prev.lastUpdatedAt).getTime() : 0) || 0);
      const incTs = Number(r.lastModifiedAt || r.updatedAt || (r.lastUpdatedAt ? new Date(r.lastUpdatedAt).getTime() : 0) || 0);
      if (prev && prevTs > incTs) {
        mergedById.set(targetId, { ...r, ...prev, id: targetId });
      } else {
        mergedById.set(targetId, prev ? { ...prev, ...r, id: targetId } : { ...r, id: targetId });
      }
      if (nk) mergedByName.set(nk, targetId);
    }

    if (changedMember && changedMember.id && !isBlacklistedOrGhost(changedMember)) {
      const cid = String(changedMember.id).trim();
      const prev = mergedById.get(cid);
      const mergedChanged = prev ? { ...prev, ...changedMember, id: cid } : { ...changedMember, id: cid };
      mergedById.set(cid, mergedChanged);
      updateCachedSnapshotMember(mergedChanged);
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
          copy.qrData = 'TY-0001';
          if (copy.permissions && typeof copy.permissions === 'object') {
            const lightPerms: Record<string, any> = {};
            for (const [k, v] of Object.entries(copy.permissions)) {
              if (!k.startsWith('__system')) lightPerms[k] = v;
            }
            copy.permissions = lightPerms;
          }
        } else {
          const candidateCode = String(copy.uniqueCode || '').trim().toUpperCase();
          if (candidateCode && candidateCode !== 'TY-0001' && !usedCodes.has(candidateCode)) {
            usedCodes.add(candidateCode);
            copy.uniqueCode = candidateCode;
            copy.qrData = String(copy.qrData || candidateCode).trim();
          } else {
            const freshCode = allocNextCode();
            copy.uniqueCode = freshCode;
            copy.qrData = freshCode;
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

export function applySmartNeverShrinkState(
  prevMembers: any[],
  incomingMembers: any[],
  serverBlacklist: any = {}
): any[] {
  const normalizedBlacklist = Array.isArray(serverBlacklist)
    ? { ids: serverBlacklist, names: [] }
    : (serverBlacklist || {});

  const deletedIds = getPermanentDeletedIdsSet(normalizedBlacklist?.ids);
  const deletedNames = getPermanentDeletedNamesSet(normalizedBlacklist?.names);

  const cleanList = (list: any[]) =>
    (Array.isArray(list) ? list : []).filter((m) => {
      if (isGarbageOrGhostMember(m)) return false;
      if (m.status === 'cancelled' || m.isDeleted === true) return false;
      const idStr = String(m.id || '').trim();
      const origIdStr = String(m.originalId || '').trim();
      const codeStr = String(m.uniqueCode || '').trim();
      const normName = ultraNormalizeArabic(m.name || m.fullName || '');
      if (idStr && deletedIds.has(idStr)) return false;
      if (origIdStr && deletedIds.has(origIdStr)) return false;
      if (codeStr && deletedIds.has(codeStr)) return false;
      if (normName && deletedNames.has(normName)) return false;
      return true;
    });

  const cleanPrev = cleanList(prevMembers);

  if (!incomingMembers || !Array.isArray(incomingMembers) || incomingMembers.length === 0) {
    return cleanPrev.map((m) => {
      const g = getMemberGender(m);
      return { ...m, gender: g, sex: g };
    });
  }

  const cleanIncoming = cleanList(incomingMembers);

  // Smart Never-Shrink Shield: block anomalous partial/corrupted responses (<= 25 members, e.g. 1 owner or 17 old mocks) when real list > 30
  if (cleanPrev.length > 30 && cleanIncoming.length <= 25) {
    console.warn('Smart Never-Shrink blocked partial/corrupted state drop:', cleanIncoming.length);
    return cleanPrev.map((m) => {
      const g = getMemberGender(m);
      return { ...m, gender: g, sex: g };
    });
  }

  const prevMap = new Map<string, any>();
  const prevNameMap = new Map<string, any>();
  cleanPrev.forEach((m) => {
    if (m && m.id) prevMap.set(String(m.id), m);
    const nk = ultraNormalizeArabic(m?.fullName || m?.name || '');
    if (nk) prevNameMap.set(nk, m);
  });

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const finalMembers: any[] = [];

  cleanIncoming.forEach((serverMem, idx) => {
    const rawName = String(serverMem.fullName || serverMem.name || '').trim();
    const nk = ultraNormalizeArabic(rawName);
    if (nk && seenNames.has(nk)) return;

    let safeId = String(serverMem.id || '').trim();
    if (!safeId || seenIds.has(safeId)) {
      safeId = `${safeId || 'CF'}-${idx + 1}`;
    }
    seenIds.add(safeId);
    if (nk) seenNames.add(nk);

    const localMem =
      prevMap.get(safeId) ||
      prevMap.get(String(serverMem.id || '').trim()) ||
      (nk ? prevNameMap.get(nk) : undefined);

    const localTs = Number(localMem?.lastModifiedAt || localMem?.updatedAt || 0);
    const serverTs = Number(serverMem.lastModifiedAt || serverMem.updatedAt || 0);
    const useLocalEdits = Boolean(localMem && localTs > serverTs);
    const merged = useLocalEdits
      ? { ...serverMem, ...localMem }
      : { ...(localMem || {}), ...serverMem };

    const resolvedGender = getMemberGender(merged);
    finalMembers.push({
      ...merged,
      id: safeId,
      originalId: serverMem.originalId || serverMem.id || localMem?.originalId || safeId,
      fullName: String(merged.fullName || merged.name || '').trim(),
      name: String(merged.name || merged.fullName || '').trim(),
      gender: resolvedGender,
      sex: resolvedGender,
      genderCode: merged.genderCode || (merged.genderLocked ? resolvedGender : undefined),
      manualGender: merged.manualGender || (merged.genderLocked ? resolvedGender : undefined),
      role: merged.role || 'member',
      status: 'active',
      isDeleted: false
    });
  });

  if (finalMembers.length > 25 && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SAFE_BACKUP_MEMBERS_KEY, serializeRegistrantsForLocalCache(finalMembers, true));
    } catch {}
  }
  return finalMembers;
}

export function mergeAndEnrichWithPermanent95(
  membersList: any[],
  serverBlacklist: any = {},
  permanentCatalog?: any[]
): any[] {
  unblacklistRestoredFourOnce();
  const catalog = Array.isArray(permanentCatalog) && permanentCatalog.length > 0
    ? permanentCatalog
    : cachedPermanent95List;

  const baseList = Array.isArray(membersList) ? membersList : [];
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return baseList;
  }

  const normalizedBlacklist = Array.isArray(serverBlacklist)
    ? { ids: serverBlacklist, names: [] }
    : (serverBlacklist || {});
  const deletedIds = getPermanentDeletedIdsSet(normalizedBlacklist?.ids);
  const deletedNames = getPermanentDeletedNamesSet(normalizedBlacklist?.names);

  const isDeletedMember = (m: any) => {
    if (!m || typeof m !== 'object') return true;
    const idStr = String(m.id || '').trim();
    const origStr = String(m.originalId || '').trim();
    const codeStr = String(m.uniqueCode || '').trim();
    const normName = ultraNormalizeArabic(m.fullName || m.name || '');
    return (
      (idStr && deletedIds.has(idStr)) ||
      (origStr && deletedIds.has(origStr)) ||
      (codeStr && deletedIds.has(codeStr)) ||
      (normName && deletedNames.has(normName))
    );
  };

  const permByNormName = new Map<string, any>();
  const permById = new Map<string, any>();
  const permByCode = new Map<string, any>();

  for (const pm of catalog) {
    if (!pm || typeof pm !== 'object' || isGarbageOrGhostMember(pm)) continue;
    const pName = ultraNormalizeArabic(pm.fullName || pm.name || '');
    const pid = String(pm.id || '').trim();
    const pBare = pid.replace(/^reg_member_/, '');
    const pCode = String(pm.uniqueCode || '').trim().toUpperCase();
    if (pName) permByNormName.set(pName, pm);
    if (pid) permById.set(pid, pm);
    if (pBare) {
      permById.set(pBare, pm);
      permById.set(`reg_member_${pBare}`, pm);
    }
    if (pCode) permByCode.set(pCode, pm);
  }

  const enrichedList: any[] = [];
  const coveredNormNames = new Set<string>();
  const coveredIds = new Set<string>();

  for (let i = 0; i < baseList.length; i++) {
    const raw = baseList[i];
    if (isGarbageOrGhostMember(raw) || raw.status === 'cancelled' || raw.isDeleted === true) continue;
    if (isDeletedMember(raw)) continue;

    const rid = String(raw.id || '').trim();
    const bareRid = rid.replace(/^reg_member_/, '');
    const rCode = String(raw.uniqueCode || '').trim().toUpperCase();
    const rNormName = ultraNormalizeArabic(raw.fullName || raw.name || '');

    const permMatch =
      (rNormName ? permByNormName.get(rNormName) : undefined) ||
      (rid ? permById.get(rid) : undefined) ||
      (bareRid ? permById.get(bareRid) : undefined) ||
      (rCode ? permByCode.get(rCode) : undefined);

    if (permMatch) {
      const isBareIncoming =
        !rid ||
        /^CF_\d+$/i.test(rid) ||
        /^CF-STATIC-/i.test(rid) ||
        !raw.phone ||
        !raw.uniqueCode ||
        !raw.photoUrl ||
        String(raw.photoUrl).startsWith('__D1_PHOTO_REF__:');

      const canonicalId =
        (!rid || /^CF_\d+$/i.test(rid) || /^CF-STATIC-/i.test(rid))
          ? permMatch.id
          : (permMatch.id || rid);

      const resolvedPhoto =
        (raw.photoUrl && String(raw.photoUrl).includes('data:image/'))
          ? raw.photoUrl
          : (permMatch.photoUrl || raw.photoUrl || '');

      const resolvedPhone = String(raw.phone || permMatch.phone || '').trim();
      const resolvedWhatsapp = String(raw.whatsapp || permMatch.whatsapp || resolvedPhone || '').trim();
      const resolvedDob = String(raw.dob || raw.birthDate || permMatch.dob || permMatch.birthDate || '').trim();
      const resolvedAddress = String(raw.address || raw.residence || permMatch.address || permMatch.residence || '').trim();
      const resolvedNotes = String(raw.notes || raw.talents || permMatch.notes || permMatch.talents || '').trim();
      const resolvedCode = String(
        (raw.uniqueCode && !/^CF/i.test(raw.uniqueCode) ? raw.uniqueCode : '') ||
        permMatch.uniqueCode ||
        ''
      ).trim().toUpperCase();
      const resolvedRole =
        raw.id === 'reg_owner_main' || permMatch.id === 'reg_owner_main' || raw.role === 'community_owner' || permMatch.role === 'community_owner'
          ? 'community_owner'
          : (raw.role && raw.role !== 'member')
            ? raw.role
            : (permMatch.role || raw.role || 'member');

      const merged = normalizeMember({
        ...permMatch,
        ...(isBareIncoming ? {} : raw),
        id: canonicalId,
        originalId: raw.originalId || permMatch.originalId || canonicalId,
        fullName: (!isBareIncoming && raw.fullName) ? raw.fullName : (permMatch.fullName || raw.fullName || raw.name),
        name: (!isBareIncoming && raw.fullName) ? raw.fullName : (permMatch.fullName || raw.fullName || raw.name),
        uniqueCode: resolvedCode,
        qrData: String(permMatch.qrData || resolvedCode).trim(),
        phone: resolvedPhone,
        whatsapp: resolvedWhatsapp,
        dob: resolvedDob,
        birthDate: resolvedDob,
        address: resolvedAddress,
        residence: resolvedAddress,
        notes: resolvedNotes,
        talents: resolvedNotes,
        skills: resolvedNotes,
        role: resolvedRole,
        photoUrl: resolvedPhoto,
        gender: raw.genderLocked ? getMemberGender(raw) : getMemberGender({ ...permMatch, ...raw }),
        sex: raw.genderLocked ? getMemberGender(raw) : getMemberGender({ ...permMatch, ...raw }),
        genderLocked: Boolean(raw.genderLocked || permMatch.genderLocked),
        stamps: { ...(permMatch.stamps || {}), ...(raw.stamps || {}) },
        fridayStamps: { ...(permMatch.fridayStamps || {}), ...(raw.fridayStamps || {}) },
        attendanceDates: Array.from(
          new Set([
            ...(Array.isArray(permMatch.attendanceDates) ? permMatch.attendanceDates : []),
            ...(Array.isArray(raw.attendanceDates) ? raw.attendanceDates : [])
          ])
        ),
        attendanceHistory:
          Array.isArray(raw.attendanceHistory) && raw.attendanceHistory.length >= (Array.isArray(permMatch.attendanceHistory) ? permMatch.attendanceHistory.length : 0)
            ? raw.attendanceHistory
            : (permMatch.attendanceHistory || raw.attendanceHistory),
        permissions: raw.permissions || permMatch.permissions,
        status: 'active',
        isDeleted: false
      }, i);

      enrichedList.push(merged);
      const finalNorm = ultraNormalizeArabic(merged.fullName || '');
      if (finalNorm) coveredNormNames.add(finalNorm);
      coveredIds.add(String(merged.id));
    } else {
      const normalized = normalizeMember(raw, i);
      enrichedList.push(normalized);
      if (rNormName) coveredNormNames.add(rNormName);
      if (normalized.id) coveredIds.add(String(normalized.id));
    }
  }

  // Restore any missing active permanent member not blacklisted
  for (let i = 0; i < catalog.length; i++) {
    const pm = catalog[i];
    if (!pm || isGarbageOrGhostMember(pm)) continue;
    if (isDeletedMember(pm)) continue;
    const pNorm = ultraNormalizeArabic(pm.fullName || pm.name || '');
    const pid = String(pm.id || '').trim();
    if ((pNorm && coveredNormNames.has(pNorm)) || (pid && coveredIds.has(pid))) {
      continue;
    }
    const hydrated = normalizeMember({ ...pm, status: 'active', isDeleted: false }, enrichedList.length);
    enrichedList.push(hydrated);
    if (pNorm) coveredNormNames.add(pNorm);
    if (hydrated.id) coveredIds.add(String(hydrated.id));
  }

  return enrichedList;
}

export function applyNeverShrinkMembersUpdate(
  prevMembers: any[],
  incomingMembers: any[],
  serverBlacklist: any = {}
): any[] {
  return applySmartNeverShrinkState(prevMembers, incomingMembers, serverBlacklist);
}

export async function fetchFullStateFromCloudflareD1(force = false): Promise<Record<string, any> | null> {
  // 0. 10-Second Polling Freeze & Save Lock Guard
  if (!force && (isPollingFrozen() || isMemberSaveSyncLocked()) && lastFetchedStateSnapshot) {
    return { __unchanged: true, ...lastFetchedStateSnapshot };
  }

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

  if (!force && hasCompleteSnapshot && now - lastCompletedFetchAt < 800) {
    return { __unchanged: true, ...lastFetchedStateSnapshot };
  }

  inFlightFetchStatePromise = (async () => {
    try {
      const ts = Date.now();
      const queryParam = force ? `?force=1&t=${ts}` : `?t=${ts}`;
      const [annsRes, sqlMembersRes] = await Promise.all([
        fetch(`${CLOUDFLARE_WORKER_URL}/api/announcements${queryParam}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: NO_CACHE_FETCH_HEADERS
        }).catch(() => null),
        fetch(`${CLOUDFLARE_WORKER_URL}/api/members${queryParam}`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: NO_CACHE_FETCH_HEADERS
        }).catch(() => null),
        loadPermanent95Members().catch(() => [])
      ]);

      const slices: Record<string, { ts: number; raw: string }> = {};
      let annJson: any = null;

      if (annsRes && annsRes.ok) {
        annJson = await annsRes.json();
        if (annJson && (annJson.lastModified || annJson.version)) {
          lastSyncedEdgeVersion = Number(annJson.lastModified || annJson.version);
        }
        const rows = Array.isArray(annJson?.results) ? annJson.results : [];
        for (const row of rows) {
          if (!row || typeof row.title !== 'string') continue;
          const rowTs = Number(row.created_at || 0);
          if (row.title.startsWith('D1_STATE:')) {
            const key = row.title.replace('D1_STATE:', '').trim();
            if (key && row.body && (!slices[key] || rowTs >= slices[key].ts)) {
              slices[key] = { ts: rowTs, raw: row.body };
            }
          }
        }
      } else {
        // Automatic fallback to /api/data (Edge KV + master union) when D1 /api/announcements returns 500 D1_ERROR
        try {
          const dataRes = await fetch(`${CLOUDFLARE_WORKER_URL}/api/data${queryParam}`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: NO_CACHE_FETCH_HEADERS
          });
          if (dataRes.ok) {
            const dataJson = await dataRes.json();
            if (dataJson?.version) {
              lastSyncedEdgeVersion = Number(dataJson.version);
            }
            const d = dataJson?.data || {};
            if (Array.isArray(d.registrants)) {
              slices.registrants = { ts, raw: JSON.stringify(d.registrants) };
            }
            if (Array.isArray(d.announcements)) {
              slices.announcements = { ts, raw: JSON.stringify(d.announcements) };
            }
            if (Array.isArray(d.attendance)) {
              slices.attendance_records = { ts, raw: JSON.stringify(d.attendance) };
            }
            if (Array.isArray(d.blockedUsers)) {
              slices.blocked_users = { ts, raw: JSON.stringify(d.blockedUsers) };
            }
            if (d.siteTextsRaw && typeof d.siteTextsRaw === 'object') {
              slices.site_texts = { ts, raw: JSON.stringify(d.siteTextsRaw) };
            }
            if (Array.isArray(d.revokedMembersLog)) {
              slices.revoked_members_log = { ts, raw: JSON.stringify(d.revokedMembersLog) };
            }
            annJson = { lastModified: dataJson?.version || ts, version: dataJson?.version || ts };
          }
        } catch {}
      }

      if (Object.keys(slices).length === 0 && cachedPermanent95List.length === 0) {
        return lastFetchedStateSnapshot;
      }

      const assembled: Record<string, any> = {};
      const revokedIdSet = new Set<string>();
      const revokedNameSet = new Set<string>();

      // Parse active registrants from D1_STATE:registrants (1:1 Server Source of Truth without client-side tombstone dropping)
      let parsedActiveRegs: any[] = [];
      const activeSliceIdSet = new Set<string>();
      if (slices.registrants) {
        try {
          const parsed = JSON.parse(slices.registrants.raw);
          if (Array.isArray(parsed)) {
            parsedActiveRegs = parsed;
            for (const r of parsed) {
              if (!r || typeof r !== 'object') continue;
              const rid = String(r.id || '').trim();
              if (rid) {
                activeSliceIdSet.add(rid);
                activeSliceIdSet.add(rid.replace(/^reg_member_/, ''));
              }
            }
          }
        } catch {}
      }

      const confirmedLocalDeletedIds = getPermanentDeletedIdsSet();
      const confirmedLocalDeletedNames = getPermanentDeletedNamesSet();
      confirmedLocalDeletedIds.forEach((id) => revokedIdSet.add(id));
      confirmedLocalDeletedNames.forEach((name) => revokedNameSet.add(name));

      if (slices.revoked_members_log) {
        try {
          const parsedRevoked = JSON.parse(slices.revoked_members_log.raw);
          if (Array.isArray(parsedRevoked)) {
            assembled.revokedMembersLog = parsedRevoked;
            for (const entry of parsedRevoked) {
              const revId = typeof entry === 'string' ? entry : entry?.id;
              const revOrig = typeof entry === 'object' ? entry?.originalId : '';
              const revCode = typeof entry === 'object' ? entry?.uniqueCode : '';
              const bareRevId = String(revId || '').replace(/^reg_member_/, '');
              if (revId && revId !== 'reg_owner_main') {
                revokedIdSet.add(String(revId));
                if (bareRevId) {
                  revokedIdSet.add(bareRevId);
                  revokedIdSet.add(`reg_member_${bareRevId}`);
                }
              }
              if (revOrig && revOrig !== 'reg_owner_main') revokedIdSet.add(String(revOrig));
              if (revCode && revCode !== 'TY-0001') revokedIdSet.add(String(revCode));
              if (entry && typeof entry === 'object' && (entry.fullName || entry.normalizedName)) {
                const nRevName = ultraNormalizeArabic(entry.normalizedName || entry.fullName);
                if (nRevName && !nRevName.includes('ميخاييل ادور')) revokedNameSet.add(nRevName);
              }
            }
          }
        } catch {}
      }
      assembled.serverTombstones = {
        ids: Array.from(revokedIdSet),
        names: Array.from(revokedNameSet)
      };

      // Unify D1_STATE:registrants + SQL members table 1:1 while strictly respecting explicit deletions and ghost removal
      const hydrateMemberPhoto = (r: any, index = 0) => {
        if (isGarbageOrGhostMember(r)) return r;
        const normalized = normalizeMember(r, index);
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
          const cached = getCachedD1Photo(refId) || (r.originalId ? getCachedD1Photo(r.originalId) : null);
          if (cached) {
            r.photoUrl = cached;
            r.avatar = cached;
          } else {
            fetchD1PhotoLazy(refId);
            r.photoUrl = refId === 'reg_owner_main' ? '/owner_portrait.jpg' : '';
          }
        } else if (!rawPhoto && r.id) {
          const cached = getCachedD1Photo(r.id) || (r.originalId ? getCachedD1Photo(r.originalId) : null);
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

      const rawCombinedServerList: any[] = [];
      const seenServerIds = new Set<string>();
      const seenServerNames = new Set<string>();

      const addMemberToUnion = (rawObj: any, idxHint: number) => {
        if (isGarbageOrGhostMember(rawObj)) return;
        if (rawObj.status === 'cancelled' || rawObj.isDeleted === true) return;
        const rawCheckId = String(rawObj.id || '').trim();
        const rawOrigId = String(rawObj.originalId || '').trim();
        const bareCheckId = rawCheckId.replace(/^reg_member_/, '');
        if (
          (rawCheckId && revokedIdSet.has(rawCheckId)) ||
          (rawOrigId && revokedIdSet.has(rawOrigId)) ||
          (bareCheckId && revokedIdSet.has(bareCheckId))
        ) {
          return;
        }
        const hydrated = hydrateMemberPhoto({ ...rawObj }, idxHint);
        if (isGarbageOrGhostMember(hydrated)) return;
        const fullName = String(hydrated.fullName || hydrated.name || '').trim();
        const nk = ultraNormalizeArabic(fullName);
        if (nk && revokedNameSet.has(nk)) return;
        let rawId = String(hydrated.id || '').trim();
        const bareId = rawId.replace(/^reg_member_/, '');
        if (revokedIdSet.has(rawId) || (bareId && revokedIdSet.has(bareId))) return;

        // If exact normalized Arabic name is already present, merge keeping newer lastModifiedAt
        if (nk && seenServerNames.has(nk)) {
          const existingIdx = rawCombinedServerList.findIndex(
            (item) => ultraNormalizeArabic(item.fullName || item.name || '') === nk
          );
          if (existingIdx >= 0) {
            const ex = rawCombinedServerList[existingIdx];
            const exMod = Number(ex.lastModifiedAt || ex.updatedAt || 0);
            const hyMod = Number(hydrated.lastModifiedAt || hydrated.updatedAt || 0);
            const newer = hyMod > exMod ? hydrated : ex;
            const older = hyMod > exMod ? ex : hydrated;
            rawCombinedServerList[existingIdx] = {
              ...older,
              ...newer,
              id: ex.id,
              fullName: newer.fullName || older.fullName || fullName,
              phone: newer.phone || older.phone || '',
              whatsapp: newer.whatsapp || older.whatsapp || newer.phone || older.phone || '',
              uniqueCode: newer.uniqueCode || older.uniqueCode || '',
              photoUrl:
                newer.photoUrl && !String(newer.photoUrl).startsWith('__D1_PHOTO_REF__:')
                  ? newer.photoUrl
                  : older.photoUrl || newer.photoUrl || '',
              stamps: { ...(older.stamps || {}), ...(newer.stamps || {}) },
              fridayStamps: { ...(older.fridayStamps || {}), ...(newer.fridayStamps || {}) }
            };
          }
          return;
        }

        if (
          !rawId ||
          seenServerIds.has(rawId) ||
          (bareId && (seenServerIds.has(bareId) || seenServerIds.has(`reg_member_${bareId}`)))
        ) {
          rawId = `${rawId || '3FY'}-ROW-${rawCombinedServerList.length + 1}`;
          hydrated.id = rawId;
        }

        seenServerIds.add(rawId);
        if (bareId) {
          seenServerIds.add(bareId);
          seenServerIds.add(`reg_member_${bareId}`);
        }
        if (nk) seenServerNames.add(nk);
        rawCombinedServerList.push(hydrated);
      };

      // 1. Authoritative D1_STATE:registrants rows
      if (parsedActiveRegs.length > 0) {
        parsedActiveRegs.forEach((r, idx) => addMemberToUnion(r, idx));
      }

      // 1b. Additional D1 slices (D1_STATE:backup_members, D1_STATE:members, D1_STATE:app_state)
      const extraSlices = [slices.backup_members, slices.members, slices.app_state, slices.all_members_v1];
      for (const sl of extraSlices) {
        if (!sl || typeof sl.raw !== 'string') continue;
        try {
          const parsedSl = JSON.parse(sl.raw);
          const arr = Array.isArray(parsedSl)
            ? parsedSl
            : Array.isArray(parsedSl?.registrants)
            ? parsedSl.registrants
            : Array.isArray(parsedSl?.members)
            ? parsedSl.members
            : [];
          arr.forEach((r: any, idx: number) => addMemberToUnion(r, rawCombinedServerList.length + idx));
        } catch {}
      }

      // 2. Any additional rows in SQL `members` table (/api/members)
      if (sqlMembersRes && sqlMembersRes.ok) {
        try {
          const sqlJson = await sqlMembersRes.json();
          const sqlRows = Array.isArray(sqlJson?.results) ? sqlJson.results : [];
          for (const m of sqlRows) {
            if (isGarbageOrGhostMember(m)) continue;
            const sqlRawId = String(m.id || '').trim();
            const sqlName = String(m.fullName || m.name || '').trim().replace(/\s+/g, ' ');
            addMemberToUnion(
              {
                id: sqlRawId ? (sqlRawId.startsWith('reg_') ? sqlRawId : `reg_member_${sqlRawId}`) : undefined,
                originalId: sqlRawId,
                fullName: sqlName,
                phone: m.phone ? String(m.phone).trim() : '',
                whatsapp: m.phone ? String(m.phone).trim() : '',
                role: m.role || 'member',
                status: 'active',
                registeredAt: m.created_at ? new Date(Number(m.created_at)).toISOString() : '2026-01-01T00:00:00.000Z'
              },
              rawCombinedServerList.length
            );
          }
        } catch {}
      }

      // 3. Filter local SAFE_BACKUP_MEMBERS through blacklist & ghost purge (NEVER resurrect blacklisted IDs or Names!)
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const localSources = [
          localStorage.getItem(SAFE_BACKUP_MEMBERS_KEY),
          localStorage.getItem('three_youths_registrants_v3')
        ];
        for (const rawLoc of localSources) {
          if (!rawLoc) continue;
          try {
            const parsedLoc = JSON.parse(rawLoc);
            if (Array.isArray(parsedLoc) && parsedLoc.length > 2) {
              const cleanLocal = filterOutDeletedAndGhosts(parsedLoc, assembled.serverTombstones);
              cleanLocal.forEach((r, idx) => addMemberToUnion(r, rawCombinedServerList.length + idx));
            }
          } catch {}
        }
      }

      // 4. Fallback to previous snapshot if still empty
      if (rawCombinedServerList.length === 0 && Array.isArray(lastFetchedStateSnapshot?.registrants)) {
        filterOutDeletedAndGhosts(lastFetchedStateSnapshot!.registrants, assembled.serverTombstones)
          .forEach((r: any, idx: number) => addMemberToUnion(r, idx));
      }

      // 5. Enrich & restore missing/bare KV members from Permanent 95 catalog, then repair & Never-Shrink
      const enrichedWith95 = mergeAndEnrichWithPermanent95(
        rawCombinedServerList,
        assembled.serverTombstones
      );
      const { repairedList, modifiedMembers } = repairDuplicateQRCodesAndIds(enrichedWith95);
      const finalRegistrants = applySmartNeverShrinkState(
        filterOutDeletedAndGhosts(lastFetchedStateSnapshot?.registrants || [], assembled.serverTombstones),
        repairedList,
        assembled.serverTombstones
      );
      assembled.registrants = finalRegistrants;
      serverRegistrantsCount = finalRegistrants.length;
      initialFetchCompleted = true;

      if (finalRegistrants.length > 25 && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(SAFE_BACKUP_MEMBERS_KEY, serializeRegistrantsForLocalCache(finalRegistrants, true));
        } catch {}
      }

      // Auto-Heal Cloudflare KV/D1 ONLY if server lost active non-deleted members or has bare CF_* stubs without details
      const parsedHasBareStubs = parsedActiveRegs.some(
        (r: any) => r && (!r.phone || !r.uniqueCode || /^CF_\d+$/i.test(String(r.id || '')))
      );
      if (
        (finalRegistrants.length > parsedActiveRegs.length || parsedHasBareStubs) &&
        finalRegistrants.length >= 90
      ) {
        const lightHealRegs = JSON.parse(serializeRegistrantsForLocalCache(finalRegistrants, true));
        pushStateSliceToCloudflareD1('registrants', lightHealRegs, true);
        pushStateSliceToCloudflareD1('backup_members', lightHealRegs, true);
      }

      if (modifiedMembers.length > 0) {
        for (const modMember of modifiedMembers) {
          const repairKey = `${modMember.id}:${modMember.uniqueCode}`;
          if (!persistedCollisionRepairs.has(repairKey)) {
            persistedCollisionRepairs.add(repairKey);
            safeCloudflareUpsert('registrants', { ...modMember, isCollisionRepair: true }).catch(() => {});
          }
        }
      }

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

      const sysBundleAttendance: any[] = [];
      if (slices.system_bundle) {
        try {
          const sysB = JSON.parse(slices.system_bundle.raw);
          if (Array.isArray(sysB?.attendance)) {
            sysBundleAttendance.push(...sysB.attendance);
          }
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

      if (slices.attendance_session) {
        try {
          const asB = JSON.parse(slices.attendance_session.raw);
          if (asB && typeof asB === 'object') {
            const curTs = Number(assembled.attendanceSession?.updatedAt || 0);
            const incTs = Number(asB.updatedAt || slices.attendance_session.ts || 0);
            if (incTs >= curTs) {
              assembled.attendanceSession = asB;
            }
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

      // Union-merge attendance records from system_bundle, attendance_records, member objects, and active fridayStamps
      const mergedAttMap = new Map<string, any>();
      const memberDateSeen = new Set<string>();
      const delAttSet = new Set<string>(
        Array.isArray(assembled.deletedAttendanceIds) ? assembled.deletedAttendanceIds.map(String) : []
      );
      const regByAnyId = new Map<string, any>();
      const regByNormName = new Map<string, any>();
      if (Array.isArray(assembled.registrants)) {
        for (const m of assembled.registrants) {
          if (!m || !m.id) continue;
          const mid = String(m.id).trim();
          const bareMid = mid.replace(/^reg_member_/, '');
          regByAnyId.set(mid, m);
          regByAnyId.set(bareMid, m);
          regByAnyId.set(`reg_member_${bareMid}`, m);
          if (m.originalId) regByAnyId.set(String(m.originalId).trim(), m);
          if (m.uniqueCode) regByAnyId.set(String(m.uniqueCode).trim().toUpperCase(), m);
          const nName = normalizeArabicName(m.fullName || m.name || '');
          if (nName) regByNormName.set(nName, m);
        }
      }

      const addMergedAttRecord = (rec: any) => {
        if (!rec || typeof rec !== 'object') return;
        const recId = String(rec.id || '').trim();
        if (recId && delAttSet.has(recId)) return;
        const rawRegId = String(rec.registrantId || rec.memberId || '').trim();
        const bareRegId = rawRegId.replace(/^reg_member_/, '');
        const matchedMem =
          regByAnyId.get(rawRegId) ||
          regByAnyId.get(bareRegId) ||
          (rec.uniqueCode ? regByAnyId.get(String(rec.uniqueCode).trim().toUpperCase()) : undefined) ||
          (rec.registrantName ? regByNormName.get(normalizeArabicName(rec.registrantName)) : undefined);
        const canonicalRegId = matchedMem ? String(matchedMem.id) : (rawRegId || recId);
        const rawDate = String(rec.date || (rec.timestamp && String(rec.timestamp).includes('T') ? String(rec.timestamp).split('T')[0] : '')).trim();
        if (!canonicalRegId || !rawDate) return;

        // Strip heavy Base64 photos from attendance records so localStorage never overflows
        let cleanPhotoRef = String(rec.registrantPhotoUrl || '').trim();
        if (cleanPhotoRef.includes('data:image/')) {
          const cleanDataUrl = cleanPhotoRef.startsWith('data:image/')
            ? cleanPhotoRef
            : cleanPhotoRef.slice(cleanPhotoRef.indexOf('data:image/'));
          setCachedD1Photo(canonicalRegId, cleanDataUrl);
          cleanPhotoRef = `__D1_PHOTO_REF__:${canonicalRegId}`;
        }

        const finalId = recId || `att_${canonicalRegId}_${rawDate}`;
        const normalizedRec = {
          ...rec,
          id: finalId,
          registrantId: canonicalRegId,
          registrantName: matchedMem?.fullName || rec.registrantName || 'مخدوم حاضر',
          uniqueCode: matchedMem?.uniqueCode || rec.uniqueCode || undefined,
          registrantPhotoUrl: cleanPhotoRef,
          date: rawDate,
          timestamp: rec.timestamp || rec.scannedAt || `${rawDate}T18:00:00.000Z`,
          scannedAt: rec.scannedAt || rec.timestamp || `${rawDate}T18:00:00.000Z`,
          timeString: rec.timeString || undefined,
          orderNumber: typeof rec.orderNumber === 'number' ? rec.orderNumber : undefined,
          method: rec.method === 'manual' ? 'manual' : 'camera_scan'
        };

        const mdKey = `${canonicalRegId}__${rawDate}`;
        if (!mergedAttMap.has(finalId) && !memberDateSeen.has(mdKey)) {
          mergedAttMap.set(finalId, normalizedRec);
          memberDateSeen.add(mdKey);
          if (rawRegId) memberDateSeen.add(`${rawRegId}__${rawDate}`);
          if (bareRegId) memberDateSeen.add(`${bareRegId}__${rawDate}`);
        }
      };

      if (slices.attendance_records) {
        try {
          const attB = JSON.parse(slices.attendance_records.raw);
          if (Array.isArray(attB)) {
            attB.forEach(addMergedAttRecord);
          }
        } catch {}
      }

      sysBundleAttendance.forEach(addMergedAttRecord);

      // Also extract any member-level stamps / attendanceHistory / attendanceDates
      const mergedFridayStamps: Record<string, any> =
        assembled.fridayStamps && typeof assembled.fridayStamps === 'object'
          ? { ...assembled.fridayStamps }
          : {};

      if (Array.isArray(assembled.registrants)) {
        for (const m of assembled.registrants) {
          if (!m || !m.id) continue;
          const hist = Array.isArray(m.attendanceHistory) ? m.attendanceHistory : [];
          for (const h of hist) {
            if (h && typeof h === 'object' && h.date) {
              addMergedAttRecord({
                id: h.id || `att_hist_${m.id}_${h.date}`,
                registrantId: m.id,
                registrantName: m.fullName,
                uniqueCode: m.uniqueCode,
                date: String(h.date).split('T')[0],
                timestamp: h.timestamp || h.scannedAt || `${String(h.date).split('T')[0]}T18:00:00.000Z`,
                timeString: h.timeString,
                orderNumber: h.orderNumber,
                method: h.method || 'camera_scan'
              });
            }
          }
          if (m.stamps && typeof m.stamps === 'object' && !Array.isArray(m.stamps)) {
            for (const [dKey, sVal] of Object.entries(m.stamps)) {
              const cleanD = String(dKey).split('T')[0];
              if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanD)) continue;
              const isStamped = sVal === true || (sVal && typeof sVal === 'object' && (sVal as any).stamped !== false);
              if (isStamped) {
                const stampObj = typeof sVal === 'object' && sVal !== null ? (sVal as any) : {};
                addMergedAttRecord({
                  id: `att_mstamp_${m.id}_${cleanD}`,
                  registrantId: m.id,
                  registrantName: m.fullName,
                  uniqueCode: m.uniqueCode,
                  date: cleanD,
                  timestamp: stampObj.timestamp || (stampObj.updatedAt ? new Date(stampObj.updatedAt).toISOString() : `${cleanD}T18:00:00.000Z`),
                  method: stampObj.method || 'camera_scan'
                });
                const fk = `${m.id}_${cleanD}`;
                if (!mergedFridayStamps[fk]) {
                  mergedFridayStamps[fk] = {
                    stamped: true,
                    version: Number(stampObj.version || 1),
                    updatedAt: Number(stampObj.updatedAt || Date.now())
                  };
                }
              }
            }
          }
        }
      }

      // Ensure every attendance record in mergedAttMap also has an active stamp entry if none exists or if accidentally reset before the scan
      for (const rec of mergedAttMap.values()) {
        const fk = `${rec.registrantId}_${rec.date}`;
        const existingStamp = mergedFridayStamps[fk];
        if (!existingStamp) {
          mergedFridayStamps[fk] = {
            stamped: true,
            version: 1,
            updatedAt: new Date(rec.timestamp || Date.now()).getTime() || Date.now()
          };
        }
      }

      // Also ensure every active Friday stamp in mergedFridayStamps has a corresponding attendance record in mergedAttMap
      for (const [stampKey, state] of Object.entries(mergedFridayStamps)) {
        if (!state || !(state === true || state.stamped)) continue;
        const sepIdx = stampKey.lastIndexOf('_');
        if (sepIdx <= 0) continue;
        const rawMemId = stampKey.slice(0, sepIdx);
        const dateStr = stampKey.slice(sepIdx + 1);
        if (!rawMemId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        const matchedMem = regByAnyId.get(rawMemId) || regByAnyId.get(rawMemId.replace(/^reg_member_/, ''));
        const canonicalId = matchedMem ? String(matchedMem.id) : rawMemId;
        addMergedAttRecord({
          id: `att_stamp_${canonicalId}_${dateStr}`,
          registrantId: canonicalId,
          registrantName: matchedMem?.fullName || 'مخدوم حاضر',
          uniqueCode: matchedMem?.uniqueCode,
          date: dateStr,
          timestamp: state.updatedAt ? new Date(state.updatedAt).toISOString() : `${dateStr}T18:00:00.000Z`,
          method: 'camera_scan'
        });
      }

      assembled.fridayStamps = mergedFridayStamps;
      assembled.attendance = Array.from(mergedAttMap.values());
      assembled.lastModified = Number(annJson?.lastModified || annJson?.version || Date.now());

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

export async function forceFetchFromCloudflare(): Promise<{
  members: any[];
  attendance: any[];
  announcements: any[];
  events: any[];
  quizzes: any[];
  attendanceSession: any;
  lastModified: number;
  state: Record<string, any> | null;
}> {
  invalidateCloudflareEdgeVersion();
  inFlightFetchStatePromise = null;
  lastCompletedFetchAt = 0;
  const state = await fetchFullStateFromCloudflareD1(true);
  const members = Array.isArray(state?.registrants)
    ? lossLessMembers(state!.registrants)
    : [];
  return {
    members,
    attendance: Array.isArray(state?.attendance) ? state!.attendance : [],
    announcements: Array.isArray(state?.announcements) ? state!.announcements : [],
    events: Array.isArray(state?.communityEvents) ? state!.communityEvents : [],
    quizzes: Array.isArray(state?.kahootQuizzes) ? state!.kahootQuizzes : [],
    attendanceSession: state?.attendanceSession || null,
    lastModified: Number(state?.lastModified || Date.now()),
    state
  };
}

export async function fetchMembers(force = true): Promise<any[]> {
  try {
    if (force) {
      invalidateCloudflareEdgeVersion();
    }
    const d1State = await fetchFullStateFromCloudflareD1(force).catch(() => null);
    const finalMembers = Array.isArray(d1State?.registrants)
      ? lossLessMembers(d1State!.registrants)
      : [];

    // Smart Phone Guard: Only persist to localStorage when we have the real member list (> 2 members)
    if (finalMembers.length > 2 && typeof localStorage !== 'undefined') {
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
    const cleanList = (Array.isArray(records) ? records : []).map((r: any, idx: number) => ({
      id: r.id,
      registrantId: r.registrantId,
      registrantName: r.registrantName,
      uniqueCode: r.uniqueCode || undefined,
      registrantPhotoUrl: typeof r.registrantPhotoUrl === 'string' && r.registrantPhotoUrl.startsWith('data:')
        ? `__D1_PHOTO_REF__:${r.registrantId}`
        : r.registrantPhotoUrl,
      date: r.date,
      timestamp: r.timestamp,
      scannedAt: r.scannedAt || r.timestamp,
      timeString: r.timeString || undefined,
      orderNumber: typeof r.orderNumber === 'number' ? r.orderNumber : idx + 1,
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
    'id', 'originalId', 'uniqueCode', 'fullName', 'name', 'gender', 'sex', 'genderCode', 'manualGender', 'genderLabel', 'type', 'category', 'genderLocked',
    'phone', 'whatsapp', 'dob', 'birthDate',
    'address', 'residence', 'notes', 'talents', 'skills', 'photoUrl', 'avatar', 'image', 'qrData',
    'registeredAt', 'updatedAt', 'lastUpdatedAt', 'lastModifiedAt', 'updatedFields',
    'password', 'role', 'permissions', 'status', 'isOnline', 'lastSeen',
    'isVisitedGeneral', 'lastVisitedAt', 'lastVisitedBy', 'needsRealPhoto',
    'faceSignature', 'recoveryCode', 'deviceRecoveryToken', 'ipAddress', 'detectedCountry',
    'stamps', 'fridayStamps', 'attendanceDates', 'attendanceHistory', 'attendance', 'presentDates', 'lastAttendance'
  ]),
  attendance: new Set([
    'id', 'registrantId', 'registrantName', 'uniqueCode', 'registrantPhotoUrl', 'date', 'timestamp', 'scannedAt', 'timeString', 'orderNumber', 'method'
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
export async function safeCloudflareUpsert(tableName: string, data: any): Promise<any> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);
    let serverSavedRecord: any = null;

    if (tableName === 'registrants' && clean.id) {
      lockMemberSaveSync(8000);
      updateCachedSnapshotMember(clean);
      if (typeof clean.photoUrl === 'string' && clean.photoUrl.startsWith('data:')) {
        pushPhotoToCloudflareD1(clean.id, clean.photoUrl).catch(() => {});
      }
      try {
        const res = await fetch(getCloudflareApiUrl(`/api/registrants/${encodeURIComponent(clean.id)}`), {
          method: 'PUT',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'UPDATE_SINGLE_MEMBER',
            member: clean,
            ...clean
          })
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json && (json.lastModified || json.version)) {
            lastSyncedEdgeVersion = Number(json.lastModified || json.version);
          }
          if (json && json.registrant && typeof json.registrant === 'object') {
            serverSavedRecord = json.registrant;
            updateCachedSnapshotMember({ ...clean, ...serverSavedRecord });
          }
        }
      } catch {}
    }

    const effectiveRecord = serverSavedRecord ? { ...clean, ...serverSavedRecord } : clean;
    const lightCopy = { ...effectiveRecord };
    if (typeof lightCopy.photoUrl === 'string' && lightCopy.photoUrl.startsWith('data:')) {
      lightCopy.photoUrl = `__D1_PHOTO_REF__:${lightCopy.id}`;
    }
    delete lightCopy.avatar;
    delete lightCopy.image;
    broadcastCloudflareRealtime({
      type: 'd1_mutation',
      action: 'UPSERT',
      table: tableName,
      record: lightCopy
    });

    return serverSavedRecord || true;
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
    const rawClean = sanitizeForDb(data);
    if (!rawClean) return false;
    const clean = filterTablePayload(tableName, rawClean);
    const targetVal = matchValue !== undefined ? matchValue : clean[matchColumn];

    if (tableName === 'registrants' && targetVal) {
      lockMemberSaveSync(8000);
      updateCachedSnapshotMember({ ...clean, [matchColumn]: targetVal });
      fetch(getCloudflareApiUrl(`/api/registrants/${encodeURIComponent(String(targetVal))}`), {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_SINGLE_MEMBER',
          member: { ...clean, [matchColumn]: targetVal },
          ...clean,
          [matchColumn]: targetVal
        })
      }).catch(() => {});
    }

    const lightCopy = { ...clean, [matchColumn]: targetVal };
    if (typeof lightCopy.photoUrl === 'string' && lightCopy.photoUrl.startsWith('data:')) {
      lightCopy.photoUrl = `__D1_PHOTO_REF__:${targetVal}`;
    }
    delete lightCopy.avatar;
    delete lightCopy.image;
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
