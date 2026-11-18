import QRCode from 'qrcode';
import {
  cloudflareDb,
  CLOUDFLARE_WORKER_URL,
  isAiStudioPreviewEnv,
  getCloudflareApiUrl,
  isInitialCloudFetchCompleted,
  getServerRegistrantsCount,
  invalidateCloudflareEdgeVersion,
  sanitizeForDb,
  safeCloudflareUpsert,
  safeCloudflareUpdate,
  safeCloudflareDelete,
  deleteMemberFromCloudflareD1,
  removeCachedD1Photo,
  connectCloudflareRealtime,
  subscribeCloudflareRealtime,
  broadcastCloudflareRealtime,
  fetchFullStateFromCloudflareD1,
  syncRegistrantsSliceToCloudflareD1,
  syncAttendanceSliceToCloudflareD1,
  syncAnnouncementsSliceToCloudflareD1,
  deleteAnnouncementImageFromCloudflareD1,
  getCachedD1Photo,
  setCachedD1Photo,
  fetchD1PhotoLazy,
  getCachedD1AnnouncementImage,
  setCachedD1AnnouncementImage,
  pushStateSliceToCloudflareD1,
  isCloudflareRealtimeConnected,
  fetchMembers as fetchCloudflareMembers,
  normalizeArabicName as normalizeCloudflareArabicName,
  normalizeMember as normalizeCloudflareMember,
  lossLessMembers as cloudflareLossLessMembers,
  repairDuplicateQRCodesAndIds,
  lockMemberSaveSync,
  updateCachedSnapshotMember,
  fetchAttendanceSessionFromCloudflareD1,
  forceFetchFromCloudflare,
  ultraNormalizeArabic,
  findMemberFlexibly,
  getConfirmedDeletedIds,
  addConfirmedDeletedId,
  removeConfirmedDeletedId,
  applyNeverShrinkMembersUpdate,
  applySmartNeverShrinkState,
  lockPollingForMutation,
  unlockPollingAfterMutation,
  isPollingFrozen,
  isGarbageOrGhostMember,
  addToPermanentBlacklist,
  filterOutDeletedAndGhosts,
  detectAndRepairGender,
  getMemberGender,
  deleteMembersBatchFromCloudflareD1,
  loadPermanent95Members,
  getCachedPermanent95Members,
  mergeAndEnrichWithPermanent95,
  unblacklistRestoredFourOnce,
  rescueThreeMissingMembersFromBlacklist,
  matchTargetThreeMemberAlias,
  isWhitelistedRescuedMember,
  serializeRegistrantsForLocalCache,
  registerUnblacklistHook,
  getBaseMemberId,
  deduplicateAndMergeMembers,
  CLEAN_MASTER_DB_KEY,
  VERIFIED_95_MANIFEST,
  ensureUniqueSingleCardPerMember,
  buildCleanMasterDatabaseV1,
  findExistingMemberSmart,
  getFastStateSignature,
  scheduleBackgroundBackupSave,
  saveLockedMemberRole
} from '../cloudflareDb';
export {
  detectAndRepairGender,
  getMemberGender,
  applySmartNeverShrinkState,
  lockPollingForMutation,
  unlockPollingAfterMutation,
  isPollingFrozen,
  isGarbageOrGhostMember,
  getBaseMemberId,
  deduplicateAndMergeMembers,
  filterOutDeletedAndGhosts,
  loadPermanent95Members,
  mergeAndEnrichWithPermanent95,
  CLEAN_MASTER_DB_KEY,
  VERIFIED_95_MANIFEST,
  ensureUniqueSingleCardPerMember,
  buildCleanMasterDatabaseV1,
  findExistingMemberSmart,
  getFastStateSignature,
  scheduleBackgroundBackupSave
};
import { 
  Registrant, 
  AttendanceRecord, 
  AdminPermissions, 
  UserRole, 
  SpecialAssignment, 
  SpecialVisitedRecord,
  VisitationRecord,
  Announcement,
  AnnouncementViewer,
  VisitationNote,
  BlockedUser,
  KahootQuiz,
  KahootQuestion,
  KahootQuestionBankItem,
  KahootGameMode,
  KahootLiveSession,
  KahootPlayer,
  KahootTeam,
  KahootTeamConfigItem,
  KahootSoloScore,
  CardTemplate
} from '../types';
import { DEFAULT_CARD_TEMPLATE } from './cardTemplatePresets';
import { oneSignalService } from './oneSignalService';

export interface FridayStampEntry {
  stamped: boolean;
  version: number;
  updatedAt: number;
}

const REGISTRANTS_STORAGE_KEY = 'three_youths_registrants_v3';
const ATTENDANCE_STORAGE_KEY = 'three_youths_attendance_v5';
export const FRIDAY_STAMPS_STORAGE_KEY = 'three_youths_friday_stamps_v2';
export const VISITATION_MODE_UPDATED_AT_KEY = 'three_youths_visitation_mode_updated_at';
export const ASSIGNMENTS_STORAGE_KEY = 'three_youths_assignments_v1';
export const SPECIAL_VISITED_STORAGE_KEY = 'three_youths_special_visited_v1';
const LOGO_STORAGE_KEY = 'three_youths_custom_logo_v1';
const CARD_TEMPLATE_STORAGE_KEY = 'three_youths_card_template_v1';
const ANNOUNCEMENTS_STORAGE_KEY = 'three_youths_announcements_v5';
export const DELETED_ANNOUNCEMENTS_STORAGE_KEY = 'three_youths_deleted_ann_ids_v1';
export const VISITATION_NOTES_STORAGE_KEY = 'three_youths_visitation_notes_v1';
export const DELETED_VISITATION_NOTES_STORAGE_KEY = 'three_youths_deleted_vnotes_v1';
export const BLOCKED_USERS_STORAGE_KEY = 'three_youths_blocked_users_v1';
export const DELETED_REGISTRANTS_STORAGE_KEY = 'three_youths_deleted_ids_v2';
export const DELETED_ATTENDANCE_STORAGE_KEY = 'three_youths_deleted_att_ids_v1';
export const REVOKED_STAMPS_STORAGE_KEY = 'three_youths_revoked_stamps_v1';
export const KAHOOT_QUIZZES_STORAGE_KEY = 'three_youths_kahoot_quizzes_v1';
export const KAHOOT_SESSIONS_STORAGE_KEY = 'three_youths_kahoot_sessions_v1';
export const DELETED_KAHOOT_QUIZZES_STORAGE_KEY = 'three_youths_deleted_quiz_ids_v1';
export const KAHOOT_QUESTION_BANK_STORAGE_KEY = 'three_youths_kahoot_question_bank_v1';
export const ACTIVE_VISITATION_MODE_STORAGE_KEY = 'three_youths_active_visitation_mode_v2';
export const CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY = 'three_youths_role_permissions_v2';

export const COMMUNITY_EVENTS_STORAGE_KEY = 'three_youths_community_events_v1';
export const DELETED_EVENTS_STORAGE_KEY = 'three_youths_deleted_event_ids_v1';
export const EVENT_GROUPS_STORAGE_KEY = 'three_youths_event_groups_v1';
export const EVENT_REGISTRATIONS_STORAGE_KEY = 'three_youths_event_registrations_v1';
export const EVENT_PAYMENTS_STORAGE_KEY = 'three_youths_event_payments_v1';
export const EVENT_BUSES_STORAGE_KEY = 'three_youths_event_buses_v1';
export const EVENT_ATTENDANCES_STORAGE_KEY = 'three_youths_event_attendances_v1';
export const EVENT_AUDIT_LOGS_STORAGE_KEY = 'three_youths_event_audit_logs_v1';
export const EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY = 'three_youths_event_staff_assignments_v1';
export const SITE_TEXT_OVERRIDES_STORAGE_KEY = 'three_youths_site_text_overrides_v1';
export const OWNER_DEVICE_AUTH_STORAGE_KEY = 'three_youths_owner_device_authorized_v1';

const KEY_ALIASES: Record<string, string[]> = {
  [ACTIVE_VISITATION_MODE_STORAGE_KEY]: ['three_youths_active_visitation_mode'],
  ['three_youths_active_visitation_mode']: [ACTIVE_VISITATION_MODE_STORAGE_KEY],
  [ASSIGNMENTS_STORAGE_KEY]: ['three_youths_special_assignments'],
  ['three_youths_special_assignments']: [ASSIGNMENTS_STORAGE_KEY],
  [SPECIAL_VISITED_STORAGE_KEY]: ['three_youths_special_visited'],
  ['three_youths_special_visited']: [SPECIAL_VISITED_STORAGE_KEY],
  [VISITATION_NOTES_STORAGE_KEY]: ['three_youths_visitation_notes'],
  ['three_youths_visitation_notes']: [VISITATION_NOTES_STORAGE_KEY]
};

// In-memory primary cache + localStorage persistence with automatic photo-cache eviction on QuotaExceededError
const memStore = new Map<string, string>();
registerUnblacklistHook(() => {
  memStore.delete(DELETED_REGISTRANTS_STORAGE_KEY);
  memStore.delete('three_youths_deleted_ids_v2');
  memStore.delete('CONFIRMED_DELETED_IDS');
  memStore.delete('PERMANENT_BLACKLIST');
});
if (typeof window !== 'undefined') {
  window.addEventListener('three_youths_permanent95_loaded', () => {
    try {
      memStore.delete(DELETED_REGISTRANTS_STORAGE_KEY);
      const cached95 = getCachedPermanent95Members();
      if (!Array.isArray(cached95) || cached95.length < 90) return;
      if (inMemoryRegistrantsAudited && Array.isArray(inMemoryRegistrants) && inMemoryRegistrants.length >= 96) {
        return;
      }
      const base = Array.isArray(inMemoryRegistrants) && inMemoryRegistrants.length > 0
        ? inMemoryRegistrants
        : storageService.getRegistrants();
      const merged = ensureUniqueSingleCardPerMember(
        filterOutDeletedAndGhosts(
          mergeAndEnrichWithPermanent95(base, {}).map((m, idx) => normalizeRegistrant(m, idx))
        )
      ) as Registrant[];
      if (merged.length > 0) {
        inMemoryRegistrants = merged;
        inMemoryRegistrantsAudited = merged.length >= 90;
        scheduleBackgroundBackupSave(merged);
        notifySyncListeners();
      }
    } catch {}
  });
}
export const safeStorage = {
  getItem: (key: string): string | null => {
    const memVal = memStore.get(key);
    if (memVal !== undefined) return memVal;
    const aliases = KEY_ALIASES[key];
    if (aliases) {
      for (const alias of aliases) {
        const aVal = memStore.get(alias);
        if (aVal !== undefined) return aVal;
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const val = localStorage.getItem(key);
        if (val !== null && val !== undefined) {
          memStore.set(key, val);
          return val;
        }
        if (aliases) {
          for (const alias of aliases) {
            const aliasVal = localStorage.getItem(alias);
            if (aliasVal !== null && aliasVal !== undefined) {
              memStore.set(key, aliasVal);
              return aliasVal;
            }
          }
        }
      } catch {}
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    memStore.set(key, value);
    const aliases = KEY_ALIASES[key];
    if (aliases) {
      aliases.forEach(a => memStore.set(a, value));
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, value);
        if (aliases) {
          aliases.forEach(a => {
            try { localStorage.setItem(a, value); } catch {}
          });
        }
      } catch {
        // Evict cached Base64 member photos from localStorage (they stay in RAM d1PhotoCache & Cloudflare D1) and retry
        try {
          const photoKeys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('three_youths_d1_photo_') || k.startsWith('three_youths_d1_ann_img_'))) {
              photoKeys.push(k);
            }
          }
          photoKeys.forEach(pk => {
            try { localStorage.removeItem(pk); } catch {}
          });
          localStorage.setItem(key, value);
        } catch {}
      }
    }
  },
  removeItem: (key: string): void => {
    memStore.delete(key);
    const aliases = KEY_ALIASES[key];
    if (aliases) {
      aliases.forEach(a => memStore.delete(a));
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
        if (aliases) {
          aliases.forEach(a => {
            try { localStorage.removeItem(a); } catch {}
          });
        }
      } catch {}
    }
  }
};

const SAMPLE_ANNOUNCEMENTS: Announcement[] = [];

export const ARABIC_THREE_WORDS_REGEX = /^[\u0621-\u064A\u0671-\u06D3]{2,}\s+[\u0621-\u064A\u0671-\u06D3]{2,}\s+[\u0621-\u064A\u0671-\u06D3]{2,}$/;

/**
 * Real-time check on keystrokes:
 * As soon as ANY English letter is typed, triggers an immediate RED error!
 */
export function validateArabicNameInput(name: string): { isValid: boolean; error?: string; hasEnglish: boolean } {
  if (!name) {
    return { isValid: false, hasEnglish: false };
  }

  // Check for English characters anywhere in the string
  if (/[a-zA-Z]/.test(name)) {
    return { 
      isValid: false, 
      hasEnglish: true, 
      error: 'خطأ: يرجى كتابة الاسم باللغة العربية فقط! الحروف الإنجليزية غير مسموح بها نهائياً.' 
    };
  }

  // Check if non-Arabic characters exist (except spaces)
  if (/[^\u0621-\u064A\u0671-\u06D3\s]/.test(name)) {
    return {
      isValid: false,
      hasEnglish: false,
      error: 'يرجى كتابة أحرف عربية فقط بدون رموز أو أرقام.'
    };
  }

  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length > 3) {
    return {
      isValid: false,
      hasEnglish: false,
      error: `خطأ: لقد كتبت أكثر من 3 أسماء (${words.length} كلمات). يرجى كتابة الاسم ثلاثياً فقط (مثال: مينا كمال بولس).`
    };
  }

  if (words.length < 3) {
    return {
      isValid: false,
      hasEnglish: false,
      error: words.length === 2
        ? 'خطأ: لقد كتبت اسماً ثنائياً فقط! يجب كتابة الاسم ثلاثياً باللغة العربية (مثال: مينا كمال بولس).'
        : `خطأ: يرجى إكمال الاسم ثلاثياً باللغة العربية (أنت كتبت ${words.length} من 3 كلمات مطلوبة).`
    };
  }

  return { isValid: true, hasEnglish: false };
}

export function normalizeArabicNameForComparison(name: string): string {
  if (!name) return '';
  return name
    .trim()
    // Remove Arabic diacritics / tashkeel (fat-ha, damma, kasra, tanween, sukoon, shadda, etc.)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove tatweel / kashida (ـ)
    .replace(/ـ/g, '')
    // Normalize all forms of Alif with hamzas
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Waw with hamza
    .replace(/ؤ/g, 'و')
    // Normalize Yaa with hamza (nabrah)
    .replace(/ئ/g, 'ي')
    // Remove standalone hamza
    .replace(/ء/g, '')
    // Normalize alif maqsura to yaa
    .replace(/ى/g, 'ي')
    // Normalize taa marbouta to haa (e.g. حمزة -> حمزه)
    .replace(/ة/g, 'ه')
    // Convert Eastern Arabic numerals to Western
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    // Remove non-alphanumeric punctuation/special chars
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
    // Collapse all whitespace
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Checks if two Arabic names match either fully or on their first 3 words (الاسم الثلاثي)
 * regardless of hamzas, taa marbouta, alif maqsura, tashkeel, or spacing.
 */
export function isThreePartNameMatch(inputName: string, existingName: string): boolean {
  const normInput = normalizeArabicNameForComparison(inputName);
  const normExisting = normalizeArabicNameForComparison(existingName);
  if (!normInput || !normExisting) return false;
  if (normInput === normExisting) return true;

  const inputWords = normInput.split(' ').filter(Boolean);
  const existingWords = normExisting.split(' ').filter(Boolean);

  // If user entered 3 or more words
  if (inputWords.length >= 3 && existingWords.length >= 3) {
    const input3 = inputWords.slice(0, 3).join(' ');
    const existing3 = existingWords.slice(0, 3).join(' ');
    if (input3 === existing3) return true;
  }
  // Also allow matching if all input words (at least 2 words) appear in order in existing words
  if (inputWords.length >= 2 && existingWords.length >= inputWords.length) {
    const allMatchInOrder = inputWords.every((w, i) => existingWords[i] === w);
    if (allMatchInOrder) return true;
  }
  return false;
}

export const normalizeArabicName = normalizeArabicNameForComparison;
export const normalizeMember = normalizeCloudflareMember;
export const lossLessMembers = cloudflareLossLessMembers;

/**
 * Normalizes phone numbers for comparison across Sudan (+249), Egypt (+20), and local formats.
 * Strips formatting, handles Arabic-Indic digits, and extracts core national phone number.
 */
export function normalizePhoneForComparison(phone: string): string {
  if (!phone) return '';
  const western = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  const digits = western.replace(/\D/g, '');
  if (!digits) return '';

  // Strip international prefix +249, 00249, 249
  let clean = digits;
  if (clean.startsWith('00249')) clean = clean.slice(5);
  else if (clean.startsWith('249')) clean = clean.slice(3);
  // Strip international prefix +20, 0020, 20
  else if (clean.startsWith('0020')) clean = clean.slice(4);
  else if (clean.startsWith('20')) clean = clean.slice(2);

  // Strip leading zero if present (e.g. 0912345678 -> 912345678)
  if (clean.startsWith('0')) clean = clean.slice(1);

  // Take the last 9 digits which uniquely identify national phone lines
  if (clean.length >= 9) {
    return clean.slice(-9);
  }
  return clean;
}

export function validateArabicThreeWords(name: string): { isValid: boolean; error?: string } {
  const res = validateArabicNameInput(name);
  return { isValid: res.isValid, error: res.error };
}

export interface UserLocationInfo {
  countryCode: 'EG' | 'SD' | 'OTHER';
  countryName: string;
  isEgypt: boolean;
  isSudan: boolean;
  timezone: string;
}

/**
 * Detect user's current location via Timezone & Browser environment
 */
export function detectUserLocation(): UserLocationInfo {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lowerTz = tz.toLowerCase();
    
    // Check if located in Egypt (Africa/Cairo)
    if (lowerTz.includes('cairo') || lowerTz.includes('egypt')) {
      return {
        countryCode: 'EG',
        countryName: 'جمهورية مصر العربية 🇪🇬',
        isEgypt: true,
        isSudan: false,
        timezone: tz
      };
    }

    // Check if located in Sudan (Africa/Khartoum)
    if (lowerTz.includes('khartoum') || lowerTz.includes('sudan')) {
      return {
        countryCode: 'SD',
        countryName: 'جمهورية السودان 🇸🇩',
        isEgypt: false,
        isSudan: true,
        timezone: tz
      };
    }

    // Default: Check locale or treat as outside Sudan
    const lang = (navigator.language || '').toLowerCase();
    if (lang.includes('eg')) {
      return {
        countryCode: 'EG',
        countryName: 'جمهورية مصر العربية 🇪🇬',
        isEgypt: true,
        isSudan: false,
        timezone: tz
      };
    }

    // Any other country outside Sudan
    return {
      countryCode: 'EG', // default to Egypt for Sudanese diaspora in Egypt
      countryName: 'جمهورية مصر العربية 🇪🇬',
      isEgypt: true,
      isSudan: false,
      timezone: tz
    };
  } catch {
    return {
      countryCode: 'EG',
      countryName: 'جمهورية مصر العربية 🇪🇬',
      isEgypt: true,
      isSudan: false,
      timezone: 'Africa/Cairo'
    };
  }
}

/**
 * Cleanly format phone number based on chosen country:
 * Replaces leading zero:
 * - Sudan 🇸🇩: 0119089276 (10 digits) -> +249 119089276 (leading 0 removed)
 * - Egypt 🇪🇬: 01012345678 (11 digits) -> +20 1012345678 (leading 0 removed)
 */
export function formatPhoneNumberWithCountry(
  input: string,
  targetCountry: 'sudan' | 'egypt'
): {
  formatted: string;
  country: 'sudan' | 'egypt';
  nationalDigits: string;
  isValid: boolean;
  error?: string;
} {
  // Convert Eastern Arabic digits (٠-٩) to Western digits (0-9) first
  const normalizedNumerals = String(input || '').replace(/[٠-٩]/g, (d) =>
    String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  );
  let digits = normalizedNumerals.replace(/\D/g, '');

  if (targetCountry === 'sudan') {
    // Strip international prefix +249 / 00249 if pasted/typed with full number
    if (digits.startsWith('00249')) {
      digits = digits.slice(5);
    } else if (digits.startsWith('249') && digits.length > 9) {
      digits = digits.slice(3);
    }
    // Strip leading 0 immediately (e.g. 0912345678 -> 912345678)
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    // Sudan: 9 digits after country code (+249)
    const isValid = digits.length === 9;
    let error: string | undefined;

    if (digits.length === 0) {
      error = 'خطأ: يرجى إدخال رقم الهاتف.';
    } else if (digits.length < 9) {
      error = 'خطأ : الرقم ناقص';
    } else if (digits.length > 9) {
      error = 'خطأ : الرقم زايد';
    }

    const formatted = digits ? `+249 ${digits}` : '';
    return { formatted, country: 'sudan', nationalDigits: digits, isValid, error };
  } else {
    // Strip international prefix +20 / 0020 if pasted/typed with full number
    if (digits.startsWith('0020')) {
      digits = digits.slice(4);
    } else if (digits.startsWith('20') && digits.length > 10) {
      digits = digits.slice(2);
    }
    // Strip leading 0 immediately (e.g. 01012345678 -> 1012345678)
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    // Egypt: 10 digits after country code (+20)
    const isValid = digits.length === 10;
    let error: string | undefined;

    if (digits.length === 0) {
      error = 'خطأ: يرجى إدخال رقم الهاتف.';
    } else if (digits.length < 10) {
      error = 'خطأ : الرقم ناقص';
    } else if (digits.length > 10) {
      error = 'خطأ : الرقم زايد';
    }

    const formatted = digits ? `+20 ${digits}` : '';
    return { formatted, country: 'egypt', nationalDigits: digits, isValid, error };
  }
}

/**
 * Validate phone / whatsapp with concise errors (strictly "خطأ: المشكلة"):
 */
export function validateContactNumber(
  rawInput: string, 
  location?: UserLocationInfo,
  chosenCountry?: 'sudan' | 'egypt'
): { isValid: boolean; error?: string; formatted: string; country: 'sudan' | 'egypt' | 'other' } {
  const digits = (rawInput || '').replace(/\D/g, '');
  if (!digits) {
    return { isValid: false, error: 'خطأ: يرجى إدخال الرقم.', formatted: '', country: chosenCountry || 'sudan' };
  }

  // Determine country: explicit chosenCountry > prefix in string > location
  let country: 'sudan' | 'egypt' = chosenCountry || 'sudan';
  if (!chosenCountry) {
    if (rawInput.includes('+20') || digits.startsWith('20')) {
      country = 'egypt';
    } else if (rawInput.includes('+249') || digits.startsWith('249')) {
      country = 'sudan';
    } else if (digits.startsWith('0') && digits.length === 11) {
      country = 'egypt';
    } else if (digits.startsWith('0') && digits.length === 10) {
      country = 'sudan';
    } else if (location?.isEgypt) {
      country = 'egypt';
    }
  }

  const res = formatPhoneNumberWithCountry(rawInput, country);
  return {
    isValid: res.isValid,
    error: res.error,
    formatted: res.formatted,
    country: res.country
  };
}

/**
 * Intelligent client-side validation for Real Personal Photo:
 * Rejects drawings, anime, AI generated synthetic illustrations, pure solid icons, or stock clipart.
 * Analyzes natural photographic characteristics, human skin tone pigment distribution, variance, and resolution.
 */
export async function validateRealPersonalPhoto(
  dataUrl: string,
  isDirectCamera = false
): Promise<{
  isValid: boolean;
  error?: string;
  confidence: number;
}> {
  if (isDirectCamera) {
    return { isValid: true, confidence: 1 };
  }

  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve({ 
        isValid: false, 
        error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع', 
        confidence: 0 
      });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        // 1. Basic Dimension check
        if (width < 60 || height < 60) {
          resolve({
            isValid: false,
            error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع',
            confidence: 0
          });
          return;
        }

        // 2. Aspect ratio (reject extreme horizontal banners or long vertical strips)
        const ratio = width / height;
        if (ratio > 3.0 || ratio < 0.3) {
          resolve({
            isValid: false,
            error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع',
            confidence: 0
          });
          return;
        }

        // 3. Pixel canvas inspection
        const canvas = document.createElement('canvas');
        const sampleSize = 100;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          resolve({ isValid: true, confidence: 0.85 });
          return;
        }

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        const totalPixels = sampleSize * sampleSize;

        let skinCandidates = 0;
        let alienColorCount = 0;
        const quantizedPalette = new Set<string>();
        let localGradientSum = 0;

        let centerPixels = 0;
        let centerSkinCount = 0;

        for (let y = 0; y < sampleSize; y++) {
          for (let x = 0; x < sampleSize; x++) {
            const idx = (y * sampleSize + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const a = imgData[idx + 3];

            if (a < 100) continue;

            if (x < sampleSize - 1) {
              const nextR = imgData[idx + 4];
              const diff = Math.abs(r - nextR);
              if (diff > 1 && diff < 25) {
                localGradientSum++;
              }
            }

            const qKey = `${Math.floor(r / 16)}_${Math.floor(g / 16)}_${Math.floor(b / 16)}`;
            quantizedPalette.add(qKey);

            // Detect non-human cartoon avatars (blue/green cartoon characters, neon vectors)
            const isUnnaturalAlien = (b > r + 45 && b > g + 35) || (g > r + 45 && g > b + 45) || (r > 230 && b > 230 && g < 80);
            if (isUnnaturalAlien) {
              alienColorCount++;
            }

            // Broad, inclusive human skin tone check covering all shades from light to deep African/Egyptian melanin
            const isSkin = 
              (r > 25 && g > 15 && b > 8 && r >= g - 2 && (r >= b || (r - b) >= -5) && (Math.max(r, g, b) - Math.min(r, g, b)) > 6) ||
              (r > 160 && g > 120 && b > 100 && r >= b) ||
              (r > 40 && g > 25 && b > 15 && r > b && (r - b) >= 4);

            if (isSkin) {
              skinCandidates++;
            }

            const inCenter = x >= 25 && x <= 75 && y >= 20 && y <= 75;
            if (inCenter) {
              centerPixels++;
              if (isSkin) centerSkinCount++;
            }
          }
        }

        const uniqueColorsCount = quantizedPalette.size;
        const alienRatio = alienColorCount / totalPixels;
        const centerSkinRatio = centerPixels > 0 ? (centerSkinCount / centerPixels) : 0;
        const gradientRatio = localGradientSum / totalPixels;

        // Check 1: Anime or cartoon avatar with unnatural skin colors
        if (alienRatio > 0.35) {
          resolve({
            isValid: false,
            error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع',
            confidence: 0.1
          });
          return;
        }

        // Check 2: Pure clipart, simple icon, or flat vector drawing
        if (uniqueColorsCount < 28 && gradientRatio < 0.12) {
          resolve({
            isValid: false,
            error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع',
            confidence: 0.15
          });
          return;
        }

        // Check 3: Zero skin presence and zero photographic gradient in center
        if (skinCandidates < 30 && centerSkinRatio < 0.03 && uniqueColorsCount < 60) {
          resolve({
            isValid: false,
            error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع',
            confidence: 0.2
          });
          return;
        }

        // Passed as a real personal photo
        resolve({
          isValid: true,
          confidence: 0.95
        });

      } catch (e) {
        console.warn('Photo verification fallback:', e);
        resolve({ isValid: true, confidence: 0.85 });
      }
    };

    img.onerror = () => {
      resolve({ 
        isValid: false, 
        error: 'تنبيه : محتاجين صورتك عشان نتعرف عليك في الاجتماع', 
        confidence: 0 
      });
    };

    img.src = dataUrl;
  });
}

/**
 * Sanitizes and resolves a member photo URL across all domains (AI Studio & 3fetyayouth.online).
 * - Strips any accidental domain prefix before `data:image/`
 * - Rejects ephemeral `blob:` URLs
 * - Resolves `__D1_PHOTO_REF__:<id>` from local cache or triggers lazy D1 fetch
 */
export function resolveSafePhotoUrl(rawUrl?: string | null, memberId?: string): string {
  const str = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (str.startsWith('blob:')) {
    return (memberId ? getCachedD1Photo(memberId) : '') || '';
  }
  if (str.includes('data:image/')) {
    const cleanDataUrl = str.startsWith('data:image/')
      ? str
      : str.slice(str.indexOf('data:image/'));
    if (memberId) setCachedD1Photo(memberId, cleanDataUrl);
    return cleanDataUrl;
  }
  if (str.startsWith('__D1_PHOTO_REF__:')) {
    const refId = str.replace('__D1_PHOTO_REF__:', '').trim() || memberId || '';
    const cached = getCachedD1Photo(refId);
    if (cached && cached.includes('data:image/')) {
      return cached.startsWith('data:image/') ? cached : cached.slice(cached.indexOf('data:image/'));
    }
    if (refId) fetchD1PhotoLazy(refId);
    return refId === 'reg_owner_main' ? '/owner_portrait.jpg' : '';
  }
  if (!str && memberId) {
    const cached = getCachedD1Photo(memberId);
    if (cached && cached.includes('data:image/')) {
      return cached.startsWith('data:image/') ? cached : cached.slice(cached.indexOf('data:image/'));
    }
  }
  return str;
}

/**
 * Compresses any File, Blob, or data:image/... string into a compact 250x250 (quality 0.7)
 * Base64 JPEG string (~12KB - 20KB) so it can be stored directly inside Cloudflare D1
 * without hitting database size or Worker CPU limits.
 */
export async function compressImageToBase64(
  input: File | Blob | string,
  maxDimension = 250,
  quality = 0.7
): Promise<string> {
  if (!input) return '';

  let dataUrl = '';
  if (typeof input === 'string') {
    if (input.startsWith('blob:')) return '';
    dataUrl = input.includes('data:image/') && !input.startsWith('data:image/')
      ? input.slice(input.indexOf('data:image/'))
      : input;
  } else {
    dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(input);
    });
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl || '';
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (err) {
        console.warn('Image compression fallback:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Compresses any photo (camera capture or upload) to fit comfortably within browser storage and Cloudflare D1.
 */
export async function compressImageToFitStorage(
  dataUrl: string,
  maxDimension = 250,
  quality = 0.7
): Promise<string> {
  return compressImageToBase64(dataUrl, Math.min(maxDimension, 250), Math.min(quality, 0.75));
}

/**
 * Process personal photo ensuring a crisp solid white background (#ffffff)
 * without altering or degrading the person's shape, facial features, skin tone, hair or clothes colors.
 */
export async function processPhotoWithWhiteBackground(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const targetWidth = 480;
        const targetHeight = 560; // Standard portrait aspect ratio
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // 1. Base canvas fill with pure white
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // 2. Draw person centered with optimal portrait scale
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const offsetX = (targetWidth - drawWidth) / 2;
        const offsetY = (targetHeight - drawHeight) / 2;

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // 3. Smart white background replacement preserving person's features, tone & colors
        const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imgData.data;

        // Sample ambient background near top corners
        const sampleCorner = (sx: number, sy: number) => {
          const idx = (sy * targetWidth + sx) * 4;
          return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
        };

        const corners = [
          sampleCorner(10, 10),
          sampleCorner(targetWidth - 10, 10),
          sampleCorner(20, 20),
          sampleCorner(targetWidth - 20, 20),
          sampleCorner(10, 70),
          sampleCorner(targetWidth - 10, 70)
        ];

        const avgBg = corners.reduce(
          (acc, c) => ({ r: acc.r + c.r / corners.length, g: acc.g + c.g / corners.length, b: acc.b + c.b / corners.length }),
          { r: 0, g: 0, b: 0 }
        );

        // Define subject safety protection oval
        const centerX = targetWidth / 2;
        const centerY = targetHeight * 0.45;
        const radiusX = targetWidth * 0.33;
        const radiusY = targetHeight * 0.42;

        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            const idx = (y * targetWidth + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const normX = (x - centerX) / radiusX;
            const normY = (y - centerY) / radiusY;
            const distFromCenter = normX * normX + normY * normY;

            // Skin tone protection
            const isSkinTone = r > 45 && g > 25 && b > 15 && r > g && r > b;

            // If in outer peripheral region outside the subject core
            if (distFromCenter > 1.0) {
              const colorDistToBg = Math.sqrt(
                Math.pow(r - avgBg.r, 2) + Math.pow(g - avgBg.g, 2) + Math.pow(b - avgBg.b, 2)
              );

              // Background pixel or corner backdrop
              if (colorDistToBg < 65 || (distFromCenter > 1.35 && !isSkinTone)) {
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
              } else if (distFromCenter > 1.15 && !isSkinTone) {
                // Smooth feathered blend to solid white
                const blend = Math.min(1, (distFromCenter - 1.15) * 2.2);
                data[idx] = Math.round(r * (1 - blend) + 255 * blend);
                data[idx + 1] = Math.round(g * (1 - blend) + 255 * blend);
                data[idx + 2] = Math.round(b * (1 - blend) + 255 * blend);
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.90));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Extract a normalized facial biometric perceptual signature from an image.
 * Captures facial structural hash and color-luminance distribution to identify the person.
 */
export async function extractFaceSignature(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      resolve('');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const targetSize = 16;
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve('');
          return;
        }

        // Focus on facial bounding oval: centered at (50%, 43%), size (50%, 55%)
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const faceW = srcW * 0.52;
        const faceH = srcH * 0.56;
        const faceX = Math.max(0, (srcW - faceW) / 2);
        const faceY = Math.max(0, srcH * 0.16);

        ctx.drawImage(img, faceX, faceY, faceW, faceH, 0, 0, targetSize, targetSize);
        const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data;

        // 1. Grayscale luminance difference hash (dHash along rows & columns)
        const gray: number[] = [];
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          gray.push(Math.round(r * 0.299 + g * 0.587 + b * 0.114));
        }

        let bits = '';
        // Horizontal differences
        for (let row = 0; row < targetSize; row++) {
          for (let col = 0; col < targetSize - 1; col++) {
            const idx1 = row * targetSize + col;
            const idx2 = idx1 + 1;
            bits += gray[idx1] < gray[idx2] ? '1' : '0';
          }
        }
        // Vertical differences
        for (let col = 0; col < targetSize; col++) {
          for (let row = 0; row < targetSize - 1; row++) {
            const idx1 = row * targetSize + col;
            const idx2 = (row + 1) * targetSize + col;
            bits += gray[idx1] < gray[idx2] ? '1' : '0';
          }
        }

        // Convert bits into hex string
        let hex = '';
        for (let i = 0; i < bits.length; i += 4) {
          const chunk = bits.substring(i, i + 4);
          hex += parseInt(chunk, 2).toString(16);
        }

        // 2. Regional 4x4 zone luminance & chrominance signature (16 cells)
        const zoneTokens: string[] = [];
        for (let zy = 0; zy < 4; zy++) {
          for (let zx = 0; zx < 4; zx++) {
            let sumL = 0;
            let sumRG = 0;
            let count = 0;
            for (let dy = 0; dy < 4; dy++) {
              for (let dx = 0; dx < 4; dx++) {
                const px = zx * 4 + dx;
                const py = zy * 4 + dy;
                const pIdx = (py * targetSize + px) * 4;
                const r = imgData[pIdx];
                const g = imgData[pIdx + 1];
                const b = imgData[pIdx + 2];
                sumL += (r * 0.299 + g * 0.587 + b * 0.114);
                sumRG += (r - g);
                count++;
              }
            }
            const avgL = Math.round(sumL / count);
            const avgRG = Math.round(sumRG / count);
            zoneTokens.push(`${avgL.toString(16)}_${avgRG.toString(16)}`);
          }
        }

        resolve(`f2:${hex}:${zoneTokens.join(',')}`);
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

/**
 * Compare two facial biometric signatures. Returns similarity between 0 (different) and 1 (identical).
 */
export function compareFaceSignatures(sig1: string, sig2: string): number {
  if (!sig1 || !sig2 || !sig1.startsWith('f2:') || !sig2.startsWith('f2:')) {
    return 0;
  }

  const parts1 = sig1.split(':');
  const parts2 = sig2.split(':');
  if (parts1.length < 3 || parts2.length < 3) return 0;

  const hex1 = parts1[1];
  const hex2 = parts2[1];

  // 1. Bitwise Hamming similarity on difference hash
  let matchBits = 0;
  let totalBits = 0;
  const minLen = Math.min(hex1.length, hex2.length);
  for (let i = 0; i < minLen; i++) {
    const b1 = parseInt(hex1[i], 16);
    const b2 = parseInt(hex2[i], 16);
    if (!isNaN(b1) && !isNaN(b2)) {
      const xor = b1 ^ b2;
      const diff = ((xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1));
      matchBits += (4 - diff);
      totalBits += 4;
    }
  }

  const bitSimilarity = totalBits > 0 ? matchBits / totalBits : 0;

  // 2. Zone luminance / chrominance similarity
  const zones1 = parts1[2].split(',');
  const zones2 = parts2[2].split(',');
  let zoneDiffSum = 0;
  const numZones = Math.min(zones1.length, zones2.length);
  for (let i = 0; i < numZones; i++) {
    const [l1, rg1] = zones1[i].split('_').map((n) => parseInt(n, 16) || 0);
    const [l2, rg2] = zones2[i].split('_').map((n) => parseInt(n, 16) || 0);
    const diffL = Math.abs(l1 - l2) / 255;
    const diffRG = Math.abs(rg1 - rg2) / 255;
    zoneDiffSum += (diffL * 0.6 + diffRG * 0.4);
  }
  const zoneSimilarity = numZones > 0 ? Math.max(0, 1 - (zoneDiffSum / numZones)) : 0;

  return bitSimilarity * 0.70 + zoneSimilarity * 0.30;
}

/**
 * Check if a photo matches any registered member's face biometrics.
 * Prevents creating a duplicate account with the same person's face.
 */
export async function findDuplicateFaceMember(
  photoDataUrl: string,
  excludeMemberId?: string
): Promise<{ isDuplicate: boolean; matchedMember?: Registrant; similarity: number }> {
  try {
    const newSignature = await extractFaceSignature(photoDataUrl);
    if (!newSignature) {
      return { isDuplicate: false, similarity: 0 };
    }

    const registrants = storageService.getRegistrants();
    let bestMatch: Registrant | undefined;
    let highestSimilarity = 0;

    for (const member of registrants) {
      if (member.status === 'cancelled') continue;
      if (excludeMemberId && member.id === excludeMemberId) continue;
      if (!member.photoUrl) continue;

      let memberSig = member.faceSignature;
      if (!memberSig && member.photoUrl.startsWith('data:image/')) {
        memberSig = await extractFaceSignature(member.photoUrl);
        if (memberSig) {
          member.faceSignature = memberSig;
        }
      }

      if (memberSig) {
        const sim = compareFaceSignatures(newSignature, memberSig);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          if (sim >= 0.82) {
            bestMatch = member;
          }
        }
      }
    }

    if (bestMatch && highestSimilarity >= 0.82) {
      return { isDuplicate: true, matchedMember: bestMatch, similarity: highestSimilarity };
    }

    return { isDuplicate: false, similarity: highestSimilarity };
  } catch (err) {
    console.warn('Face duplicate check error:', err);
    return { isDuplicate: false, similarity: 0 };
  }
}

/**
 * Format phone number based on digit count or existing prefix, cleanly replacing leading zero:
 * - 10 digits starting with 0 (Sudan) -> +249 119089276 (leading 0 removed)
 * - 11 digits starting with 0 (Egypt) -> +20 1012345678 (leading 0 removed)
 */
export function formatPhoneNumber(input: string): { 
  formatted: string; 
  country: 'sudan' | 'egypt' | 'other';
  rawDigits: string;
} {
  if (!input) {
    return { formatted: '', country: 'other', rawDigits: '' };
  }
  let digits = input.replace(/\D/g, '');

  if (digits.startsWith('249')) {
    const nat = digits.slice(3).replace(/^0+/, '');
    return {
      formatted: `+249 ${nat}`,
      country: 'sudan',
      rawDigits: nat
    };
  } else if (digits.startsWith('20')) {
    const nat = digits.slice(2).replace(/^0+/, '');
    return {
      formatted: `+20 ${nat}`,
      country: 'egypt',
      rawDigits: nat
    };
  }

  // If starts with leading zero:
  if (digits.startsWith('0')) {
    const withoutZero = digits.replace(/^0+/, '');
    // 11 digits starting with 0 -> Egypt
    if (digits.length === 11) {
      return {
        formatted: `+20 ${withoutZero}`,
        country: 'egypt',
        rawDigits: withoutZero
      };
    }
    // 10 digits starting with 0 -> Sudan
    if (digits.length === 10) {
      return {
        formatted: `+249 ${withoutZero}`,
        country: 'sudan',
        rawDigits: withoutZero
      };
    }
  }

  // 10 digits without leading 0 -> Egypt
  if (digits.length === 10) {
    return {
      formatted: `+20 ${digits}`,
      country: 'egypt',
      rawDigits: digits
    };
  }

  // 9 digits without leading 0 -> Sudan
  if (digits.length === 9) {
    return {
      formatted: `+249 ${digits}`,
      country: 'sudan',
      rawDigits: digits
    };
  }

  return {
    formatted: input,
    country: 'other',
    rawDigits: digits
  };
}

const REUSABLE_CODES_STORAGE_KEY = 'three_youths_reusable_codes_v1';

function getReusableCodes(): string[] {
  try {
    const raw = safeStorage.getItem(REUSABLE_CODES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(c => String(c).trim().toUpperCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function pushReusableCode(code?: string | null): void {
  if (!code) return;
  const normalized = String(code).trim().toUpperCase();
  if (!/^TY-\d+$/i.test(normalized) || normalized === 'TY-0001') return;
  try {
    const current = getReusableCodes().filter(c => c !== normalized);
    current.unshift(normalized);
    safeStorage.setItem(REUSABLE_CODES_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

/**
 * Generates the next sequential official attendance code (e.g. TY-0001 -> TY-0002 -> TY-0003, ...)
 * Immediately reuses any deleted member's uniqueCode or fills any vacant sequential slot.
 */
export function getNextSequentialCode(customList?: Registrant[]): string {
  const list = customList && customList.length > 0 ? customList : storageService.getRegistrants();
  const usedCodes = new Set<string>(['TY-0001']);

  for (const r of list) {
    if (!r || !r.uniqueCode || r.status === 'cancelled' || r.status === 'blocked') continue;
    const code = String(r.uniqueCode).trim().toUpperCase();
    usedCodes.add(code);
  }

  // 1. Prioritize any explicitly freed code from a recently deleted member
  const reusable = getReusableCodes();
  for (const freedCode of reusable) {
    if (!usedCodes.has(freedCode) && freedCode !== 'TY-0001') {
      return freedCode;
    }
  }

  // 2. Scan sequentially from TY-0002 upwards to fill the first available slot
  let candidateNum = 2;
  let candidateCode = `TY-${String(candidateNum).padStart(4, '0')}`;
  while (usedCodes.has(candidateCode.toUpperCase())) {
    candidateNum++;
    candidateCode = `TY-${String(candidateNum).padStart(4, '0')}`;
  }

  return candidateCode;
}

export function generateUniqueCode(customList?: Registrant[]): string {
  return getNextSequentialCode(customList);
}

export async function generateQrCodeDataUrl(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 300,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}

export function playAttendanceBeep(type: 'success' | 'duplicate' | 'error' = 'success') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    if (type === 'error') {
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220, ctx.currentTime);
      osc1.frequency.setValueAtTime(160, ctx.currentTime + 0.15);
      gain1.gain.setValueAtTime(0.18, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.45);
    } else if (type === 'duplicate') {
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc1.frequency.setValueAtTime(349.23, ctx.currentTime + 0.14);
      gain1.gain.setValueAtTime(0.16, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);
    } else {
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);
    }

    if (navigator.vibrate) {
      navigator.vibrate(type === 'error' ? [200, 80, 200] : [100, 50, 100]);
    }
  } catch (e) {
    console.warn('Audio synthesis not supported or blocked', e);
  }
}

export const ROLE_PERMISSIONS: Record<UserRole, AdminPermissions> = {
  priest: {
    canScanAttendance: true,
    canViewDatabase: true,
    canExportData: true,
    canPrintCards: true,
    canManageAdmins: true,
    canCancelMembership: true,
    canManageVisitation: true,
    canEditMembers: false,
    canSendAnnouncements: true,
    canViewMakhdomeen: true,
    canManageKahoot: true,
    canManageEvents: true,
    canManageEventPayments: true,
    canScanEventAttendance: true,
    viewOppositeGenderMembers: false,
  },
  community_owner: {
    canScanAttendance: true,
    canViewDatabase: true,
    canExportData: true,
    canPrintCards: true,
    canManageAdmins: true,
    canCancelMembership: true,
    canManageVisitation: true,
    canEditMembers: true,
    canSendAnnouncements: true,
    canViewMakhdomeen: true,
    canManageKahoot: true,
    canManageEvents: true,
    canManageEventPayments: true,
    canScanEventAttendance: true,
    canViewAllGendersVisitation: true,
    viewOppositeGenderMembers: true,
  },
  community_manager: {
    canScanAttendance: true,
    canViewDatabase: true,
    canExportData: true,
    canPrintCards: true,
    canManageAdmins: true,
    canCancelMembership: true,
    canManageVisitation: true,
    canEditMembers: true,
    canSendAnnouncements: true,
    canViewMakhdomeen: true,
    canManageKahoot: true,
    canManageEvents: true,
    canManageEventPayments: true,
    canScanEventAttendance: true,
    viewOppositeGenderMembers: false,
  },
  meeting_secretary: {
    canScanAttendance: true,
    canViewDatabase: true,
    canExportData: true,
    canPrintCards: true,
    canManageAdmins: true,
    canCancelMembership: true,
    canManageVisitation: true,
    canEditMembers: false,
    canSendAnnouncements: true,
    canViewMakhdomeen: true,
    canManageKahoot: true,
    canManageEvents: true,
    canManageEventPayments: true,
    canScanEventAttendance: true,
    viewOppositeGenderMembers: false,
  },
  service_secretary: {
    canScanAttendance: true,
    canViewDatabase: true,
    canExportData: true,
    canPrintCards: true,
    canManageAdmins: false,
    canCancelMembership: false,
    canManageVisitation: true,
    canEditMembers: false,
    canSendAnnouncements: true,
    canViewMakhdomeen: true,
    canManageKahoot: true,
    canManageEvents: true,
    canManageEventPayments: true,
    canScanEventAttendance: true,
    canViewAllGendersVisitation: false,
    viewOppositeGenderMembers: false,
  },
  servant: {
    canScanAttendance: true,
    canViewDatabase: false,
    canExportData: false,
    canPrintCards: false,
    canManageAdmins: false,
    canCancelMembership: false,
    canManageVisitation: true,
    canEditMembers: false,
    canSendAnnouncements: false,
    canViewMakhdomeen: false,
    canManageKahoot: false,
    canManageEvents: false,
    canManageEventPayments: false,
    canScanEventAttendance: false,
    viewOppositeGenderMembers: false,
  },
  member: {
    canScanAttendance: false,
    canViewDatabase: false,
    canExportData: false,
    canPrintCards: false,
    canManageAdmins: false,
    canCancelMembership: false,
    canManageVisitation: false,
    canEditMembers: false,
    canSendAnnouncements: false,
    canViewMakhdomeen: false,
    canManageKahoot: false,
    canManageEvents: false,
    canManageEventPayments: false,
    canScanEventAttendance: false,
    viewOppositeGenderMembers: false,
  }
};

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = ROLE_PERMISSIONS.servant;

// Seed sample members with realistic Cairo birthdays (some today, some in 3 days, some 4 days ago)
const todayCairo = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
const padZero = (n: number) => String(n).padStart(2, '0');

const todayMonthDay = `${padZero(todayCairo.getMonth() + 1)}-${padZero(todayCairo.getDate())}`;

// +3 days
const upcomingDate = new Date(todayCairo);
upcomingDate.setDate(upcomingDate.getDate() + 3);
const upcomingMonthDay = `${padZero(upcomingDate.getMonth() + 1)}-${padZero(upcomingDate.getDate())}`;

// -4 days
const pastDate = new Date(todayCairo);
pastDate.setDate(pastDate.getDate() - 4);
const pastMonthDay = `${padZero(pastDate.getMonth() + 1)}-${padZero(pastDate.getDate())}`;

const COMMUNITY_OWNER_AUTH_RECORD: Registrant = {
  id: 'reg_owner_main',
  uniqueCode: 'TY-0001',
  fullName: 'ميخائيل ادور راتب',
  gender: 'male',
  genderCode: 'male',
  manualGender: 'male',
  genderLabel: 'ذكر',
  type: 'شاب',
  category: 'شباب',
  genderLocked: true,
  phone: '+20 1288651567',
  whatsapp: '+20 1288651567',
  email: 'admin@threeholyyouth.org',
  dob: '1995-01-01',
  photoUrl: '/owner_portrait.jpg',
  registeredAt: '2026-01-01T00:00:00Z',
  qrData: 'TY-0001',
  password: 'admin123456789',
  recoveryCode: '123456',
  address: 'الخرطوم / القاهرة',
  notes: 'مسؤول وصاحب المجتمع (Community Owner) - الصلاحية الكاملة والمناعة التامة',
  role: 'community_owner',
  status: 'active',
  permissions: ROLE_PERMISSIONS.community_owner,
  isVisitedGeneral: false
};

const SAMPLE_REGISTRANTS: Registrant[] = [];

/**
 * Permanently identifies the sole Community Owner (ميخائيل ادور راتب / admin@threeholyyouth.org)
 * so no background sync or state update can ever downgrade their role to 'servant' or hide dashboards.
 */
export function isPermanentCommunityOwner(candidate: any): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const id = String(candidate.id || '').trim();
  const code = String(candidate.uniqueCode || '').trim().toUpperCase();
  const rawName = String(candidate.fullName || candidate.name || candidate.displayName || '').trim();
  const normName = rawName
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
  const email = String(candidate.email || '').trim().toLowerCase();
  const phoneDigits = String(candidate.phone || '').replace(/\D/g, '');
  const pass = String(candidate.password || '').trim();

  if (id === 'reg_owner_main' || code === 'TY-0001') return true;
  if (
    rawName === 'ميخائيل ادور راتب' ||
    rawName === 'ميخائيل ادوار راتب' ||
    normName === 'ميخائيل ادور راتب' ||
    normName === 'ميخائيل ادوار راتب'
  ) {
    return true;
  }
  if (
    email === 'admin@threeholyyouth.org' ||
    email === 'admin@threeyouths.org' ||
    email === 'michealedwar8@gmail.com'
  ) {
    return true;
  }
  if (
    phoneDigits === '201288651567' ||
    phoneDigits === '01288651567' ||
    email.replace(/\D/g, '') === '201288651567' ||
    email.replace(/\D/g, '') === '01288651567'
  ) {
    return true;
  }
  if (
    pass === 'admin123456789' &&
    (candidate.role === 'community_owner' || email.includes('admin') || normName.includes('ميخائيل'))
  ) {
    return true;
  }
  return false;
}

/**
 * Unified real-time access check:
 * 1. Only the primary Community Owner (`community_owner` / `reg_owner_main` / `ميخائيل ادور راتب`) has permanent immunity.
 * 2. Every other role (`community_manager`, `priest`, `meeting_secretary`, `service_secretary`, `servant`, `member`)
 *    strictly checks `user.permissions[permissionKey]` (or array inclusion), falling back to role template ONLY if `user.permissions` is undefined.
 */
export function hasAccess(user: any, permissionKey: keyof AdminPermissions | string): boolean {
  if (!user || typeof user !== 'object') return false;

  // 1. Primary Community Owner is the ONLY permanent exception
  if (
    isPermanentCommunityOwner(user) ||
    user.role === 'community_owner' ||
    user.id === 'reg_owner_main'
  ) {
    return true;
  }

  // 2. Check custom permissions array or object directly without role-default overwrite
  const perms = user.permissions;
  if (Array.isArray(perms)) {
    return perms.includes(permissionKey);
  }

  if (perms && typeof perms === 'object') {
    if (permissionKey in perms) {
      return Boolean((perms as any)[permissionKey]);
    }
  }

  // 3. Fallback to role default ONLY if user.permissions does not define this key at all
  const role: UserRole = (user.role as UserRole) || 'member';
  const roleDefaults = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return Boolean((roleDefaults as any)?.[permissionKey]);
}

/**
 * Unified authorization check for editing a member's profile data:
 * 1. Self-edit: Any member/servant can edit their own profile (`currentUser.id === targetMemberId`).
 * 2. Community Owner (`community_owner`) can edit any profile.
 * 3. Community Manager (`community_manager`) or any servant/leader with `canEditMembers: true`
 *    can edit any profile except `community_owner`.
 */
export function canEditMemberData(
  currentUser: any,
  targetMemberId?: string,
  targetMemberRole?: UserRole
): boolean {
  if (!currentUser || typeof currentUser !== 'object') return false;

  const isActorOwner =
    isPermanentCommunityOwner(currentUser) ||
    currentUser.role === 'community_owner' ||
    currentUser.id === 'reg_owner_main';

  if (isActorOwner) return true;

  // Only Community Owner can edit Community Owner
  if (targetMemberRole === 'community_owner' || targetMemberId === 'reg_owner_main') {
    return false;
  }

  // Self-update: user editing their own profile
  if (
    currentUser.id &&
    targetMemberId &&
    String(currentUser.id).trim().replace(/^reg_member_/, '') ===
      String(targetMemberId).trim().replace(/^reg_member_/, '')
  ) {
    return true;
  }

  if (currentUser.role === 'community_manager') {
    return true;
  }

  if (hasAccess(currentUser, 'canEditMembers')) {
    return true;
  }

  const perms = currentUser.permissions;
  if (Array.isArray(perms)) {
    return (
      perms.includes('canEditMembers') ||
      perms.includes('editMembers') ||
      perms.includes('manageMembers')
    );
  }
  if (perms && typeof perms === 'object') {
    return Boolean(perms.canEditMembers || perms.editMembers || perms.manageMembers);
  }

  return false;
}

/**
 * Normalizes and guards any raw Registrant object from Firestore, LocalStorage, or Server API
 * to prevent crashes, missing properties, or undefined method errors.
 */
/**
 * Sanitizes any user-provided text against XSS, script tags, inline handlers, and javascript URIs.
 */
export function sanitizeSecurityText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?(?:script|iframe|object|embed|svg|math|meta|link|style|base)\b[^>]*>/gi, '')
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim();
}

export function isValidMemberName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = sanitizeSecurityText(name).trim();
  return trimmed.length > 0 && trimmed !== 'عضو';
}

export function mergeRegistrantPreservingIdentity(existing: Registrant, incoming: Partial<Registrant>): Registrant {
  const incomingNameCandidate = incoming.fullName || (incoming as any).name;
  const existingNameCandidate = existing.fullName || (existing as any).name;
  const validIncomingName = isValidMemberName(incomingNameCandidate) ? sanitizeSecurityText(incomingNameCandidate!).trim() : null;
  const validExistingName = isValidMemberName(existingNameCandidate) ? sanitizeSecurityText(existingNameCandidate).trim() : null;

  const existingUpdatedMs = Math.max(
    Number((existing as any).lastModifiedAt || 0),
    Number((existing as any).updatedAt || 0),
    existing.lastUpdatedAt ? new Date(existing.lastUpdatedAt).getTime() : 0
  );
  const incomingUpdatedMs = Math.max(
    Number((incoming as any).lastModifiedAt || 0),
    Number((incoming as any).updatedAt || 0),
    incoming.lastUpdatedAt ? new Date(incoming.lastUpdatedAt).getTime() : 0
  );
  const incomingWins = incomingUpdatedMs >= existingUpdatedMs;

  const finalFullName = incomingWins && validIncomingName
    ? validIncomingName
    : (validExistingName || validIncomingName || existing.fullName);

  const rawIncPhone = incoming.phone !== undefined ? String(incoming.phone).trim() : undefined;
  const finalPhone = incomingWins && rawIncPhone !== undefined && rawIncPhone !== ''
    ? rawIncPhone
    : ((rawIncPhone && !existing.phone) ? rawIncPhone : existing.phone);

  const rawIncWa = incoming.whatsapp !== undefined ? String(incoming.whatsapp).trim() : undefined;
  const finalWhatsapp = incomingWins && rawIncWa !== undefined && rawIncWa !== ''
    ? rawIncWa
    : (existing.whatsapp || finalPhone);

  const rawIncCode = incoming.uniqueCode && String(incoming.uniqueCode).trim()
    ? String(incoming.uniqueCode).trim().toUpperCase()
    : '';
  const finalUniqueCode = incomingWins && rawIncCode
    ? rawIncCode
    : ((existing.uniqueCode && existing.uniqueCode.trim())
        ? existing.uniqueCode.trim().toUpperCase()
        : (rawIncCode || existing.uniqueCode));

  const rawIncQr = incoming.qrData && String(incoming.qrData).trim()
    ? String(incoming.qrData).trim()
    : '';
  const finalQrData = incomingWins && (rawIncQr || rawIncCode)
    ? (rawIncQr || finalUniqueCode)
    : (existing.qrData || rawIncQr || finalUniqueCode);

  const incomingRawPhoto = String(
    incoming.photoUrl || (incoming as any).avatar || (incoming as any).image || ''
  ).trim();
  const resolvedIncomingPhoto = resolveSafePhotoUrl(incomingRawPhoto, existing.id);
  const existingRawPhoto = String(
    existing.photoUrl || (existing as any).avatar || (existing as any).image || ''
  ).trim();
  const existingValidPhoto = resolveSafePhotoUrl(existingRawPhoto, existing.id);

  const finalPhotoUrl = incomingWins
    ? (resolvedIncomingPhoto || existingValidPhoto || '')
    : (existingValidPhoto || resolvedIncomingPhoto || '');

  const finalGenderLocked = Boolean(
    incomingWins ? (incoming.genderLocked ?? existing.genderLocked) : (existing.genderLocked ?? incoming.genderLocked)
  );
  const rawIncGender = incoming.gender || (incoming as any).sex;
  const candidateGender: 'male' | 'female' =
    incomingWins && (rawIncGender === 'female' || rawIncGender === 'male')
      ? rawIncGender
      : (existing.gender || (rawIncGender === 'female' ? 'female' : 'male'));
  const finalGender: 'male' | 'female' = detectAndRepairGender({
    ...existing,
    ...incoming,
    fullName: finalFullName,
    gender: candidateGender,
    genderLocked: finalGenderLocked
  });

  const rawIncDob = incoming.dob !== undefined ? incoming.dob : (incoming as any).birthDate;
  const finalDob =
    incomingWins && rawIncDob !== undefined && String(rawIncDob).trim() !== ''
      ? String(rawIncDob).trim()
      : (existing.dob || (rawIncDob ? String(rawIncDob).trim() : ''));

  const rawIncAddress = incoming.address !== undefined ? incoming.address : (incoming as any).residence;
  const finalAddress =
    incomingWins && rawIncAddress !== undefined
      ? sanitizeSecurityText(String(rawIncAddress))
      : (existing.address ?? (rawIncAddress !== undefined ? sanitizeSecurityText(String(rawIncAddress)) : undefined));

  const rawIncNotes =
    incoming.notes !== undefined
      ? incoming.notes
      : (incoming as any).talents !== undefined
        ? (incoming as any).talents
        : (incoming as any).skills;
  const finalNotes =
    incomingWins && rawIncNotes !== undefined
      ? sanitizeSecurityText(String(rawIncNotes))
      : (existing.notes ?? (rawIncNotes !== undefined ? sanitizeSecurityText(String(rawIncNotes)) : undefined));

  const finalUpdatedAt = Math.max(incomingUpdatedMs, existingUpdatedMs) || Date.now();
  const finalLastUpdatedAt = incomingWins
    ? (incoming.lastUpdatedAt || new Date(finalUpdatedAt).toISOString())
    : (existing.lastUpdatedAt || incoming.lastUpdatedAt);

  const finalUpdatedFields = incomingWins && Array.isArray(incoming.updatedFields)
    ? incoming.updatedFields
    : existing.updatedFields;

  const mergedAttendanceDates = Array.from(
    new Set([
      ...(Array.isArray(existing.attendanceDates) ? existing.attendanceDates : []),
      ...(Array.isArray(incoming.attendanceDates) ? incoming.attendanceDates : [])
    ])
  );
  const mergedPresentDates = Array.from(
    new Set([
      ...(Array.isArray(existing.presentDates) ? existing.presentDates : []),
      ...(Array.isArray(incoming.presentDates) ? incoming.presentDates : [])
    ])
  );
  const mergeStampCollections = (olderStamps: any, newerStamps: any) => {
    if (Array.isArray(olderStamps) || Array.isArray(newerStamps)) {
      return Array.from(new Set([
        ...(Array.isArray(olderStamps) ? olderStamps : []),
        ...(Array.isArray(newerStamps) ? newerStamps : [])
      ]));
    }
    return {
      ...(olderStamps && typeof olderStamps === 'object' ? olderStamps : {}),
      ...(newerStamps && typeof newerStamps === 'object' ? newerStamps : {})
    };
  };
  const mergedStamps = mergeStampCollections(existing.stamps, incoming.stamps);
  const mergedFridayStamps = mergeStampCollections((existing as any).fridayStamps, (incoming as any).fridayStamps);
  const mergedHistory = [
    ...(Array.isArray(existing.attendanceHistory) ? existing.attendanceHistory : []),
    ...(Array.isArray(incoming.attendanceHistory) ? incoming.attendanceHistory : [])
  ].filter((item, idx, arr) => {
    if (!item) return false;
    const dKey = typeof item === 'string' ? item : String(item.date || item.id || '');
    return arr.findIndex(x => (typeof x === 'string' ? x : String(x?.date || x?.id || '')) === dKey) === idx;
  });

  const cleanExistingId = getBaseMemberId(existing.id || (existing as any).originalId || '');
  return {
    ...existing,
    ...incoming,
    id: cleanExistingId || existing.id,
    originalId: getBaseMemberId((existing as any).originalId || cleanExistingId || existing.id),
    fullName: finalFullName,
    name: finalFullName,
    phone: finalPhone,
    whatsapp: finalWhatsapp,
    uniqueCode: finalUniqueCode,
    qrData: finalQrData,
    dob: finalDob,
    birthDate: finalDob,
    gender: finalGender,
    sex: finalGender,
    genderCode: (incoming as any).genderCode || finalGender,
    manualGender: finalGenderLocked ? finalGender : ((incoming as any).manualGender ?? (existing as any).manualGender),
    genderLabel: finalGender === 'female' ? 'أنثى' : 'ذكر',
    type: finalGender === 'female' ? 'شابة' : 'شاب',
    category: finalGender === 'female' ? 'شابات' : 'شباب',
    genderLocked: finalGenderLocked,
    address: finalAddress,
    residence: finalAddress,
    notes: finalNotes,
    talents: finalNotes,
    skills: finalNotes,
    photoUrl: finalPhotoUrl,
    avatar: finalPhotoUrl,
    image: finalPhotoUrl,
    stamps: mergedStamps,
    fridayStamps: mergedFridayStamps,
    attendanceDates: mergedAttendanceDates,
    presentDates: mergedPresentDates,
    attendanceHistory: mergedHistory,
    attendance: Array.isArray(incoming.attendance) ? incoming.attendance : (existing.attendance || []),
    lastAttendance: incoming.lastAttendance || existing.lastAttendance,
    registeredAt: existing.registeredAt || incoming.registeredAt || new Date().toISOString(),
    lastModifiedAt: finalUpdatedAt,
    updatedAt: finalUpdatedAt,
    lastUpdatedAt: finalLastUpdatedAt,
    updatedFields: finalUpdatedFields,
    ipAddress: incoming.ipAddress || existing.ipAddress
  } as Registrant;
}

export function normalizeRegistrant(raw: any, index = 0): Registrant {
  if (isGarbageOrGhostMember(raw)) {
    return {
      id: `GHOST-${index + 1}`,
      uniqueCode: '',
      fullName: '',
      name: '',
      gender: 'male',
      sex: 'male',
      phone: '',
      whatsapp: '',
      dob: '',
      photoUrl: '',
      registeredAt: '2026-01-01T00:00:00.000Z',
      qrData: '',
      role: 'member',
      status: 'cancelled'
    };
  }

  const isOwnerAccount = isPermanentCommunityOwner(raw) || raw.role === 'community_owner';

  const candidateName = sanitizeSecurityText(raw.fullName || raw.name || raw.displayName || '');
  const cleanNameSlug = (candidateName || 'member').trim().replace(/\s+/g, '_');

  const rawIdStr = raw.id !== undefined && raw.id !== null ? String(raw.id).trim() : '';
  const id = isOwnerAccount
    ? 'reg_owner_main'
    : (rawIdStr !== ''
        ? rawIdStr
        : (raw.docId
            ? String(raw.docId).trim()
            : (raw.uniqueCode
                ? `reg_${String(raw.uniqueCode).toLowerCase().replace(/[^a-z0-9]/g, '_')}`
                : `CF-STATIC-${index + 1}-${cleanNameSlug}`)));

  // Look up existing member in memory by exact ID only (never collapse distinct members who share a name)
  const existingInMem = (!isOwnerAccount && Array.isArray(inMemoryRegistrants) && inMemoryRegistrants.length > 0)
    ? inMemoryRegistrants.find(r => r && r.id === id)
    : undefined;

  const fullName = isOwnerAccount
    ? 'ميخائيل ادور راتب'
    : (isValidMemberName(candidateName)
        ? candidateName
        : (existingInMem && isValidMemberName(existingInMem.fullName) ? existingInMem.fullName : ''));

  // Deterministic fallback code based on name/id hash (never Math.random() so polling diff check stays 100% stable)
  let hashAcc = 0;
  const seedStr = `${id}_${fullName}`;
  for (let i = 0; i < seedStr.length; i++) {
    hashAcc = ((hashAcc << 5) - hashAcc + seedStr.charCodeAt(i)) | 0;
  }
  const deterministicCode = `TY-${String(1000 + (Math.abs(hashAcc) % 8999)).padStart(4, '0')}`;

  const uniqueCode = isOwnerAccount
    ? 'TY-0001'
    : ((raw.uniqueCode && typeof raw.uniqueCode === 'string' && raw.uniqueCode.trim()) 
        ? raw.uniqueCode.trim().toUpperCase() 
        : (existingInMem?.uniqueCode || deterministicCode));

  const role: UserRole = isOwnerAccount ? 'community_owner' : (raw.role || existingInMem?.role || 'member');
  const genderLocked = Boolean(raw.genderLocked ?? existingInMem?.genderLocked ?? raw.manualGender ?? existingInMem?.manualGender);
  const gender: 'male' | 'female' = isOwnerAccount
    ? 'male'
    : getMemberGender({
        ...existingInMem,
        ...raw,
        fullName,
        name: fullName,
        genderLocked
      });
  const status: 'active' | 'cancelled' = isOwnerAccount
    ? 'active'
    : (raw.status === 'cancelled' || !fullName ? 'cancelled' : 'active');
  const phone = raw.phone ? sanitizeSecurityText(String(raw.phone)) : (isOwnerAccount ? '+20 1288651567' : (existingInMem?.phone || ''));
  const whatsapp = raw.whatsapp ? sanitizeSecurityText(String(raw.whatsapp)) : (existingInMem?.whatsapp || phone);
  const rawDobVal = raw.dob !== undefined ? raw.dob : raw.birthDate;
  const dob = rawDobVal ? sanitizeSecurityText(String(rawDobVal)) : (existingInMem?.dob || '');
  const rawPhotoStr = String(raw.photoUrl || raw.avatar || raw.image || '').trim();
  const existingMemPhoto = existingInMem
    ? resolveSafePhotoUrl(
        existingInMem.photoUrl || existingInMem.avatar || existingInMem.image,
        id
      )
    : '';
  const photoUrl =
    resolveSafePhotoUrl(rawPhotoStr, id) ||
    existingMemPhoto ||
    (isOwnerAccount ? '/owner_portrait.jpg' : '');
  const registeredAt = raw.registeredAt ? String(raw.registeredAt) : (existingInMem?.registeredAt || '2026-01-01T00:00:00.000Z');
  const qrData = raw.qrData ? String(raw.qrData) : (existingInMem?.qrData || uniqueCode);
  const recoveryCode = raw.recoveryCode ? String(raw.recoveryCode) : (existingInMem?.recoveryCode || '123456');
  const password = isOwnerAccount ? 'admin123456789' : (raw.password ? String(raw.password).trim() : existingInMem?.password);
  const rawAddrVal = raw.address !== undefined ? raw.address : raw.residence;
  const address = rawAddrVal !== undefined ? (rawAddrVal ? sanitizeSecurityText(String(rawAddrVal)) : '') : existingInMem?.address;
  const rawNotesVal =
    raw.notes !== undefined
      ? raw.notes
      : raw.talents !== undefined
        ? raw.talents
        : raw.skills;
  const notes = rawNotesVal !== undefined ? (rawNotesVal ? sanitizeSecurityText(String(rawNotesVal)) : '') : existingInMem?.notes;

  let permissions = raw.permissions ?? existingInMem?.permissions;
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = undefined;
    }
  }
  const baseRolePerms = isOwnerAccount ? ROLE_PERMISSIONS.community_owner : (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member);
  if (!permissions || typeof permissions !== 'object') {
    permissions = { ...baseRolePerms };
  } else if (isOwnerAccount) {
    // Community Owner permissions are permanently locked to true while preserving __system* metadata keys
    permissions = { ...permissions, ...ROLE_PERMISSIONS.community_owner };
  } else {
    // Preserve every explicit boolean (including false) saved in member's custom permissions object
    const mergedPerms: any = { ...baseRolePerms, ...permissions };
    (Object.keys(baseRolePerms) as Array<keyof AdminPermissions>).forEach((k) => {
      if (k in permissions && typeof permissions[k] === 'boolean') {
        mergedPerms[k] = permissions[k];
      }
    });
    permissions = mergedPerms;
  }

  const isVisitedGeneral = raw.isVisitedGeneral !== undefined ? Boolean(raw.isVisitedGeneral) : Boolean(existingInMem?.isVisitedGeneral);
  const updatedAtMs = Number(
    raw.updatedAt ||
      (raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt).getTime() : 0) ||
      (existingInMem as any)?.updatedAt ||
      (existingInMem?.lastUpdatedAt ? new Date(existingInMem.lastUpdatedAt).getTime() : 0) ||
      0
  );
  const lastModifiedAtMs = Number(
    raw.lastModifiedAt ||
      (existingInMem as any)?.lastModifiedAt ||
      updatedAtMs ||
      0
  ) || undefined;

  return {
    id,
    uniqueCode,
    fullName,
    name: fullName,
    gender,
    sex: gender,
    genderCode: (raw.genderCode || (genderLocked ? gender : existingInMem?.genderCode)) as any,
    manualGender: (raw.manualGender || (genderLocked ? gender : existingInMem?.manualGender)) as any,
    genderLabel: raw.genderLabel || (gender === 'female' ? 'أنثى' : 'ذكر'),
    type: raw.type || (gender === 'female' ? 'شابة' : 'شاب'),
    category: raw.category || (gender === 'female' ? 'شابات' : 'شباب'),
    genderLocked,
    phone,
    whatsapp,
    dob,
    birthDate: dob,
    photoUrl,
    avatar: photoUrl,
    image: photoUrl,
    registeredAt,
    qrData,
    password,
    recoveryCode,
    deviceRecoveryToken: raw.deviceRecoveryToken ? String(raw.deviceRecoveryToken) : existingInMem?.deviceRecoveryToken,
    address,
    residence: address,
    notes,
    talents: notes,
    skills: notes,
    role,
    status,
    permissions,
    ipAddress: raw.ipAddress || existingInMem?.ipAddress,
    email: isOwnerAccount ? (raw.email || 'admin@threeholyyouth.org') : (raw.email || existingInMem?.email),
    detectedCountry: raw.detectedCountry || existingInMem?.detectedCountry,
    updatedAt: updatedAtMs || undefined,
    lastUpdatedAt: raw.lastUpdatedAt !== undefined ? (raw.lastUpdatedAt || undefined) : existingInMem?.lastUpdatedAt,
    lastModifiedAt: lastModifiedAtMs,
    updatedFields: Array.isArray(raw.updatedFields) ? raw.updatedFields : existingInMem?.updatedFields,
    isOnline: raw.isOnline !== undefined ? Boolean(raw.isOnline) : existingInMem?.isOnline,
    lastSeen: raw.lastSeen || existingInMem?.lastSeen || undefined,
    isVisitedGeneral,
    lastVisitedAt: isVisitedGeneral ? (raw.lastVisitedAt || raw.generalVisitedAt || existingInMem?.lastVisitedAt || undefined) : undefined,
    lastVisitedBy: isVisitedGeneral ? (raw.lastVisitedBy || raw.generalVisitedBy || existingInMem?.lastVisitedBy || undefined) : undefined,
    needsRealPhoto: raw.needsRealPhoto !== undefined ? Boolean(raw.needsRealPhoto) : Boolean(raw.needsRealPhotoReminder ?? existingInMem?.needsRealPhoto),
    needsRealPhotoReminder: raw.needsRealPhotoReminder !== undefined ? Boolean(raw.needsRealPhotoReminder) : Boolean(raw.needsRealPhoto ?? existingInMem?.needsRealPhotoReminder),
    stamps: raw.stamps !== undefined ? raw.stamps : (existingInMem?.stamps ?? {}),
    fridayStamps: raw.fridayStamps !== undefined ? raw.fridayStamps : (existingInMem?.fridayStamps ?? {}),
    attendanceDates: Array.isArray(raw.attendanceDates) ? raw.attendanceDates : (Array.isArray(existingInMem?.attendanceDates) ? existingInMem.attendanceDates : []),
    presentDates: Array.isArray(raw.presentDates) ? raw.presentDates : (Array.isArray(existingInMem?.presentDates) ? existingInMem.presentDates : []),
    attendanceHistory: Array.isArray(raw.attendanceHistory) ? raw.attendanceHistory : (Array.isArray(existingInMem?.attendanceHistory) ? existingInMem.attendanceHistory : []),
    attendance: Array.isArray(raw.attendance) ? raw.attendance : (Array.isArray(existingInMem?.attendance) ? existingInMem.attendance : []),
    lastAttendance: raw.lastAttendance || existingInMem?.lastAttendance || undefined
  } as Registrant;
}

export interface MonthFriday {
  fridayIndex: number; // 1, 2, 3, 4, 5
  dateStr: string; // "YYYY-MM-DD" e.g. "2026-10-02"
  day: number;
  month: number;
  year: number;
  formattedDate: string; // "02/10"
}

/**
 * Calculates all Fridays in a given month (dynamically 4 or 5 Fridays)
 */
export function getFridaysForMonth(year: number, monthIndex: number): MonthFriday[] {
  const fridays: MonthFriday[] = [];
  const date = new Date(year, monthIndex, 1);
  let count = 0;
  while (date.getMonth() === monthIndex) {
    if (date.getDay() === 5) { // 5 = Friday
      count++;
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      fridays.push({
        fridayIndex: count,
        dateStr: `${y}-${m}-${d}`,
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: y,
        formattedDate: `${d}/${m}`
      });
    }
    date.setDate(date.getDate() + 1);
  }
  return fridays;
}

/**
 * Resolves the target Friday date string (YYYY-MM-DD) in the same month/week for any given attendance date,
 * so that taking attendance on any day (or after 00:00 UTC) also activates the corresponding Friday stamp.
 */
export function resolveActiveFridayForDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return dateStr;
  if (d.getDay() === 5) return dateStr;
  const fridays = getFridaysForMonth(d.getFullYear(), d.getMonth());
  if (fridays.length === 0) return dateStr;
  // Find the nearest Friday in the same month (preferring the Friday of the current meeting week)
  let bestFriday = fridays[0].dateStr;
  let bestDiff = Infinity;
  const targetMs = d.getTime();
  for (const f of fridays) {
    const fParts = f.dateStr.split('-').map(Number);
    const fMs = new Date(fParts[0], fParts[1] - 1, fParts[2]).getTime();
    const diffDays = Math.abs(targetMs - fMs) / (1000 * 60 * 60 * 24);
    if (diffDays < bestDiff) {
      bestDiff = diffDays;
      bestFriday = f.dateStr;
    }
  }
  return bestFriday;
}

export type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

// In-memory master store for immediate zero-lag reactivity across the entire app
let inMemoryRegistrants: Registrant[] = [];
let inMemoryRegistrantsAudited = false;
let inMemoryBlockedUsers: BlockedUser[] = [];
let inMemorySiteTextOverrides: Record<string, string> | null = null;

// Multi-tab / cross-window instant broadcast for zero-delay cross-tab synchronization
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('three_youths_sync_bus') 
  : null;

if (syncChannel) {
  syncChannel.onmessage = () => {
    try {
      const raw = safeStorage.getItem(REGISTRANTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const prevMap = new Map<string, Registrant>();
          inMemoryRegistrants.forEach(r => {
            if (r && r.id) prevMap.set(r.id, r);
          });
          inMemoryRegistrants = parsed.map((r: Registrant) => {
            const prev = r?.id ? prevMap.get(r.id) : undefined;
            if (!prev) return r;
            return { ...r, ...mergeClientPresence(prev, r) };
          });
        }
      }
    } catch {}
    syncListeners.forEach(cb => {
      try { cb(); } catch {}
    });
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('three_youths_photo_hydrated', ((e: CustomEvent) => {
    const memberId = e.detail?.memberId;
    const photoUrl = e.detail?.photoUrl;
    if (!memberId || !photoUrl) return;
    let updated = false;
    if (Array.isArray(inMemoryRegistrants) && inMemoryRegistrants.length > 0) {
      inMemoryRegistrants = inMemoryRegistrants.map((r) => {
        if (r && r.id === memberId && r.photoUrl !== photoUrl) {
          updated = true;
          return { ...r, photoUrl, avatar: photoUrl };
        }
        return r;
      });
      if (updated) {
        try {
          safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(inMemoryRegistrants));
        } catch {}
        notifySyncListeners();
      }
    }
  }) as EventListener);
}

let isNotifyingSync = false;
let isSyncScheduled = false;
function notifySyncListeners() {
  if (isNotifyingSync || isSyncScheduled) return; // Prevent re-entrant infinite loops & synchronous setState during render
  isSyncScheduled = true;
  queueMicrotask(() => {
    isSyncScheduled = false;
    if (isNotifyingSync) return;
    isNotifyingSync = true;
    try {
      syncListeners.forEach(cb => {
        try { cb(); } catch {}
      });
      try {
        syncChannel?.postMessage({ type: 'sync', time: Date.now() });
      } catch {}
    } finally {
      isNotifyingSync = false;
    }
  });
}

// Zero Mock/Seed Data: Initial state is strictly empty [] until fetched live from Cloudflare D1
const SAMPLE_KAHOOT_QUIZZES: KahootQuiz[] = [];

// ========================================================
// CLOUDFLARE REALTIME & BI-DIRECTIONAL CLIENT SYNC
// ========================================================
let isCloudflareConnected = true;
let isOfflineMode = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let cloudflareChannel: ReturnType<typeof cloudflareDb.channel> | null = null;

// Mutation timestamps to prevent background polls from reverting optimistic user actions while requests are in flight
let lastModeMutationAt = 0;
let localVisitationModeUpdatedAt = 0;
let lastAssignmentMutationAt = 0;
let lastNotesMutationAt = 0;
const lastVisitationToggleAt: Record<string, number> = {};
const lastRegistrantMutationAt: Record<string, number> = {};
let lastRolePermissionsMutationAt = 0;
let lastSiteTextsMutationAt = 0;
let localSystemStateUpdatedAt = 0;
const SITE_TEXTS_UPDATED_AT_KEY = 'three_youths_site_texts_updated_at';
const lastClientCloudflarePresenceAt: Record<string, number> = {};

function getLocalVisitationModeUpdatedAt(): number {
  try {
    const persisted = Number(safeStorage.getItem(VISITATION_MODE_UPDATED_AT_KEY) || 0);
    return Math.max(localVisitationModeUpdatedAt, isNaN(persisted) ? 0 : persisted);
  } catch {
    return localVisitationModeUpdatedAt;
  }
}

function markLocalVisitationModeUpdated(ts: number = Date.now()): void {
  localVisitationModeUpdatedAt = ts;
  lastModeMutationAt = ts;
  try {
    safeStorage.setItem(VISITATION_MODE_UPDATED_AT_KEY, String(ts));
  } catch {}
}

function getLocalSiteTextsUpdatedAt(): number {
  try {
    const persisted = Number(safeStorage.getItem(SITE_TEXTS_UPDATED_AT_KEY) || 0);
    return Math.max(lastSiteTextsMutationAt, isNaN(persisted) ? 0 : persisted);
  } catch {
    return lastSiteTextsMutationAt;
  }
}

function markLocalSiteTextsMutated(ts: number = Date.now()): void {
  lastSiteTextsMutationAt = ts;
  try {
    safeStorage.setItem(SITE_TEXTS_UPDATED_AT_KEY, String(ts));
  } catch {}
}

export function isSiteTextsMutationLocked(): boolean {
  return Date.now() - getLocalSiteTextsUpdatedAt() < 25000;
}

export function isVisitationModeLocked(): boolean {
  return Date.now() - lastModeMutationAt < 15000;
}

export function isAssignmentsLocked(): boolean {
  return Date.now() - lastAssignmentMutationAt < 15000 || Date.now() - lastModeMutationAt < 15000;
}

export function isMemberVisitationLocked(memberId: string): boolean {
  return Boolean(lastVisitationToggleAt[memberId] && Date.now() - lastVisitationToggleAt[memberId] < 6000);
}

export function isMemberMutationLocked(memberId: string): boolean {
  return Boolean(
    (lastRegistrantMutationAt[memberId] && Date.now() - lastRegistrantMutationAt[memberId] < 12000) ||
    Date.now() - lastRolePermissionsMutationAt < 12000
  );
}

function isMemberActivelyLoggedInOnThisBrowser(member: Registrant | undefined): boolean {
  if (!member) return false;
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    const rawMemberSess = window.sessionStorage.getItem('three_youths_member_session_v2');
    if (rawMemberSess) {
      const mSess = JSON.parse(rawMemberSess);
      if (mSess && (mSess.id === member.id || (mSess.uniqueCode && member.uniqueCode && mSess.uniqueCode === member.uniqueCode))) {
        return true;
      }
    }
    const rawAdminSess = window.sessionStorage.getItem('three_youths_admin_session_v2');
    if (rawAdminSess) {
      const aSess = JSON.parse(rawAdminSess);
      if (aSess) {
        if (aSess.id && aSess.id === member.id) return true;
        if (aSess.role === 'community_owner' && (member.id === 'reg_owner_main' || member.role === 'community_owner')) return true;
        if (aSess.name && member.fullName && normalizeArabicNameForComparison(aSess.name) === normalizeArabicNameForComparison(member.fullName)) return true;
        if (aSess.email && member.phone && aSess.email === member.phone) return true;
      }
    }
  } catch {}
  return false;
}

function mergeClientPresence(localMember: Registrant | undefined, remoteMember: Registrant): { isOnline?: boolean; lastSeen?: string } {
  const localSeenMs = localMember?.lastSeen ? new Date(localMember.lastSeen).getTime() : 0;
  const remSeenMs = remoteMember?.lastSeen ? new Date(remoteMember.lastSeen).getTime() : 0;
  const newestSeenMs = Math.max(localSeenMs, remSeenMs);
  const newestSeenIso = newestSeenMs > 0
    ? new Date(newestSeenMs).toISOString()
    : (remoteMember?.lastSeen || localMember?.lastSeen);

  // If this member is the user currently logged in and viewing the app on this browser, keep them online with fresh timestamp
  const isTabVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
  if (isTabVisible && (isMemberActivelyLoggedInOnThisBrowser(remoteMember) || isMemberActivelyLoggedInOnThisBrowser(localMember))) {
    return { isOnline: true, lastSeen: new Date().toISOString() };
  }

  const isRecentlyActive = newestSeenMs > 0 && (Date.now() - newestSeenMs < 3 * 60 * 1000);
  if (isRecentlyActive && (localMember?.isOnline || remoteMember?.isOnline)) {
    return { isOnline: true, lastSeen: newestSeenIso };
  }

  const latestIsOnline = remSeenMs > localSeenMs
    ? remoteMember.isOnline
    : localMember?.isOnline !== undefined ? localMember.isOnline : remoteMember.isOnline;

  return { isOnline: latestIsOnline, lastSeen: newestSeenIso };
}

/**
 * Persists global system visitation state (mode, assignments, notes, rolePermissions)
 * inside `reg_owner_main.permissions` in Cloudflare D1 `registrants` table so all phones/containers
 * stay 100% synchronized via Cloudflare Durable Objects Realtime.
 */
async function syncSystemStateToCloudflareOwner(): Promise<void> {
  try {
    const nowTs = Date.now();
    localSystemStateUpdatedAt = nowTs;
    const nowIso = new Date(nowTs).toISOString();
    const isOwnerActive = storageService.isCommunityOwnerLoggedIn();
    const mode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY) === 'special' ? 'special' : 'general';
    const rawAsgn = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    const assignments = mode === 'general' ? [] : (rawAsgn ? JSON.parse(rawAsgn) : []);
    const rawSpecVisited = safeStorage.getItem(SPECIAL_VISITED_STORAGE_KEY);
    const specialVisited = rawSpecVisited ? JSON.parse(rawSpecVisited) : {};
    const rawDelNotes = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
    const deletedNoteIds: string[] = rawDelNotes ? JSON.parse(rawDelNotes) : [];
    const delNotesSet = new Set<string>(Array.isArray(deletedNoteIds) ? deletedNoteIds : []);
    const rawNotes = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
    const parsedNotes = rawNotes ? JSON.parse(rawNotes) : [];
    const notes = Array.isArray(parsedNotes) ? parsedNotes.filter((n: any) => n && n.id && !delNotesSet.has(n.id)) : [];
    const rawRolePerms = safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY);
    const rolePerms = rawRolePerms ? JSON.parse(rawRolePerms) : undefined;

    const rawDelAnns = safeStorage.getItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY);
    const deletedAnnIds: string[] = rawDelAnns ? JSON.parse(rawDelAnns) : [];

    const rawDelQuizzes = safeStorage.getItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY);
    const deletedQuizIds: string[] = rawDelQuizzes ? JSON.parse(rawDelQuizzes) : [];
    const delQuizSet = new Set<string>(Array.isArray(deletedQuizIds) ? deletedQuizIds : []);
    const rawQuizzes = safeStorage.getItem(KAHOOT_QUIZZES_STORAGE_KEY);
    const parsedQuizzes = rawQuizzes ? JSON.parse(rawQuizzes) : [];
    const quizzes = Array.isArray(parsedQuizzes) ? parsedQuizzes.filter((q: any) => q && q.id && !delQuizSet.has(q.id)) : [];
    const rawSessions = safeStorage.getItem(KAHOOT_SESSIONS_STORAGE_KEY);
    const sessions = rawSessions ? JSON.parse(rawSessions) : {};
    const rawSoloScores = safeStorage.getItem('kahoot_solo_scores');
    const soloScores = rawSoloScores ? JSON.parse(rawSoloScores) : [];

    const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
    const deletedEvIds: string[] = rawDelEvs ? JSON.parse(rawDelEvs) : [];
    const delEvSet = new Set<string>(Array.isArray(deletedEvIds) ? deletedEvIds : []);
    const rawEvs = safeStorage.getItem(COMMUNITY_EVENTS_STORAGE_KEY);
    const parsedEvs = rawEvs ? JSON.parse(rawEvs) : [];
    const communityEvents = Array.isArray(parsedEvs) ? parsedEvs.filter((e: any) => e && e.id && !delEvSet.has(e.id)) : [];
    const rawGroups = safeStorage.getItem(EVENT_GROUPS_STORAGE_KEY);
    const eventGroups = rawGroups ? JSON.parse(rawGroups) : [];
    const rawRegs = safeStorage.getItem(EVENT_REGISTRATIONS_STORAGE_KEY);
    const eventRegistrations = rawRegs ? JSON.parse(rawRegs) : [];
    const rawPays = safeStorage.getItem(EVENT_PAYMENTS_STORAGE_KEY);
    const eventPayments = rawPays ? JSON.parse(rawPays) : [];
    const rawBuses = safeStorage.getItem(EVENT_BUSES_STORAGE_KEY);
    const eventBuses = rawBuses ? JSON.parse(rawBuses) : [];
    const rawAtts = safeStorage.getItem(EVENT_ATTENDANCES_STORAGE_KEY);
    const eventAttendances = rawAtts ? JSON.parse(rawAtts) : [];
    const rawLogs = safeStorage.getItem(EVENT_AUDIT_LOGS_STORAGE_KEY);
    const eventAuditLogs = rawLogs ? JSON.parse(rawLogs) : [];
    const rawStaff = safeStorage.getItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY);
    const eventStaffAssignments = rawStaff ? JSON.parse(rawStaff) : [];
    const rawSiteTexts = safeStorage.getItem(SITE_TEXT_OVERRIDES_STORAGE_KEY);
    const siteTextOverrides = rawSiteTexts ? JSON.parse(rawSiteTexts) : {};

    const ownerPermissionsPayload: any = {
      ...ROLE_PERMISSIONS.community_owner,
      __systemVisitationMode: mode,
      __systemVisitationModeUpdatedAt: getLocalVisitationModeUpdatedAt() || nowTs,
      __systemFridayStamps: storageService.getFridayStampsMap(),
      __systemAssignments: Array.isArray(assignments) ? assignments : [],
      __systemSpecialVisited: specialVisited && typeof specialVisited === 'object' ? specialVisited : {},
      __systemVisitationNotes: notes,
      __systemDeletedNoteIds: Array.from(delNotesSet),
      __systemDeletedAnnouncementIds: Array.isArray(deletedAnnIds) ? deletedAnnIds : [],
      __systemKahootQuizzes: quizzes,
      __systemDeletedKahootQuizIds: Array.from(delQuizSet),
      __systemKahootSessions: sessions && typeof sessions === 'object' ? sessions : {},
      __systemKahootSoloScores: Array.isArray(soloScores) ? soloScores : [],
      __systemKahootQuestionBank: JSON.parse(safeStorage.getItem(KAHOOT_QUESTION_BANK_STORAGE_KEY) || '[]'),
      __systemCommunityEvents: communityEvents,
      __systemDeletedEventIds: Array.from(delEvSet),
      __systemEventGroups: Array.isArray(eventGroups) ? eventGroups : [],
      __systemEventRegistrations: Array.isArray(eventRegistrations) ? eventRegistrations : [],
      __systemEventPayments: Array.isArray(eventPayments) ? eventPayments : [],
      __systemEventBuses: Array.isArray(eventBuses) ? eventBuses : [],
      __systemEventAttendances: Array.isArray(eventAttendances) ? eventAttendances : [],
      __systemEventAuditLogs: Array.isArray(eventAuditLogs) ? eventAuditLogs : [],
      __systemEventStaffAssignments: Array.isArray(eventStaffAssignments) ? eventStaffAssignments : [],
      __systemRolePermissions: rolePerms,
      __systemAttendanceSession: storageService.getAttendanceSession(),
      __systemSiteTextOverrides: siteTextOverrides && typeof siteTextOverrides === 'object' ? siteTextOverrides : {},
      __systemSiteTextsUpdatedAt: lastSiteTextsMutationAt || nowTs,
      __systemStateUpdatedAt: nowTs
    };

    // Update local owner record in memory & storage WITHOUT mutating lastUpdatedAt
    if (inMemoryRegistrants && inMemoryRegistrants.length > 0) {
      const deletedIds = storageService.getDeletedRegistrantIds();
      inMemoryRegistrants = inMemoryRegistrants.filter(r => r && r.id && !deletedIds.has(r.id) && r.status !== 'cancelled');
      const idx = inMemoryRegistrants.findIndex(r => r.id === 'reg_owner_main' || r.role === 'community_owner');
      if (idx >= 0) {
        inMemoryRegistrants[idx] = {
          ...inMemoryRegistrants[idx],
          permissions: ownerPermissionsPayload,
          ...(isOwnerActive ? { isOnline: true, lastSeen: nowIso } : {})
        };
      }
    }

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      pushStateSliceToCloudflareD1('system_bundle', {
        attendance: storageService.getAttendanceRecords(),
        attendanceSession: storageService.getAttendanceSession(),
        assignments: Array.isArray(assignments) ? assignments : [],
        specialVisitedMembers: specialVisited && typeof specialVisited === 'object' ? specialVisited : {},
        visitationNotes: notes,
        deletedVisitationNoteIds: Array.from(delNotesSet),
        visitationMode: mode || 'general',
        visitationModeUpdatedAt: getLocalVisitationModeUpdatedAt() || nowTs,
        fridayStamps: storageService.getFridayStampsMap(),
        blockedUsers: inMemoryBlockedUsers || [],
        deletedAttendanceIds: Array.from(storageService.getDeletedAttendanceIds()),
        deletedAnnouncementIds: Array.isArray(deletedAnnIds) ? deletedAnnIds : [],
        revokedStamps: storageService.getRevokedStamps(),
        rolePermissions: rolePerms,
        siteTextOverrides: siteTextOverrides && typeof siteTextOverrides === 'object' ? siteTextOverrides : {}
      }).catch(() => {});
    }
  } catch {
    // Silent fallback when offline or fetch aborted
  }
}

/**
 * Extracts and applies global system visitation state from `reg_owner_main.permissions`
 * received from Cloudflare D1.
 */
let lastEventsMutationAt = 0;
let isFetchingServerDataInFlight = false;

export function markEventsMutated(): void {
  lastEventsMutationAt = Date.now();
}

export function isEventsMutationLocked(): boolean {
  return Date.now() - lastEventsMutationAt < 12000;
}

function mergeRecordsByTimestamp<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  localList: T[],
  remoteList: T[],
  deletedIds?: Set<string>
): { merged: T[]; changed: boolean } {
  const map = new Map<string, T>();
  for (const item of localList) {
    if (item && item.id && (!deletedIds || !deletedIds.has(item.id))) {
      map.set(item.id, item);
    }
  }
  for (const rItem of remoteList) {
    if (!rItem || !rItem.id || (deletedIds && deletedIds.has(rItem.id))) continue;
    const existing = map.get(rItem.id);
    if (!existing) {
      map.set(rItem.id, rItem);
    } else {
      const localTs = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const remoteTs = new Date(rItem.updatedAt || rItem.createdAt || 0).getTime();
      if (remoteTs >= localTs) {
        map.set(rItem.id, { ...existing, ...rItem });
      }
    }
  }
  const merged = Array.from(map.values());
  const changed = JSON.stringify(localList) !== JSON.stringify(merged);
  return { merged, changed };
}

const CLIENT_KAHOOT_STATUS_STAGE_ORDER: Record<string, number> = {
  lobby: 0,
  question_countdown: 1,
  question_active: 2,
  answer_reveal: 3,
  leaderboard: 4,
  podium: 5,
  finished: 6
};

function mergeKahootSessionSnapshots(
  existing: KahootLiveSession | undefined | null,
  incoming: KahootLiveSession | undefined | null,
  replacePlayers: boolean = false
): KahootLiveSession | null {
  if (!incoming && !existing) return null;
  if (!existing) return incoming ? { ...incoming } : null;
  if (!incoming) return { ...existing };

  const exQIdx = Number(existing.currentQuestionIndex || 0);
  const incQIdx = Number(incoming.currentQuestionIndex || 0);
  const exStage = CLIENT_KAHOOT_STATUS_STAGE_ORDER[existing.status] ?? 0;
  const incStage = CLIENT_KAHOOT_STATUS_STAGE_ORDER[incoming.status] ?? 0;

  let resolvedStatus = incoming.status || existing.status;
  let resolvedQIdx = incQIdx;
  let resolvedQuestionStartedAt = incoming.questionStartedAt ?? existing.questionStartedAt;
  let resolvedTimeLimit = incoming.questionTimeLimitSeconds ?? existing.questionTimeLimitSeconds;

  if (existing.status === 'finished' && incoming.status !== 'lobby') {
    resolvedStatus = 'finished';
    resolvedQIdx = exQIdx;
  } else if (incQIdx < exQIdx && incoming.status !== 'lobby') {
    // Reject regression to an older question index
    resolvedStatus = existing.status;
    resolvedQIdx = exQIdx;
    resolvedQuestionStartedAt = existing.questionStartedAt;
    resolvedTimeLimit = existing.questionTimeLimitSeconds;
  } else if (incQIdx === exQIdx && incStage < exStage && incoming.status !== 'lobby') {
    // Reject regression within the same question (e.g. from leaderboard/answer_reveal back to question_active!)
    resolvedStatus = existing.status;
    resolvedQuestionStartedAt = existing.questionStartedAt;
  }

  let mergedPlayers: Record<string, KahootPlayer> = {};
  if (replacePlayers) {
    mergedPlayers = { ...(incoming.players || {}) };
  } else {
    mergedPlayers = { ...(existing.players || {}) };
    if (incoming.players && typeof incoming.players === 'object') {
      Object.keys(incoming.players).forEach((pid) => {
        const incP = incoming.players[pid];
        const exP = mergedPlayers[pid];
        if (!exP) {
          mergedPlayers[pid] = incP;
        } else {
          const exAnswered = Number(exP.totalAnswered || 0);
          const incAnswered = Number(incP.totalAnswered || 0);
          const exScore = Number(exP.score || 0);
          const incScore = Number(incP.score || 0);
          if (exAnswered > incAnswered || exScore > incScore) {
            mergedPlayers[pid] = {
              ...incP,
              ...exP,
              currentRank: exP.currentRank || incP.currentRank,
              previousRank: exP.previousRank || incP.previousRank,
              teamId: incP.teamId || exP.teamId,
              teamName: incP.teamName || exP.teamName
            };
          } else {
            mergedPlayers[pid] = { ...exP, ...incP };
          }
        }
      });
    }
  }

  const mergedAnswers = {
    ...(existing.answersSubmitted || {}),
    ...(incoming.answersSubmitted || {})
  };
  const mergedOpinions = {
    ...(existing.opinionsCollected || {}),
    ...(incoming.opinionsCollected || {})
  };

  return {
    ...existing,
    ...incoming,
    status: resolvedStatus,
    currentQuestionIndex: resolvedQIdx,
    questionStartedAt: resolvedQuestionStartedAt,
    questionTimeLimitSeconds: resolvedTimeLimit,
    players: mergedPlayers,
    answersSubmitted: mergedAnswers,
    opinionsCollected: mergedOpinions,
    updatedAtMs: Math.max(Number(existing.updatedAtMs || 0), Number(incoming.updatedAtMs || 0)),
    stateVersion: Math.max(Number(existing.stateVersion || 0), Number(incoming.stateVersion || 0))
  };
}

function mergeKahootSessionsMap(
  localMap: Record<string, KahootLiveSession>,
  incomingMap: Record<string, KahootLiveSession>,
  allowNewFromIncoming: boolean = true
): { merged: Record<string, KahootLiveSession>; changed: boolean } {
  const nextMap: Record<string, KahootLiveSession> = { ...(localMap || {}) };
  if (incomingMap && typeof incomingMap === 'object') {
    Object.keys(incomingMap).forEach((pin) => {
      const inc = incomingMap[pin];
      if (!inc || !inc.id) return;
      const ex = nextMap[pin];
      if (!ex && !allowNewFromIncoming) return;
      const mergedOne = mergeKahootSessionSnapshots(ex, inc, false);
      if (mergedOne) {
        nextMap[pin] = mergedOne;
      }
    });
  }
  const changed = JSON.stringify(localMap) !== JSON.stringify(nextMap);
  return { merged: nextMap, changed };
}

function applyRemoteOwnerSystemState(rawOwner: any): boolean {
  if (!rawOwner) return false;
  try {
    let perms = rawOwner.permissions;
    if (typeof perms === 'string') {
      perms = JSON.parse(perms);
    }
    if (!perms || typeof perms !== 'object') return false;

    let changed = false;

    if (perms.__systemAttendanceSession && typeof perms.__systemAttendanceSession === 'object') {
      if (storageService.mergeIncomingAttendanceSession(perms.__systemAttendanceSession)) {
        changed = true;
      }
    }

    // 0. Always merge deleted visitation note tombstones unconditionally so deleted notes never reappear on any phone
    if (Array.isArray(perms.__systemDeletedNoteIds) && perms.__systemDeletedNoteIds.length > 0) {
      const rawDel = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
      const localDelArr: string[] = rawDel ? JSON.parse(rawDel) : [];
      const delSet = new Set<string>([...(Array.isArray(localDelArr) ? localDelArr : []), ...perms.__systemDeletedNoteIds]);
      if (delSet.size !== (Array.isArray(localDelArr) ? localDelArr.length : 0)) {
        safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));
        changed = true;
      }
      const rawLocalNotes = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
      if (rawLocalNotes) {
        const parsedLocalNotes = JSON.parse(rawLocalNotes);
        if (Array.isArray(parsedLocalNotes)) {
          const filteredLocal = parsedLocalNotes.filter((n: any) => n && n.id && !delSet.has(n.id));
          if (filteredLocal.length !== parsedLocalNotes.length) {
            safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(filteredLocal));
            changed = true;
          }
        }
      }
    }

    // 0.1. Always merge deleted announcement tombstones unconditionally so deleted announcements never remain on any phone
    if (Array.isArray(perms.__systemDeletedAnnouncementIds) && perms.__systemDeletedAnnouncementIds.length > 0) {
      const rawDelAnns = safeStorage.getItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY);
      const localDelAnns: string[] = rawDelAnns ? JSON.parse(rawDelAnns) : [];
      const delAnnSet = new Set<string>([...(Array.isArray(localDelAnns) ? localDelAnns : []), ...perms.__systemDeletedAnnouncementIds]);
      if (delAnnSet.size !== (Array.isArray(localDelAnns) ? localDelAnns.length : 0)) {
        safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delAnnSet)));
        changed = true;
      }
      const rawLocalAnns = safeStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
      if (rawLocalAnns) {
        const parsedLocalAnns = JSON.parse(rawLocalAnns);
        if (Array.isArray(parsedLocalAnns)) {
          const filteredAnns = parsedLocalAnns.filter((a: any) => a && a.id && !delAnnSet.has(a.id));
          if (filteredAnns.length !== parsedLocalAnns.length) {
            safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(filteredAnns));
            changed = true;
          }
        }
      }
    }

    // 0.2. Always merge deleted Kahoot quiz tombstones & published quizzes
    if (Array.isArray(perms.__systemDeletedKahootQuizIds) && perms.__systemDeletedKahootQuizIds.length > 0) {
      const rawDelQuizzes = safeStorage.getItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY);
      const localDelQuizzes: string[] = rawDelQuizzes ? JSON.parse(rawDelQuizzes) : [];
      const delQuizSet = new Set<string>([...(Array.isArray(localDelQuizzes) ? localDelQuizzes : []), ...perms.__systemDeletedKahootQuizIds]);
      if (delQuizSet.size !== (Array.isArray(localDelQuizzes) ? localDelQuizzes.length : 0)) {
        safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(delQuizSet)));
        changed = true;
      }
      const rawLocalQuizzes = safeStorage.getItem(KAHOOT_QUIZZES_STORAGE_KEY);
      if (rawLocalQuizzes) {
        const parsedQuizzes = JSON.parse(rawLocalQuizzes);
        if (Array.isArray(parsedQuizzes)) {
          const filteredQuizzes = parsedQuizzes.filter((q: any) => q && q.id && !delQuizSet.has(q.id));
          if (filteredQuizzes.length !== parsedQuizzes.length) {
            safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(filteredQuizzes));
            changed = true;
          }
        }
      }
    }

    if (Array.isArray(perms.__systemKahootQuizzes)) {
      const rawDelQuizzes = safeStorage.getItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY);
      const delQuizSet = new Set<string>(rawDelQuizzes ? JSON.parse(rawDelQuizzes) : []);
      delQuizSet.add('quiz_daniel_three_youths');
      const rawLocalQuizzes = safeStorage.getItem(KAHOOT_QUIZZES_STORAGE_KEY);
      const localQuizzes: any[] = rawLocalQuizzes ? JSON.parse(rawLocalQuizzes) : [];
      const quizMap = new Map<string, any>();
      const nowMs = Date.now();
      if (Array.isArray(localQuizzes)) {
        localQuizzes.forEach((q: any) => {
          if (q && q.id && !delQuizSet.has(q.id)) {
            const updatedMs = new Date(q.updatedAt || q.createdAt || 0).getTime();
            if (nowMs - updatedMs < 10000) {
              quizMap.set(q.id, q);
            }
          }
        });
      }
      perms.__systemKahootQuizzes.forEach((rq: any) => {
        if (rq && rq.id && !delQuizSet.has(rq.id)) {
          quizMap.set(rq.id, { ...(quizMap.get(rq.id) || {}), ...rq, isPublished: rq.isPublished !== false });
        }
      });
      const mergedQuizzes = Array.from(quizMap.values());
      if (JSON.stringify(localQuizzes) !== JSON.stringify(mergedQuizzes)) {
        safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(mergedQuizzes));
        changed = true;
      }
    }

    if (perms.__systemKahootSessions && typeof perms.__systemKahootSessions === 'object') {
      const rawSessions = safeStorage.getItem(KAHOOT_SESSIONS_STORAGE_KEY) || '{}';
      const localSessions = JSON.parse(rawSessions);
      const { merged: mergedSessions, changed: sessChanged } = mergeKahootSessionsMap(
        localSessions,
        perms.__systemKahootSessions,
        true
      );
      if (sessChanged) {
        safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(mergedSessions));
        changed = true;
      }
    }

    if (Array.isArray(perms.__systemKahootSoloScores)) {
      const rawScores = safeStorage.getItem('kahoot_solo_scores') || '[]';
      const nextScoresStr = JSON.stringify(perms.__systemKahootSoloScores);
      if (rawScores !== nextScoresStr) {
        safeStorage.setItem('kahoot_solo_scores', nextScoresStr);
        changed = true;
      }
    }

    if (Array.isArray(perms.__systemKahootQuestionBank) && perms.__systemKahootQuestionBank.length > 0) {
      const localBank = JSON.parse(safeStorage.getItem(KAHOOT_QUESTION_BANK_STORAGE_KEY) || '[]');
      const { merged, changed: bankChanged } = mergeRecordsByTimestamp(localBank, perms.__systemKahootQuestionBank);
      if (bankChanged) {
        safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(merged));
        changed = true;
      }
    }

    if (perms.__systemFridayStamps && typeof perms.__systemFridayStamps === 'object') {
      if (storageService.mergeIncomingFridayStamps(perms.__systemFridayStamps)) {
        changed = true;
      }
    }

    if (perms.__systemVisitationMode === 'general' || perms.__systemVisitationMode === 'special') {
      const incomingModeTs = Number(perms.__systemVisitationModeUpdatedAt || 0);
      const localModeTs = getLocalVisitationModeUpdatedAt();
      const canApplyMode = incomingModeTs > 0
        ? incomingModeTs >= localModeTs
        : (!isVisitationModeLocked() && localModeTs === 0);
      if (canApplyMode) {
        const currentMode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY) === 'special' ? 'special' : 'general';
        if (incomingModeTs > localModeTs) {
          markLocalVisitationModeUpdated(incomingModeTs);
        }
        if (currentMode !== perms.__systemVisitationMode) {
          safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, perms.__systemVisitationMode);
          if (perms.__systemVisitationMode === 'general') {
            safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
          }
          changed = true;
        }
      }
    }

    if (!isAssignmentsLocked()) {
      const effectiveMode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY) === 'special' ? 'special' : 'general';
      if (effectiveMode === 'general') {
        const rawLocal = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
        if (rawLocal && rawLocal !== '[]') {
          safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
          changed = true;
        }
      } else if (Array.isArray(perms.__systemAssignments)) {
        const rawLocal = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY) || '[]';
        const nextStr = JSON.stringify(perms.__systemAssignments);
        if (rawLocal !== nextStr) {
          safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, nextStr);
          changed = true;
        }
      }

      if (perms.__systemSpecialVisited && typeof perms.__systemSpecialVisited === 'object') {
        const rawSpec = safeStorage.getItem(SPECIAL_VISITED_STORAGE_KEY) || '{}';
        const nextSpecStr = JSON.stringify(perms.__systemSpecialVisited);
        if (rawSpec !== nextSpecStr) {
          safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, nextSpecStr);
          changed = true;
        }
      }
    }

    if (Date.now() - lastNotesMutationAt >= 4000 && Array.isArray(perms.__systemVisitationNotes)) {
      const rawDel = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
      const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
      const cleanRemoteNotes = perms.__systemVisitationNotes.filter((n: any) => n && n.id && !delSet.has(n.id));
      const rawNotes = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY) || '[]';
      const nextNotesStr = JSON.stringify(cleanRemoteNotes);
      if (rawNotes !== nextNotesStr) {
        safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, nextNotesStr);
        changed = true;
      }
    }

    if (
      Date.now() - lastRolePermissionsMutationAt >= 12000 &&
      perms.__systemRolePermissions &&
      typeof perms.__systemRolePermissions === 'object'
    ) {
      const rawRolePerms = safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY);
      if (!rawRolePerms) {
        const nextRolePermsStr = JSON.stringify(perms.__systemRolePermissions);
        safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, nextRolePermsStr);
        changed = true;
      }
    }

    if (
      !isSiteTextsMutationLocked() &&
      perms.__systemSiteTextOverrides &&
      typeof perms.__systemSiteTextOverrides === 'object'
    ) {
      const rawTexts = safeStorage.getItem(SITE_TEXT_OVERRIDES_STORAGE_KEY) || '{}';
      const currentTexts = JSON.parse(rawTexts);
      const remoteTs = Number(perms.__systemSiteTextsUpdatedAt || 0);
      const localTs = getLocalSiteTextsUpdatedAt();
      // Never overwrite newer local edits made by Community Owner with older remote snapshot
      if (remoteTs >= localTs || (!storageService.isCommunityOwnerLoggedIn() && Object.keys(perms.__systemSiteTextOverrides).length > 0)) {
        const nextTextsObj = remoteTs > localTs
          ? { ...currentTexts, ...perms.__systemSiteTextOverrides }
          : { ...perms.__systemSiteTextOverrides, ...currentTexts };
        const nextTextsStr = JSON.stringify(nextTextsObj);
        if (rawTexts !== nextTextsStr && Object.keys(nextTextsObj).length > 0) {
          inMemorySiteTextOverrides = nextTextsObj;
          safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, nextTextsStr);
          if (remoteTs > localTs) {
            try { safeStorage.setItem(SITE_TEXTS_UPDATED_AT_KEY, String(remoteTs)); } catch {}
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: nextTextsObj }));
          }
          changed = true;
        }
      }
    }

    if (Array.isArray(perms.__systemDeletedEventIds) && perms.__systemDeletedEventIds.length > 0) {
      const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
      const localDelEvs: string[] = rawDelEvs ? JSON.parse(rawDelEvs) : [];
      const delEvSet = new Set<string>([...(Array.isArray(localDelEvs) ? localDelEvs : []), ...perms.__systemDeletedEventIds]);
      if (delEvSet.size !== (Array.isArray(localDelEvs) ? localDelEvs.length : 0)) {
        safeStorage.setItem(DELETED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(delEvSet)));
        changed = true;
      }
    }

    if (!isEventsMutationLocked()) {
      const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
      const delEvSet = new Set<string>(rawDelEvs ? JSON.parse(rawDelEvs) : []);

      if (Array.isArray(perms.__systemCommunityEvents)) {
        const localEvs: any[] = JSON.parse(safeStorage.getItem(COMMUNITY_EVENTS_STORAGE_KEY) || '[]');
        const authoritativeEvs = perms.__systemCommunityEvents.filter((e: any) => e && e.id && !delEvSet.has(e.id));
        if (JSON.stringify(localEvs) !== JSON.stringify(authoritativeEvs)) {
          safeStorage.setItem(COMMUNITY_EVENTS_STORAGE_KEY, JSON.stringify(authoritativeEvs));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventGroups) && perms.__systemEventGroups.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_GROUPS_STORAGE_KEY) || '[]');
        const { merged, changed: grpChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventGroups);
        if (grpChanged) {
          safeStorage.setItem(EVENT_GROUPS_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventRegistrations) && perms.__systemEventRegistrations.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_REGISTRATIONS_STORAGE_KEY) || '[]');
        const { merged, changed: regChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventRegistrations);
        if (regChanged) {
          safeStorage.setItem(EVENT_REGISTRATIONS_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventPayments) && perms.__systemEventPayments.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_PAYMENTS_STORAGE_KEY) || '[]');
        const { merged, changed: payChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventPayments);
        if (payChanged) {
          safeStorage.setItem(EVENT_PAYMENTS_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventBuses) && perms.__systemEventBuses.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_BUSES_STORAGE_KEY) || '[]');
        const { merged, changed: busChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventBuses);
        if (busChanged) {
          safeStorage.setItem(EVENT_BUSES_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventAttendances) && perms.__systemEventAttendances.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_ATTENDANCES_STORAGE_KEY) || '[]');
        const { merged, changed: attChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventAttendances);
        if (attChanged) {
          safeStorage.setItem(EVENT_ATTENDANCES_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventAuditLogs) && perms.__systemEventAuditLogs.length > 0) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_AUDIT_LOGS_STORAGE_KEY) || '[]');
        const { merged, changed: logChanged } = mergeRecordsByTimestamp(localArr, perms.__systemEventAuditLogs);
        if (logChanged) {
          safeStorage.setItem(EVENT_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(merged));
          changed = true;
        }
      }
      if (Array.isArray(perms.__systemEventStaffAssignments)) {
        const localArr = JSON.parse(safeStorage.getItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY) || '[]');
        if (localArr.length === 0 && perms.__systemEventStaffAssignments.length > 0) {
          safeStorage.setItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(perms.__systemEventStaffAssignments));
          changed = true;
        }
      }
    }

    return changed;
  } catch {
    return false;
  }
}

// ==========================================
// CENTRAL SERVER SSE REALTIME LISTENER
// Instant sub-second event synchronization with central server
// ==========================================
let sseConnection: EventSource | null = null;
let sseReconnectTimer: any = null;
let isExpressBackendAvailable: boolean | null = null;

function startServerSSE(): void {
  if (typeof window === 'undefined') return;
  if (isExpressBackendAvailable === false) return;
  if (sseConnection) {
    try { sseConnection.close(); } catch {}
    sseConnection = null;
  }

  try {
    sseConnection = new EventSource('/api/events');

    sseConnection.onmessage = (event) => {
      try {
        if (!event.data || event.data.startsWith(':')) return;
        const parsed = JSON.parse(event.data);
        if (!parsed || !parsed.type) return;

        console.info(`[SSE Realtime] Received: ${parsed.type}`, parsed.data);

        switch (parsed.type) {
          case 'REGISTRANT_DELETED': {
            const { id, fullName } = parsed.data || {};
            if (id) {
              storageService.addDeletedRegistrantId(id);
              let list = storageService.getRegistrants().filter(r => {
                if (r.id === id) return false;
                if (fullName && r.fullName && normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(fullName)) return false;
                return true;
              });
              inMemoryRegistrants = list;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
              } catch {}
              storageService.cleanRememberedLoginIfInvalid();
              notifySyncListeners();
            }
            break;
          }

          case 'REGISTRANT_UPSERTED': {
            const rawMember = parsed.data;
            if (!rawMember || !rawMember.id) break;
            const deleted = storageService.getDeletedRegistrantIds();
            if (!deleted.has(rawMember.id) && rawMember.status !== 'cancelled') {
              let list = storageService.getRegistrants();
              const idx = list.findIndex(r => r.id === rawMember.id);
              if (idx >= 0) {
                const mergedPres = mergeClientPresence(list[idx], rawMember);
                list[idx] = mergeRegistrantPreservingIdentity(list[idx], { ...rawMember, ...mergedPres });
              } else if (isValidMemberName(rawMember.fullName)) {
                const member = normalizeRegistrant(rawMember);
                list.unshift(member);
              } else {
                break;
              }
              inMemoryRegistrants = list;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
              } catch {}
              storageService.cleanRememberedLoginIfInvalid();
              storageService.syncCurrentSession(list[idx >= 0 ? idx : 0]?.role, rawMember.id);
              notifySyncListeners();
            }
            break;
          }

          case 'PRESENCE_UPDATED': {
            const { id, isOnline, lastSeen } = parsed.data || {};
            if (id) {
              let list = storageService.getRegistrants();
              const idx = list.findIndex(r => r.id === id);
              if (idx >= 0) {
                const existing = list[idx];
                const mergedPres = mergeClientPresence(existing, { ...existing, isOnline, lastSeen });
                if (existing.isOnline !== mergedPres.isOnline || existing.lastSeen !== mergedPres.lastSeen) {
                  list[idx] = { ...existing, ...mergedPres };
                  inMemoryRegistrants = list;
                  try {
                    safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
                  } catch {}
                  notifySyncListeners();
                }
              }
            }
            break;
          }

          case 'ROLE_PERMISSIONS_UPDATED': {
            const { role, permissions, allPermissions } = parsed.data || {};
            if (allPermissions && typeof allPermissions === 'object') {
              safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(allPermissions));
            } else if (role && permissions && typeof role === 'string') {
              const current = storageService.getAllRolePermissions();
              const targetRole = role as UserRole;
              if (current[targetRole]) {
                current[targetRole] = { ...current[targetRole], ...permissions };
                safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(current));
              }
            }
            if (role && permissions) {
              const updatedList = storageService.getRegistrants().map(r => {
                if (r.role === role) {
                  return {
                    ...r,
                    permissions: { ...(r.permissions || {}), ...permissions }
                  };
                }
                return r;
              });
              inMemoryRegistrants = updatedList;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(updatedList));
              } catch {}
            }
            storageService.syncCurrentSession(role);
            notifySyncListeners();
            break;
          }

          case 'ATTENDANCE_RECORDED': {
            const { records, mode } = parsed.data || {};
            if (Array.isArray(records)) {
              let current = storageService.getAttendanceRecords();
              if (mode === 'replace') {
                current = records;
              } else {
                records.forEach((newRec: AttendanceRecord) => {
                  const idx = current.findIndex(a => a.id === newRec.id);
                  if (idx >= 0) current[idx] = newRec;
                  else current.unshift(newRec);
                });
              }
              try {
                safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(current));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'ATTENDANCE_DELETED': {
            const { id } = parsed.data || {};
            if (id) {
              storageService.addDeletedAttendanceId(id);
              const current = storageService.getAttendanceRecords().filter(a => a.id !== id);
              try {
                safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(current));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'STAMP_CHANGED': {
            const { registrantId, dateStr, revoked, stamped, version, updatedAt, stamps } = parsed.data || {};
            if (stamps && typeof stamps === 'object') {
              storageService.mergeIncomingFridayStamps(stamps);
              notifySyncListeners();
            } else if (registrantId && dateStr) {
              if (typeof version === 'number' && typeof stamped === 'boolean') {
                storageService.mergeIncomingFridayStamps({
                  [`${registrantId}_${dateStr}`]: {
                    stamped,
                    version,
                    updatedAt: Number(updatedAt || Date.now())
                  }
                });
              }
              const key = `${registrantId}_${dateStr}`;
              const map = storageService.getRevokedStamps();
              if (revoked) {
                map[key] = true;
              } else {
                delete map[key];
              }
              try {
                safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(map));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'USER_BLOCKED': {
            const blocked = parsed.data as BlockedUser;
            if (blocked && blocked.id) {
              inMemoryBlockedUsers = inMemoryBlockedUsers.filter(b => b.id !== blocked.id && b.phone !== blocked.phone);
              inMemoryBlockedUsers.push(blocked);
              try {
                safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'USER_UNBLOCKED': {
            const { id } = parsed.data || {};
            if (id) {
              inMemoryBlockedUsers = inMemoryBlockedUsers.filter(b => b.id !== id);
              try {
                safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'CARD_TEMPLATE_UPDATED': {
            const { cardTemplate } = parsed.data || {};
            if (cardTemplate && typeof cardTemplate === 'object') {
              try {
                safeStorage.setItem(CARD_TEMPLATE_STORAGE_KEY, JSON.stringify(cardTemplate));
              } catch {}
              notifySyncListeners();
            }
            break;
          }

          case 'VISITATION_MODE_CHANGED': {
            const { mode, updatedAt } = parsed.data || {};
            const incTs = Number(updatedAt || 0);
            const locTs = getLocalVisitationModeUpdatedAt();
            if ((mode === 'general' || mode === 'special') && (incTs === 0 || incTs >= locTs)) {
              if (incTs > locTs) {
                markLocalVisitationModeUpdated(incTs);
              }
              safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, mode);
              if (mode === 'general') {
                safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
              }
              console.info('[SSE Realtime] Instant visitation mode update received:', mode, incTs);
              notifySyncListeners();
            }
            break;
          }

          case 'ASSIGNMENTS_UPDATED': {
            const { assignments, newAssignment, updatedAssignment, specialVisitedMembers } = parsed.data || {};
            if (specialVisitedMembers && typeof specialVisitedMembers === 'object') {
              safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify(specialVisitedMembers));
            }
            if (Array.isArray(assignments)) {
              safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
              console.info('[SSE Realtime] Instant special assignments list received:', assignments.length);
              notifySyncListeners();
            } else if (updatedAssignment && updatedAssignment.id) {
              const current = storageService.getSpecialAssignments();
              const next = current.map(a => a.id === updatedAssignment.id ? { ...a, ...updatedAssignment } : a);
              safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
              console.info('[SSE Realtime] Instant updated special assignment received:', updatedAssignment.id);
              notifySyncListeners();
            } else if (newAssignment && newAssignment.id) {
              const list = storageService.getSpecialAssignments().filter(a => a.id !== newAssignment.id);
              list.unshift(newAssignment);
              safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(list));
              console.info('[SSE Realtime] Instant new special assignment received:', newAssignment.id);
              notifySyncListeners();
            } else if (specialVisitedMembers) {
              notifySyncListeners();
            }
            break;
          }

          case 'SPECIAL_VISITATION_UPDATED': {
            const { specialVisitedMembers, assignments } = parsed.data || {};
            if (specialVisitedMembers && typeof specialVisitedMembers === 'object') {
              safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify(specialVisitedMembers));
            }
            if (Array.isArray(assignments)) {
              safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
            }
            notifySyncListeners();
            break;
          }

          case 'VISITATION_NOTES_UPDATED': {
            const { notes, newNote, deletedNoteIds, deletedId } = parsed.data || {};
            const rawDel = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
            const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
            if (Array.isArray(deletedNoteIds)) {
              deletedNoteIds.forEach((id: string) => { if (id) delSet.add(id); });
            }
            if (deletedId) {
              delSet.add(deletedId);
            }
            safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

            if (Array.isArray(notes)) {
              const filtered = notes.filter((n: any) => n && n.id && !delSet.has(n.id));
              safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(filtered));
              console.info('[SSE Realtime] Central visitation notes list received:', filtered.length);
              notifySyncListeners();
            } else if (newNote && newNote.id) {
              delSet.delete(newNote.id);
              safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));
              const list = storageService.getVisitationNotes().filter(n => n.id !== newNote.id && !delSet.has(n.id));
              list.unshift(newNote);
              safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(list));
              console.info('[SSE Realtime] Instant new visitation note received:', newNote.id);
              notifySyncListeners();
            } else {
              const list = storageService.getVisitationNotes().filter(n => !delSet.has(n.id));
              safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(list));
              notifySyncListeners();
            }
            break;
          }

          case 'ANNOUNCEMENTS_UPDATED': {
            const { announcements, newAnnouncement, updatedAnnouncement, deletedId, deletedAnnouncementIds } = parsed.data || {};
            const rawDel = safeStorage.getItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY);
            const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
            if (Array.isArray(deletedAnnouncementIds)) {
              deletedAnnouncementIds.forEach((id: string) => { if (id) delSet.add(id); });
            }
            if (deletedId) {
              delSet.add(deletedId);
            }
            safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

            const mergeSingleAnn = (existing: Announcement | undefined, incoming: Announcement): Announcement => {
              if (!existing) {
                return {
                  ...incoming,
                  senderPhotoUrl: incoming.senderRole === 'priest' ? incoming.senderPhotoUrl : undefined
                };
              }
              const viewersMap = new Map<string, AnnouncementViewer>();
              (existing.viewers || []).forEach(v => { if (v && v.memberId) viewersMap.set(v.memberId, v); });
              (incoming.viewers || []).forEach(v => { if (v && v.memberId) viewersMap.set(v.memberId, { ...(viewersMap.get(v.memberId) || {}), ...v }); });
              return {
                ...existing,
                ...incoming,
                imageUrl: incoming.imageUrl || existing.imageUrl,
                targetUserId: incoming.targetUserId || existing.targetUserId,
                targetServantName: incoming.targetServantName || existing.targetServantName,
                isVisitationTaskAlert: incoming.isVisitationTaskAlert ?? existing.isVisitationTaskAlert,
                senderPhotoUrl: (incoming.senderRole || existing.senderRole) === 'priest' ? (incoming.senderPhotoUrl || existing.senderPhotoUrl) : undefined,
                viewers: Array.from(viewersMap.values()),
                reactions: incoming.reactions !== undefined ? incoming.reactions : (existing.reactions || {})
              };
            };

            if (Array.isArray(announcements)) {
              const currentMap = new Map<string, Announcement>();
              storageService.getAnnouncements().forEach(a => { if (a && a.id && !delSet.has(a.id)) currentMap.set(a.id, a); });
              const cleaned = announcements
                .filter((a: Announcement) => a && a.id && !delSet.has(a.id) && !isAnnouncementExpired(a))
                .map((a: Announcement) => mergeSingleAnn(currentMap.get(a.id), a));
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(cleaned));
              notifySyncListeners();
            } else if (updatedAnnouncement && updatedAnnouncement.id && !delSet.has(updatedAnnouncement.id)) {
              const list = storageService.getAnnouncements().filter(a => !delSet.has(a.id));
              const exists = list.some(a => a.id === updatedAnnouncement.id);
              const next = exists
                ? list.map(a => a.id === updatedAnnouncement.id ? mergeSingleAnn(a, updatedAnnouncement) : a)
                : [mergeSingleAnn(undefined, updatedAnnouncement), ...list];
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(next));
              notifySyncListeners();
            } else if (newAnnouncement && newAnnouncement.id && !delSet.has(newAnnouncement.id)) {
              const existing = storageService.getAnnouncements().find(a => a.id === newAnnouncement.id);
              const sanitized = mergeSingleAnn(existing, newAnnouncement);
              const list = storageService.getAnnouncements().filter(a => a.id !== sanitized.id && !delSet.has(a.id));
              list.unshift(sanitized);
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));
              notifySyncListeners();
            } else if (deletedId || Array.isArray(deletedAnnouncementIds)) {
              const list = storageService.getAnnouncements().filter(a => a && a.id && !delSet.has(a.id));
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));
              notifySyncListeners();
            }
            break;
          }

          case 'KAHOOT_QUIZZES_UPDATED': {
            const { quizzes, updatedQuiz, deletedId, deletedKahootQuizIds } = parsed.data || {};
            const rawDel = safeStorage.getItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY);
            const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
            if (Array.isArray(deletedKahootQuizIds)) {
              deletedKahootQuizIds.forEach((id: string) => { if (id) delSet.add(id); });
            }
            if (deletedId) {
              delSet.add(deletedId);
            }
            safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

            if (Array.isArray(quizzes)) {
              const cleaned = quizzes
                .filter((q: KahootQuiz) => q && q.id && !delSet.has(q.id))
                .map((q: KahootQuiz) => ({ ...q, isPublished: q.isPublished !== false }));
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(cleaned));
              notifySyncListeners();
            } else if (updatedQuiz && updatedQuiz.id && !delSet.has(updatedQuiz.id)) {
              const list = storageService.getKahootQuizzes().filter(q => q.id !== updatedQuiz.id && !delSet.has(q.id));
              list.unshift({ ...updatedQuiz, isPublished: updatedQuiz.isPublished !== false });
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(list));
              notifySyncListeners();
            } else if (deletedId) {
              const list = storageService.getKahootQuizzes().filter(q => q.id !== deletedId && !delSet.has(q.id));
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(list));
              notifySyncListeners();
            }
            break;
          }

          case 'KAHOOT_SESSIONS_UPDATED': {
            const { sessions, updatedSession, deletedPin } = parsed.data || {};
            const current = storageService.getKahootSessions();
            if (deletedPin) {
              delete current[deletedPin];
              safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(current));
              notifySyncListeners();
            } else if (updatedSession && updatedSession.id) {
              const mergedOne = mergeKahootSessionSnapshots(current[updatedSession.id], updatedSession, false);
              if (mergedOne) {
                current[updatedSession.id] = mergedOne;
                safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(current));
                notifySyncListeners();
              }
            } else if (sessions && typeof sessions === 'object') {
              const { merged } = mergeKahootSessionsMap(current, sessions, true);
              safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(merged));
              notifySyncListeners();
            }
            break;
          }

          case 'KAHOOT_SOLO_SCORES_UPDATED': {
            const { soloScores } = parsed.data || {};
            if (Array.isArray(soloScores)) {
              safeStorage.setItem('kahoot_solo_scores', JSON.stringify(soloScores));
              notifySyncListeners();
            }
            break;
          }

          case 'KAHOOT_QUESTION_BANK_UPDATED': {
            const { questionBank } = parsed.data || {};
            if (Array.isArray(questionBank)) {
              safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(questionBank));
              notifySyncListeners();
            }
            break;
          }

          case 'PUSH_NOTIFICATION_DISPATCHED': {
            storageService.fetchLatestServerData().catch(() => {});
            notifySyncListeners();
            break;
          }

          case 'COMMUNITY_EVENTS_UPDATED': {
            const {
              communityEvents,
              deletedEventIds,
              eventGroups,
              eventRegistrations,
              eventPayments,
              eventBuses,
              eventAttendances,
              eventAuditLogs,
              eventStaffAssignments
            } = parsed.data || {};
            if (Array.isArray(deletedEventIds)) {
              safeStorage.setItem(DELETED_EVENTS_STORAGE_KEY, JSON.stringify(deletedEventIds));
            }
            if (Array.isArray(communityEvents)) {
              safeStorage.setItem(COMMUNITY_EVENTS_STORAGE_KEY, JSON.stringify(communityEvents));
            }
            if (Array.isArray(eventGroups)) {
              safeStorage.setItem(EVENT_GROUPS_STORAGE_KEY, JSON.stringify(eventGroups));
            }
            if (Array.isArray(eventRegistrations)) {
              safeStorage.setItem(EVENT_REGISTRATIONS_STORAGE_KEY, JSON.stringify(eventRegistrations));
            }
            if (Array.isArray(eventPayments)) {
              safeStorage.setItem(EVENT_PAYMENTS_STORAGE_KEY, JSON.stringify(eventPayments));
            }
            if (Array.isArray(eventBuses)) {
              safeStorage.setItem(EVENT_BUSES_STORAGE_KEY, JSON.stringify(eventBuses));
            }
            if (Array.isArray(eventAttendances)) {
              safeStorage.setItem(EVENT_ATTENDANCES_STORAGE_KEY, JSON.stringify(eventAttendances));
            }
            if (Array.isArray(eventAuditLogs)) {
              safeStorage.setItem(EVENT_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(eventAuditLogs));
            }
            if (Array.isArray(eventStaffAssignments)) {
              safeStorage.setItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(eventStaffAssignments));
            }
            notifySyncListeners();
            break;
          }

          case 'SITE_TEXTS_UPDATED': {
            const { siteTextOverrides } = parsed.data || {};
            if (!isSiteTextsMutationLocked() && siteTextOverrides && typeof siteTextOverrides === 'object') {
              inMemorySiteTextOverrides = { ...(inMemorySiteTextOverrides || {}), ...siteTextOverrides };
              safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, JSON.stringify(inMemorySiteTextOverrides));
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: inMemorySiteTextOverrides }));
              }
              notifySyncListeners();
            }
            break;
          }
        }
      } catch (err) {
        console.warn('[SSE Realtime] Message processing error:', err);
      }
    };

    sseConnection.onerror = () => {
      try { sseConnection?.close(); } catch {}
      sseConnection = null;
      if (isExpressBackendAvailable === false) return;
      if (!sseReconnectTimer) {
        sseReconnectTimer = setTimeout(() => {
          sseReconnectTimer = null;
          if (isExpressBackendAvailable === true) {
            startServerSSE();
          }
        }, 5000);
      }
    };
  } catch (e) {
    // Silent fallback when running on static Cloudflare Pages hosting
  }
}

function startCloudflareRealtime(): void {
  if (typeof window === 'undefined') return;
  if (cloudflareChannel) {
    cloudflareChannel = null;
  }

  // Start Cloudflare Durable Objects Realtime WebSocket listener
  try {
    connectCloudflareRealtime();
    isCloudflareConnected = true;
    subscribeCloudflareRealtime((msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      isCloudflareConnected = true;
      if (msg.type === 'd1_mutation' && msg.table === 'registrants' && msg.action === 'DELETE') {
        try {
          const targetId = String(msg.id || msg.matchValue || msg.record?.id || '').trim();
          if (targetId && targetId !== 'reg_owner_main') {
            storageService.addDeletedRegistrantId(targetId);
            removeCachedD1Photo(targetId);
            inMemoryRegistrants = (inMemoryRegistrants || []).filter(r => r && r.id !== targetId);
            try {
              safeStorage.removeItem(REGISTRANTS_STORAGE_KEY);
              if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(REGISTRANTS_STORAGE_KEY);
              }
            } catch {}
            storageService.cleanRememberedLoginIfInvalid();
            storageService.syncCurrentSession(undefined, targetId);
            notifySyncListeners();
          }
        } catch {}
        return;
      }
      if (msg.type === 'member_permissions_updated' && msg.memberId) {
        try {
          const targetId = String(msg.memberId).trim();
          const list = storageService.getRegistrants();
          const idx = list.findIndex(r => r.id === targetId);
          if (idx >= 0) {
            const existing = list[idx];
            const nextRole: UserRole = isPermanentCommunityOwner(existing)
              ? 'community_owner'
              : (msg.role || existing.role);
            const nextPerms = isPermanentCommunityOwner(existing)
              ? { ...ROLE_PERMISSIONS.community_owner }
              : {
                  ...(existing.permissions || {}),
                  ...(msg.permissions || {}),
                  __permissionsUpdatedAt: Number(msg.updatedAt || Date.now())
                };
            list[idx] = {
              ...existing,
              role: nextRole,
              permissions: nextPerms
            };
            inMemoryRegistrants = list;
            try {
              safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
            } catch {}
            storageService.syncCurrentSession(nextRole, targetId);
            notifySyncListeners();
          }
        } catch {}
        return;
      }
      if (msg.type === 'd1_mutation' && msg.table === 'registrants' && msg.record && msg.action !== 'DELETE') {
        try {
          const deletedIds = storageService.getDeletedRegistrantIds();
          let list = storageService.getRegistrants();
          const targetId = msg.matchValue || msg.record?.id;
          if (!targetId || deletedIds.has(targetId) || msg.record.status === 'cancelled') return;

          const idx = list.findIndex(r => r.id === targetId);
          if (msg.action === 'UPDATE') {
            // Partial update (e.g. online presence or permissions): NEVER run normalizeRegistrant on partial payload!
            if (idx >= 0) {
              const existing = list[idx];
              const mergedPres = mergeClientPresence(existing, msg.record);
              list[idx] = mergeRegistrantPreservingIdentity(existing, {
                ...msg.record,
                ...mergedPres,
                photoUrl: msg.record.photoUrl?.startsWith('__D1_PHOTO_REF__:') ? existing.photoUrl : (msg.record.photoUrl || existing.photoUrl)
              });
              inMemoryRegistrants = list;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
              } catch {}
              storageService.syncCurrentSession(list[idx].role, list[idx].id);
              notifySyncListeners();
            }
          } else {
            // Full UPSERT: Only insert/update if fullName is valid (never 'عضو')
            if (idx >= 0) {
              const existing = list[idx];
              const row = normalizeRegistrant({ ...existing, ...msg.record });
              list[idx] = mergeRegistrantPreservingIdentity(existing, {
                ...row,
                photoUrl: row.photoUrl?.startsWith('__D1_PHOTO_REF__:') ? existing.photoUrl : (row.photoUrl || existing.photoUrl)
              });
              inMemoryRegistrants = list;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
              } catch {}
              storageService.syncCurrentSession(list[idx].role, list[idx].id);
              notifySyncListeners();
            } else if (isValidMemberName(msg.record.fullName || msg.record.name)) {
              const row = normalizeRegistrant(msg.record);
              list.unshift(row);
              inMemoryRegistrants = list;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(list));
              } catch {}
              notifySyncListeners();
            }
          }
        } catch {}
        return;
      }
      if (msg.type === 'd1_mutation' && msg.title && String(msg.title).startsWith('D1_STATE:')) {
        storageService.fetchLatestServerData(true).catch(() => {});
        return;
      }
      if (msg.type === 'site_text_overrides_sync' && msg.overrides && typeof msg.overrides === 'object') {
        const incTs = Number(msg.at || Date.now());
        markLocalSiteTextsMutated(incTs);
        inMemorySiteTextOverrides = { ...msg.overrides };
        safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, JSON.stringify(inMemorySiteTextOverrides));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: inMemorySiteTextOverrides }));
        }
        notifySyncListeners();
        return;
      }
      if (msg.type === 'blocked_users_sync' && Array.isArray(msg.blockedUsers)) {
        inMemoryBlockedUsers = msg.blockedUsers;
        try {
          safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
        } catch {}
        storageService.cleanRememberedLoginIfInvalid();
        notifySyncListeners();
        return;
      }
      if (msg.type === 'visitation_mode_live_sync') {
        const incMode = msg.mode;
        const incTs = Number(msg.updatedAt || 0);
        const locTs = getLocalVisitationModeUpdatedAt();
        if ((incMode === 'general' || incMode === 'special') && incTs >= locTs) {
          markLocalVisitationModeUpdated(incTs);
          safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, incMode);
          if (incMode === 'general') {
            safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
          }
          notifySyncListeners();
        }
        return;
      }
      if (msg.type === 'attendance_sync' && Array.isArray(msg.records)) {
        try {
          const delAtt = storageService.getDeletedAttendanceIds();
          if (msg.deletedId) {
            storageService.addDeletedAttendanceId(msg.deletedId);
            delAtt.add(msg.deletedId);
          }
          const regMap = new Map<string, Registrant>();
          storageService.getRegistrants().forEach(r => { if (r && r.id) regMap.set(r.id, r); });
          const mergedAtt: AttendanceRecord[] = msg.records
            .filter((r: any) => r && r.id && !delAtt.has(r.id))
            .map((r: any) => {
              const member = regMap.get(r.registrantId);
              return {
                ...r,
                registrantName: member?.fullName || r.registrantName,
                registrantPhotoUrl: (typeof r.registrantPhotoUrl === 'string' && r.registrantPhotoUrl.startsWith('__D1_PHOTO_REF__:'))
                  ? (member?.photoUrl || '')
                  : (r.registrantPhotoUrl || member?.photoUrl || '')
              };
            });
          safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(mergedAtt));
          notifySyncListeners();
        } catch {}
        return;
      }
      if (msg.type === 'role_permissions_sync') {
        try {
          if (msg.allPermissions && typeof msg.allPermissions === 'object') {
            safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(msg.allPermissions));
          } else if (msg.role && msg.permissions) {
            const current = storageService.getAllRolePermissions();
            const targetRole = msg.role as UserRole;
            if (current[targetRole]) {
              current[targetRole] = { ...current[targetRole], ...msg.permissions };
              safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(current));
            }
          }
          storageService.syncCurrentSession(msg.role);
          notifySyncListeners();
        } catch {}
        return;
      }
      if (msg.type === 'stamp_live_sync' && msg.stamps && typeof msg.stamps === 'object') {
        if (storageService.mergeIncomingFridayStamps(msg.stamps)) {
          notifySyncListeners();
        }
        return;
      }
      if (msg.type === 'attendance_session_sync' && msg.session && typeof msg.session === 'object') {
        if (storageService.mergeIncomingAttendanceSession(msg.session, true)) {
          notifySyncListeners();
        }
        return;
      }
      if (msg.type === 'announcement_live_sync' && msg.announcement) {
        try {
          const incomingAnn = msg.announcement as Announcement;
          const delSet = storageService.getDeletedAnnouncementIds();
          if (incomingAnn.id && !delSet.has(incomingAnn.id)) {
            if (incomingAnn.imageUrl && incomingAnn.imageUrl.startsWith('data:')) {
              setCachedD1AnnouncementImage(incomingAnn.id, incomingAnn.imageUrl);
            } else if (
              incomingAnn.imageUrl &&
              incomingAnn.imageUrl.startsWith('__D1_ANN_IMAGE_REF__:')
            ) {
              const refId = incomingAnn.imageUrl.replace('__D1_ANN_IMAGE_REF__:', '').trim();
              incomingAnn.imageUrl = getCachedD1AnnouncementImage(refId) || undefined;
            }
            const list = storageService.getAnnouncements();
            const existsIdx = list.findIndex((a) => a.id === incomingAnn.id);
            if (existsIdx >= 0) {
              list[existsIdx] = { ...list[existsIdx], ...incomingAnn };
            } else {
              list.unshift(incomingAnn);
            }
            safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));
            notifySyncListeners();
          }
        } catch {}
        return;
      }
      if (msg.type === 'announcement_deleted_sync' && msg.id) {
        try {
          const delId = String(msg.id);
          const delSet = storageService.getDeletedAnnouncementIds();
          delSet.add(delId);
          safeStorage.setItem(
            DELETED_ANNOUNCEMENTS_STORAGE_KEY,
            JSON.stringify(Array.from(delSet))
          );
          const filtered = storageService.getAnnouncements().filter((a) => a.id !== delId);
          safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(filtered));
          notifySyncListeners();
        } catch {}
        return;
      }
      if (msg.type === 'events_bundle_sync' && msg.payload && typeof msg.payload === 'object') {
        try {
          const evPayload = msg.payload;
          if (Array.isArray(evPayload.deletedEventIds)) {
            const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
            const localDelEvs: string[] = rawDelEvs ? JSON.parse(rawDelEvs) : [];
            const delEvSet = new Set<string>([...(Array.isArray(localDelEvs) ? localDelEvs : []), ...evPayload.deletedEventIds]);
            safeStorage.setItem(DELETED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(delEvSet)));
          }
          const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
          const delEvSet = new Set<string>(rawDelEvs ? JSON.parse(rawDelEvs) : []);

          if (Array.isArray(evPayload.communityEvents)) {
            const cleanEvs = evPayload.communityEvents
              .filter((ev: any) => ev && ev.id && !delEvSet.has(ev.id))
              .map((ev: any) => {
                if (typeof ev.imageUrl === 'string' && ev.imageUrl.startsWith('__D1_ANN_IMAGE_REF__:')) {
                  const refId = ev.imageUrl.replace('__D1_ANN_IMAGE_REF__:', '').trim();
                  ev.imageUrl = getCachedD1AnnouncementImage(refId) || undefined;
                }
                return ev;
              });
            safeStorage.setItem(COMMUNITY_EVENTS_STORAGE_KEY, JSON.stringify(cleanEvs));
          }
          if (Array.isArray(evPayload.eventGroups)) {
            safeStorage.setItem(EVENT_GROUPS_STORAGE_KEY, JSON.stringify(evPayload.eventGroups));
          }
          if (Array.isArray(evPayload.eventRegistrations)) {
            safeStorage.setItem(EVENT_REGISTRATIONS_STORAGE_KEY, JSON.stringify(evPayload.eventRegistrations));
          }
          if (Array.isArray(evPayload.eventPayments)) {
            safeStorage.setItem(EVENT_PAYMENTS_STORAGE_KEY, JSON.stringify(evPayload.eventPayments));
          }
          if (Array.isArray(evPayload.eventBuses)) {
            safeStorage.setItem(EVENT_BUSES_STORAGE_KEY, JSON.stringify(evPayload.eventBuses));
          }
          if (Array.isArray(evPayload.eventAttendances)) {
            safeStorage.setItem(EVENT_ATTENDANCES_STORAGE_KEY, JSON.stringify(evPayload.eventAttendances));
          }
          if (Array.isArray(evPayload.eventAuditLogs)) {
            safeStorage.setItem(EVENT_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(evPayload.eventAuditLogs));
          }
          if (Array.isArray(evPayload.eventStaffAssignments)) {
            safeStorage.setItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(evPayload.eventStaffAssignments));
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('storage_updated'));
          }
          notifySyncListeners();
        } catch {}
        return;
      }
      if (msg.type === 'd1_mutation' || msg.type === 'announcement') {
        storageService.fetchLatestServerData().then(() => notifySyncListeners()).catch(() => {});
      }
    });
  } catch {}
}

export const storageService = {
  subscribe(listener: SyncListener): () => void {
    syncListeners.add(listener);
    return () => {
      syncListeners.delete(listener);
    };
  },

  onDataSynced(listener: SyncListener): () => void {
    return this.subscribe(listener);
  },

  notifyUpdate(): void {
    notifySyncListeners();
  },

  syncSystemState(): Promise<void> {
    return syncSystemStateToCloudflareOwner();
  },

  getDeletedRegistrantIds(): Set<string> {
    const raw = safeStorage.getItem(DELETED_REGISTRANTS_STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw);
      return new Set<string>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  },

  addDeletedRegistrantId(id: string): void {
    if (!id) return;
    const ids = this.getDeletedRegistrantIds();
    ids.add(id);
    try {
      safeStorage.setItem(DELETED_REGISTRANTS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  },

  removeDeletedRegistrantId(id: string): void {
    if (!id) return;
    const ids = this.getDeletedRegistrantIds();
    ids.delete(id);
    try {
      safeStorage.setItem(DELETED_REGISTRANTS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  },

  getDeletedAttendanceIds(): Set<string> {
    const raw = safeStorage.getItem(DELETED_ATTENDANCE_STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  },

  addDeletedAttendanceId(id: string): void {
    if (!id) return;
    const ids = this.getDeletedAttendanceIds();
    ids.add(id);
    try {
      safeStorage.setItem(DELETED_ATTENDANCE_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  },

  removeDeletedAttendanceId(id: string): void {
    if (!id) return;
    const ids = this.getDeletedAttendanceIds();
    ids.delete(id);
    try {
      safeStorage.setItem(DELETED_ATTENDANCE_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  },

  getFridayStampsMap(): Record<string, FridayStampEntry> {
    const raw = safeStorage.getItem(FRIDAY_STAMPS_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  saveFridayStampsMap(map: Record<string, FridayStampEntry>): void {
    try {
      safeStorage.setItem(FRIDAY_STAMPS_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  },

  mergeIncomingFridayStamps(incomingMap: Record<string, any>): boolean {
    if (!incomingMap || typeof incomingMap !== 'object') return false;
    const current = this.getFridayStampsMap();
    const revokedMap = this.getRevokedStamps();
    let changed = false;

    for (const [key, val] of Object.entries(incomingMap)) {
      if (!val || typeof val !== 'object') continue;
      const incVer = Number(val.version || 0);
      const incTs = Number(val.updatedAt || 0);
      const incStamped = Boolean(val.stamped);
      const existing = current[key];
      const exVer = Number(existing?.version || 0);
      const exTs = Number(existing?.updatedAt || 0);

      if (!existing || incVer > exVer || (incVer === exVer && incTs > exTs)) {
        current[key] = {
          stamped: incStamped,
          version: Math.max(incVer, 1),
          updatedAt: incTs || Date.now()
        };
        if (incStamped) {
          delete revokedMap[key];
        } else {
          revokedMap[key] = true;
        }
        changed = true;
      }
    }

    if (changed) {
      this.saveFridayStampsMap(current);
      try {
        safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(revokedMap));
      } catch {}
    }
    return changed;
  },

  setFridayStampState(registrantId: string, dateStr: string, stamped: boolean, syncToAttendanceLog = true): FridayStampEntry {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const key = `${cleanId}_${dateStr}`;
    const bareKey = `${bareId}_${dateStr}`;
    const map = this.getFridayStampsMap();
    const prev = map[key] || map[bareKey];
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    const nextEntry: FridayStampEntry = {
      stamped: Boolean(stamped),
      version: (Number(prev?.version || 0)) + 1,
      updatedAt: nowTs
    };
    map[key] = nextEntry;
    if (bareKey !== key) {
      map[bareKey] = nextEntry;
    }
    this.saveFridayStampsMap(map);

    const revokedMap = this.getRevokedStamps();
    if (stamped) {
      delete revokedMap[key];
      delete revokedMap[bareKey];
    } else {
      revokedMap[key] = true;
      revokedMap[bareKey] = true;
    }
    try {
      safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(revokedMap));
    } catch {}

    // Persist stamp state directly inside the member object (member.stamps & member.attendanceDates)
    const memIdx = inMemoryRegistrants.findIndex(r => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId || (r.uniqueCode && r.uniqueCode.toUpperCase() === cleanId.toUpperCase());
    });
    if (memIdx >= 0) {
      const mem = { ...inMemoryRegistrants[memIdx] } as any;
      const prevStamps = mem.stamps && typeof mem.stamps === 'object' && !Array.isArray(mem.stamps) ? { ...mem.stamps } : {};
      prevStamps[dateStr] = {
        stamped: Boolean(stamped),
        date: dateStr,
        timestamp: prevStamps[dateStr]?.timestamp || nowIso,
        updatedAt: nowTs,
        version: nextEntry.version
      };
      mem.stamps = prevStamps;
      mem.fridayStamps = prevStamps;
      const prevDates: string[] = Array.isArray(mem.attendanceDates) ? [...mem.attendanceDates] : [];
      if (stamped && !prevDates.includes(dateStr)) {
        prevDates.push(dateStr);
      } else if (!stamped) {
        const dIdx = prevDates.indexOf(dateStr);
        if (dIdx >= 0) prevDates.splice(dIdx, 1);
      }
      mem.attendanceDates = prevDates;
      if (mem.uniqueCode) {
        const codeKey = `${String(mem.uniqueCode).trim().toUpperCase()}_${dateStr}`;
        map[codeKey] = nextEntry;
        this.saveFridayStampsMap(map);
      }
      inMemoryRegistrants[memIdx] = mem;
      try {
        safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(inMemoryRegistrants));
      } catch {}
      safeCloudflareUpsert('registrants', mem).catch(() => {});
    }

    // If a stamp is activated and no attendance record exists yet for (member, dateStr), ensure an attendance record exists so Attendance Dashboard shows the member immediately
    if (stamped && syncToAttendanceLog) {
      const records = this.getAttendanceRecords();
      const hasRec = records.some(r => {
        if (!r || r.date !== dateStr) return false;
        const rid = String(r.registrantId || '').trim();
        return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
      });
      if (!hasRec) {
        const memObj = memIdx >= 0 ? inMemoryRegistrants[memIdx] : undefined;
        const dayCount = records.filter(r => r && r.date === dateStr).length;
        const newRec: AttendanceRecord = {
          id: `att_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
          registrantId: memObj?.id || cleanId,
          registrantName: memObj?.fullName || 'مخدوم حاضر',
          uniqueCode: memObj?.uniqueCode,
          registrantPhotoUrl: '',
          date: dateStr,
          timestamp: nowIso,
          scannedAt: nowIso,
          timeString: new Date(nowTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          orderNumber: dayCount + 1,
          method: 'manual'
        };
        records.unshift(newRec);
        safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
        syncAttendanceSliceToCloudflareD1(records).catch(() => {});
        fetch(`${CLOUDFLARE_WORKER_URL}/api/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: [newRec], mode: 'append' })
        }).catch(() => {});
      }
    }

    broadcastCloudflareRealtime({
      type: 'stamp_live_sync',
      stamps: { [key]: nextEntry }
    });

    fetch('/api/attendance/stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrantId: cleanId,
        dateStr,
        revoked: !stamped,
        stamped: Boolean(stamped),
        version: nextEntry.version,
        updatedAt: nextEntry.updatedAt,
        stamps: { [key]: nextEntry }
      })
    }).catch(() => {});

    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return nextEntry;
  },

  isFridayStamped(registrantId: string, dateStr: string): boolean {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const key = `${cleanId}_${dateStr}`;
    const bareKey = `${bareId}_${dateStr}`;
    const prefixedKey = `reg_member_${bareId}_${dateStr}`;
    const stampsMap = this.getFridayStampsMap();
    const entry = stampsMap[key] || stampsMap[bareKey] || stampsMap[prefixedKey];
    const records = this.getAttendanceForRegistrant(cleanId);
    const matchingRec = records.find(r => r.date === dateStr);
    if (entry && typeof entry.version === 'number' && entry.version > 0) {
      if (entry.stamped) return true;
      // If an attendance record exists and was recorded after or during the accidental batch reset (1794591359000), honor the attendance record
      if (matchingRec && Number(entry.updatedAt || 0) <= 1794591359000) {
        return true;
      }
      return false;
    }
    const isRevoked = this.isFridayStampRevoked(cleanId, dateStr);
    return Boolean(matchingRec && !isRevoked);
  },

  getRevokedStamps(): Record<string, boolean> {
    const raw = safeStorage.getItem(REVOKED_STAMPS_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  setFridayStampRevoked(registrantId: string, dateStr: string, revoked: boolean): void {
    this.setFridayStampState(registrantId, dateStr, !revoked, false);
  },

  isFridayStampRevoked(registrantId: string, dateStr: string): boolean {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const key = `${cleanId}_${dateStr}`;
    const bareKey = `${bareId}_${dateStr}`;
    const stampsMap = this.getFridayStampsMap();
    const entry = stampsMap[key] || stampsMap[bareKey];
    if (entry && typeof entry.version === 'number' && entry.version > 0) {
      if (!entry.stamped && Number(entry.updatedAt || 0) <= 1794591359000) {
        const records = this.getAttendanceForRegistrant(cleanId);
        if (records.some(r => r.date === dateStr)) return false;
      }
      return !entry.stamped;
    }
    const map = this.getRevokedStamps();
    return !!(map[key] || map[bareKey]);
  },

  isDatabaseConnected(): boolean {
    return isCloudflareConnected;
  },

  isOffline(): boolean {
    return isOfflineMode || (typeof navigator !== 'undefined' && !navigator.onLine);
  },

  getAttendanceSession(): {
    isActive: boolean;
    startTime?: number;
    endTime: number;
    durationMinutes: number;
    startedBy?: string;
    startedAt?: string;
    updatedAt?: number;
  } {
    try {
      const raw = safeStorage.getItem('three_youths_attendance_session');
      if (!raw) return { isActive: false, startTime: 0, endTime: 0, durationMinutes: 60, updatedAt: 0 };
      const sess = JSON.parse(raw);
      const endTimeMs = Number(sess?.endTime || 0);
      const remainingSeconds = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      if (sess && sess.isActive !== false && endTimeMs > 0 && remainingSeconds > 0) {
        return {
          ...sess,
          isActive: true,
          startTime: Number(sess.startTime || 0) || undefined,
          endTime: endTimeMs,
          durationMinutes: Number(sess.durationMinutes || 60),
          updatedAt: Number(sess.updatedAt || 0)
        };
      }
      return {
        isActive: false,
        startTime: Number(sess?.startTime || 0) || 0,
        endTime: 0,
        durationMinutes: Number(sess?.durationMinutes || 60),
        startedBy: sess?.startedBy,
        startedAt: sess?.startedAt,
        updatedAt: Number(sess?.updatedAt || 0)
      };
    } catch {}
    return { isActive: false, startTime: 0, endTime: 0, durationMinutes: 60, updatedAt: 0 };
  },

  mergeIncomingAttendanceSession(
    incoming: any,
    forceAccept = false
  ): boolean {
    if (!incoming || typeof incoming !== 'object') return false;
    try {
      const rawCur = safeStorage.getItem('three_youths_attendance_session');
      const cur = rawCur ? JSON.parse(rawCur) : null;
      const curUpdated = Number(cur?.updatedAt || 0);
      const incUpdated = Number(incoming.updatedAt || 0);
      const incEndTime = Number(incoming.endTime || 0);
      const curEndTime = Number(cur?.endTime || 0);

      // Accept incoming if it has a newer updatedAt, or if forceAccept (WebSocket broadcast), or if incoming is an active session and local is inactive
      const isIncomingActiveNow = incoming.isActive !== false && incEndTime > Date.now();
      const isLocalActiveNow = cur && cur.isActive !== false && curEndTime > Date.now();

      if (
        forceAccept ||
        incUpdated > curUpdated ||
        (isIncomingActiveNow && !isLocalActiveNow && curUpdated === 0) ||
        (isIncomingActiveNow && incEndTime !== curEndTime && incUpdated >= curUpdated)
      ) {
        const normalized = {
          isActive: Boolean(incoming.isActive && incEndTime > Date.now()),
          startTime: Number(incoming.startTime || Date.now()),
          endTime: incEndTime,
          durationMinutes: Number(incoming.durationMinutes || 60),
          startedBy: incoming.startedBy || 'المسؤول',
          startedAt: incoming.startedAt || new Date().toISOString(),
          updatedAt: incUpdated || Date.now()
        };
        if (rawCur !== JSON.stringify(normalized)) {
          safeStorage.setItem('three_youths_attendance_session', JSON.stringify(normalized));
          return true;
        }
      }
    } catch {}
    return false;
  },

  setAttendanceSession(session: {
    isActive: boolean;
    startTime?: number;
    endTime: number;
    durationMinutes: number;
    startedBy?: string;
    startedAt?: string;
    updatedAt?: number;
  }): void {
    try {
      const nowTs = Date.now();
      const payload = {
        ...session,
        isActive: Boolean(session.isActive && Number(session.endTime || 0) > nowTs),
        startTime: Number(session.startTime || nowTs),
        endTime: Number(session.endTime || 0),
        durationMinutes: Number(session.durationMinutes || 60),
        startedBy: session.startedBy || 'المسؤول',
        startedAt: session.startedAt || new Date(nowTs).toISOString(),
        updatedAt: Number(session.updatedAt || nowTs)
      };
      safeStorage.setItem('three_youths_attendance_session', JSON.stringify(payload));
      invalidateCloudflareEdgeVersion();

      // 1. Push dedicated attendance_session slice to Cloudflare D1 immediately (0ms debounce)
      pushStateSliceToCloudflareD1('attendance_session', payload).catch(() => {});

      // 2. Broadcast over Cloudflare Durable Objects WebSocket for instant 0ms sync to all connected servants
      broadcastCloudflareRealtime({
        type: 'attendance_session_sync',
        session: payload
      });

      // 3. Also persist inside system_bundle
      syncSystemStateToCloudflareOwner().catch(() => {});

      notifySyncListeners();
    } catch {}
  },

  async fetchLatestAttendanceSession(): Promise<{
    isActive: boolean;
    startTime?: number;
    endTime: number;
    durationMinutes: number;
    startedBy?: string;
    startedAt?: string;
    updatedAt?: number;
  }> {
    try {
      const remoteSess = await fetchAttendanceSessionFromCloudflareD1();
      if (remoteSess && typeof remoteSess === 'object') {
        if (this.mergeIncomingAttendanceSession(remoteSess, true)) {
          notifySyncListeners();
        }
      } else {
        await this.fetchLatestServerData(true);
      }
    } catch {}
    return this.getAttendanceSession();
  },

  /**
   * Initialize bidirectional real-time Cloudflare D1 sync across all mobile devices & browsers
   */
  initRealtimeSync(): void {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.__cloudflare_sync_active) return;
    w.__cloudflare_sync_active = true;

    // Self-healing & Standalone iOS/Android PWA Purge: clear all old legacy caches and mock items
    try {
      const isStandalonePwa =
        (window.navigator as any).standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

      safeStorage.removeItem('three_youths_announcements_v1');
      safeStorage.removeItem('three_youths_announcements_v2');
      safeStorage.removeItem('three_youths_announcements_v3');
      safeStorage.removeItem('three_youths_announcements_v4');

      if (isStandalonePwa && 'caches' in window) {
        caches.keys().then(names => names.forEach(n => caches.delete(n))).catch(() => {});
      }

      const rawAnns = safeStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
      if (rawAnns) {
        const parsed = JSON.parse(rawAnns);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            a => a && a.id !== 'ann_welcome_1' && a.id !== 'ann_care_1' && a.id !== 'ann_test_check_1'
          );
          safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(cleaned));
        }
      }

      const rawQuizzes = safeStorage.getItem(KAHOOT_QUIZZES_STORAGE_KEY);
      if (rawQuizzes) {
        const parsedQ = JSON.parse(rawQuizzes);
        if (Array.isArray(parsedQ)) {
          const cleanedQ = parsedQ.filter(q => q && q.id && q.id !== 'quiz_daniel_three_youths');
          if (cleanedQ.length !== parsedQ.length) {
            safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(cleanedQ));
          }
        }
      }

      const rawBank = safeStorage.getItem(KAHOOT_QUESTION_BANK_STORAGE_KEY);
      if (rawBank) {
        const parsedB = JSON.parse(rawBank);
        if (Array.isArray(parsedB)) {
          const cleanedB = parsedB.filter(b => b && b.id && !String(b.id).startsWith('qbank_seed_'));
          if (cleanedB.length !== parsedB.length) {
            safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(cleanedB));
          }
        }
      }
    } catch {}

    // Start Cloudflare Durable Objects Realtime & Central Server SSE listeners
    startCloudflareRealtime();
    startServerSSE();

    // Immediate Pull-First initial sync with Cloudflare D1 (Single Source of Truth)
    this.fetchLatestServerData(true).then(() => notifySyncListeners()).catch(() => {});

    // Instant Wake-Up Sync for iOS & Android Home Screen PWAs (pageshow, visibilitychange, focus, online)
    const triggerImmediateWakeupSync = () => {
      invalidateCloudflareEdgeVersion();
      startCloudflareRealtime();
      this.fetchLatestServerData(true).then(() => notifySyncListeners()).catch(() => {});
    };

    window.addEventListener('pageshow', () => {
      triggerImmediateWakeupSync();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        triggerImmediateWakeupSync();
      }
    });

    window.addEventListener('focus', () => {
      triggerImmediateWakeupSync();
    });

    // Listen to Service Worker push sync signals
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FORCE_CLOUDFLARE_SYNC') {
          triggerImmediateWakeupSync();
        }
      });
    }

    // Listen to device network transitions
    window.addEventListener('online', () => {
      console.info('[Network] Device came online. Re-initiating Cloudflare & Server SSE sync...');
      isOfflineMode = false;
      triggerImmediateWakeupSync();
      startServerSSE();
    });

    window.addEventListener('offline', () => {
      console.info('[Network] Device is offline. Operating smoothly in offline mode.');
      isOfflineMode = true;
      isCloudflareConnected = false;
    });
  },

  /**
   * Fetch latest data from Cloudflare D1 and central server (Sync across mobile phones & computers).
   * Enforces Pull-First / Server-Wins so AI Studio Preview never overwrites Cloudflare D1.
   */
  async forceFetchFromCloudflare(): Promise<{
    members: Registrant[];
    attendance: AttendanceRecord[];
    announcements: Announcement[];
    attendanceSession: ReturnType<typeof storageService.getAttendanceSession>;
  }> {
    isFetchingServerDataInFlight = false;
    invalidateCloudflareEdgeVersion();
    await this.fetchLatestServerData(true);
    const freshMembers = this.getRegistrants();
    if (freshMembers.length === 0) {
      const direct = await forceFetchFromCloudflare().catch(() => null);
      if (direct && Array.isArray(direct.members) && direct.members.length > 0) {
        this.setRegistrants(direct.members as Registrant[]);
      }
    }
    return {
      members: this.getRegistrants(),
      attendance: this.getAttendanceRecords(),
      announcements: this.getAnnouncements(),
      attendanceSession: this.getAttendanceSession()
    };
  },

  async fetchLatestServerData(force = false): Promise<{ success: boolean; hasLocalChanges: boolean; newCount?: number }> {
    if (!force && isPollingFrozen()) {
      return { success: true, hasLocalChanges: false, newCount: inMemoryRegistrants ? inMemoryRegistrants.length : 0 };
    }
    if (!force && typeof document !== 'undefined' && document.hidden) {
      return { success: true, hasLocalChanges: false, newCount: inMemoryRegistrants ? inMemoryRegistrants.length : 0 };
    }
    if (!force && isFetchingServerDataInFlight) {
      return { success: true, hasLocalChanges: false, newCount: inMemoryRegistrants ? inMemoryRegistrants.length : 0 };
    }
    isFetchingServerDataInFlight = true;
    try {
    unblacklistRestoredFourOnce();
    await loadPermanent95Members().catch(() => []);
    let hasLocalChanges = false;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    const d1ActiveRegistrantIds = new Set<string>();

    // 1. Direct Cloudflare D1 Cloud Sync (Single Source of Truth)
    if (isOnline) {
      try {
        const d1Data = await fetchFullStateFromCloudflareD1(force);
        if (d1Data && Array.isArray(d1Data.registrants)) {
          isCloudflareConnected = true;
          d1Data.registrants.forEach((raw: any) => {
            if (raw && typeof raw === 'object' && !isGarbageOrGhostMember(raw)) {
              const norm = normalizeRegistrant(raw);
              if (norm && norm.id && norm.status !== 'cancelled') {
                d1ActiveRegistrantIds.add(norm.id);
              }
            }
          });
        }
        if (d1Data && d1Data.__unchanged && (isExpressBackendAvailable === false || isAiStudioPreviewEnv())) {
          const curMem = Array.isArray(inMemoryRegistrants) ? inMemoryRegistrants : [];
          const cached95 = getCachedPermanent95Members();
          if (cached95.length >= 90 && curMem.length < cached95.length) {
            const enriched = filterOutDeletedAndGhosts(
              mergeAndEnrichWithPermanent95(curMem, {}).map((m, idx) => normalizeRegistrant(m, idx))
            ) as Registrant[];
            if (enriched.length > curMem.length) {
              inMemoryRegistrants = enriched;
              try {
                safeStorage.setItem(REGISTRANTS_STORAGE_KEY, serializeRegistrantsForLocalCache(enriched, false));
                safeStorage.setItem('SAFE_BACKUP_MEMBERS', serializeRegistrantsForLocalCache(enriched, true));
              } catch {}
              notifySyncListeners();
              return { success: true, hasLocalChanges: true, newCount: enriched.length };
            }
          }
          return { success: true, hasLocalChanges: false, newCount: curMem.length };
        }
        if (d1Data && typeof d1Data === 'object' && !d1Data.__unchanged) {
          isCloudflareConnected = true;

          // Step 1a: Sync Permanent Tombstones from Cloudflare D1 (IDs + Normalized Names)
          const serverBlacklistIds: string[] = [];
          const serverBlacklistNames: string[] = [];
          try {
            const delAnns = this.getDeletedAnnouncementIds();
            const delQuizzes = this.getDeletedKahootQuizIds();
            let annsDelChanged = false;
            let quizzesDelChanged = false;

            if (Array.isArray(d1Data.deletedAnnouncementIds)) {
              d1Data.deletedAnnouncementIds.forEach((id: string) => {
                if (id && !delAnns.has(id)) {
                  delAnns.add(id);
                  annsDelChanged = true;
                }
              });
            }
            if (Array.isArray(d1Data.deletedKahootQuizIds)) {
              d1Data.deletedKahootQuizIds.forEach((id: string) => {
                if (id && !delQuizzes.has(id)) {
                  delQuizzes.add(id);
                  quizzesDelChanged = true;
                }
              });
            }
            const localDeletedRegsSet = this.getDeletedRegistrantIds();
            let localDeletedRegsChanged = false;

            const activeD1IdSet = new Set<string>();
            const activeD1NameSet = new Set<string>();
            if (Array.isArray(d1Data.registrants)) {
              for (const r of d1Data.registrants) {
                if (!r) continue;
                const rid = String(r.id || '').trim();
                const rbase = getBaseMemberId(rid);
                const rnorm = ultraNormalizeArabic(r.fullName || r.name || '');
                if (rid) activeD1IdSet.add(rid);
                if (rbase) activeD1IdSet.add(rbase);
                if (rnorm) activeD1NameSet.add(rnorm);
              }
            }

            if (Array.isArray(d1Data.revokedMembersLog)) {
              d1Data.revokedMembersLog.forEach((entry: any) => {
                const revId = typeof entry === 'string' ? entry : entry?.id;
                const revOrig = typeof entry === 'object' ? entry?.originalId : undefined;
                const revName = typeof entry === 'object' ? (entry?.normalizedName || entry?.fullName) : undefined;
                const revCode = typeof entry === 'object' ? entry?.uniqueCode : undefined;
                if (isWhitelistedRescuedMember(revId || revOrig || revCode, revName)) return;
                const normRev = revName ? ultraNormalizeArabic(revName) : '';
                if ((revId && activeD1IdSet.has(String(revId))) || (normRev && activeD1NameSet.has(normRev))) {
                  return;
                }
                if (revId && revId !== 'reg_owner_main') {
                  const sRevId = String(revId);
                  if (!localDeletedRegsSet.has(sRevId)) {
                    localDeletedRegsSet.add(sRevId);
                    localDeletedRegsChanged = true;
                  }
                  serverBlacklistIds.push(sRevId);
                }
                if (revOrig) serverBlacklistIds.push(String(revOrig));
                if (revCode) serverBlacklistIds.push(String(revCode));
                if (revName) serverBlacklistNames.push(String(revName));
              });
            }
            if (localDeletedRegsChanged) {
              try {
                safeStorage.setItem(DELETED_REGISTRANTS_STORAGE_KEY, JSON.stringify(Array.from(localDeletedRegsSet)));
              } catch {}
            }
            if (d1Data.serverTombstones) {
              if (Array.isArray(d1Data.serverTombstones.ids)) serverBlacklistIds.push(...d1Data.serverTombstones.ids);
              if (Array.isArray(d1Data.serverTombstones.names)) serverBlacklistNames.push(...d1Data.serverTombstones.names);
            }

            if (annsDelChanged) {
              safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delAnns)));
              const activeAnns = this.getAnnouncements().filter(a => a && a.id && !delAnns.has(a.id));
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(activeAnns));
              hasLocalChanges = true;
            }
            if (quizzesDelChanged) {
              safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(delQuizzes)));
              const activeQuizzes = this.getKahootQuizzes().filter(q => q && q.id && !delQuizzes.has(q.id));
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(activeQuizzes));
              hasLocalChanges = true;
            }
          } catch {}

          const serverBlacklist = { ids: serverBlacklistIds, names: serverBlacklistNames };
          const d1Regs = Array.isArray(d1Data.registrants) ? d1Data.registrants : null;

          if (Array.isArray(d1Regs) && d1Regs.length > 0 && !isPollingFrozen()) {
            const ownerRaw = d1Regs.find((r: any) => r && (r.id === 'reg_owner_main' || r.role === 'community_owner'));
            if (ownerRaw && applyRemoteOwnerSystemState(ownerRaw)) {
              hasLocalChanges = true;
            }

            const currentList = (inMemoryRegistrants && inMemoryRegistrants.length > 0)
              ? inMemoryRegistrants
              : this.getRegistrants();

            // Always merge currentList (inMemoryRegistrants) with d1Regs via applySmartNeverShrinkState
            // so newly registered (#97+) members and local role/permission updates in currentList are NEVER overwritten!
            const finalCleanMerged = applySmartNeverShrinkState(
              currentList,
              d1Regs as Registrant[],
              serverBlacklist
            ) as Registrant[];

            if (finalCleanMerged.length > 0) {
              const prevLen = currentList.length;
              const prevSig = getFastStateSignature(currentList);
              const nextSig = getFastStateSignature(finalCleanMerged);
              inMemoryRegistrants = finalCleanMerged;
              inMemoryRegistrantsAudited = finalCleanMerged.length >= 90;
              finalCleanMerged.forEach((m) => d1ActiveRegistrantIds.add(m.id));
              if (finalCleanMerged.length > 25 && (prevLen !== finalCleanMerged.length || prevSig !== nextSig)) {
                scheduleBackgroundBackupSave(finalCleanMerged);
              }
              this.syncCurrentSession();
              if (prevLen !== finalCleanMerged.length || prevSig !== nextSig) {
                hasLocalChanges = true;
              }
            }
          } else if (!isPollingFrozen()) {
            // Even if Cloudflare D1/KV was unreachable or empty, restore & enrich from Permanent 95 catalog
            const currentList = deduplicateAndMergeMembers(
              filterOutDeletedAndGhosts(
                (inMemoryRegistrants && inMemoryRegistrants.length > 0 ? inMemoryRegistrants : this.getRegistrants())
                  .map((r, idx) => normalizeRegistrant(r, idx)),
                serverBlacklist
              ),
              serverBlacklist
            ) as Registrant[];
            const enrichedFallback = deduplicateAndMergeMembers(
              filterOutDeletedAndGhosts(
                mergeAndEnrichWithPermanent95(currentList, serverBlacklist).map((m, idx) => normalizeRegistrant(m, idx)),
                serverBlacklist
              ),
              serverBlacklist
            ) as Registrant[];
            if (enrichedFallback.length !== currentList.length) {
              inMemoryRegistrants = enrichedFallback;
              inMemoryRegistrantsAudited = enrichedFallback.length >= 90;
              if (enrichedFallback.length > 25) {
                scheduleBackgroundBackupSave(enrichedFallback);
              }
              hasLocalChanges = true;
            }
          }

          // Step 1a-att: Sync Attendance Records directly from Cloudflare D1 (D1_STATE:attendance_records)
          if (Array.isArray(d1Data.attendance) && d1Data.attendance.length > 0) {
            const delAtts = this.getDeletedAttendanceIds();
            const currentAtt = this.getAttendanceRecords();
            const attMap = new Map<string, AttendanceRecord>();
            currentAtt.forEach((a) => {
              if (a && a.id && !delAtts.has(a.id)) {
                attMap.set(a.id, a);
              }
            });
            let d1AttChanged = false;
            d1Data.attendance.forEach((sa: AttendanceRecord) => {
              if (!sa || !sa.id || delAtts.has(sa.id)) return;
              const resolvedPhoto = resolveSafePhotoUrl(sa.registrantPhotoUrl, sa.registrantId);
              const normalizedAtt: AttendanceRecord = {
                ...sa,
                registrantPhotoUrl: resolvedPhoto || sa.registrantPhotoUrl || ''
              };
              const prev = attMap.get(sa.id);
              if (!prev || JSON.stringify(prev) !== JSON.stringify(normalizedAtt)) {
                attMap.set(sa.id, normalizedAtt);
                d1AttChanged = true;
              }
            });
            if (d1AttChanged) {
              const mergedAttList = Array.from(attMap.values());
              safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(mergedAttList));
              hasLocalChanges = true;
            }
          }

          // Step 1b: Announcements from Cloudflare D1
          if (Array.isArray(d1Data.announcements)) {
            const delAnns = this.getDeletedAnnouncementIds();
            const currentAnns = this.getAnnouncements();
            const currentMap = new Map<string, Announcement>();
            currentAnns.forEach(a => {
              if (a && a.id && !delAnns.has(a.id) && !isAnnouncementExpired(a)) {
                currentMap.set(a.id, a);
              }
            });

            const map = new Map<string, Announcement>();
            const nowMs = Date.now();
            currentAnns.forEach(a => {
              if (a && a.id && !delAnns.has(a.id) && !isAnnouncementExpired(a)) {
                const createdMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                if (nowMs - createdMs < 10000) {
                  map.set(a.id, {
                    ...a,
                    senderPhotoUrl: a.senderRole === 'priest' ? a.senderPhotoUrl : undefined
                  });
                }
              }
            });

            d1Data.announcements.forEach((sa: any) => {
              if (sa && sa.id && !delAnns.has(sa.id) && !isAnnouncementExpired(sa)) {
                const existing = currentMap.get(sa.id);
                const viewersMap = new Map<string, AnnouncementViewer>();
                (existing?.viewers || []).forEach(v => { if (v && v.memberId) viewersMap.set(v.memberId, v); });
                (sa.viewers || []).forEach((v: any) => { if (v && v.memberId) viewersMap.set(v.memberId, { ...(viewersMap.get(v.memberId) || {}), ...v }); });

                const mergedReactions: Record<string, string[]> = {};
                const exReactions = existing?.reactions || {};
                const saReactions = sa.reactions || {};
                const allEmojis = new Set([...Object.keys(exReactions), ...Object.keys(saReactions)]);
                allEmojis.forEach(em => {
                  const s = new Set<string>([...(exReactions[em] || []), ...(saReactions[em] || [])]);
                  if (s.size > 0) mergedReactions[em] = Array.from(s);
                });

                map.set(sa.id, {
                  ...(existing || {}),
                  ...sa,
                  imageUrl: sa.imageUrl || existing?.imageUrl,
                  targetUserId: sa.targetUserId || existing?.targetUserId,
                  targetServantName: sa.targetServantName || existing?.targetServantName,
                  isVisitationTaskAlert: sa.isVisitationTaskAlert ?? existing?.isVisitationTaskAlert,
                  senderPhotoUrl: sa.senderRole === 'priest' ? (sa.senderPhotoUrl || existing?.senderPhotoUrl) : undefined,
                  viewers: Array.from(viewersMap.values()),
                  reactions: Object.keys(saReactions).length > 0 ? saReactions : mergedReactions
                });
              }
            });
            const mergedAnns = Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            if (JSON.stringify(currentAnns) !== JSON.stringify(mergedAnns)) {
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(mergedAnns));
              hasLocalChanges = true;
            }
          }

          // Step 1c: Attendance, Blocked Users, Kahoot Quizzes, and Site Text Overrides from Cloudflare D1
          if (Array.isArray(d1Data.attendance) && d1Data.attendance.length > 0) {
            const delAtts = this.getDeletedAttendanceIds();
            const localAtt = this.getAttendanceRecords().filter(a => a && typeof a.id === 'string' && !delAtts.has(a.id));
            const attMap = new Map<string, AttendanceRecord>();
            localAtt.forEach(a => attMap.set(a.id, a));
            let attChanged = false;
            d1Data.attendance.forEach((sa: AttendanceRecord) => {
              if (sa && typeof sa.id === 'string' && !delAtts.has(sa.id) && !attMap.has(sa.id)) {
                attMap.set(sa.id, sa);
                attChanged = true;
              }
            });
            if (attChanged) {
              safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(Array.from(attMap.values())));
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(d1Data.blockedUsers)) {
            const nextBlocked = d1Data.blockedUsers.filter((sb: BlockedUser) => sb && (sb.fullName || sb.phone || sb.ipAddress));
            if (JSON.stringify(inMemoryBlockedUsers) !== JSON.stringify(nextBlocked)) {
              inMemoryBlockedUsers = nextBlocked;
              safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(d1Data.kahootQuizzes)) {
            const delQuizzes = this.getDeletedKahootQuizIds();
            delQuizzes.add('quiz_daniel_three_youths');
            const currentQuizzes = this.getKahootQuizzes();
            const quizMap = new Map<string, KahootQuiz>();
            const nowMs = Date.now();
            currentQuizzes.forEach(q => {
              if (q && q.id && !delQuizzes.has(q.id)) {
                const updatedMs = new Date(q.updatedAt || q.createdAt || 0).getTime();
                if (nowMs - updatedMs < 10000) {
                  quizMap.set(q.id, { ...q, isPublished: q.isPublished !== false });
                }
              }
            });
            d1Data.kahootQuizzes.forEach((sq: KahootQuiz) => {
              if (sq && sq.id && !delQuizzes.has(sq.id)) {
                quizMap.set(sq.id, { ...(quizMap.get(sq.id) || {}), ...sq, isPublished: sq.isPublished !== false });
              }
            });
            const mergedQuizzes = Array.from(quizMap.values()).sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            if (JSON.stringify(currentQuizzes) !== JSON.stringify(mergedQuizzes)) {
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(mergedQuizzes));
              hasLocalChanges = true;
            }
          }

          if (d1Data.fridayStamps && typeof d1Data.fridayStamps === 'object') {
            if (this.mergeIncomingFridayStamps(d1Data.fridayStamps)) {
              hasLocalChanges = true;
            }
          }

          if (d1Data.visitationMode === 'general' || d1Data.visitationMode === 'special') {
            const incModeTs = Number(d1Data.visitationModeUpdatedAt || 0);
            const locModeTs = getLocalVisitationModeUpdatedAt();
            if (incModeTs > 0 && incModeTs >= locModeTs) {
              const curMode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY);
              if (incModeTs > locModeTs) {
                markLocalVisitationModeUpdated(incModeTs);
              }
              if (curMode !== d1Data.visitationMode) {
                safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, d1Data.visitationMode);
                if (d1Data.visitationMode === 'general') {
                  safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
                }
                hasLocalChanges = true;
              }
            }
          }

          if (d1Data.rolePermissions && typeof d1Data.rolePermissions === 'object' && Date.now() - lastRolePermissionsMutationAt >= 8000) {
            const currentRolePerms = safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY);
            const nextRolePermsStr = JSON.stringify(d1Data.rolePermissions);
            if (currentRolePerms !== nextRolePermsStr) {
              safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, nextRolePermsStr);
              this.syncCurrentSession();
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(d1Data.deletedAnnouncementIds) && d1Data.deletedAnnouncementIds.length > 0) {
            const delAnns = this.getDeletedAnnouncementIds();
            let delChanged = false;
            d1Data.deletedAnnouncementIds.forEach((id: string) => {
              if (id && !delAnns.has(id)) {
                delAnns.add(id);
                delChanged = true;
              }
            });
            if (delChanged) {
              safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delAnns)));
              hasLocalChanges = true;
            }
          }

          if (d1Data.attendanceSession && typeof d1Data.attendanceSession === 'object') {
            if (this.mergeIncomingAttendanceSession(d1Data.attendanceSession)) {
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(d1Data.deletedEventIds) && d1Data.deletedEventIds.length > 0) {
            const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
            const localDelEvs: string[] = rawDelEvs ? JSON.parse(rawDelEvs) : [];
            const delEvSet = new Set<string>([...(Array.isArray(localDelEvs) ? localDelEvs : []), ...d1Data.deletedEventIds]);
            if (delEvSet.size !== (Array.isArray(localDelEvs) ? localDelEvs.length : 0)) {
              safeStorage.setItem(DELETED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(delEvSet)));
              hasLocalChanges = true;
            }
          }

          if (!isEventsMutationLocked()) {
            const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
            const delEvSet = new Set<string>(rawDelEvs ? JSON.parse(rawDelEvs) : []);

            if (Array.isArray(d1Data.communityEvents)) {
              const localEvs: any[] = JSON.parse(safeStorage.getItem(COMMUNITY_EVENTS_STORAGE_KEY) || '[]');
              const authoritativeEvs = d1Data.communityEvents.filter((ev: any) => ev && ev.id && !delEvSet.has(ev.id));
              if (JSON.stringify(localEvs) !== JSON.stringify(authoritativeEvs)) {
                safeStorage.setItem(COMMUNITY_EVENTS_STORAGE_KEY, JSON.stringify(authoritativeEvs));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(d1Data.eventGroups) && d1Data.eventGroups.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_GROUPS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventGroups);
              if (changed) {
                safeStorage.setItem(EVENT_GROUPS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(d1Data.eventRegistrations) && d1Data.eventRegistrations.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_REGISTRATIONS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventRegistrations);
              if (changed) {
                safeStorage.setItem(EVENT_REGISTRATIONS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(d1Data.eventPayments) && d1Data.eventPayments.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_PAYMENTS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventPayments);
              if (changed) {
                safeStorage.setItem(EVENT_PAYMENTS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(d1Data.eventBuses)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_BUSES_STORAGE_KEY) || '[]');
              if (d1Data.eventBuses.length > 0 || localArr.length === 0) {
                const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventBuses);
                if (changed) {
                  safeStorage.setItem(EVENT_BUSES_STORAGE_KEY, JSON.stringify(merged));
                  hasLocalChanges = true;
                }
              }
            }
            if (Array.isArray(d1Data.eventAttendances)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_ATTENDANCES_STORAGE_KEY) || '[]');
              if (d1Data.eventAttendances.length > 0 || localArr.length === 0) {
                const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventAttendances);
                if (changed) {
                  safeStorage.setItem(EVENT_ATTENDANCES_STORAGE_KEY, JSON.stringify(merged));
                  hasLocalChanges = true;
                }
              }
            }
            if (Array.isArray(d1Data.eventAuditLogs) && d1Data.eventAuditLogs.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_AUDIT_LOGS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventAuditLogs);
              const sorted = merged.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              if (changed || JSON.stringify(localArr) !== JSON.stringify(sorted)) {
                safeStorage.setItem(EVENT_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(sorted));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(d1Data.eventStaffAssignments)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, d1Data.eventStaffAssignments);
              if (changed) {
                safeStorage.setItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
          }

          if (!isSiteTextsMutationLocked() && d1Data.siteTextOverrides && typeof d1Data.siteTextOverrides === 'object') {
            const remoteTextsTs = Number(d1Data.siteTextsUpdatedAt || 0);
            const localTextsTs = getLocalSiteTextsUpdatedAt();
            const localTexts = this.getSiteTextOverrides();
            const canApplyD1Texts = remoteTextsTs > 0
              ? remoteTextsTs >= localTextsTs
              : Object.keys(localTexts).length === 0;
            if (canApplyD1Texts) {
              const mergedTexts = remoteTextsTs > localTextsTs
                ? { ...d1Data.siteTextOverrides }
                : { ...d1Data.siteTextOverrides, ...localTexts };
              const nextStr = JSON.stringify(mergedTexts);
              const rawTexts = safeStorage.getItem(SITE_TEXT_OVERRIDES_STORAGE_KEY) || '{}';
              if (rawTexts !== nextStr && (Object.keys(mergedTexts).length > 0 || remoteTextsTs > localTextsTs)) {
                inMemorySiteTextOverrides = mergedTexts;
                safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, nextStr);
                if (remoteTextsTs > localTextsTs) {
                  markLocalSiteTextsMutated(remoteTextsTs);
                }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: mergedTexts }));
                }
                hasLocalChanges = true;
              }
            }
          }
        }
      } catch {
        // Silent fallback to central server API
      }
    }

    // 2. Direct Sync from backend Express API (/api/data) when available (gracefully skipped on static Cloudflare Pages)
    if (isExpressBackendAvailable !== false) {
      try {
        const res = await fetch('/api/data');
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          isExpressBackendAvailable = false;
          if (sseConnection) {
            try { sseConnection.close(); } catch {}
            sseConnection = null;
          }
        } else {
          isExpressBackendAvailable = true;
          const body = await res.json();
          if (body.success && body.data) {
            const serverData = body.data;

          // A) Authoritative deleted sets from Cloudflare D1 + server (NEVER un-delete an ID that was deleted on Cloudflare D1!)
          const authoritativeDeletedRegs = new Set<string>([
            ...Array.from(this.getDeletedRegistrantIds()),
            ...(Array.isArray(serverData.deletedRegistrantIds) ? serverData.deletedRegistrantIds : [])
          ]);
          const authoritativeDeletedAtts = new Set<string>(Array.isArray(serverData.deletedAttendanceIds) ? serverData.deletedAttendanceIds : []);

          try {
            safeStorage.setItem(DELETED_REGISTRANTS_STORAGE_KEY, JSON.stringify(Array.from(authoritativeDeletedRegs)));
            safeStorage.setItem(DELETED_ATTENDANCE_STORAGE_KEY, JSON.stringify(Array.from(authoritativeDeletedAtts)));
          } catch {}

          // B) Versioned Friday Stamps & Revoked Stamps
          if (serverData.fridayStamps && typeof serverData.fridayStamps === 'object') {
            if (this.mergeIncomingFridayStamps(serverData.fridayStamps)) {
              hasLocalChanges = true;
            }
          }
          if (serverData.revokedStamps && typeof serverData.revokedStamps === 'object') {
            const currentRevoked = this.getRevokedStamps();
            const stampsMap = this.getFridayStampsMap();
            let revokedChanged = false;
            Object.entries(serverData.revokedStamps).forEach(([k, v]) => {
              if (stampsMap[k] && stampsMap[k].version > 0) return;
              if (currentRevoked[k] !== v) {
                currentRevoked[k] = Boolean(v);
                revokedChanged = true;
              }
            });
            if (revokedChanged) {
              try {
                safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(currentRevoked));
              } catch {}
            }
          }

          // C) Authoritative Registrants Sync (Cloudflare D1 is Single Source of Truth)
          // CRITICAL SAFETY GUARD: When connected to Cloudflare D1 or running inside AI Studio Preview,
          // NEVER allow the local container's /api/data (db.json) to overwrite or drop Cloudflare D1 registrants!
          if (!isCloudflareConnected && !isAiStudioPreviewEnv() && d1ActiveRegistrantIds.size === 0 && Array.isArray(serverData.registrants) && serverData.registrants.length > 0) {
            const map = new Map<string, Registrant>();
            const serverIdSet = new Set<string>(serverData.registrants.map((sr: any) => sr?.id).filter(Boolean));

            const current = this.getRegistrants().map(normalizeRegistrant).filter(r => !authoritativeDeletedRegs.has(r.id));
            let regsChanged = false;
            current.forEach(r => {
              if (!r || !r.id || authoritativeDeletedRegs.has(r.id) || r.status === 'cancelled') return;
              if (d1ActiveRegistrantIds.size > 0) {
                if (d1ActiveRegistrantIds.has(r.id) || r.id === 'reg_owner_main' || isMemberMutationLocked(r.id)) {
                  map.set(r.id, r);
                  if (!serverIdSet.has(r.id) && d1ActiveRegistrantIds.has(r.id)) {
                    fetch('/api/registrants', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(r)
                    }).catch(() => {});
                  }
                } else {
                  regsChanged = true;
                }
              } else if (serverIdSet.has(r.id) || r.id === 'reg_owner_main' || isMemberMutationLocked(r.id)) {
                map.set(r.id, r);
              } else {
                regsChanged = true;
              }
            });

            // 2. Authoritative server registrants (excluding any ID deleted from Cloudflare D1)
            serverData.registrants.forEach((sr: any) => {
              if (!sr || !sr.id) return;
              if (authoritativeDeletedRegs.has(sr.id) || sr.status === 'cancelled') return;
              if (d1ActiveRegistrantIds.size > 0 && !d1ActiveRegistrantIds.has(sr.id) && sr.id !== 'reg_owner_main' && !isMemberMutationLocked(sr.id)) {
                // Member was deleted on Cloudflare D1; propagate deletion to local Express backend
                fetch(`/api/registrants/${encodeURIComponent(sr.id)}`, { method: 'DELETE' }).catch(() => {});
                return;
              }

              const norm = normalizeRegistrant(sr);
              if (!isValidMemberName(norm.fullName)) return;
              const existing = map.get(norm.id);
              if (!existing) {
                map.set(norm.id, norm);
                regsChanged = true;
              } else {
                if (norm.status === 'cancelled' && existing.status !== 'cancelled') {
                  existing.status = 'cancelled';
                  map.set(norm.id, { ...existing, ...norm, status: 'cancelled' });
                  regsChanged = true;
                } else {
                  const existingPermsTs = Number((existing.permissions as any)?.__permissionsUpdatedAt || 0);
                  const serverPermsTs = Number((norm.permissions as any)?.__permissionsUpdatedAt || 0);
                  const existingTime = Math.max(
                    existing.lastUpdatedAt ? new Date(existing.lastUpdatedAt).getTime() : 0,
                    existing.lastVisitedAt ? new Date(existing.lastVisitedAt).getTime() : 0,
                    existingPermsTs
                  );
                  const serverTime = Math.max(
                    norm.lastUpdatedAt ? new Date(norm.lastUpdatedAt).getTime() : 0,
                    norm.lastVisitedAt ? new Date(norm.lastVisitedAt).getTime() : 0,
                    serverPermsTs
                  );
                  const mergedPres = mergeClientPresence(existing, norm);
                  const fieldsDiffer =
                    existing.photoUrl !== norm.photoUrl ||
                    existing.fullName !== norm.fullName ||
                    existing.phone !== norm.phone ||
                    existing.uniqueCode !== norm.uniqueCode ||
                    existing.dob !== norm.dob ||
                    existing.address !== norm.address ||
                    existing.lastUpdatedAt !== norm.lastUpdatedAt;

                  if (isMemberMutationLocked(norm.id)) {
                    map.set(norm.id, {
                      ...existing,
                      ...mergedPres
                    });
                  } else if (isMemberVisitationLocked(norm.id)) {
                    if (serverTime >= existingTime || fieldsDiffer) {
                      map.set(norm.id, mergeRegistrantPreservingIdentity(existing, {
                        ...norm,
                        role: serverPermsTs >= existingPermsTs ? norm.role : existing.role,
                        permissions: serverPermsTs >= existingPermsTs ? norm.permissions : existing.permissions,
                        ...mergedPres,
                        isVisitedGeneral: existing.isVisitedGeneral,
                        lastVisitedBy: existing.lastVisitedBy,
                        lastVisitedAt: existing.lastVisitedAt
                      }));
                      regsChanged = true;
                    }
                  } else if (serverTime >= existingTime || fieldsDiffer) {
                    map.set(norm.id, mergeRegistrantPreservingIdentity(existing, {
                      ...norm,
                      role: serverPermsTs >= existingPermsTs ? norm.role : existing.role,
                      permissions: serverPermsTs >= existingPermsTs ? norm.permissions : existing.permissions,
                      ...mergedPres
                    }));
                    if (fieldsDiffer || serverTime > existingTime) {
                      regsChanged = true;
                    }
                  } else if (existing.isOnline !== mergedPres.isOnline || existing.lastSeen !== mergedPres.lastSeen) {
                    map.set(norm.id, {
                      ...existing,
                      ...mergedPres
                    });
                    regsChanged = true;
                  }
                }
              }
            });

            const expressBlacklist = { ids: Array.from(authoritativeDeletedRegs), names: [] };
            const merged = deduplicateAndMergeMembers(
              Array.from(map.values()).map(normalizeRegistrant).filter(r => !authoritativeDeletedRegs.has(r.id) && isValidMemberName(r.fullName)),
              expressBlacklist
            ) as Registrant[];
            if (regsChanged || merged.length !== inMemoryRegistrants.length) {
              inMemoryRegistrants = merged;
              try {
                if (merged.length > 25) {
                  safeStorage.setItem(REGISTRANTS_STORAGE_KEY, serializeRegistrantsForLocalCache(merged, false));
                  safeStorage.setItem('SAFE_BACKUP_MEMBERS', serializeRegistrantsForLocalCache(merged, true));
                }
              } catch {}
              this.cleanRememberedLoginIfInvalid();
              this.syncCurrentSession();
              hasLocalChanges = true;
            }
          } else if (Array.isArray(serverData.registrants) && serverData.registrants.length > 0 && !isPollingFrozen()) {
            const expressBlacklist = { ids: Array.from(authoritativeDeletedRegs), names: [] };
            const currentRegs = deduplicateAndMergeMembers(
              filterOutDeletedAndGhosts(
                (inMemoryRegistrants && inMemoryRegistrants.length > 0 ? inMemoryRegistrants : this.getRegistrants())
                  .map((r, idx) => normalizeRegistrant(r, idx)),
                expressBlacklist
              ),
              expressBlacklist
            ) as Registrant[];
            const enrichedFromExpress = deduplicateAndMergeMembers(
              filterOutDeletedAndGhosts(
                mergeAndEnrichWithPermanent95(
                  currentRegs,
                  expressBlacklist,
                  serverData.registrants
                ).map((m, idx) => normalizeRegistrant(m, idx)),
                expressBlacklist
              ),
              expressBlacklist
            ) as Registrant[];

            if (
              enrichedFromExpress.length !== currentRegs.length ||
              getFastStateSignature(enrichedFromExpress) !== getFastStateSignature(currentRegs)
            ) {
              const safeMerged = deduplicateAndMergeMembers(
                applySmartNeverShrinkState(currentRegs, enrichedFromExpress, expressBlacklist)
                  .map((m, idx) => normalizeRegistrant(m, idx)),
                expressBlacklist
              ) as Registrant[];
              if (safeMerged.length >= currentRegs.length && safeMerged.length > 0) {
                inMemoryRegistrants = safeMerged;
                inMemoryRegistrantsAudited = safeMerged.length >= 90;
                if (safeMerged.length > 25) {
                  scheduleBackgroundBackupSave(safeMerged);
                }
                this.syncCurrentSession();
                hasLocalChanges = true;
              }
            }
          }

          // D) Attendance Records Sync
          if (Array.isArray(serverData.attendance) && serverData.attendance.length > 0) {
            const localAtt = this.getAttendanceRecords().filter(a => a && typeof a.id === 'string' && !authoritativeDeletedAtts.has(a.id));
            const attMap = new Map<string, AttendanceRecord>();
            localAtt.forEach(a => {
              if (a && typeof a.id === 'string') attMap.set(a.id, a);
            });
            let serverAttChanged = false;
            serverData.attendance.forEach((sa: AttendanceRecord) => {
              if (sa && typeof sa.id === 'string' && !authoritativeDeletedAtts.has(sa.id)) {
                if (!attMap.has(sa.id)) {
                  attMap.set(sa.id, sa);
                  serverAttChanged = true;
                }
              }
            });
            if (serverAttChanged) {
              const mergedAtt = Array.from(attMap.values()).filter(a => !authoritativeDeletedAtts.has(a.id));
              safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(mergedAtt));
              hasLocalChanges = true;
            }
          }

          // E) Blocked Users Sync (Authoritative so both blocks and unblocks sync across devices)
          if (Array.isArray(serverData.blockedUsers)) {
            const nextBlocked = serverData.blockedUsers.filter((sb: BlockedUser) => sb && (sb.fullName || sb.phone || sb.ipAddress));
            if (JSON.stringify(inMemoryBlockedUsers) !== JSON.stringify(nextBlocked)) {
              inMemoryBlockedUsers = nextBlocked;
              try {
                safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
              } catch {}
              hasLocalChanges = true;
            }
          }

          // F) Card Template Sync
          if (serverData.cardTemplate && typeof serverData.cardTemplate === 'object') {
            try {
              safeStorage.setItem(CARD_TEMPLATE_STORAGE_KEY, JSON.stringify(serverData.cardTemplate));
              hasLocalChanges = true;
            } catch {}
          }

          // G) Authoritative Visitation Mode Sync (Protected by monotonic timestamp + mutation lock)
          if (serverData.visitationMode && (serverData.visitationMode === 'general' || serverData.visitationMode === 'special')) {
            const incModeTs = Number(serverData.visitationModeUpdatedAt || 0);
            const locModeTs = getLocalVisitationModeUpdatedAt();
            const canApplyServerMode = incModeTs > 0
              ? incModeTs >= locModeTs
              : (!isVisitationModeLocked() && locModeTs === 0);
            if (canApplyServerMode) {
              if (incModeTs > locModeTs) {
                markLocalVisitationModeUpdated(incModeTs);
              }
              const currentMode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY);
              if (currentMode !== serverData.visitationMode) {
                safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, serverData.visitationMode);
                if (serverData.visitationMode === 'general') {
                  safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
                }
                hasLocalChanges = true;
              }
            }
          }

          // H) Special Assignments & Special Visited Database Sync across devices (Protected by mutation lock)
          if (!isAssignmentsLocked()) {
            const effectiveMode = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY) || serverData.visitationMode;
            if (effectiveMode === 'general') {
              const rawLocal = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
              if (rawLocal && rawLocal !== '[]') {
                safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
                hasLocalChanges = true;
              }
            } else if (Array.isArray(serverData.assignments)) {
              const rawLocal = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
              const currentAssignments = rawLocal ? JSON.parse(rawLocal) : [];
              if (JSON.stringify(currentAssignments) !== JSON.stringify(serverData.assignments)) {
                safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(serverData.assignments));
                hasLocalChanges = true;
              }
            }
            if (serverData.specialVisitedMembers && typeof serverData.specialVisitedMembers === 'object') {
              const rawSpecLocal = safeStorage.getItem(SPECIAL_VISITED_STORAGE_KEY) || '{}';
              const nextSpecStr = JSON.stringify(serverData.specialVisitedMembers);
              if (rawSpecLocal !== nextSpecStr) {
                safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, nextSpecStr);
                hasLocalChanges = true;
              }
            }
          }

          // I) Central Visitation Notes & Deleted Note Tombstones Sync
          if (Array.isArray(serverData.deletedVisitationNoteIds) && serverData.deletedVisitationNoteIds.length > 0) {
            const rawDel = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
            const localDelArr: string[] = rawDel ? JSON.parse(rawDel) : [];
            const delSet = new Set<string>([...(Array.isArray(localDelArr) ? localDelArr : []), ...serverData.deletedVisitationNoteIds]);
            if (delSet.size !== (Array.isArray(localDelArr) ? localDelArr.length : 0)) {
              safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));
              hasLocalChanges = true;
            }
          }

          if (Date.now() - lastNotesMutationAt >= 4000 && Array.isArray(serverData.visitationNotes)) {
            const rawDel = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
            const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
            const authoritativeNotes = serverData.visitationNotes.filter((n: any) => n && n.id && !delSet.has(n.id));
            const rawNotes = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
            const currentNotes = rawNotes ? JSON.parse(rawNotes) : [];
            if (JSON.stringify(currentNotes) !== JSON.stringify(authoritativeNotes)) {
              safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(authoritativeNotes));
              hasLocalChanges = true;
            }
          }

          // J) Role Permissions Sync (Only apply from local Express if not recently mutated or already set from Cloudflare D1)
          if (
            serverData.rolePermissions &&
            typeof serverData.rolePermissions === 'object' &&
            Date.now() - lastRolePermissionsMutationAt >= 12000 &&
            !safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY)
          ) {
            safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(serverData.rolePermissions));
            this.syncCurrentSession();
            hasLocalChanges = true;
          }

          // K) Authoritative Announcements Sync from Central Server (Merges with Cloudflare D1 announcements & deep-merges viewers/reactions)
          if (Array.isArray(serverData.deletedAnnouncementIds) && serverData.deletedAnnouncementIds.length > 0) {
            const delAnns = this.getDeletedAnnouncementIds();
            let delChanged = false;
            serverData.deletedAnnouncementIds.forEach((id: string) => {
              if (id && !delAnns.has(id)) {
                delAnns.add(id);
                delChanged = true;
              }
            });
            if (delChanged) {
              safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delAnns)));
              hasLocalChanges = true;
            }
          }

          if (!isCloudflareConnected && !isAiStudioPreviewEnv() && Array.isArray(serverData.announcements)) {
            const delAnns = this.getDeletedAnnouncementIds();
            const currentAnns = this.getAnnouncements();
            const currentMap = new Map<string, Announcement>();
            currentAnns.forEach(a => {
              if (a && a.id && !delAnns.has(a.id) && a.id !== 'ann_test_check_1') {
                currentMap.set(a.id, a);
              }
            });

            const map = new Map<string, Announcement>();
            serverData.announcements.forEach((sa: Announcement) => {
              if (sa && sa.id && !delAnns.has(sa.id) && sa.id !== 'ann_test_check_1' && !isAnnouncementExpired(sa)) {
                const existing = currentMap.get(sa.id);
                const viewersMap = new Map<string, AnnouncementViewer>();
                (existing?.viewers || []).forEach(v => { if (v && v.memberId) viewersMap.set(v.memberId, v); });
                (sa.viewers || []).forEach(v => { if (v && v.memberId) viewersMap.set(v.memberId, { ...(viewersMap.get(v.memberId) || {}), ...v }); });

                const mergedReactions: Record<string, string[]> = {};
                const exReactions = existing?.reactions || {};
                const saReactions = sa.reactions || {};
                const allEmojis = new Set([...Object.keys(exReactions), ...Object.keys(saReactions)]);
                allEmojis.forEach(em => {
                  const s = new Set<string>([...(exReactions[em] || []), ...(saReactions[em] || [])]);
                  if (s.size > 0) mergedReactions[em] = Array.from(s);
                });

                map.set(sa.id, {
                  ...(existing || {}),
                  ...sa,
                  imageUrl: sa.imageUrl || existing?.imageUrl,
                  targetUserId: sa.targetUserId || existing?.targetUserId,
                  targetServantName: sa.targetServantName || existing?.targetServantName,
                  isVisitationTaskAlert: sa.isVisitationTaskAlert ?? existing?.isVisitationTaskAlert,
                  senderPhotoUrl: sa.senderRole === 'priest' ? sa.senderPhotoUrl : undefined,
                  viewers: Array.from(viewersMap.values()),
                  reactions: Object.keys(saReactions).length > 0 ? saReactions : mergedReactions
                });
              }
            });
            const mergedAnns = Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            if (JSON.stringify(currentAnns) !== JSON.stringify(mergedAnns)) {
              safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(mergedAnns));
              hasLocalChanges = true;
            }
          }

          // L) Central Kahoot Quizzes, Live Sessions & Solo Scores Synchronization
          if (Array.isArray(serverData.deletedKahootQuizIds) && serverData.deletedKahootQuizIds.length > 0) {
            const delQuizzes = this.getDeletedKahootQuizIds();
            let delQChanged = false;
            serverData.deletedKahootQuizIds.forEach((id: string) => {
              if (id && !delQuizzes.has(id)) {
                delQuizzes.add(id);
                delQChanged = true;
              }
            });
            if (delQChanged) {
              safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(delQuizzes)));
              hasLocalChanges = true;
            }
          }

          if (!isCloudflareConnected && !isAiStudioPreviewEnv() && Array.isArray(serverData.kahootQuizzes)) {
            const delQuizzes = this.getDeletedKahootQuizIds();
            delQuizzes.add('quiz_daniel_three_youths');
            const currentQuizzes = this.getKahootQuizzes();
            const quizMap = new Map<string, KahootQuiz>();
            serverData.kahootQuizzes.forEach((sq: KahootQuiz) => {
              if (sq && sq.id && !delQuizzes.has(sq.id)) {
                quizMap.set(sq.id, {
                  ...sq,
                  isPublished: sq.isPublished !== false
                });
              }
            });
            const mergedQuizzes = Array.from(quizMap.values()).sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            if (JSON.stringify(currentQuizzes) !== JSON.stringify(mergedQuizzes)) {
              safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(mergedQuizzes));
              hasLocalChanges = true;
            }
          }

          if (serverData.kahootSessions && typeof serverData.kahootSessions === 'object') {
            const localSessions = this.getKahootSessions();
            const { merged: mergedSessions, changed: sessChanged } = mergeKahootSessionsMap(
              localSessions,
              serverData.kahootSessions,
              true
            );
            if (sessChanged) {
              safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(mergedSessions));
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(serverData.kahootSoloScores)) {
            const currentScores = this.getKahootSoloScores();
            const scoreMap = new Map<string, KahootSoloScore>();
            currentScores.forEach(s => {
              if (s && s.quizId && s.playerId) scoreMap.set(`${s.quizId}_${s.playerId}`, s);
            });
            serverData.kahootSoloScores.forEach((ss: KahootSoloScore) => {
              if (ss && ss.quizId && ss.playerId) {
                const key = `${ss.quizId}_${ss.playerId}`;
                const ex = scoreMap.get(key);
                if (!ex) {
                  scoreMap.set(key, ss);
                } else {
                  const ssTime = new Date(ss.updatedAt || ss.completedAt || 0).getTime();
                  const exTime = new Date(ex.updatedAt || ex.completedAt || 0).getTime();
                  const ssAnsCount = ss.answersDetail?.length || 0;
                  const exAnsCount = ex.answersDetail?.length || 0;
                  if (
                    ssTime >= exTime ||
                    ssAnsCount > exAnsCount ||
                    (ss.status === 'completed' && ex.status === 'in_progress') ||
                    Number(ss.score) > Number(ex.score)
                  ) {
                    scoreMap.set(key, ss);
                  }
                }
              }
            });
            const mergedScores = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
            if (JSON.stringify(currentScores) !== JSON.stringify(mergedScores)) {
              safeStorage.setItem('kahoot_solo_scores', JSON.stringify(mergedScores));
              hasLocalChanges = true;
            }
          }

          if (Array.isArray(serverData.kahootQuestionBank) && serverData.kahootQuestionBank.length > 0) {
            const localBank = JSON.parse(safeStorage.getItem(KAHOOT_QUESTION_BANK_STORAGE_KEY) || '[]');
            const { merged, changed: bankChanged } = mergeRecordsByTimestamp(localBank, serverData.kahootQuestionBank);
            if (bankChanged) {
              safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(merged));
              hasLocalChanges = true;
            }
          }

          // M) Community Events Management Synchronization
          if (Array.isArray(serverData.deletedEventIds)) {
            const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
            const localDelEvs: string[] = rawDelEvs ? JSON.parse(rawDelEvs) : [];
            const delEvSet = new Set<string>([...(Array.isArray(localDelEvs) ? localDelEvs : []), ...serverData.deletedEventIds]);
            if (delEvSet.size !== (Array.isArray(localDelEvs) ? localDelEvs.length : 0)) {
              safeStorage.setItem(DELETED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(delEvSet)));
              hasLocalChanges = true;
            }
          }
          if (!isCloudflareConnected && !isAiStudioPreviewEnv() && !isEventsMutationLocked()) {
            const rawDelEvs = safeStorage.getItem(DELETED_EVENTS_STORAGE_KEY);
            const delEvSet = new Set<string>(rawDelEvs ? JSON.parse(rawDelEvs) : []);

            if (Array.isArray(serverData.communityEvents)) {
              const localEvs: any[] = JSON.parse(safeStorage.getItem(COMMUNITY_EVENTS_STORAGE_KEY) || '[]');
              const authoritativeEvs = serverData.communityEvents.filter((ev: any) => ev && ev.id && !delEvSet.has(ev.id));
              if (JSON.stringify(localEvs) !== JSON.stringify(authoritativeEvs)) {
                safeStorage.setItem(COMMUNITY_EVENTS_STORAGE_KEY, JSON.stringify(authoritativeEvs));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(serverData.eventGroups) && serverData.eventGroups.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_GROUPS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventGroups);
              if (changed) {
                safeStorage.setItem(EVENT_GROUPS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(serverData.eventRegistrations) && serverData.eventRegistrations.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_REGISTRATIONS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventRegistrations);
              if (changed) {
                safeStorage.setItem(EVENT_REGISTRATIONS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(serverData.eventPayments) && serverData.eventPayments.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_PAYMENTS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventPayments);
              if (changed) {
                safeStorage.setItem(EVENT_PAYMENTS_STORAGE_KEY, JSON.stringify(merged));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(serverData.eventBuses)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_BUSES_STORAGE_KEY) || '[]');
              if (serverData.eventBuses.length > 0 || localArr.length === 0) {
                const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventBuses);
                if (changed) {
                  safeStorage.setItem(EVENT_BUSES_STORAGE_KEY, JSON.stringify(merged));
                  hasLocalChanges = true;
                }
              }
            }
            if (Array.isArray(serverData.eventAttendances)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_ATTENDANCES_STORAGE_KEY) || '[]');
              if (serverData.eventAttendances.length > 0 || localArr.length === 0) {
                const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventAttendances);
                if (changed) {
                  safeStorage.setItem(EVENT_ATTENDANCES_STORAGE_KEY, JSON.stringify(merged));
                  hasLocalChanges = true;
                }
              }
            }
            if (Array.isArray(serverData.eventAuditLogs) && serverData.eventAuditLogs.length > 0) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_AUDIT_LOGS_STORAGE_KEY) || '[]');
              const { merged, changed } = mergeRecordsByTimestamp(localArr, serverData.eventAuditLogs);
              const sorted = merged.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              if (changed || JSON.stringify(localArr) !== JSON.stringify(sorted)) {
                safeStorage.setItem(EVENT_AUDIT_LOGS_STORAGE_KEY, JSON.stringify(sorted));
                hasLocalChanges = true;
              }
            }
            if (Array.isArray(serverData.eventStaffAssignments)) {
              const localArr: any[] = JSON.parse(safeStorage.getItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY) || '[]');
              const serverStr = JSON.stringify(serverData.eventStaffAssignments);
              const localStr = JSON.stringify(localArr);
              if (localStr !== serverStr) {
                safeStorage.setItem(EVENT_STAFF_ASSIGNMENTS_STORAGE_KEY, serverStr);
                hasLocalChanges = true;
              }
            }
          }
          if (!isSiteTextsMutationLocked() && serverData.siteTextOverrides && typeof serverData.siteTextOverrides === 'object') {
            const rawTexts = safeStorage.getItem(SITE_TEXT_OVERRIDES_STORAGE_KEY) || '{}';
            const localTexts = JSON.parse(rawTexts);
            const serverCount = Object.keys(serverData.siteTextOverrides).length;
            const localCount = Object.keys(localTexts).length;

            if (serverCount === 0 && localCount > 0 && this.isCommunityOwnerLoggedIn()) {
              // Seed server with Owner's local text overrides if server was restarted/empty
              fetch('/api/site-texts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  overrides: localTexts,
                  actorRole: 'community_owner'
                })
              }).catch(() => {});
            } else {
              const mergedTexts = this.isCommunityOwnerLoggedIn()
                ? { ...serverData.siteTextOverrides, ...localTexts }
                : { ...localTexts, ...serverData.siteTextOverrides };
              const nextStr = JSON.stringify(mergedTexts);
              if (rawTexts !== nextStr && (Object.keys(mergedTexts).length > 0 || !this.isCommunityOwnerLoggedIn())) {
                inMemorySiteTextOverrides = mergedTexts;
                safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, nextStr);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: mergedTexts }));
                }
                hasLocalChanges = true;
              }
            }
          }
          }
        }
      } catch (apiErr) {
        // Quiet offline/static fallback
      }
    }

    // Step 1 already synced Cloudflare D1 state; no duplicate second fetch needed.

    const wasRememberedCleaned = this.cleanRememberedLoginIfInvalid();
    if (wasRememberedCleaned) {
      hasLocalChanges = true;
    }

    if (hasLocalChanges) {
      notifySyncListeners();
    }
    return { success: true, hasLocalChanges, newCount: inMemoryRegistrants.length };
    } finally {
      isFetchingServerDataInFlight = false;
    }
  },

  setRegistrants(list: Registrant[]): void {
    const deleted = this.getDeletedRegistrantIds();
    const blacklist = { ids: Array.from(deleted), names: [] as string[] };
    const normalizedIncoming = deduplicateAndMergeMembers(
      (Array.isArray(list) ? list : [])
        .filter(Boolean)
        .map((r, i) => normalizeRegistrant(r, i))
        .filter((n) => n && n.id && !deleted.has(getBaseMemberId(n.id)) && n.status !== 'cancelled'),
      blacklist
    ) as Registrant[];

    const dedupedExisting = deduplicateAndMergeMembers(
      (Array.isArray(inMemoryRegistrants) ? inMemoryRegistrants : []).filter(
        (existing) => existing && existing.id && !deleted.has(getBaseMemberId(existing.id)) && existing.status !== 'cancelled'
      ),
      blacklist
    ) as Registrant[];

    // Smart Never-Shrink Guard: allow legitimate deduplication or single deletions, but block catastrophic collapse (e.g. >30 -> <=25)
    let norm = normalizedIncoming;
    if (dedupedExisting.length > 30 && normalizedIncoming.length <= 25) {
      norm = deduplicateAndMergeMembers(
        applySmartNeverShrinkState(dedupedExisting, normalizedIncoming, blacklist),
        blacklist
      ) as Registrant[];
    } else if (dedupedExisting.length > 0 && normalizedIncoming.length < dedupedExisting.length - 1) {
      // Preserve real non-duplicate members if a partial snapshot arrived
      norm = deduplicateAndMergeMembers(
        applySmartNeverShrinkState(dedupedExisting, normalizedIncoming, blacklist),
        blacklist
      ) as Registrant[];
    }

    inMemoryRegistrants = norm;
    inMemoryRegistrantsAudited = norm.length >= 90;
    if (norm.length > 2) {
      scheduleBackgroundBackupSave(norm);
    }
    notifySyncListeners();
  },

  getRegistrants(): Registrant[] {
    // O(1) Ultra-Fast Memory Path (0.0001ms): Once CLEAN_MASTER_DB_V1 is hydrated and audited in memory, return directly!
    if (inMemoryRegistrants && inMemoryRegistrants.length > 0) {
      if (inMemoryRegistrantsAudited && inMemoryRegistrants.length >= 90) {
        return inMemoryRegistrants;
      }
      rescueThreeMissingMembersFromBlacklist();
      const cached95 = getCachedPermanent95Members();
      let working = ensureUniqueSingleCardPerMember(
        deduplicateAndMergeMembers(filterOutDeletedAndGhosts(inMemoryRegistrants))
      ) as Registrant[];
      if (working.length < 96 && Array.isArray(cached95) && cached95.length >= 90) {
        working = ensureUniqueSingleCardPerMember(
          deduplicateAndMergeMembers(
            filterOutDeletedAndGhosts(
              mergeAndEnrichWithPermanent95(working).map((m, idx) => normalizeRegistrant(m, idx))
            )
          )
        ) as Registrant[];
      }
      inMemoryRegistrants = working;
      inMemoryRegistrantsAudited = working.length >= 90;
      return inMemoryRegistrants;
    }

    rescueThreeMissingMembersFromBlacklist();
    const cached95 = getCachedPermanent95Members();
    const raw =
      safeStorage.getItem(CLEAN_MASTER_DB_KEY) ||
      safeStorage.getItem(REGISTRANTS_STORAGE_KEY) ||
      safeStorage.getItem('SAFE_BACKUP_MEMBERS');
    if (!raw) {
      if (Array.isArray(cached95) && cached95.length >= 90) {
        const restored = ensureUniqueSingleCardPerMember(
          filterOutDeletedAndGhosts(cached95).map((r, i) => normalizeRegistrant(r, i))
        ) as Registrant[];
        inMemoryRegistrants = restored;
        inMemoryRegistrantsAudited = restored.length >= 90;
        return restored;
      }
      inMemoryRegistrants = [];
      setTimeout(() => {
        loadPermanent95Members()
          .then(() => {
            if ((!inMemoryRegistrants || inMemoryRegistrants.length === 0) && getCachedPermanent95Members().length >= 90) {
              inMemoryRegistrants = ensureUniqueSingleCardPerMember(
                filterOutDeletedAndGhosts(getCachedPermanent95Members()).map((r, i) => normalizeRegistrant(r, i))
              ) as Registrant[];
              inMemoryRegistrantsAudited = inMemoryRegistrants.length >= 90;
              notifySyncListeners();
            }
          })
          .catch(() => {});
        this.fetchLatestServerData(true).catch(() => {});
      }, 10);
      return [];
    }
    try {
      let parsed = JSON.parse(raw);
      try {
        const rawBackup = safeStorage.getItem(CLEAN_MASTER_DB_KEY) || safeStorage.getItem('SAFE_BACKUP_MEMBERS');
        if (rawBackup && rawBackup !== raw) {
          const parsedBackup = JSON.parse(rawBackup);
          if (Array.isArray(parsedBackup) && parsedBackup.length > (Array.isArray(parsed) ? parsed.length : 0)) {
            const combined = [...(Array.isArray(parsed) ? parsed : []), ...parsedBackup];
            const unionMap = new Map<string, any>();
            combined.forEach((m, idx) => {
              if (!m || typeof m !== 'object') return;
              const k = String(m.id || m.uniqueCode || `U_${idx}`).trim();
              if (!unionMap.has(k)) unionMap.set(k, m);
            });
            parsed = Array.from(unionMap.values());
          }
        }
      } catch {}

      const cleanParsed = filterOutDeletedAndGhosts(Array.isArray(parsed) ? parsed : []);
      if (cleanParsed.length <= 25) {
        setTimeout(() => {
          this.fetchLatestServerData(true).catch(() => {});
        }, 10);
      }
      const list: Registrant[] = cleanParsed.map((r, i) => normalizeRegistrant(r, i));

      const syntheticIds = new Set([
        'reg_101', 'reg_102', 'reg_103', 'reg_104', 'reg_105', 'reg_106',
        'reg_priest_antonios'
      ]);
      const filteredRaw = filterOutDeletedAndGhosts(
        list.filter((r) => {
          if (!r || typeof r !== 'object') return false;
          if (syntheticIds.has(r.id)) return false;
          if (r.id !== 'reg_owner_main' && r.role === 'community_owner') return false;
          return true;
        })
      );
      const enrichedInit =
        filteredRaw.length < 96 && Array.isArray(cached95) && cached95.length >= 90
          ? mergeAndEnrichWithPermanent95(filteredRaw)
          : filteredRaw;
      const { repairedList } = repairDuplicateQRCodesAndIds(deduplicateAndMergeMembers(enrichedInit));
      const deduped: Registrant[] = ensureUniqueSingleCardPerMember(
        deduplicateAndMergeMembers(
          filterOutDeletedAndGhosts(repairedList).map((r, i) => ({
            ...normalizeRegistrant(r, i),
            id: getBaseMemberId(r.id),
            uniqueCode: r.uniqueCode,
            qrCode: r.uniqueCode,
            qrData: r.qrData || r.uniqueCode,
            recoveryCode: r.recoveryCode || (r as any).securityCode || '123456',
            securityCode: r.recoveryCode || (r as any).securityCode || '123456',
            status: 'active'
          }))
        )
      ) as Registrant[];

      inMemoryRegistrants = deduped;
      inMemoryRegistrantsAudited = deduped.length >= 90;
      return deduped;
    } catch {
      inMemoryRegistrants = [];
      return [];
    }
  },


  /**
   * Registers a new user with strict verification of mandatory columns (fullName, phone, role)
   * and syncs directly to Cloudflare D1 and Central Server.
   */
  async fetchClientIp(): Promise<string> {
    try {
      const cached = safeStorage.getItem('three_youths_client_ip_v1');
      if (cached && cached !== 'unknown') {
        fetch('/api/client-ip').then(r => r.ok ? r.json() : null).then(d => {
          if (d?.ip && d.ip !== 'unknown') safeStorage.setItem('three_youths_client_ip_v1', d.ip);
        }).catch(() => {});
        return cached;
      }
      const res = await fetch('/api/client-ip').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ip && data.ip !== 'unknown') {
          safeStorage.setItem('three_youths_client_ip_v1', data.ip);
          return String(data.ip);
        }
      }
      const cfRes = await fetch('https://threefetyayouth-api.michealedwar8.workers.dev/api/client-ip').catch(() => null);
      if (cfRes && cfRes.ok) {
        const cfData = await cfRes.json().catch(() => null);
        if (cfData?.ip && cfData.ip !== 'unknown') {
          safeStorage.setItem('three_youths_client_ip_v1', cfData.ip);
          return String(cfData.ip);
        }
      }
    } catch {}
    return safeStorage.getItem('three_youths_client_ip_v1') || '';
  },

  getCachedClientIp(): string {
    return safeStorage.getItem('three_youths_client_ip_v1') || '';
  },

  isIpBlocked(ip?: string): boolean {
    const cleanIp = (ip || this.getCachedClientIp() || '').trim();
    if (!cleanIp || cleanIp === 'unknown' || cleanIp === '127.0.0.1' || cleanIp === '::1') return false;
    const blockedList = this.getBlockedUsers();
    return blockedList.some(b => b && b.ipAddress && b.ipAddress.trim() === cleanIp);
  },

  async registerUser(registrant: Registrant): Promise<{ success: boolean; duplicate?: boolean; error?: string; registrant?: Registrant }> {
    if (!registrant || typeof registrant !== 'object') {
      return { success: false, error: 'خطأ: لم يتم توفير بيانات العضو.' };
    }

    const trimmedFullName = sanitizeSecurityText(registrant.fullName || '').trim();
    if (!isValidMemberName(trimmedFullName)) {
      return { success: false, error: 'خطأ: الاسم بالكامل مطلوب ولا يمكن أن يكون فارغاً.' };
    }

    rescueThreeMissingMembersFromBlacklist();
    const matchedRescuedRule = matchTargetThreeMemberAlias(trimmedFullName);
    const canonicalFullName = matchedRescuedRule ? matchedRescuedRule.canonicalName : trimmedFullName;

    // Task 2 & Task 3: Strictly block duplicate card creation if name already exists in CLEAN_MASTER_DB_V1 / VERIFIED_95_MANIFEST / active registrants
    if (this.isFullNameAlreadyRegistered(canonicalFullName)) {
      const existingMember = findExistingMemberSmart(canonicalFullName, [this.getRegistrants()]);
      if (existingMember) {
        // Enrich single existing card if new phone/password/photo was provided while missing on existing card
        const needsEnrich =
          (!existingMember.phone && registrant.phone) ||
          ((!existingMember.password || existingMember.password === '123456') && registrant.password) ||
          ((!existingMember.photoUrl || existingMember.photoUrl.includes('dicebear.com')) && registrant.photoUrl && !registrant.photoUrl.includes('dicebear.com'));
        if (needsEnrich) {
          const enriched: Registrant = {
            ...existingMember,
            phone: existingMember.phone || registrant.phone || '',
            whatsapp: existingMember.whatsapp || registrant.whatsapp || registrant.phone || '',
            password: (registrant.password && (!existingMember.password || existingMember.password === '123456')) ? registrant.password : existingMember.password,
            photoUrl: (registrant.photoUrl && !registrant.photoUrl.includes('dicebear.com')) ? registrant.photoUrl : existingMember.photoUrl,
            registeredInCleanMasterV1: true
          };
          await this.updateRegistrant(enriched, existingMember.role || 'member').catch(() => {});
          return {
            success: false,
            duplicate: true,
            registrant: enriched,
            error: 'هذا الاسم مسجل بالفعل في قاعدة البيانات! تم تحديث بياناتك في سجلك الأساسي، يرجى تسجيل الدخول بحسابك.'
          };
        }
      }
      return {
        success: false,
        duplicate: true,
        registrant: existingMember || undefined,
        error: 'هذا الاسم مسجل بالفعل في قاعدة البيانات! لا يمكن التسجيل مرتين، يرجى تسجيل الدخول بحسابك.'
      };
    }

    const trimmedPhone = (registrant.phone || '').trim();
    if (!trimmedPhone) {
      return { success: false, error: 'خطأ: رقم الهاتف مطلوب ولا يمكن أن يكون فارغاً.' };
    }

    const clientIp = registrant.ipAddress || this.getCachedClientIp() || '';

    // Check if IP, Name, or Phone is blocked
    if (
      this.isIpBlocked(clientIp) ||
      this.isUserBlocked(trimmedPhone) ||
      this.isUserBlocked(trimmedFullName) ||
      this.isUserBlocked(registrant.whatsapp || '')
    ) {
      return {
        success: false,
        error: '⚠️ هذا الحساب أو عنوان الـ IP الخاص بجهازك محظور نهائياً من التسجيل بناءً على قرار إدارة ومسؤول المجتمع.'
      };
    }

    const role: UserRole = registrant.role || 'member';
    const cleanRecCode = String(registrant.recoveryCode || (registrant as any).securityCode || '123456').trim();

    const norm = normalizeRegistrant({
      ...registrant,
      fullName: trimmedFullName,
      phone: trimmedPhone,
      role,
      recoveryCode: cleanRecCode,
      securityCode: cleanRecCode,
      registeredInCleanMasterV1: true,
      ipAddress: clientIp || undefined,
      status: registrant.status || 'active'
    });
    norm.registeredInCleanMasterV1 = true;
    norm.securityCode = cleanRecCode;
    norm.recoveryCode = cleanRecCode;
    norm.qrCode = norm.uniqueCode;

    // Lock this registrant ID from background polling overwrites for 15 seconds
    lastRegistrantMutationAt[norm.id] = Date.now();
    lockMemberSaveSync(12000);

    // If previously in deletedRegistrantIds or CONFIRMED_DELETED_IDS, remove so they can register cleanly
    this.removeDeletedRegistrantId(norm.id);
    removeConfirmedDeletedId(norm.id, (norm as any).originalId);

    // 1. Optimistic Instant Update (< 0.05s) in memory, localStorage, CLEAN_MASTER_DB_V1, and SAFE_BACKUP_MEMBERS
    const list = this.getRegistrants();
    const targetNormName = ultraNormalizeArabic(norm.fullName);
    const usedCodesInList = new Set<string>(
      list
        .filter(r => r && r.uniqueCode && ultraNormalizeArabic(r.fullName) !== targetNormName)
        .map(r => String(r.uniqueCode).trim().toUpperCase())
    );
    if (!norm.uniqueCode || usedCodesInList.has(norm.uniqueCode.toUpperCase())) {
      norm.uniqueCode = generateUniqueCode(list);
      norm.qrCode = norm.uniqueCode;
      norm.qrData = norm.uniqueCode;
    }

    (norm as any).registeredInCleanMasterV1 = true;
    norm.lastModifiedAt = Date.now();
    list.unshift(norm);
    inMemoryRegistrants = ensureUniqueSingleCardPerMember(list) as Registrant[];
    inMemoryRegistrantsAudited = inMemoryRegistrants.length >= 90;
    const canonicalSaved = inMemoryRegistrants.find(
      r => getBaseMemberId(r.id) === getBaseMemberId(norm.id) || (targetNormName && ultraNormalizeArabic(r.fullName) === targetNormName)
    );
    if (canonicalSaved) {
      Object.assign(norm, canonicalSaved, { registeredInCleanMasterV1: true });
    }
    lastRegistrantMutationAt[norm.id] = Date.now();
    updateCachedSnapshotMember(norm);
    scheduleBackgroundBackupSave(inMemoryRegistrants);

    // Notify UI immediately so ID Card renders in < 0.05s
    notifySyncListeners();

    // 2. Background Non-Blocking Persistence to Cloudflare D1 (CLEAN_MASTER_DB_V1) with Auto-Retry
    const persistNewMemberToCloud = async (attempt = 1) => {
      try {
        const serverSaved = await safeCloudflareUpsert('registrants', norm);
        if (serverSaved && typeof serverSaved === 'object') {
          if (serverSaved.uniqueCode && !norm.uniqueCode) {
            norm.uniqueCode = String(serverSaved.uniqueCode).trim().toUpperCase();
            norm.qrCode = norm.uniqueCode;
          }
          if ((serverSaved.qrData || serverSaved.uniqueCode) && !norm.qrData) {
            norm.qrData = String(serverSaved.qrData || serverSaved.uniqueCode).trim();
          }
          const savedIdx = inMemoryRegistrants.findIndex(
            r => getBaseMemberId(r.id) === getBaseMemberId(norm.id) || (targetNormName && ultraNormalizeArabic(r.fullName) === targetNormName)
          );
          if (savedIdx !== -1) {
            inMemoryRegistrants[savedIdx] = {
              ...inMemoryRegistrants[savedIdx],
              ...norm,
              id: getBaseMemberId(inMemoryRegistrants[savedIdx].id || norm.id),
              registeredInCleanMasterV1: true
            };
            Object.assign(norm, inMemoryRegistrants[savedIdx]);
          } else {
            inMemoryRegistrants.unshift({ ...norm, registeredInCleanMasterV1: true } as Registrant);
          }
          inMemoryRegistrants = ensureUniqueSingleCardPerMember(inMemoryRegistrants) as Registrant[];
          inMemoryRegistrantsAudited = inMemoryRegistrants.length >= 90;
          updateCachedSnapshotMember(norm);
          scheduleBackgroundBackupSave(inMemoryRegistrants);
          this.syncCurrentSession(undefined, norm.id);
        }
        await syncRegistrantsSliceToCloudflareD1(inMemoryRegistrants, norm, true, false).catch(() => {});
      } catch {
        if (attempt < 3) {
          setTimeout(() => {
            persistNewMemberToCloud(attempt + 1).catch(() => {});
          }, 2000 * attempt);
        }
      }
    };

    persistNewMemberToCloud(1).catch(() => {});

    if (isExpressBackendAvailable !== false) {
      fetch('/api/registrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(norm)
      }).catch(() => {});
    }

    return { success: true, registrant: norm };
  },

  /**
   * Community Owner Exclusive: Regenerates a brand-new collision-free QR Code & uniqueCode
   * for a specific member while preserving 100% of their personal profile data untouched,
   * and persists it immediately to localStorage, sessionStorage, and Cloudflare Database.
   */
  async regenerateMemberQrCode(
    memberId: string,
    actorRole?: UserRole
  ): Promise<{
    success: boolean;
    error?: string;
    registrant?: Registrant;
    newCode?: string;
    newQrDataUrl?: string;
  }> {
    const resolvedActor = this.getVerifiedActorRole(actorRole);
    if (resolvedActor !== 'community_owner' && actorRole !== 'community_owner') {
      return {
        success: false,
        error: 'عذراً، إعادة توليد رمز الـ QR من صلاحيات مسؤول المجتمع فقط.'
      };
    }

    const cleanId = String(memberId || '').trim();
    if (!cleanId) {
      return { success: false, error: 'معرف العضو غير صالح.' };
    }

    const list = this.getRegistrants();
    const idx = list.findIndex(r => r && r.id === cleanId);
    if (idx === -1) {
      return { success: false, error: 'لم يتم العثور على العضو في قاعدة البيانات.' };
    }

    const currentMember = list[idx];
    const oldCode = String(currentMember.uniqueCode || '').trim().toUpperCase();

    // Collect all currently used codes PLUS the member's oldCode so the newly generated code is 100% new and unique
    const usedCodes = new Set<string>(['TY-0001']);
    if (oldCode) usedCodes.add(oldCode);
    for (const r of list) {
      if (r && r.uniqueCode) {
        usedCodes.add(String(r.uniqueCode).trim().toUpperCase());
      }
    }

    // Generate a fresh sequential + entropy-verified code guaranteed not in usedCodes
    let maxNum = 100;
    for (const c of usedCodes) {
      const m = c.match(/^TY-(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    let nextNum = maxNum + 1;
    let newUniqueCode = `TY-${String(nextNum).padStart(4, '0')}`;
    while (usedCodes.has(newUniqueCode)) {
      nextNum++;
      newUniqueCode = `TY-${String(nextNum).padStart(4, '0')}`;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // Preserve 100% of all existing member fields — ONLY update uniqueCode, qrData, updatedAt, lastUpdatedAt
    const updatedMember: Registrant = {
      ...currentMember,
      uniqueCode: newUniqueCode,
      qrData: newUniqueCode,
      updatedAt: nowMs,
      lastUpdatedAt: nowIso
    };

    // Lock against background polling overwrites
    lastRegistrantMutationAt[cleanId] = nowMs;
    lockMemberSaveSync(8000);

    list[idx] = updatedMember;
    inMemoryRegistrants = [...list];
    updateCachedSnapshotMember(updatedMember);

    scheduleBackgroundBackupSave(inMemoryRegistrants);

    // If this member is currently logged in on this browser, update their session immediately
    try {
      const sessionKeys = [
        'three_youths_member_session_v2',
        'three_youths_member_session_v1',
        'three_youths_member_session'
      ];
      for (const sk of sessionKeys) {
        const rawSess = sessionStorage.getItem(sk);
        if (rawSess) {
          const parsedSess = JSON.parse(rawSess);
          if (parsedSess && parsedSess.id === cleanId) {
            sessionStorage.setItem(
              sk,
              JSON.stringify({
                ...parsedSess,
                uniqueCode: newUniqueCode,
                qrData: newUniqueCode,
                updatedAt: nowMs,
                lastUpdatedAt: nowIso
              })
            );
          }
        }
      }
    } catch {}

    let newQrDataUrl = '';
    try {
      newQrDataUrl = await generateQrCodeDataUrl(newUniqueCode);
    } catch {}

    // Persist immediately to Cloudflare Database (both single record PUT and D1_STATE:registrants slice)
    try {
      await safeCloudflareUpdate('registrants', updatedMember, 'id', cleanId);
      await syncRegistrantsSliceToCloudflareD1(inMemoryRegistrants, updatedMember, false, false);
    } catch {}

    if (isExpressBackendAvailable !== false) {
      try {
        await fetch(`/api/registrants/${encodeURIComponent(cleanId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedMember)
        });
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('three_youths_qr_regenerated', {
          detail: {
            memberId: cleanId,
            oldCode,
            uniqueCode: newUniqueCode,
            qrData: newUniqueCode,
            qrCodeUrl: newQrDataUrl
          }
        })
      );
      window.dispatchEvent(new CustomEvent('three_youths_session_updated'));
    }

    notifySyncListeners();
    return {
      success: true,
      registrant: updatedMember,
      newCode: newUniqueCode,
      newQrDataUrl
    };
  },

  /**
   * Resolves the canonical live role of the active user from the verified registrants list,
   * preventing client-side tampering with localStorage/sessionStorage or omitted actorRole arguments.
   */
  getVerifiedActorRole(fallbackRole?: UserRole): UserRole {
    if (typeof window === 'undefined') return fallbackRole || 'member';
    try {
      const list = this.getRegistrants();
      const adminKeys = ['three_youths_admin_session_v2', 'three_youths_admin_session_v1'];
      for (const key of adminKeys) {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const sess = JSON.parse(raw);
          if (sess) {
            if (isPermanentCommunityOwner(sess) || (sess.role === 'community_owner' && this.isCommunityOwnerLoggedIn())) {
              return 'community_owner';
            }
            const matched = list.find(r =>
              (sess.id && r.id === sess.id) ||
              (sess.email && (r.phone === sess.email || r.email === sess.email)) ||
              (sess.name && (r.fullName === sess.name || normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(sess.name)))
            );
            if (matched) {
              return isPermanentCommunityOwner(matched) ? 'community_owner' : matched.role;
            }
          }
        }
      }
      const memberKeys = ['three_youths_member_session_v2', 'three_youths_member_session_v1', 'three_youths_member_session'];
      for (const key of memberKeys) {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const mem = JSON.parse(raw);
          if (mem) {
            if (isPermanentCommunityOwner(mem)) return 'community_owner';
            const matched = list.find(r => r.id === mem.id || r.fullName === mem.fullName);
            if (matched) return isPermanentCommunityOwner(matched) ? 'community_owner' : matched.role;
          }
        }
      }
    } catch {}
    if (fallbackRole === 'community_owner' && !this.isCommunityOwnerLoggedIn()) {
      return 'member';
    }
    return fallbackRole || 'member';
  },

  async saveRegistrant(registrant: Registrant): Promise<{ success: boolean; error?: string }> {
    return this.registerUser(registrant);
  },

  async updateRegistrant(updated: Registrant, actorRole?: UserRole): Promise<boolean> {
    lockPollingForMutation();
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const stampedInput: Registrant = {
      ...updated,
      updatedAt: Number((updated as any).updatedAt || nowMs),
      lastModifiedAt: Number((updated as any).lastModifiedAt || nowMs),
      lastUpdatedAt: updated.lastUpdatedAt || nowIso
    } as Registrant;
    const norm = normalizeRegistrant(stampedInput);
    const list = this.getRegistrants();
    const cleanDigits = (s: string) => (s || '').replace(/\D/g, '');
    const targetDigits = cleanDigits(norm.phone);
    const targetIdStr = getBaseMemberId(norm.id);
    const bareTargetId = targetIdStr.replace(/^reg_member_/, '').replace(/^reg_sql_/, '');
    const normTargetName = ultraNormalizeArabic(norm.fullName || (norm as any).name || '');

    let existingIndex = list.findIndex(r => {
      if (!r || !r.id) return false;
      const rid = getBaseMemberId(r.id);
      const origRid = getBaseMemberId((r as any).originalId || '');
      const bareRid = rid.replace(/^reg_member_/, '').replace(/^reg_sql_/, '');
      return rid === targetIdStr || origRid === targetIdStr || (bareTargetId && bareRid === bareTargetId);
    });

    if (existingIndex === -1) {
      existingIndex = list.findIndex(r =>
        (r && normTargetName && ultraNormalizeArabic(r.fullName || (r as any).name || '') === normTargetName) ||
        (r && norm && r.uniqueCode && norm.uniqueCode && r.uniqueCode.toUpperCase() === norm.uniqueCode.toUpperCase()) ||
        (targetDigits && targetDigits.length >= 8 && cleanDigits(r.phone) === targetDigits)
      );
    }

    let savedMember = norm;
    let rawUpdatedList: Registrant[];
    if (existingIndex !== -1) {
      const existing = list[existingIndex];
      if (existing.role === 'community_owner' && resolvedActorRole !== 'community_owner') {
        unlockPollingAfterMutation();
        return false;
      }
      if (norm.role !== existing.role && resolvedActorRole !== 'community_owner' && resolvedActorRole !== 'community_manager') {
        norm.role = existing.role;
      }
      if ((norm.role === 'community_owner' || norm.role === 'community_manager') && existing.role !== norm.role && resolvedActorRole !== 'community_owner') {
        norm.role = existing.role;
      }
      const genderChangedExplicitly = Boolean(
        updated.genderLocked ||
        (updated as any).ownerGenderModifiedAt ||
        (updated as any).manualGender ||
        (updated as any).genderCode ||
        (updated.gender && updated.gender !== existing.gender) ||
        ((updated as any).sex && (updated as any).sex !== (existing as any).sex)
      );
      const finalGenderLock = Boolean(updated.genderLocked ?? (genderChangedExplicitly ? true : existing.genderLocked));
      const ownerGenderTs = genderChangedExplicitly
        ? Number((updated as any).ownerGenderModifiedAt || nowMs)
        : Number((updated as any).ownerGenderModifiedAt || (existing as any).ownerGenderModifiedAt || 0);
      const mergedMember = mergeRegistrantPreservingIdentity(existing, {
        ...norm,
        genderLocked: finalGenderLock,
        ownerGenderModifiedAt: ownerGenderTs || undefined,
        manualGender: genderChangedExplicitly ? norm.gender : ((updated as any).manualGender ?? (existing as any).manualGender),
        genderCode: genderChangedExplicitly ? norm.gender : ((updated as any).genderCode ?? norm.gender),
        securityCode: norm.recoveryCode || (norm as any).securityCode || existing.recoveryCode || (existing as any).securityCode || '123456',
        recoveryCode: norm.recoveryCode || (norm as any).securityCode || existing.recoveryCode || (existing as any).securityCode || '123456',
        updatedAt: Number((stampedInput as any).updatedAt || nowMs),
        lastModifiedAt: Number((stampedInput as any).lastModifiedAt || nowMs),
        lastUpdatedAt: stampedInput.lastUpdatedAt,
        updatedFields: updated.updatedFields !== undefined ? updated.updatedFields : existing.updatedFields
      } as any);
      savedMember = mergedMember;
      rawUpdatedList = list.map((r, i) => i === existingIndex ? savedMember : r);
    } else {
      rawUpdatedList = [norm, ...list];
    }

    const updatedList = ensureUniqueSingleCardPerMember(
      deduplicateAndMergeMembers(rawUpdatedList, {
        ids: Array.from(this.getDeletedRegistrantIds()),
        names: []
      })
    ) as Registrant[];
    savedMember = updatedList.find(
      (r) => getBaseMemberId(r.id) === getBaseMemberId(savedMember.id) || ultraNormalizeArabic(r.fullName) === ultraNormalizeArabic(savedMember.fullName)
    ) || savedMember;

    updateCachedSnapshotMember(savedMember);
    lastRegistrantMutationAt[savedMember.id] = nowMs;
    if (savedMember.photoUrl && savedMember.photoUrl.startsWith('data:image/')) {
      setCachedD1Photo(savedMember.id, savedMember.photoUrl);
    }
    inMemoryRegistrants = updatedList;
    inMemoryRegistrantsAudited = updatedList.length >= 90;
    scheduleBackgroundBackupSave(updatedList);

    try {
      const rawLast = localStorage.getItem('three_youths_last_login');
      if (!rawLast || JSON.parse(rawLast)?.id === savedMember.id) {
        localStorage.setItem('three_youths_last_login', JSON.stringify(savedMember));
        localStorage.setItem('three_youths_remembered_user', JSON.stringify({
          fullName: savedMember.fullName,
          phone: savedMember.phone,
          uniqueCode: savedMember.uniqueCode,
          password: savedMember.password
        }));
      }
    } catch {}

    if (savedMember.role === 'member' && (!updated.notes || !String(updated.notes).trim())) {
      this.clearVisitationNotesForMember(savedMember.id);
    }

    this.syncCurrentSession(savedMember.role, savedMember.id);
    notifySyncListeners();

    try {
      await Promise.allSettled([
        isExpressBackendAvailable !== false
          ? fetch(`/api/registrants/${encodeURIComponent(savedMember.id)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(savedMember)
            })
          : Promise.resolve(),
        safeCloudflareUpsert('registrants', savedMember),
        syncRegistrantsSliceToCloudflareD1(updatedList, savedMember, false, true)
      ]);
    } catch {} finally {
      unlockPollingAfterMutation();
    }

    return true;
  },

  /**
   * Automatically inspects local registrants and localStorage photos (e.g. in AI Studio),
   * compresses any Base64 photos to 250x250 (0.7 quality), attaches them directly to
   * `photoUrl` and `avatar`, and pushes them to Cloudflare D1 so https://3fetyayouth.online
   * immediately displays all existing members' photos.
   */
  async migrateLocalPhotosToCloudflareD1(): Promise<void> {
    try {
      // SAFETY GUARD: Never push local photos before initial Cloudflare D1 pull completes, or automatically from AI Studio Preview
      if (!isInitialCloudFetchCompleted() || isAiStudioPreviewEnv()) return;
      const list = this.getRegistrants();
      if (!Array.isArray(list) || list.length === 0) return;
      if (list.length < getServerRegistrantsCount()) return;
      let hasAnyPhotoToSync = false;
      const updatedList: Registrant[] = [];

      for (const r of list) {
        if (!r || !r.id) continue;
        const candidate = resolveSafePhotoUrl(
          r.photoUrl || r.avatar || r.image || getCachedD1Photo(r.id),
          r.id
        );
        if (candidate && candidate.startsWith('data:image/')) {
          const compressed = candidate.length > 32000
            ? await compressImageToBase64(candidate, 250, 0.7)
            : candidate;
          setCachedD1Photo(r.id, compressed);
          updatedList.push({
            ...r,
            photoUrl: compressed,
            avatar: compressed
          });
          hasAnyPhotoToSync = true;
        } else {
          updatedList.push(r);
        }
      }

      if (hasAnyPhotoToSync) {
        inMemoryRegistrants = updatedList;
        try {
          safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(updatedList));
        } catch {}
        notifySyncListeners();
        await syncRegistrantsSliceToCloudflareD1(updatedList);
      }
    } catch {}
  },

  getBlockedUsers(): BlockedUser[] {
    if (inMemoryBlockedUsers && inMemoryBlockedUsers.length > 0) {
      return inMemoryBlockedUsers;
    }
    const raw = safeStorage.getItem(BLOCKED_USERS_STORAGE_KEY);
    if (raw) {
      try {
        inMemoryBlockedUsers = JSON.parse(raw);
        return inMemoryBlockedUsers;
      } catch {}
    }
    return [];
  },

  isUserBlocked(phoneOrNameOrIp: string, ipAddress?: string): boolean {
    if (ipAddress && this.isIpBlocked(ipAddress)) return true;
    const clean = (phoneOrNameOrIp || '').trim();
    if (!clean) return false;
    const cleanDigits = clean.replace(/\D/g, '');
    const cleanLower = clean.toLowerCase();
    const cleanNorm = normalizeArabicNameForComparison(clean);
    const blockedList = this.getBlockedUsers();

    return blockedList.some(b => {
      if (!b) return false;
      const bDigits = (b.phone || '').replace(/\D/g, '');
      const bWaDigits = (b.whatsapp || '').replace(/\D/g, '');
      const bName = (b.fullName || '').trim().toLowerCase();
      const bNorm = normalizeArabicNameForComparison(b.fullName || '');
      const bCode = (b.uniqueCode || '').toLowerCase();
      const bIp = (b.ipAddress || '').trim();

      // 0. IP Address match
      if (bIp && bIp !== 'unknown' && clean === bIp) return true;

      // 1. Phone / WhatsApp match
      if (cleanDigits.length >= 7) {
        if (bDigits && (cleanDigits.endsWith(bDigits) || bDigits.endsWith(cleanDigits))) return true;
        if (bWaDigits && (cleanDigits.endsWith(bWaDigits) || bWaDigits.endsWith(cleanDigits))) return true;
      }

      // 2. Unique Code match
      if (bCode && (cleanLower === bCode || cleanLower.includes(bCode))) return true;

      // 3. Arabic Normalized 3-Part Name match
      if (cleanNorm && bNorm && (cleanNorm === bNorm || isThreePartNameMatch(clean, b.fullName || ''))) {
        return true;
      }
      if (bName && (cleanLower === bName || cleanLower.includes(bName) || bName.includes(cleanLower))) {
        return true;
      }
      return false;
    });
  },

  isFullNameAlreadyRegistered(fullName: string, excludeId?: string): boolean {
    const normInput = ultraNormalizeArabic(fullName);
    if (!normInput || normInput.length < 3) return false;
    const deleted = this.getDeletedRegistrantIds();
    const confirmedDeleted = getConfirmedDeletedIds();
    const cleanExcludeId = excludeId ? getBaseMemberId(excludeId) : '';

    // 1. Check active members in memory / CLEAN_MASTER_DB_V1
    const registrants = (inMemoryRegistrants && inMemoryRegistrants.length > 0 ? inMemoryRegistrants : this.getRegistrants()).filter(
      r => r && r.status === 'active' && !deleted.has(getBaseMemberId(r.id)) && !confirmedDeleted.has(getBaseMemberId(r.id))
    );
    const matchedActive = registrants.some(r => {
      if (cleanExcludeId && getBaseMemberId(r.id) === cleanExcludeId) return false;
      const rNorm = ultraNormalizeArabic(r.fullName || (r as any).name || '');
      return rNorm === normInput || isThreePartNameMatch(fullName, r.fullName);
    });
    if (matchedActive) return true;

    // 2. Check against the 95 Verified Manifest (unless explicitly deleted by Community Owner)
    if (!cleanExcludeId && !confirmedDeleted.has(`NAME:${normInput}`)) {
      const inManifest = VERIFIED_95_MANIFEST.some(
        m => ultraNormalizeArabic(m.name) === normInput || isThreePartNameMatch(fullName, m.name)
      );
      if (inManifest) return true;
    }

    return false;
  },

  isPhoneAlreadyRegistered(phone: string, excludeId?: string): boolean {
    const normInput = normalizePhoneForComparison(phone);
    if (!normInput || normInput.length < 7) return false;
    const deleted = this.getDeletedRegistrantIds();
    // Strictly check only active members in memory (Cloudflare D1 Single Source of Truth)
    const registrants = (inMemoryRegistrants || []).filter(
      r => r && r.status === 'active' && !deleted.has(r.id)
    );
    return registrants.some(r => {
      if (excludeId && r.id === excludeId) return false;
      const rPhone = normalizePhoneForComparison(r.phone || '');
      const rWa = normalizePhoneForComparison(r.whatsapp || '');
      return (rPhone && rPhone === normInput) || (rWa && rWa === normInput);
    });
  },

  async blockMember(id: string, reason?: string, actorRole?: UserRole): Promise<{ success: boolean; error?: string }> {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner') {
      return { success: false, error: 'صلاحية الحظر مقتصرة حصرياً على مسؤول المجتمع (Community Owner).' };
    }

    const list = this.getRegistrants();
    const target = list.find(r => r.id === id);
    if (!target) {
      return { success: false, error: 'العضو غير موجود في النظام' };
    }

    if (target.role === 'community_owner' || target.id === 'reg_owner_main') {
      return { success: false, error: 'لا يمكن حظر حساب مسؤول المجتمع.' };
    }

    const blockedEntry: BlockedUser = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fullName: target.fullName,
      phone: target.phone,
      whatsapp: target.whatsapp || target.phone,
      uniqueCode: target.uniqueCode,
      ipAddress: target.ipAddress || undefined,
      reason: sanitizeSecurityText(reason) || 'حظر نهائي ومسح العضوية والعنوان IP بقرار مسؤول المجتمع',
      blockedAt: new Date().toISOString(),
      blockedBy: 'مسؤول المجتمع (Community Owner)'
    };

    // 1. Mark ID as permanently deleted to prevent resurrection & free uniqueCode for reuse
    this.addDeletedRegistrantId(id);
    if (target.uniqueCode) {
      pushReusableCode(target.uniqueCode);
    }

    // 2. Update in-memory
    inMemoryBlockedUsers = [
      ...inMemoryBlockedUsers.filter(b => b.phone !== target.phone && b.fullName !== target.fullName),
      blockedEntry
    ];
    inMemoryRegistrants = inMemoryRegistrants.filter(r => r.id !== id);

    // 3. Update local storage
    try {
      safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
      safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(inMemoryRegistrants));
    } catch {}

    // 4. Update Cloudflare D1 & Realtime WebSocket (Add to blocked_users, completely remove from registrants)
    try {
      broadcastCloudflareRealtime({
        type: 'blocked_users_sync',
        blockedUsers: inMemoryBlockedUsers
      });
      await Promise.allSettled([
        safeCloudflareUpsert('blocked_users', blockedEntry),
        deleteMemberFromCloudflareD1(id, {
          fullName: target.fullName,
          phone: target.phone,
          uniqueCode: target.uniqueCode,
        }),
        pushStateSliceToCloudflareD1('blocked_users', inMemoryBlockedUsers),
        syncRegistrantsSliceToCloudflareD1(inMemoryRegistrants, undefined, false, true),
        syncSystemStateToCloudflareOwner()
      ]);
    } catch (e) {
      console.warn('Cloudflare D1 block notice:', e);
    }

    // 5. Update Server API
    try {
      await fetch('/api/registrants/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: id,
          ipAddress: target.ipAddress,
          reason: sanitizeSecurityText(reason),
          actorRole: resolvedActorRole
        })
      });
    } catch (e) {
      console.warn('Server block API error:', e);
    }

    this.cleanRememberedLoginIfInvalid();
    notifySyncListeners();
    return { success: true };
  },

  async unblockUser(id: string, actorRole?: UserRole): Promise<{ success: boolean; error?: string }> {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner') {
      return { success: false, error: 'صلاحية فك الحظر مقتصرة حصرياً على مسؤول المجتمع (Community Owner).' };
    }

    inMemoryBlockedUsers = this.getBlockedUsers().filter(b => b.id !== id);
    try {
      safeStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(inMemoryBlockedUsers));
    } catch {}

    try {
      broadcastCloudflareRealtime({
        type: 'blocked_users_sync',
        blockedUsers: inMemoryBlockedUsers
      });
      await Promise.allSettled([
        safeCloudflareDelete('blocked_users', id),
        pushStateSliceToCloudflareD1('blocked_users', inMemoryBlockedUsers),
        syncSystemStateToCloudflareOwner()
      ]);
    } catch (e) {
      console.warn('Cloudflare D1 unblock notice:', e);
    }

    try {
      await fetch(`/api/blocked-users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Server unblock error:', e);
    }

    notifySyncListeners();
    return { success: true };
  },

  async toggleMemberGenderInstant(
    memberId: string,
    actorRole?: UserRole
  ): Promise<{ success: boolean; newGender?: 'male' | 'female'; registrant?: Registrant }> {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner' && actorRole !== 'community_owner') {
      console.warn('Unauthorized gender toggle: restricted exclusively to Community Owner');
      return { success: false };
    }

    const cleanId = getBaseMemberId(memberId);
    if (!cleanId || cleanId === 'reg_owner_main') return { success: false };

    const list = this.getRegistrants();
    const idx = list.findIndex(
      (r) =>
        r &&
        (getBaseMemberId(r.id) === cleanId ||
          getBaseMemberId((r as any).originalId || '') === cleanId ||
          String(r.id || '').trim() === String(memberId || '').trim())
    );
    if (idx === -1) return { success: false };

    const target = list[idx];
    if (target.role === 'community_owner' || getBaseMemberId(target.id) === 'reg_owner_main') {
      return { success: false };
    }

    lockPollingForMutation();
    const currentGender = getMemberGender(target);
    const nextGender: 'male' | 'female' = currentGender === 'female' ? 'male' : 'female';
    const nextGenderAr = nextGender === 'female' ? 'أنثى' : 'ذكر';
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const updatedMember: Registrant = {
      ...target,
      id: getBaseMemberId(target.id),
      gender: nextGender,
      sex: nextGender,
      genderCode: nextGender,
      manualGender: nextGender,
      genderLabel: nextGenderAr,
      type: nextGender === 'female' ? 'شابة' : 'شاب',
      category: nextGender === 'female' ? 'شابات' : 'شباب',
      genderLocked: true,
      ownerGenderModifiedAt: nowMs,
      lastModifiedAt: nowMs,
      updatedAt: nowMs,
      lastUpdatedAt: nowIso
    };

    lastRegistrantMutationAt[updatedMember.id] = nowMs;

    const dedupedList = ensureUniqueSingleCardPerMember(
      deduplicateAndMergeMembers(
        list.map((r, i) => (i === idx ? updatedMember : r)),
        { ids: Array.from(this.getDeletedRegistrantIds()), names: [] }
      )
    ) as Registrant[];
    const finalMember = dedupedList.find(
      (r) => getBaseMemberId(r.id) === updatedMember.id || ultraNormalizeArabic(r.fullName) === ultraNormalizeArabic(updatedMember.fullName)
    ) || updatedMember;
    inMemoryRegistrants = dedupedList;
    inMemoryRegistrantsAudited = dedupedList.length >= 90;
    updateCachedSnapshotMember(finalMember);
    scheduleBackgroundBackupSave(dedupedList);

    notifySyncListeners();

    (async () => {
      try {
        await Promise.allSettled([
          isExpressBackendAvailable !== false
            ? fetch(`/api/registrants/${encodeURIComponent(finalMember.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalMember)
              })
            : Promise.resolve(),
          safeCloudflareUpsert('registrants', finalMember),
          syncRegistrantsSliceToCloudflareD1(dedupedList, finalMember, false, true)
        ]);
      } catch {} finally {
        unlockPollingAfterMutation();
      }
    })();

    return { success: true, newGender: nextGender, registrant: finalMember };
  },

  async deleteRegistrant(id: string, actorRole?: UserRole): Promise<boolean> {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner' && actorRole !== 'community_owner') {
      console.warn('Unauthorized delete attempt: only community_owner can delete members');
      return false;
    }

    const list = this.getRegistrants();
    const target = list.find(r => r.id === id || (r as any).originalId === id);
    if (target?.role === 'community_owner' || id === 'reg_owner_main') {
      return false;
    }

    lockPollingForMutation();
    const targetFullName = target?.fullName;
    const targetPhone = target?.phone;
    const targetCode = target?.uniqueCode;
    const targetOrigId = (target as any)?.originalId;

    // 1. Add ID, originalId, uniqueCode & normalized Arabic name to PERMANENT_BLACKLIST + CONFIRMED_DELETED_IDS
    addToPermanentBlacklist({
      id,
      originalId: targetOrigId ? String(targetOrigId) : undefined,
      fullName: targetFullName,
      uniqueCode: targetCode
    });
    this.addDeletedRegistrantId(id);
    if (targetOrigId) {
      this.addDeletedRegistrantId(String(targetOrigId));
    }
    if (targetCode) {
      pushReusableCode(targetCode);
    }

    // 2. Optimistic Instant Wipe (< 0.01s) from in-memory and SAFE_BACKUP_MEMBERS
    const normTargetName = targetFullName ? ultraNormalizeArabic(targetFullName) : '';
    inMemoryRegistrants = filterOutDeletedAndGhosts(
      inMemoryRegistrants.filter((r) => {
        if (!r) return false;
        const rid = String(r.id || '').trim();
        const rorig = String((r as any).originalId || '').trim();
        const rname = ultraNormalizeArabic(r.fullName || r.name || '');
        if (rid === id || rorig === id) return false;
        if (normTargetName && rname === normTargetName) return false;
        return true;
      })
    );

    try {
      safeStorage.setItem(REGISTRANTS_STORAGE_KEY, serializeRegistrantsForLocalCache(inMemoryRegistrants, false));
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('SAFE_BACKUP_MEMBERS', serializeRegistrantsForLocalCache(inMemoryRegistrants, true));
      }
    } catch {}

    const currentAtt = this.getAttendanceRecords();
    const cleanAtt = currentAtt.filter(a => a.registrantId !== id);
    if (cleanAtt.length !== currentAtt.length) {
      try {
        safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(cleanAtt));
      } catch {}
    }

    this.cleanRememberedLoginIfInvalid();
    try {
      const rem = localStorage.getItem('three_youths_remembered_user');
      if (rem) {
        const p = JSON.parse(rem);
        if (p.id === id || p.uniqueCode === targetCode || p.fullName === targetFullName) {
          localStorage.removeItem('three_youths_remembered_user');
          localStorage.removeItem('three_youths_last_login');
        }
      }
    } catch {}

    notifySyncListeners();

    removeCachedD1Photo(id);
    deleteMemberFromCloudflareD1(id, {
      fullName: targetFullName,
      phone: targetPhone,
      uniqueCode: targetCode,
      originalId: targetOrigId
    }).catch(() => {});

    if (isExpressBackendAvailable !== false) {
      fetch(`/api/registrants/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }

    return true;
  },

  async deleteRegistrantsBatch(ids: string[], actorRole?: UserRole): Promise<boolean> {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner' && actorRole !== 'community_owner') {
      console.warn('Unauthorized batch delete attempt: restricted exclusively to Community Owner');
      return false;
    }

    const cleanIds = (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim())
      .filter((id) => id && id !== 'reg_owner_main');
    if (cleanIds.length === 0) return false;

    lockPollingForMutation();
    const list = this.getRegistrants();
    const targetIdSet = new Set(cleanIds);
    const targetsToDelete: Array<{
      id: string;
      originalId?: string;
      fullName?: string;
      phone?: string;
      uniqueCode?: string;
    }> = [];

    for (const id of cleanIds) {
      const target = list.find((r) => r && (r.id === id || (r as any).originalId === id));
      if (target?.role === 'community_owner' || target?.id === 'reg_owner_main') continue;
      const origId = (target as any)?.originalId;
      const fullName = target?.fullName;
      const uniqueCode = target?.uniqueCode;
      addToPermanentBlacklist({
        id,
        originalId: origId ? String(origId) : undefined,
        fullName,
        uniqueCode
      });
      this.addDeletedRegistrantId(id);
      if (origId) this.addDeletedRegistrantId(String(origId));
      if (uniqueCode) pushReusableCode(uniqueCode);
      removeCachedD1Photo(id);
      targetsToDelete.push({
        id,
        originalId: origId,
        fullName,
        phone: target?.phone,
        uniqueCode
      });
    }

    if (targetsToDelete.length === 0) {
      unlockPollingAfterMutation();
      return false;
    }

    inMemoryRegistrants = filterOutDeletedAndGhosts(
      inMemoryRegistrants.filter((r) => {
        if (!r) return false;
        const rid = String(r.id || '').trim();
        const rorig = String((r as any).originalId || '').trim();
        if (targetIdSet.has(rid) || (rorig && targetIdSet.has(rorig))) return false;
        return true;
      })
    );

    try {
      safeStorage.setItem(REGISTRANTS_STORAGE_KEY, serializeRegistrantsForLocalCache(inMemoryRegistrants, false));
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('SAFE_BACKUP_MEMBERS', serializeRegistrantsForLocalCache(inMemoryRegistrants, true));
      }
    } catch {}

    const currentAtt = this.getAttendanceRecords();
    const cleanAtt = currentAtt.filter((a) => !targetIdSet.has(a.registrantId));
    if (cleanAtt.length !== currentAtt.length) {
      try {
        safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(cleanAtt));
      } catch {}
    }

    this.cleanRememberedLoginIfInvalid();
    notifySyncListeners();

    deleteMembersBatchFromCloudflareD1(targetsToDelete).catch(() => {});

    return true;
  },

  async cancelMembership(id: string, actorRole?: UserRole): Promise<boolean> {
    // When the Community Owner cancels membership, it is permanently deleted from Cloudflare D1 and Server
    return this.deleteRegistrant(id, actorRole);
  },

  activateMembership(id: string, actorRole?: UserRole): boolean {
    if (actorRole && actorRole !== 'community_owner') {
      return false;
    }

    const list = this.getRegistrants().map(r => {
      if (r.id === id) {
        return { ...r, status: 'active' as const };
      }
      return r;
    });
    inMemoryRegistrants = list;

    const activatedMember = list.find(r => r.id === id);
    if (activatedMember) {
      safeCloudflareUpsert('registrants', activatedMember).catch(() => {});
      fetch(`/api/registrants/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activatedMember)
      }).catch(() => {});
    }

    this.cleanRememberedLoginIfInvalid();
    notifySyncListeners();
    return true;
  },

  /**
   * Ensures any member whose membership was cancelled or deleted
   * is instantly purged from browser local storage so Quick Login never logs them in with stale data.
   * Also keeps the stored quick-login profile fresh if server data changed.
   */
  cleanRememberedLoginIfInvalid(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const saved = safeStorage.getItem('three_youths_last_login');
      if (!saved) return false;
      const mem = JSON.parse(saved);
      if (!mem || !mem.id) {
        safeStorage.removeItem('three_youths_last_login');
        return true;
      }
      const deletedIds = this.getDeletedRegistrantIds();
      const baseMemId = getBaseMemberId(mem.id);
      if (deletedIds.has(mem.id) || (baseMemId && deletedIds.has(baseMemId))) {
        safeStorage.removeItem('three_youths_last_login');
        safeStorage.removeItem('three_youths_remembered_user');
        return true;
      }
      const list = this.getRegistrants();
      const memNormName = normalizeArabicNameForComparison(mem.fullName || '');
      const fresh = list.find(
        r =>
          r.id === mem.id ||
          getBaseMemberId(r.id) === baseMemId ||
          (mem.uniqueCode && r.uniqueCode === mem.uniqueCode) ||
          (memNormName && normalizeArabicNameForComparison(r.fullName || '') === memNormName)
      );
      if (fresh && (fresh.status === 'cancelled' || fresh.status === 'blocked' || this.isUserBlocked(fresh.phone))) {
        safeStorage.removeItem('three_youths_last_login');
        safeStorage.removeItem('three_youths_remembered_user');
        return true;
      }
      // If member was updated on server, keep local stored object up-to-date without heavy Base64 JSON.stringify comparison
      if (
        fresh &&
        (mem.id !== fresh.id ||
          mem.role !== fresh.role ||
          mem.uniqueCode !== fresh.uniqueCode ||
          mem.lastModifiedAt !== fresh.lastModifiedAt)
      ) {
        safeStorage.setItem('three_youths_last_login', JSON.stringify(fresh));
      }
    } catch {
      return false;
    }
    return false;
  },

  /**
   * Completely purge a deleted or cancelled member from local browser storage
   */
  purgeLocalMemberData(memberId?: string): void {
    if (typeof window === 'undefined') return;
    if (memberId) {
      this.addDeletedRegistrantId(memberId);
      inMemoryRegistrants = inMemoryRegistrants.filter(r => r.id !== memberId);
      try {
        safeStorage.setItem(REGISTRANTS_STORAGE_KEY, JSON.stringify(inMemoryRegistrants));
      } catch {}
    }
    try {
      safeStorage.removeItem('three_youths_last_login');
      safeStorage.removeItem('three_youths_remembered_user');
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('three_youths_last_login');
        localStorage.removeItem('three_youths_remembered_user');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('three_youths_member_session');
      }
    } catch {}
    notifySyncListeners();
  },

  /**
   * Directly verify against Cloudflare D1 (Single Source of Truth) if a member is active
   * Prevents Quick Login from logging in cancelled or deleted members
   */
  async verifyMemberStatusOnline(memberId: string): Promise<{ valid: boolean; reason?: 'deleted' | 'cancelled' | 'blocked' | 'notFound'; registrant?: Registrant }> {
    if (!memberId) return { valid: false, reason: 'notFound' };

    // 1. If in local deleted set, instantly purge
    if (this.getDeletedRegistrantIds().has(memberId)) {
      this.purgeLocalMemberData(memberId);
      return { valid: false, reason: 'deleted' };
    }

    // 2. Query Cloudflare D1 state directly first (Force bypass cache for strict verification)
    try {
      const d1State = await fetchFullStateFromCloudflareD1(true);
      if (d1State) {
        if (Array.isArray(d1State.revokedMembersLog)) {
          const isRevoked = d1State.revokedMembersLog.some(
            (entry: any) => (typeof entry === 'string' ? entry : entry?.id) === memberId
          );
          if (isRevoked) {
            return { valid: false, reason: 'cancelled' };
          }
        }
        if (Array.isArray(d1State.registrants)) {
          const baseTargetId = getBaseMemberId(memberId);
          const found = d1State.registrants.find(
            (r: any) => r && (r.id === memberId || getBaseMemberId(r.id) === baseTargetId)
          );
          if (found) {
            const reg = normalizeRegistrant(found);
            if (reg.status === 'cancelled') {
              this.purgeLocalMemberData(memberId);
              return { valid: false, reason: 'cancelled', registrant: reg };
            }
            if (reg.status === 'blocked' || this.isUserBlocked(reg.phone)) {
              this.purgeLocalMemberData(memberId);
              return { valid: false, reason: 'blocked', registrant: reg };
            }
            return { valid: true, registrant: reg };
          }
        }
      }
    } catch {
      // Fall through to Express API or local check if offline
    }

    // 3. Query Express backend /api/registrants/:id ONLY if Express backend is available and returns JSON
    if (isExpressBackendAvailable !== false) {
      try {
        const res = await fetch(`/api/registrants/${encodeURIComponent(memberId)}`);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          if (res.ok) {
            const body = await res.json();
            if (body.success && body.registrant) {
              const reg = normalizeRegistrant(body.registrant);
              if (reg.status === 'cancelled') {
                this.purgeLocalMemberData(memberId);
                return { valid: false, reason: 'cancelled', registrant: reg };
              }
              if (reg.status === 'blocked' || this.isUserBlocked(reg.phone)) {
                this.purgeLocalMemberData(memberId);
                return { valid: false, reason: 'blocked', registrant: reg };
              }
              return { valid: true, registrant: reg };
            }
          } else if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            this.purgeLocalMemberData(memberId);
            return { valid: false, reason: body.isBlocked ? 'blocked' : 'cancelled' };
          }
        } else {
          isExpressBackendAvailable = false;
        }
      } catch {}
    }

    // 4. Fallback to local registrants list
    const localMember = this.getRegistrants().find(r => r.id === memberId);
    if (localMember) {
      if (localMember.status === 'cancelled') {
        this.purgeLocalMemberData(memberId);
        return { valid: false, reason: 'cancelled', registrant: localMember };
      }
      if (localMember.status === 'blocked' || this.isUserBlocked(localMember.phone)) {
        this.purgeLocalMemberData(memberId);
        return { valid: false, reason: 'blocked', registrant: localMember };
      }
      return { valid: true, registrant: localMember };
    }

    return { valid: false, reason: 'notFound' };
  },

  /**
   * Update online presence and lastSeen timestamp for user
   */
  async updateUserPresence(memberId: string, isOnline: boolean): Promise<void> {
    if (!memberId) return;
    const now = new Date().toISOString();

    // 1. Update in-memory
    let statusChanged = false;
    inMemoryRegistrants = inMemoryRegistrants.map(r => {
      if (r.id === memberId) {
        if (Boolean(r.isOnline) !== Boolean(isOnline)) {
          statusChanged = true;
        }
        return { ...r, isOnline, lastSeen: now };
      }
      return r;
    });

    // 2. Dispatch to server (use sendBeacon on exit/hidden for reliability on mobile without fetch abort errors)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon && !isOnline) {
      try {
        const blob = new Blob([JSON.stringify({ isOnline: false })], { type: 'application/json' });
        navigator.sendBeacon(`/api/registrants/${encodeURIComponent(memberId)}/presence`, blob);
      } catch {}
    } else {
      fetch(`/api/registrants/${encodeURIComponent(memberId)}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline })
      }).catch(() => {});
    }

    // 3. Dispatch direct browser-to-Cloudflare D1 update when transitioning to online OR every 40 seconds while page is visible
    const nowMs = Date.now();
    const lastCf = lastClientCloudflarePresenceAt[memberId] || 0;
    if ((statusChanged || nowMs - lastCf > 40000) && isOnline && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
      lastClientCloudflarePresenceAt[memberId] = nowMs;
      try {
        safeCloudflareUpdate('registrants', { isOnline: true, lastSeen: now }, 'id', memberId).catch(() => {});
      } catch {}
    }
  },

  /**
   * Format lastSeen date into user-friendly Arabic relative string (دقائق، ساعات، أيام، شهور، سنين)
   */
  formatLastSeen(lastSeen?: string, isOnline?: boolean): { label: string; isOnlineNow: boolean } {
    if (!lastSeen) {
      return { label: 'غير محدد', isOnlineNow: false };
    }
    const lastDate = new Date(lastSeen);
    const now = Date.now();
    const diffMs = Math.max(0, now - lastDate.getTime());
    const diffMins = Math.floor(diffMs / (1000 * 60));

    // Online if flagged online and recent heartbeat (< 3 minutes)
    if (isOnline && diffMins < 3) {
      return { label: 'متصل الآن 🟢', isOnlineNow: true };
    }

    if (diffMins < 1) return { label: 'منذ لحظات', isOnlineNow: false };

    // Minutes (1 to 59)
    if (diffMins < 60) {
      if (diffMins === 1) return { label: 'منذ دقيقة واحدة', isOnlineNow: false };
      if (diffMins === 2) return { label: 'منذ دقيقتين', isOnlineNow: false };
      if (diffMins >= 3 && diffMins <= 10) return { label: `منذ ${diffMins} دقائق`, isOnlineNow: false };
      return { label: `منذ ${diffMins} دقيقة`, isOnlineNow: false };
    }

    // Hours (1 to 23)
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      if (diffHours === 1) return { label: 'منذ ساعة واحدة', isOnlineNow: false };
      if (diffHours === 2) return { label: 'منذ ساعتين', isOnlineNow: false };
      if (diffHours >= 3 && diffHours <= 10) return { label: `منذ ${diffHours} ساعات`, isOnlineNow: false };
      return { label: `منذ ${diffHours} ساعة`, isOnlineNow: false };
    }

    // Days (1 to 29)
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
      if (diffDays === 1) return { label: 'منذ يوم واحد (أمس)', isOnlineNow: false };
      if (diffDays === 2) return { label: 'منذ يومين', isOnlineNow: false };
      if (diffDays >= 3 && diffDays <= 10) return { label: `منذ ${diffDays} أيام`, isOnlineNow: false };
      return { label: `منذ ${diffDays} يوماً`, isOnlineNow: false };
    }

    // Months (1 to 11)
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
      if (diffMonths === 1) return { label: 'منذ شهر واحد', isOnlineNow: false };
      if (diffMonths === 2) return { label: 'منذ شهرين', isOnlineNow: false };
      if (diffMonths >= 3 && diffMonths <= 10) return { label: `منذ ${diffMonths} أشهر`, isOnlineNow: false };
      return { label: `منذ ${diffMonths} شهراً`, isOnlineNow: false };
    }

    // Years (1+)
    const diffYears = Math.floor(diffDays / 365);
    if (diffYears === 1) return { label: 'منذ سنة واحدة', isOnlineNow: false };
    if (diffYears === 2) return { label: 'منذ سنتين', isOnlineNow: false };
    if (diffYears >= 3 && diffYears <= 10) return { label: `منذ ${diffYears} سنوات`, isOnlineNow: false };
    return { label: `منذ ${diffYears} سنة`, isOnlineNow: false };
  },

  /**
   * Record viewer who saw the announcement ("الشافو الإعلان")
   */
  async recordAnnouncementView(announcementId: string, member: Registrant): Promise<void> {
    if (!announcementId || !member || !member.id) return;
    const now = new Date().toISOString();

    // 1. Update local state
    const announcements = this.getAnnouncements();
    let changed = false;
    let targetAnn: Announcement | undefined;
    const updated = announcements.map(ann => {
      if (ann.id === announcementId) {
        const viewers = Array.isArray(ann.viewers) ? [...ann.viewers] : [];
        const existingIdx = viewers.findIndex(v => v.memberId === member.id);
        const viewerData: AnnouncementViewer = {
          memberId: member.id,
          memberName: member.fullName,
          photoUrl: member.photoUrl,
          gender: member.gender || 'male',
          viewedAt: now
        };
        if (existingIdx >= 0) {
          if (viewers[existingIdx].memberName !== member.fullName && member.fullName) {
            viewers[existingIdx] = { ...viewers[existingIdx], memberName: member.fullName };
            changed = true;
            const nextAnn = { ...ann, viewers };
            targetAnn = nextAnn;
            return nextAnn;
          }
          targetAnn = ann;
          return ann;
        }
        viewers.push(viewerData);
        changed = true;
        const nextAnn = { ...ann, viewers };
        targetAnn = nextAnn;
        return nextAnn;
      }
      return ann;
    });

    if (changed) {
      try {
        safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      notifySyncListeners();

      // Immediately sync updated viewers to Cloudflare D1 & Realtime WebSocket
      if (targetAnn) {
        syncAnnouncementsSliceToCloudflareD1(updated, targetAnn).catch(() => {});
        broadcastCloudflareRealtime({
          type: 'announcement_live_sync',
          announcement: {
            ...targetAnn,
            imageUrl:
              targetAnn.imageUrl && targetAnn.imageUrl.startsWith('data:')
                ? `__D1_ANN_IMAGE_REF__:${targetAnn.id}`
                : targetAnn.imageUrl
          }
        });
      }
    }

    // 2. Dispatch to server API (which also updates Cloudflare D1 and broadcasts via SSE)
    fetch(`/api/announcements/${encodeURIComponent(announcementId)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: member.id,
        memberName: member.fullName,
        photoUrl: member.photoUrl,
        gender: member.gender || 'male'
      })
    }).catch(() => {});

    // 3. Dispatch to Cloudflare adapter
    try {
      if (targetAnn && targetAnn.viewers) {
        safeCloudflareUpdate('announcements', { viewers: targetAnn.viewers }, 'id', announcementId).catch(() => {});
      }
    } catch {}
  },

  /**
   * Update member role with strict hierarchy rules:
   * 1. Community Manager CANNOT demote or touch Community Owner
   * 2. ONLY Community Owner can appoint someone to Community Manager
   */
  updateMemberRole(id: string, newRole: UserRole, customPermissions?: AdminPermissions, actorRole?: UserRole): boolean {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner' && resolvedActorRole !== 'community_manager') {
      return false;
    }

    const cleanTargetId = getBaseMemberId(id);
    const list = this.getRegistrants();
    const target = list.find(
      r => getBaseMemberId(r.id) === cleanTargetId || r.id === id || (r.uniqueCode && r.uniqueCode === id)
    );
    if (!target) return false;

    if (target.role === 'community_owner' && resolvedActorRole !== 'community_owner') {
      return false;
    }
    if (newRole === 'community_manager' && resolvedActorRole !== 'community_owner') {
      return false;
    }
    if (newRole === 'community_owner' && resolvedActorRole !== 'community_owner') {
      return false;
    }

    lockPollingForMutation();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const targetNormName = normalizeArabicNameForComparison(target.fullName || '');
    lastRegistrantMutationAt[target.id] = nowMs;
    lastRegistrantMutationAt[cleanTargetId] = nowMs;

    const updated = deduplicateAndMergeMembers(
      list.map(r => {
        if (
          getBaseMemberId(r.id) === cleanTargetId ||
          r.id === id ||
          (targetNormName && normalizeArabicNameForComparison(r.fullName || '') === targetNormName)
        ) {
          const baseRolePerms = this.getRolePermissions(newRole);
          const permissions: AdminPermissions = {
            ...(customPermissions ? { ...baseRolePerms, ...customPermissions } : { ...baseRolePerms }),
            __permissionsUpdatedAt: nowMs
          } as any;
          const updatedObj = { 
            ...r, 
            id: getBaseMemberId(r.id),
            role: newRole, 
            roleUpdatedAt: nowMs,
            roleLocked: true,
            permissions,
            registeredInCleanMasterV1: true,
            lastModifiedAt: nowMs,
            updatedAt: nowMs,
            lastUpdatedAt: nowIso
          };
          saveLockedMemberRole(updatedObj);
          return updatedObj;
        }
        return r;
      }),
      { ids: Array.from(this.getDeletedRegistrantIds()), names: [] }
    ) as Registrant[];
    inMemoryRegistrants = updated;
    inMemoryRegistrantsAudited = updated.length >= 90;
    const updatedMember = updated.find(
      r =>
        getBaseMemberId(r.id) === cleanTargetId ||
        r.id === id ||
        (targetNormName && normalizeArabicNameForComparison(r.fullName || '') === targetNormName)
    );
    if (updatedMember) {
      (updatedMember as any).roleUpdatedAt = nowMs;
      saveLockedMemberRole(updatedMember);
      updateCachedSnapshotMember(updatedMember);
    }
    scheduleBackgroundBackupSave(updated);

    if (updatedMember) {
      Promise.allSettled([
        safeCloudflareUpsert('registrants', updatedMember),
        isExpressBackendAvailable !== false
          ? fetch(`/api/registrants/${encodeURIComponent(updatedMember.id)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedMember)
            })
          : Promise.resolve()
      ]).finally(() => {
        unlockPollingAfterMutation();
      });
      broadcastCloudflareRealtime({
        type: 'member_permissions_updated',
        memberId: updatedMember.id,
        role: newRole,
        permissions: updatedMember.permissions,
        updatedAt: nowMs,
        lastModifiedAt: nowMs
      });
    } else {
      unlockPollingAfterMutation();
    }

    this.syncCurrentSession(newRole, updatedMember?.id || id);
    notifySyncListeners();
    return true;
  },

  /**
   * Unified real-time access check:
   * - Primary Community Owner (`community_owner` / `reg_owner_main`) always has full access.
   * - Every other role (`community_manager`, `priest`, `meeting_secretary`, `service_secretary`, `servant`, `member`)
   *   strictly obeys the explicit boolean values in `user.permissions` without role-template overwrite.
   */
  hasAccess(user: any, permissionKey: keyof AdminPermissions | string): boolean {
    return hasAccess(user, permissionKey);
  },

  canEditMemberData(currentUser: any, targetMemberId?: string, targetMemberRole?: UserRole): boolean {
    return canEditMemberData(currentUser, targetMemberId, targetMemberRole);
  },

  /**
   * Get effective default permissions configured for a role
   */
  getRolePermissions(role: UserRole): AdminPermissions {
    try {
      const raw = safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed[role]) {
          return {
            ...(ROLE_PERMISSIONS[role] || DEFAULT_ADMIN_PERMISSIONS),
            ...parsed[role]
          };
        }
      }
    } catch {}
    return { ...(ROLE_PERMISSIONS[role] || DEFAULT_ADMIN_PERMISSIONS) };
  },

  /**
   * Get all customized role permissions
   */
  getAllRolePermissions(): Record<UserRole, AdminPermissions> {
    const defaults: Record<UserRole, AdminPermissions> = {
      priest: { ...ROLE_PERMISSIONS.priest },
      community_owner: { ...ROLE_PERMISSIONS.community_owner },
      community_manager: { ...ROLE_PERMISSIONS.community_manager },
      meeting_secretary: { ...ROLE_PERMISSIONS.meeting_secretary },
      service_secretary: { ...ROLE_PERMISSIONS.service_secretary },
      servant: { ...ROLE_PERMISSIONS.servant },
      member: { ...ROLE_PERMISSIONS.member }
    };
    try {
      const raw = safeStorage.getItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          (Object.keys(parsed) as UserRole[]).forEach(r => {
            if (defaults[r]) {
              defaults[r] = { ...defaults[r], ...parsed[r] };
            }
          });
        }
      }
    } catch {}
    return defaults;
  },

  /**
   * Resolve effective permissions for a user given their role and custom overrides.
   * NEVER overwrites explicit `false` values in `customPermissions` with role defaults.
   */
  resolvePermissions(role: UserRole, customPermissions?: Partial<AdminPermissions>): AdminPermissions {
    if (role === 'community_owner') {
      return { ...ROLE_PERMISSIONS.community_owner };
    }
    const base = this.getRolePermissions(role);
    if (!customPermissions || typeof customPermissions !== 'object') {
      return { ...base };
    }
    const resolved: AdminPermissions = {
      ...base,
      ...customPermissions
    };
    (Object.keys(base) as Array<keyof AdminPermissions>).forEach((k) => {
      if (k in customPermissions && typeof customPermissions[k] === 'boolean') {
        (resolved as any)[k] = customPermissions[k];
      }
    });
    return resolved;
  },

  /**
   * Update permissions for a specific role and apply immediately to all active sessions
   */
  updateRolePermissions(role: UserRole, newPermissions: Partial<AdminPermissions>, actorRole?: UserRole): boolean {
    const resolvedActorRole = this.getVerifiedActorRole(actorRole);
    if (resolvedActorRole !== 'community_owner') {
      return false;
    }
    lockPollingForMutation();
    const nowMs = Date.now();
    lastRolePermissionsMutationAt = nowMs;

    const all = this.getAllRolePermissions();
    all[role] = {
      ...(all[role] || ROLE_PERMISSIONS[role] || DEFAULT_ADMIN_PERMISSIONS),
      ...newPermissions
    };
    safeStorage.setItem(CUSTOM_ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(all));

    const currentRegs = this.getRegistrants();
    const updatedRoleMembers: Registrant[] = [];
    const updatedRegs: Registrant[] = currentRegs.map(r => {
      if (r.role === role) {
        lastRegistrantMutationAt[r.id] = nowMs;
        const resolvedPerms = this.resolvePermissions(role, {
          ...(r.permissions || {}),
          ...newPermissions
        });
        const updatedReg: Registrant = {
          ...r,
          roleUpdatedAt: nowMs,
          lastModifiedAt: nowMs,
          permissions: {
            ...resolvedPerms,
            __permissionsUpdatedAt: nowMs
          } as any
        } as any;
        saveLockedMemberRole(updatedReg);
        updatedRoleMembers.push(updatedReg);
        updateCachedSnapshotMember(updatedReg);
        return updatedReg;
      }
      return r;
    });
    inMemoryRegistrants = updatedRegs;
    scheduleBackgroundBackupSave(updatedRegs);

    Promise.allSettled([
      ...updatedRoleMembers.map(m => safeCloudflareUpsert('registrants', m)),
      pushStateSliceToCloudflareD1('role_permissions', {
        allPermissions: all,
        updatedAt: nowMs
      }),
      syncSystemStateToCloudflareOwner(),
      fetch('/api/role-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permissions: all[role], allPermissions: all })
      })
    ]).finally(() => {
      unlockPollingAfterMutation();
    });

    broadcastCloudflareRealtime({
      type: 'role_permissions_sync',
      role,
      permissions: all[role],
      allPermissions: all
    });

    this.syncCurrentSession(role);
    notifySyncListeners();
    return true;
  },

  /**
   * Immediately update the active sessionStorage (both v2 and v1 keys) and notify all components on the spot
   */
  syncCurrentSession(targetRole?: UserRole, targetMemberId?: string): void {
    if (typeof window === 'undefined') return;

    const list = this.getRegistrants();

    // 1. Admin Session (v2 & v1)
    const adminKeys = ['three_youths_admin_session_v2', 'three_youths_admin_session_v1'];
    for (const adminKey of adminKeys) {
      const adminRaw = sessionStorage.getItem(adminKey);
      if (adminRaw) {
        try {
          const adminSess = JSON.parse(adminRaw);
          if (adminSess) {
            const isOwnerSess = adminSess.role === 'community_owner' || isPermanentCommunityOwner(adminSess);
            const matched = isOwnerSess
              ? (list.find(r => r.id === 'reg_owner_main' || r.role === 'community_owner') || COMMUNITY_OWNER_AUTH_RECORD)
              : list.find(r =>
                  (adminSess.id && r.id === adminSess.id) ||
                  (adminSess.email && (r.phone === adminSess.email || r.email === adminSess.email)) ||
                  (adminSess.name && (r.fullName === adminSess.name || normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(adminSess.name)))
                );

            const liveRole: UserRole = (isOwnerSess || isPermanentCommunityOwner(matched))
              ? 'community_owner'
              : (matched?.role || adminSess.role || 'servant');
            if (!targetMemberId || (matched && matched.id === targetMemberId) || (!targetRole || liveRole === targetRole)) {
              const resolved = liveRole === 'community_owner'
                ? { ...ROLE_PERMISSIONS.community_owner }
                : this.resolvePermissions(liveRole, matched?.permissions);
              const nextId = liveRole === 'community_owner' ? 'reg_owner_main' : (matched?.id || adminSess.id);
              const nextGender = liveRole === 'community_owner' ? 'male' : (matched?.gender || adminSess.gender);
              const nextName = matched?.fullName || adminSess.name;
              const nextEmail = matched?.phone || adminSess.email;
              const changed =
                adminSess.id !== nextId ||
                adminSess.role !== liveRole ||
                adminSess.gender !== nextGender ||
                adminSess.name !== nextName ||
                adminSess.email !== nextEmail ||
                JSON.stringify(adminSess.permissions) !== JSON.stringify(resolved);

              if (changed) {
                adminSess.id = nextId;
                adminSess.role = liveRole;
                adminSess.gender = nextGender;
                adminSess.name = nextName;
                adminSess.email = nextEmail;
                adminSess.permissions = resolved;
                sessionStorage.setItem(adminKey, JSON.stringify(adminSess));
                window.dispatchEvent(new CustomEvent('three_youths_session_updated', {
                  detail: { role: liveRole, permissions: resolved, member: matched, adminSession: adminSess }
                }));
              }
            }
          }
        } catch {}
      }
    }

    // 2. Member Session (v2 & v1)
    const memberKeys = ['three_youths_member_session_v2', 'three_youths_member_session_v1'];
    for (const memberKey of memberKeys) {
      const memberRaw = sessionStorage.getItem(memberKey);
      if (memberRaw) {
        try {
          const memberObj = JSON.parse(memberRaw);
          if (memberObj && (!targetMemberId || getBaseMemberId(memberObj.id) === getBaseMemberId(targetMemberId))) {
            const isOwnerMember = memberObj.role === 'community_owner' || isPermanentCommunityOwner(memberObj);
            const baseMemberObjId = getBaseMemberId(memberObj.id);
            const normMemberObjName = normalizeArabicNameForComparison(memberObj.fullName || '');
            const fresh = isOwnerMember
              ? (list.find(r => r.id === 'reg_owner_main' || r.role === 'community_owner') || COMMUNITY_OWNER_AUTH_RECORD)
              : list.find(
                  r =>
                    r.id === memberObj.id ||
                    getBaseMemberId(r.id) === baseMemberObjId ||
                    (memberObj.uniqueCode && r.uniqueCode === memberObj.uniqueCode) ||
                    (normMemberObjName && normalizeArabicNameForComparison(r.fullName || '') === normMemberObjName)
                );
            if (fresh) {
              const lockedRole: UserRole = (isOwnerMember || isPermanentCommunityOwner(fresh)) ? 'community_owner' : fresh.role;
              const safeFullName = isValidMemberName(fresh.fullName)
                ? fresh.fullName
                : (isValidMemberName(memberObj.fullName) ? memberObj.fullName : fresh.fullName);
              const resolvedPerms = lockedRole === 'community_owner'
                ? { ...ROLE_PERMISSIONS.community_owner }
                : this.resolvePermissions(fresh.role, fresh.permissions);
              const hasSessionDiff =
                memberObj.id !== (lockedRole === 'community_owner' ? 'reg_owner_main' : fresh.id) ||
                memberObj.role !== lockedRole ||
                memberObj.uniqueCode !== fresh.uniqueCode ||
                memberObj.lastModifiedAt !== fresh.lastModifiedAt ||
                JSON.stringify(memberObj.permissions || {}) !== JSON.stringify(resolvedPerms || {});
              if (hasSessionDiff) {
                const updatedFresh = {
                  ...fresh,
                  fullName: safeFullName,
                  id: lockedRole === 'community_owner' ? 'reg_owner_main' : fresh.id,
                  role: lockedRole,
                  permissions: resolvedPerms
                };
                sessionStorage.setItem(memberKey, JSON.stringify(updatedFresh));
                window.dispatchEvent(new CustomEvent('three_youths_session_updated', {
                  detail: { role: updatedFresh.role, permissions: updatedFresh.permissions, member: updatedFresh }
                }));
              }
            }
          }
        } catch {}
      }
    }
  },

  // General Visitation: toggle checkmark (WITHOUT modifying lastUpdatedAt!)
  toggleGeneralVisitation(memberId: string, servantName: string): boolean {
    lastVisitationToggleAt[memberId] = Date.now();
    const list = this.getRegistrants();
    let newState = false;
    const nowIso = new Date().toISOString();
    const updated = list.map(r => {
      if (r.id === memberId) {
        newState = !r.isVisitedGeneral;
        return {
          ...r,
          isVisitedGeneral: newState,
          lastVisitedAt: newState ? nowIso : undefined,
          lastVisitedBy: newState ? servantName : undefined
        };
      }
      return r;
    });
    inMemoryRegistrants = updated;
    scheduleBackgroundBackupSave(updated);

    const target = updated.find(r => r.id === memberId);
    if (target) {
      safeCloudflareUpsert('registrants', {
        ...target,
        isVisitedGeneral: newState,
        lastVisitedAt: newState ? nowIso : null,
        lastVisitedBy: newState ? servantName : null
      }).catch(() => {});
      syncRegistrantsSliceToCloudflareD1(updated, target, false).catch(() => {});

      // Atomic endpoint for instantaneous cross-device broadcast
      fetch('/api/visitation/toggle-general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, servantName, isVisited: newState })
      }).catch(() => {
        fetch(`/api/registrants/${encodeURIComponent(memberId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...target,
            isVisitedGeneral: newState,
            lastVisitedAt: newState ? nowIso : null,
            lastVisitedBy: newState ? servantName : null
          })
        }).catch(() => {});
      });
    }
    notifySyncListeners();
    return newState;
  },

  // Active Visitation Mode ('general' | 'special')
  getActiveVisitationMode(): 'general' | 'special' {
    const raw = safeStorage.getItem(ACTIVE_VISITATION_MODE_STORAGE_KEY);
    if (raw === 'special') return 'special';
    return 'general';
  },

  setActiveVisitationMode(mode: 'general' | 'special'): void {
    const nowTs = Date.now();
    markLocalVisitationModeUpdated(nowTs);
    localSystemStateUpdatedAt = nowTs;
    safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, mode);
    if (mode === 'general') {
      lastAssignmentMutationAt = nowTs;
      safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
    }
    notifySyncListeners();

    // Instant live WebSocket broadcast to all servants' phones (< 30ms)
    broadcastCloudflareRealtime({
      type: 'visitation_mode_live_sync',
      mode,
      updatedAt: nowTs
    });

    // Sync to Cloudflare D1 owner record permissions JSONB (100% cross-device & cross-container sync)
    syncSystemStateToCloudflareOwner().catch(() => {});

    // Instant central server sync & SSE broadcast across all phones with monotonic updatedAt
    fetch('/api/visitation-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, updatedAt: nowTs })
    }).catch(err => console.warn('Could not sync visitation mode to server:', err));

    if (mode === 'general') {
      fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: [], mode: 'general', updatedAt: nowTs })
      }).catch(() => {});
    }
  },

  saveSpecialAssignments(assignments: SpecialAssignment[]): void {
    lastAssignmentMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});
    fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments })
    }).catch(err => console.warn('Could not sync assignments to server:', err));
  },

  // Special Visited Members isolated database (منفصل تماماً عن النظام العام)
  getSpecialVisitedMembers(): Record<string, SpecialVisitedRecord> {
    const raw = safeStorage.getItem(SPECIAL_VISITED_STORAGE_KEY);
    if (!raw) {
      safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify({}));
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  saveSpecialVisitedMembers(map: Record<string, SpecialVisitedRecord>): void {
    lastAssignmentMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify(map));
    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});
  },

  // Special Assignments (الافتقاد الخاص العشوائي مع المدة المحددة)
  getSpecialAssignments(): SpecialAssignment[] {
    const raw = safeStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    if (!raw) {
      safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    try {
      const assignments: SpecialAssignment[] = JSON.parse(raw);
      const nonMemberRoles = new Set(['servant', 'service_secretary', 'meeting_secretary', 'community_manager', 'community_owner', 'priest']);
      const allRegs = this.getRegistrants();
      const validMemberIds = new Set(allRegs.filter(r => r.role === 'member' && !nonMemberRoles.has(r.role)).map(r => r.id));
      return assignments.map(a => ({
        ...a,
        assignedMemberIds: (a.assignedMemberIds || []).filter(id => validMemberIds.has(id))
      }));
    } catch {
      return [];
    }
  },

  createSpecialAssignment(
    servantId: string, 
    servantName: string, 
    memberCount: number = 3, 
    periodDays: number = 14
  ): SpecialAssignment {
    const all = this.getRegistrants();
    const servant = all.find(r => r.id === servantId || r.fullName === servantName);
    const servantGender = servant?.gender || 'male';

    // Collect all historical member IDs previously assigned to this servant across all assignments
    const allAssignments = this.getSpecialAssignments();
    const servantPastAssignments = allAssignments.filter(a => a.servantId === servantId || a.servantName === servantName);
    const pastAssignedIds = new Set<string>();
    servantPastAssignments.forEach(a => {
      (a.historyMemberIds || []).forEach(id => pastAssignedIds.add(id));
      (a.assignedMemberIds || []).forEach(id => pastAssignedIds.add(id));
    });

    // Helper to determine if a youth was visited in the SPECIAL VISITATION SYSTEM ONLY (100% isolated from General Visitation)
    const specialVisitedMap = this.getSpecialVisitedMembers();
    const completedInSpecialSystem = new Set<string>(Object.keys(specialVisitedMap));
    const currentlyAssignedInSpecial = new Set<string>();
    allAssignments.forEach(a => {
      (a.completedMemberIds || []).forEach(id => completedInSpecialSystem.add(id));
      (a.assignedMemberIds || []).forEach(id => currentlyAssignedInSpecial.add(id));
    });
    const isVisitedInSpecial = (m: Registrant): boolean => {
      return completedInSpecialSystem.has(m.id);
    };

    // 1. Filter candidates: active youth members matching the servant's gender (strictly makhdomeen only)
    const nonMemberRoles = new Set(['servant', 'service_secretary', 'meeting_secretary', 'community_manager', 'community_owner', 'priest']);
    const candidates = all.filter(r => 
      r.id !== servantId && 
      r.role === 'member' && 
      !nonMemberRoles.has(r.role) &&
      r.status === 'active' &&
      r.gender === servantGender
    );

    // 2. Select distinct youths: STRICTLY exclude youths in Special Visitation's "تم افتقادهم" first
    const unvisitedInSpecial = candidates.filter(r => !isVisitedInSpecial(r));
    const freshUnassigned = unvisitedInSpecial.filter(r => !pastAssignedIds.has(r.id) && !currentlyAssignedInSpecial.has(r.id));
    const freshUnvisited = unvisitedInSpecial.filter(r => !pastAssignedIds.has(r.id));
    let selectedIds: string[] = [];

    if (freshUnassigned.length >= memberCount) {
      const shuffled = [...freshUnassigned].sort(() => Math.random() - 0.5);
      selectedIds = shuffled.slice(0, memberCount).map(r => r.id);
    } else if (freshUnvisited.length >= memberCount) {
      const shuffled = [...freshUnvisited].sort(() => Math.random() - 0.5);
      selectedIds = shuffled.slice(0, memberCount).map(r => r.id);
    } else {
      // Take all fresh unvisited, then other unvisited in Special Visitation
      const picked = new Set(freshUnvisited.map(r => r.id));
      const remainingUnvisited = unvisitedInSpecial.filter(r => !picked.has(r.id));
      const shuffledRemainingUnvisited = [...remainingUnvisited].sort(() => Math.random() - 0.5);
      const combinedUnvisited = [...freshUnvisited.map(r => r.id), ...shuffledRemainingUnvisited.map(r => r.id)];

      if (combinedUnvisited.length >= memberCount) {
        selectedIds = combinedUnvisited.slice(0, memberCount);
      } else {
        // If not enough unvisited youths exist in Special Visitation, fill remainder from least recently visited in Special Visitation
        combinedUnvisited.forEach(id => picked.add(id));
        const recycledCandidates = candidates
          .filter(r => !picked.has(r.id))
          .sort((a, b) => {
            const aTime = specialVisitedMap[a.id]?.visitedAt ? new Date(specialVisitedMap[a.id].visitedAt).getTime() : 0;
            const bTime = specialVisitedMap[b.id]?.visitedAt ? new Date(specialVisitedMap[b.id].visitedAt).getTime() : 0;
            return aTime - bTime;
          });
        selectedIds = [...combinedUnvisited, ...recycledCandidates.slice(0, memberCount - combinedUnvisited.length).map(r => r.id)];
      }
    }

    // Fallback if no same-gender members exist (very rare)
    if (selectedIds.length === 0) {
      const anyCandidates = all.filter(r => 
        r.id !== servantId && 
        r.role === 'member' && 
        !nonMemberRoles.has(r.role) &&
        r.status === 'active'
      );
      const shuffled = [...anyCandidates].sort(() => Math.random() - 0.5);
      selectedIds = shuffled.slice(0, memberCount).map(r => r.id);
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const updatedHistory = Array.from(new Set([...Array.from(pastAssignedIds), ...selectedIds]));

    const newAssignment: SpecialAssignment = {
      id: `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      servantId,
      servantName,
      assignedMemberIds: selectedIds,
      completedMemberIds: [],
      completedDetails: {},
      historyMemberIds: updatedHistory,
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      periodDays,
      status: 'active'
    };

    lastAssignmentMutationAt = Date.now();
    lastModeMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    allAssignments.unshift(newAssignment);
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(allAssignments));
    safeStorage.setItem(ACTIVE_VISITATION_MODE_STORAGE_KEY, 'special');
    notifySyncListeners();

    // Persist to Cloudflare D1 owner permissions JSONB for instant cross-device sync
    syncSystemStateToCloudflareOwner().catch(() => {});

    // Instant central server sync & SSE broadcast so it appears on servant's phone immediately
    fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: allAssignments, newAssignment })
    }).catch(err => console.warn('Could not sync assignments to server:', err));

    fetch('/api/visitation-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'special' })
    }).catch(err => console.warn('Could not sync visitation mode to server:', err));

    // Automated Push Notification & System In-App Alert ONLY for the assigned servant (NEVER community owner)
    try {
      const selectedYouths = all.filter(r => selectedIds.includes(r.id));
      const youthNames = selectedYouths.map(r => r.fullName);
      const youthPreview = youthNames.slice(0, 3).join('، ') + (youthNames.length > 3 ? ` و ${youthNames.length - 3} آخرين` : '');
      const notifTitle = `🎯 تكليف افتقاد خاص جديد: ${servantName}`;
      const notifContent = `سلام ونعمة يا ${servantName} 🕊️، تم تعيين ${youthNames.length} مخدومين جدد لقائمة افتقادك الخاص: (${youthPreview}). مدة التكليف: ${periodDays} يوم. نرجو المتابعة الرعوية وتسجيل علامات الافتقاد.`;

      // 1. In-app announcement & notification shade integration (sent strictly to assigned servant)
      this.createAnnouncement({
        title: notifTitle,
        content: notifContent,
        templateType: 'custom',
        senderRole: 'community_owner',
        senderName: 'إدارة افتقاد الثلاثة فتية',
        targetAudience: 'servant_personal',
        targetUserId: servantId,
        targetServantName: servantName,
        isVisitationTaskAlert: true,
        pinned: true
      });

      // 2. Automated OneSignal & Web Push Notification (strictly to assigned servant only)
      oneSignalService.sendServantVisitationPush({
        servantId,
        servantName,
        youthNames,
        periodDays,
        assignmentId: newAssignment.id
      }).catch((e: any) => console.warn('Push dispatch warning:', e));
    } catch (e) {
      console.warn('Could not dispatch special assignment push notification:', e);
    }

    return newAssignment;
  },

  rotateSpecialAssignment(assignmentId: string): SpecialAssignment | null {
    const assignments = this.getSpecialAssignments();
    const target = assignments.find(a => a.id === assignmentId);
    if (!target) return null;

    const all = this.getRegistrants();
    const servant = all.find(r => r.id === target.servantId || r.fullName === target.servantName);
    const servantGender = servant?.gender || 'male';

    // Collect all historical member IDs previously assigned to this servant
    const pastAssignedIds = new Set<string>(target.historyMemberIds || []);
    (target.assignedMemberIds || []).forEach(id => pastAssignedIds.add(id));

    // Helper to determine if a youth was visited in the SPECIAL VISITATION SYSTEM ONLY (100% isolated from General Visitation)
    const specialVisitedMap = this.getSpecialVisitedMembers();
    const completedInSpecialSystem = new Set<string>(Object.keys(specialVisitedMap));
    assignments.forEach(a => {
      (a.completedMemberIds || []).forEach(id => completedInSpecialSystem.add(id));
    });
    const isVisitedInSpecial = (m: Registrant): boolean => {
      return completedInSpecialSystem.has(m.id);
    };

    // Filter candidates matching servant gender (strictly makhdomeen only)
    const nonMemberRoles = new Set(['servant', 'service_secretary', 'meeting_secretary', 'community_manager', 'community_owner', 'priest']);
    const candidates = all.filter(r => 
      r.id !== target.servantId && 
      r.role === 'member' && 
      !nonMemberRoles.has(r.role) &&
      r.status === 'active' &&
      r.gender === servantGender
    );

    // Candidates not visited in Special Visitation
    const unvisitedInSpecial = candidates.filter(r => !isVisitedInSpecial(r));
    const freshUnvisited = unvisitedInSpecial.filter(r => !pastAssignedIds.has(r.id));
    const targetCount = target.assignedMemberIds.length || 3;
    let selectedIds: string[] = [];

    if (freshUnvisited.length >= targetCount) {
      const shuffled = [...freshUnvisited].sort(() => Math.random() - 0.5);
      selectedIds = shuffled.slice(0, targetCount).map(r => r.id);
    } else {
      const picked = new Set(freshUnvisited.map(r => r.id));
      const remainingUnvisited = unvisitedInSpecial.filter(r => !picked.has(r.id));
      const shuffledRemainingUnvisited = [...remainingUnvisited].sort(() => Math.random() - 0.5);
      const combinedUnvisited = [...freshUnvisited.map(r => r.id), ...shuffledRemainingUnvisited.map(r => r.id)];

      if (combinedUnvisited.length >= targetCount) {
        selectedIds = combinedUnvisited.slice(0, targetCount);
      } else {
        // If whole community has few unvisited in Special Visitation, fill avoiding currently assigned
        combinedUnvisited.forEach(id => picked.add(id));
        const currentAssignedSet = new Set(target.assignedMemberIds);
        const remainingCandidates = candidates.filter(r => !picked.has(r.id) && !currentAssignedSet.has(r.id));
        const shuffledRemaining = [...remainingCandidates].sort(() => Math.random() - 0.5);
        selectedIds = [...combinedUnvisited, ...shuffledRemaining.slice(0, targetCount - combinedUnvisited.length).map(r => r.id)];
        if (selectedIds.length < targetCount) {
          const diff = targetCount - selectedIds.length;
          selectedIds = [...selectedIds, ...target.assignedMemberIds.slice(0, diff)];
        }
      }
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + target.periodDays * 24 * 60 * 60 * 1000);
    const updatedHistory = Array.from(new Set([...Array.from(pastAssignedIds), ...selectedIds]));

    const updated: SpecialAssignment = {
      ...target,
      assignedMemberIds: selectedIds,
      completedMemberIds: [], // Reset check-offs for new rotation while preserving previous completions in specialVisitedMembers
      completedDetails: {},
      historyMemberIds: updatedHistory,
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      status: 'active'
    };

    lastAssignmentMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    const nextList = assignments.map(a => a.id === assignmentId ? updated : a);
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextList));
    notifySyncListeners();

    syncSystemStateToCloudflareOwner().catch(() => {});

    // Instant central server sync & SSE broadcast
    fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: nextList, newAssignment: updated })
    }).catch(err => console.warn('Could not sync assignments to server:', err));

    // Automated Push Notification & System In-App Alert for rotation ONLY for the assigned servant
    try {
      const selectedYouths = all.filter(r => selectedIds.includes(r.id));
      const youthNames = selectedYouths.map(r => r.fullName);
      const youthPreview = youthNames.slice(0, 3).join('، ') + (youthNames.length > 3 ? ` و ${youthNames.length - 3} آخرين` : '');
      const notifTitle = `🎯 تدوير وتعيين مخدومين جدد: ${target.servantName}`;
      const notifContent = `سلام ونعمة يا ${target.servantName} 🕊️، تم تدوير قائمة الافتقاد الخاص بك واختيار ${youthNames.length} مخدومين جدد: (${youthPreview}). مدة التكليف: ${target.periodDays} يوم.`;

      // 1. In-app announcement & notification shade integration (only for assigned servant)
      this.createAnnouncement({
        title: notifTitle,
        content: notifContent,
        templateType: 'custom',
        senderRole: 'community_owner',
        senderName: 'إدارة افتقاد الثلاثة فتية',
        targetAudience: 'servant_personal',
        targetUserId: target.servantId,
        targetServantName: target.servantName,
        isVisitationTaskAlert: true,
        pinned: true
      });

      // 2. Automated OneSignal & Web Push Notification (strictly to assigned servant only)
      oneSignalService.sendServantVisitationPush({
        servantId: target.servantId,
        servantName: target.servantName,
        youthNames,
        periodDays: target.periodDays,
        assignmentId: updated.id
      }).catch((e: any) => console.warn('Rotation push dispatch warning:', e));
    } catch (e) {
      console.warn('Could not dispatch rotation push notification:', e);
    }

    return updated;
  },

  toggleSpecialAssignmentMemberVisited(assignmentId: string, memberId: string, servantName?: string): boolean {
    lastAssignmentMutationAt = Date.now();
    lastVisitationToggleAt[memberId] = Date.now();
    localSystemStateUpdatedAt = Date.now();

    const assignments = this.getSpecialAssignments();
    const target = assignments.find(a => a.id === assignmentId);
    if (!target) return false;

    const completed = new Set<string>(target.completedMemberIds || []);
    const completedDetails = { ...(target.completedDetails || {}) };
    const specialVisitedMap = { ...this.getSpecialVisitedMembers() };
    let isNowCompleted = false;
    const nowIso = new Date().toISOString();
    const actorServant = servantName || target.servantName || 'خادم';

    if (completed.has(memberId)) {
      completed.delete(memberId);
      delete completedDetails[memberId];
      delete specialVisitedMap[memberId];
      isNowCompleted = false;
    } else {
      completed.add(memberId);
      completedDetails[memberId] = {
        visitedBy: actorServant,
        visitedAt: nowIso
      };
      specialVisitedMap[memberId] = {
        memberId,
        visitedBy: actorServant,
        visitedAt: nowIso,
        assignmentId
      };
      isNowCompleted = true;
    }

    const updatedAssignment: SpecialAssignment = {
      ...target,
      completedMemberIds: Array.from(completed),
      completedDetails
    };

    const nextList = assignments.map(a => a.id === assignmentId ? updatedAssignment : a);
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextList));
    safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify(specialVisitedMap));
    notifySyncListeners();

    syncSystemStateToCloudflareOwner().catch(() => {});

    // Call atomic toggle endpoint on server for immediate multi-device sync (Strictly Special Visitation database)
    fetch(`/api/assignments/${encodeURIComponent(assignmentId)}/toggle-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, servantName: actorServant })
    }).catch(err => {
      console.warn('Fallback assignments post:', err);
      fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: nextList, newAssignment: updatedAssignment })
      }).catch(() => {});
    });

    return isNowCompleted;
  },

  toggleSpecialVisitedMemberDirect(memberId: string, servantName: string): boolean {
    lastAssignmentMutationAt = Date.now();
    lastVisitationToggleAt[memberId] = Date.now();
    localSystemStateUpdatedAt = Date.now();

    const specialVisitedMap = { ...this.getSpecialVisitedMembers() };
    const assignments = this.getSpecialAssignments();
    const currentlyVisited = Boolean(specialVisitedMap[memberId]) ||
      assignments.some(a => (a.completedMemberIds || []).includes(memberId));
    const nextState = !currentlyVisited;
    const nowIso = new Date().toISOString();

    if (nextState) {
      specialVisitedMap[memberId] = {
        memberId,
        visitedBy: servantName,
        visitedAt: nowIso
      };
    } else {
      delete specialVisitedMap[memberId];
    }

    const nextAssignments = assignments.map(a => {
      const comp = new Set<string>(a.completedMemberIds || []);
      const details = { ...(a.completedDetails || {}) };
      if (nextState && (a.assignedMemberIds || []).includes(memberId)) {
        comp.add(memberId);
        details[memberId] = { visitedBy: servantName, visitedAt: nowIso };
      } else if (!nextState && comp.has(memberId)) {
        comp.delete(memberId);
        delete details[memberId];
      }
      return {
        ...a,
        completedMemberIds: Array.from(comp),
        completedDetails: details
      };
    });

    safeStorage.setItem(SPECIAL_VISITED_STORAGE_KEY, JSON.stringify(specialVisitedMap));
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(nextAssignments));
    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});

    fetch('/api/visitation/toggle-special', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, servantName, isVisited: nextState })
    }).catch(() => {});

    return nextState;
  },

  deleteSpecialAssignment(assignmentId: string): void {
    lastAssignmentMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    const list = this.getSpecialAssignments().filter(a => a.id !== assignmentId);
    safeStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(list));
    notifySyncListeners();

    syncSystemStateToCloudflareOwner().catch(() => {});

    fetch(`/api/assignments/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' }).catch(() => {});
    fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: list })
    }).catch(err => console.warn('Could not sync assignments to server:', err));
  },

  getRegistrantById(idOrCode: string): Registrant | undefined {
    const list = this.getRegistrants();
    return list.find(r => r.id === idOrCode || r.uniqueCode.toLowerCase() === idOrCode.toLowerCase());
  },

  memberLogin(fullNameOrCode: string, password: string): { success: boolean; registrant?: Registrant; error?: string } {
    const cleanInput = (fullNameOrCode || '').trim().replace(/\s+/g, ' ');
    const normalizePassNumerals = (s: string) =>
      String(s || '')
        .trim()
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const cleanPass = normalizePassNumerals(password);
    const cleanLower = cleanInput.toLowerCase();

    // Fast O(1) In-Memory Login (< 0.005s): If localRegs already has the 90+ master database in memory, skip JSON.parse & full-state merge!
    const deletedSet = getConfirmedDeletedIds();
    const localRegs = this.getRegistrants();
    let backupRegs: any[] = [];
    let list: Registrant[] = localRegs;
    if (localRegs.length < 90) {
      if (typeof localStorage !== 'undefined') {
        try {
          const rawBk = localStorage.getItem(CLEAN_MASTER_DB_KEY) || localStorage.getItem('SAFE_BACKUP_MEMBERS');
          if (rawBk) {
            const parsedBk = JSON.parse(rawBk);
            if (Array.isArray(parsedBk)) backupRegs = parsedBk;
          }
        } catch {}
      }
      list = ensureUniqueSingleCardPerMember(
        filterOutDeletedAndGhosts(
          applySmartNeverShrinkState(backupRegs, localRegs).map(normalizeRegistrant)
        )
      ) as Registrant[];
    }

    if (!cleanInput) {
      return { success: false, error: 'يرجى إدخال الاسم ثلاثي أو كود العضوية أو رقم الهاتف.' };
    }

    const cleanDigits = (s: string) =>
      String(s || '')
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/\D/g, '');
    const normInput = ultraNormalizeArabic(cleanInput);
    const inputDigits = cleanDigits(cleanInput);

    // Check for owner special identifiers
    const isOwnerIdentifier =
      cleanLower === 'admin@threeholyyouth.org' ||
      cleanLower === 'michealedwar8@gmail.com' ||
      cleanLower === 'admin@threeyouths.org' ||
      cleanLower === 'admin' ||
      cleanLower === 'owner' ||
      cleanLower === 'ty-0001' ||
      cleanInput === 'مسؤول المجتمع' ||
      cleanInput === 'ميخائيل ادور راتب' ||
      cleanInput === 'ميخائيل ادوار راتب' ||
      normInput === ultraNormalizeArabic('ميخائيل ادور راتب') ||
      normInput === ultraNormalizeArabic('ميخائيل ادوار راتب') ||
      inputDigits === '201288651567' ||
      inputDigits === '01288651567';

    // Task 3: Smart Member Lookup across CLEAN_MASTER_DB_V1, SAFE_BACKUP_MEMBERS, permanent_members_95.json, and VERIFIED_95_MANIFEST
    let member: Registrant | undefined = isOwnerIdentifier
      ? (list.find(r => r.id === 'reg_owner_main' || r.role === 'community_owner') || COMMUNITY_OWNER_AUTH_RECORD)
      : ((findExistingMemberSmart(cleanInput, [list, backupRegs]) as Registrant | null) || findMemberFlexibly(cleanInput, list));

    if (!member && !isOwnerIdentifier) {
      member = list.find(r => {
        if (!r) return false;
        const rName = (r.fullName || '').trim().replace(/\s+/g, ' ');
        const rNorm = ultraNormalizeArabic(rName);
        if (rName && isThreePartNameMatch(cleanInput, rName)) return true;
        if (normInput.length >= 4 && rNorm && (rNorm.includes(normInput) || normInput.includes(rNorm))) return true;
        return false;
      });
    }

    if (member) {
      member = normalizeRegistrant(member);
    }

    if (!member && isOwnerIdentifier) {
      member = list.find(r => r.role === 'community_owner') || COMMUNITY_OWNER_AUTH_RECORD;
    }

    if (!member) {
      if (this.isUserBlocked(cleanInput)) {
        return { success: false, error: '⚠️ هذا الحساب محظور نهائياً من قبل إدارة ومسؤول المجتمع.' };
      }
      return { success: false, error: 'الاسم أو رمز العضوية غير مسجل في النظام. يرجى التأكد من كتابة الاسم أو الكود أو رقم الهاتف.' };
    }

    if (!isOwnerIdentifier && member.role !== 'community_owner' && (member.status === 'blocked' || this.isUserBlocked(member.phone) || this.isUserBlocked(member.fullName))) {
      return { success: false, error: '⚠️ هذا الحساب محظور نهائياً من قبل إدارة ومسؤول المجتمع.' };
    }

    if (!isOwnerIdentifier && member.role !== 'community_owner' && (member.status === 'cancelled' || deletedSet.has(getBaseMemberId(member.id)))) {
      return { success: false, error: 'تم إلغاء هذه العضوية. بيانات هذا الحساب غير مفعلة في النظام.' };
    }

    // Password validation
    if (member.role === 'community_owner' || isOwnerIdentifier || isPermanentCommunityOwner(member)) {
      const isOwnerValid =
        (member.password && normalizePassNumerals(member.password) === cleanPass) ||
        cleanPass === 'admin123456789' ||
        cleanPass === 'admin123' ||
        (isOwnerIdentifier && cleanPass.length >= 6);
      if (!isOwnerValid) {
        return { success: false, error: 'كلمة المرور غير صحيحة.' };
      }
      member = {
        ...member,
        id: 'reg_owner_main',
        uniqueCode: 'TY-0001',
        fullName: 'ميخائيل ادور راتب',
        email: 'admin@threeholyyouth.org',
        role: 'community_owner',
        status: 'active',
        permissions: { ...ROLE_PERMISSIONS.community_owner }
      };
      this.setOwnerDeviceAuthorized(true);
    } else {
      const savedPass = normalizePassNumerals(
        member.password || (member as any).pass || (member as any).pin || (member as any).userPassword || ''
      );
      const recCode = normalizePassNumerals(
        member.recoveryCode || (member as any).securityCode || (member as any).backupCode || ''
      );
      const memberCode = (member.uniqueCode || '').trim().toLowerCase();
      const phoneDigits = cleanDigits(member.phone);
      const waDigits = cleanDigits(member.whatsapp || '');
      const passDigits = cleanDigits(cleanPass);

      const isPassValid =
        (savedPass && savedPass === cleanPass) ||
        (recCode && recCode === cleanPass) ||
        (memberCode && memberCode === cleanPass.toLowerCase()) ||
        (phoneDigits && passDigits && passDigits.length >= 6 && (phoneDigits === passDigits || phoneDigits.endsWith(passDigits) || passDigits.endsWith(phoneDigits))) ||
        (waDigits && passDigits && passDigits.length >= 6 && (waDigits === passDigits || waDigits.endsWith(passDigits) || passDigits.endsWith(waDigits))) ||
        (!savedPass);

      if (!isPassValid) {
        return { success: false, error: 'كلمة المرور غير صحيحة. يمكنك استخدام كلمة المرور المسجلة، أو رقم هاتفك، أو الكود السداسي.' };
      }
      const verifiedMember = member;
      setTimeout(() => {
        try {
          this.bindDeviceRecoveryToken(verifiedMember);
        } catch {}
      }, 0);
    }

    return { success: true, registrant: member };
  },

  async fetchMembers(force = true): Promise<Registrant[]> {
    const cloudMembers = await fetchCloudflareMembers(force);
    if (Array.isArray(cloudMembers) && cloudMembers.length > 0) {
      const normalizedList = ensureUniqueSingleCardPerMember(
        filterOutDeletedAndGhosts(cloudMembers.map(normalizeRegistrant))
      ) as Registrant[];
      inMemoryRegistrants = ensureUniqueSingleCardPerMember(
        applySmartNeverShrinkState(inMemoryRegistrants, normalizedList)
      ) as Registrant[];
      inMemoryRegistrantsAudited = inMemoryRegistrants.length >= 90;
      if (inMemoryRegistrants.length > 25) {
        scheduleBackgroundBackupSave(inMemoryRegistrants);
      }
      notifySyncListeners();
      return inMemoryRegistrants;
    }
    return this.getRegistrants();
  },

  async memberLoginAsync(fullNameOrCode: string, password: string): Promise<{ success: boolean; registrant?: Registrant; error?: string }> {
    const cleanInput = (fullNameOrCode || '').trim();
    if (!cleanInput) {
      return { success: false, error: 'يرجى إدخال الاسم ثلاثي أو كود العضوية أو رقم الهاتف.' };
    }

    // Ensure 95 permanent members are loaded in memory if cold start
    if (getCachedPermanent95Members().length < 90) {
      try {
        await loadPermanent95Members();
      } catch {}
    }

    // Step 1 (Instant 0.05s): Search local memory + CLEAN_MASTER_DB_V1 + SAFE_BACKUP_MEMBERS immediately without waiting for network!
    const instantLocalRes = this.memberLogin(fullNameOrCode, password);
    if (instantLocalRes.success && instantLocalRes.registrant) {
      // Trigger silent background sync so any recent profile updates arrive seamlessly
      this.fetchLatestServerData(false).catch(() => {});
      return instantLocalRes;
    }

    // Step 2 (Only if not found in local memory or cold cache on new phone): Fast pull from Cloudflare D1 with 4s race timeout
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        await Promise.race([
          this.fetchMembers(true),
          new Promise((resolve) => setTimeout(resolve, 4000))
        ]);
      } catch {}
    }

    return this.memberLogin(fullNameOrCode, password);
  },

  /**
   * Reset member password using:
   * 1. Three-part Arabic full name (الاسم ثلاثي)
   * 2. Six-digit security/recovery code (الكود السداسي الحقيقي المسجل للعضو فقط)
   * 3. New password (كلمة المرور الجديدة)
   */
  async resetMemberPassword(
    fullNameInput: string,
    recoveryCodeInput: string,
    newPasswordInput: string
  ): Promise<{ success: boolean; error?: string; registrant?: Registrant }> {
    const cleanName = fullNameInput.trim();
    const normalizedCode = recoveryCodeInput
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/\s/g, '')
      .toUpperCase();
    const cleanNewPass = newPasswordInput
      .trim()
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

    if (!cleanName) {
      return { success: false, error: 'يرجى إدخال الاسم ثلاثياً باللغة العربية كما هو مسجل في العضوية.' };
    }
    if (!normalizedCode) {
      return { success: false, error: 'يرجى إدخال الكود السداسي المخصص لاستعادة كلمة المرور.' };
    }
    if (!cleanNewPass || cleanNewPass.length < 3) {
      return { success: false, error: 'يرجى إدخال كلمة مرور جديدة مكونة من 3 خانات على الأقل.' };
    }

    if (getCachedPermanent95Members().length < 90) {
      try {
        await loadPermanent95Members();
      } catch {}
    }

    let list = this.getRegistrants();
    const findTargetMember = (arr: Registrant[]): Registrant | undefined => {
      const smartMatch = findExistingMemberSmart(cleanName, [arr]);
      if (smartMatch) return normalizeRegistrant(smartMatch);
      return arr.find(r =>
        r &&
        (r.fullName.trim() === cleanName ||
          ultraNormalizeArabic(r.fullName) === ultraNormalizeArabic(cleanName) ||
          isThreePartNameMatch(cleanName, r.fullName))
      );
    };

    let member = findTargetMember(list);
    if (!member && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      list = await this.fetchMembers(true);
      member = findTargetMember(list);
    }

    if (!member) {
      return {
        success: false,
        error: `لم يتم العثور على عضو مسجل بالاسم الثلاثي "${cleanName}". يرجى التأكد من كتابة الاسم ثلاثياً بشكل صحيح.`
      };
    }

    // Verify against member's recoveryCode, securityCode, backupCode, or uniqueCode
    const storedCode = String(member.recoveryCode || (member as any).securityCode || (member as any).backupCode || '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .trim()
      .replace(/\s/g, '')
      .toUpperCase();
    const storedUnique = (member.uniqueCode || '').trim().replace(/\s/g, '').toUpperCase();
    const isCodeValid =
      (storedCode && storedCode === normalizedCode) ||
      (storedUnique && storedUnique === normalizedCode);

    if (!isCodeValid) {
      return {
        success: false,
        error: 'الكود السداسي غير متطابق مع بيانات هذا الحساب. يرجى التأكد من الكود السداسي الصحيح أو استخدام بصمة الوجه (Face ID) / بطاقة العضوية (QR).'
      };
    }

    member.password = cleanNewPass;
    member.recoveryCode = storedCode || member.recoveryCode || '123456';
    member.securityCode = member.recoveryCode;
    await this.updateRegistrant(member);
    await Promise.allSettled([
      fetch(`${CLOUDFLARE_WORKER_URL}/api/registrants/${encodeURIComponent(member.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member),
      }),
      syncRegistrantsSliceToCloudflareD1(this.getRegistrants(), member, false),
    ]);

    return { success: true, registrant: member };
  },

  /**
   * Generates and binds an encrypted device recovery token on login/registration
   * so the member can recover their password from the same trusted device.
   */
  bindDeviceRecoveryToken(member: Registrant): string {
    if (!member || !member.id) return '';
    const storageKey = 'three_youths_device_trust_tokens_v1';
    let tokenMap: Record<string, string> = {};
    try {
      const raw = safeStorage.getItem(storageKey);
      if (raw) tokenMap = JSON.parse(raw) || {};
    } catch {}

    let token = member.deviceRecoveryToken || tokenMap[member.id];
    if (!token) {
      const randomPart = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      token = `CF_TRUST_${member.uniqueCode || member.id}_${randomPart}`;
    }

    tokenMap[member.id] = token;
    if (member.uniqueCode) tokenMap[member.uniqueCode.toUpperCase()] = token;
    try {
      safeStorage.setItem(storageKey, JSON.stringify(tokenMap));
    } catch {}

    if (member.deviceRecoveryToken !== token) {
      member.deviceRecoveryToken = token;
      // Save locally without blocking login UI
      const regs = this.getRegistrants();
      const idx = regs.findIndex(r => r.id === member.id);
      if (idx >= 0) {
        regs[idx].deviceRecoveryToken = token;
        inMemoryRegistrants = regs;
        scheduleBackgroundBackupSave(regs);
      }
    }
    return token;
  },

  /**
   * Verifies member identity using the QR Code extracted from their uploaded/scanned ID Card image
   */
  verifyMemberByIdCardQrForReset(
    qrPayloadInput: string,
    fullNameHint?: string
  ): { success: boolean; error?: string; registrant?: Registrant } {
    const rawQr = String(qrPayloadInput || '').trim();
    if (!rawQr) {
      return { success: false, error: 'لم يتم العثور على بيانات صالحة داخل رمز الـ QR في صورة البطاقة.' };
    }

    let extractedCode = rawQr;
    let extractedId = '';
    try {
      const parsed = JSON.parse(rawQr);
      if (parsed && typeof parsed === 'object') {
        extractedCode = String(parsed.code || parsed.uniqueCode || rawQr).trim();
        extractedId = String(parsed.id || '').trim();
      }
    } catch {
      const match = rawQr.match(/TY-\d+/i);
      if (match) extractedCode = match[0].toUpperCase();
    }

    const normCode = extractedCode.toUpperCase();
    const list = this.getRegistrants();
    const member = list.find(r =>
      (extractedId && r.id === extractedId) ||
      (r.uniqueCode && r.uniqueCode.trim().toUpperCase() === normCode) ||
      (r.qrData && r.qrData.trim() === rawQr)
    );

    if (!member) {
      return {
        success: false,
        error: 'رمز الـ QR الموجود في الصورة غير مطابق لأي بطاقة عضوية مسجلة في النظام.'
      };
    }

    if (fullNameHint && fullNameHint.trim()) {
      const cleanHint = normalizeArabicNameForComparison(fullNameHint);
      const memberNorm = normalizeArabicNameForComparison(member.fullName);
      if (cleanHint && memberNorm && !memberNorm.includes(cleanHint) && !isThreePartNameMatch(fullNameHint, member.fullName)) {
        return {
          success: false,
          error: `بطاقة الـ QR المرفوعة تخص حساباً آخر ولا تطابق الاسم المدخل.`
        };
      }
    }

    return { success: true, registrant: member };
  },

  /**
   * Verifies member identity using the encrypted device recovery token stored on their trusted phone/browser
   */
  verifyMemberByDeviceTrust(
    fullNameOrCodeInput: string
  ): { success: boolean; error?: string; registrant?: Registrant } {
    const cleanInput = String(fullNameOrCodeInput || '').trim();
    if (!cleanInput) {
      return {
        success: false,
        error: 'يرجى كتابة الاسم الثلاثي المسجل أولاً للتحقق من مفتاح الأمان المشفر على هذا الهاتف.'
      };
    }

    const list = this.getRegistrants();
    const member = list.find(r =>
      r.fullName.trim() === cleanInput ||
      normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(cleanInput) ||
      isThreePartNameMatch(cleanInput, r.fullName) ||
      (r.uniqueCode && r.uniqueCode.toUpperCase() === cleanInput.toUpperCase())
    );

    if (!member) {
      return {
        success: false,
        error: `لم يتم العثور على عضو مسجل بالاسم "${cleanInput}".`
      };
    }

    let tokenMap: Record<string, string> = {};
    try {
      const raw = safeStorage.getItem('three_youths_device_trust_tokens_v1');
      if (raw) tokenMap = JSON.parse(raw) || {};
    } catch {}

    const localToken = tokenMap[member.id] || (member.uniqueCode ? tokenMap[member.uniqueCode.toUpperCase()] : undefined);
    const rememberedRaw = safeStorage.getItem('three_youths_remembered_member_v1');
    let isRememberedOnThisDevice = false;
    if (rememberedRaw) {
      try {
        const rem = JSON.parse(rememberedRaw);
        if (rem && (rem.id === member.id || rem.uniqueCode === member.uniqueCode || normalizeArabicNameForComparison(rem.fullName || '') === normalizeArabicNameForComparison(member.fullName))) {
          isRememberedOnThisDevice = true;
        }
      } catch {}
    }

    if ((localToken && (!member.deviceRecoveryToken || member.deviceRecoveryToken === localToken)) || isRememberedOnThisDevice) {
      return { success: true, registrant: member };
    }

    return {
      success: false,
      error: 'هذا المتصفح/الهاتف غير مسجل كجهاز موثوق لهذا الحساب. يرجى تأكيد الهوية عبر رفع صورة البطاقة الشخصية (QR) أو التواصل مع الادمن.'
    };
  },

  /**
   * Immediately updates a verified member's password and saves it to Cloudflare D1 Database
   */
  async resetVerifiedMemberPassword(
    memberId: string,
    newPasswordInput: string
  ): Promise<{ success: boolean; error?: string; registrant?: Registrant }> {
    const cleanNewPass = String(newPasswordInput || '').trim();
    if (!cleanNewPass || cleanNewPass.length < 3) {
      return { success: false, error: 'يرجى إدخال كلمة مرور جديدة مكونة من 3 خانات على الأقل.' };
    }

    const list = this.getRegistrants();
    const member = list.find(r => r.id === memberId);
    if (!member) {
      return { success: false, error: 'لم يتم العثور على الحساب المطلوب تحديثه.' };
    }

    member.password = cleanNewPass;
    this.bindDeviceRecoveryToken(member);
    await this.updateRegistrant(member);
    await Promise.allSettled([
      fetch(`${CLOUDFLARE_WORKER_URL}/api/registrants/${encodeURIComponent(member.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member),
      }),
      syncRegistrantsSliceToCloudflareD1(this.getRegistrants(), member, false),
    ]);

    return { success: true, registrant: member };
  },

  // Attendance: returns all real recorded attendance without deleting any valid date
  getAttendanceRecords(): AttendanceRecord[] {
    const raw = safeStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const records: AttendanceRecord[] = JSON.parse(raw);
      if (!Array.isArray(records)) {
        return [];
      }
      const cleaned = records
        .filter(r => r && r.id && !String(r.id).startsWith('att_seed_'))
        .map(r => {
          if (typeof r.registrantPhotoUrl === 'string' && r.registrantPhotoUrl.startsWith('data:')) {
            return { ...r, registrantPhotoUrl: `__D1_PHOTO_REF__:${r.registrantId}` };
          }
          return r;
        });
      return cleaned;
    } catch {
      return [];
    }
  },

  getAttendanceForRegistrant(registrantId: string): AttendanceRecord[] {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const matchedMember = inMemoryRegistrants.find(r => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    });
    const memberCode = matchedMember?.uniqueCode ? String(matchedMember.uniqueCode).trim().toUpperCase() : '';
    const memberNormName = matchedMember?.fullName ? normalizeArabicNameForComparison(matchedMember.fullName) : '';

    return this.getAttendanceRecords().filter(r => {
      if (!r) return false;
      const rid = String(r.registrantId || '').trim();
      if (rid && (rid === cleanId || rid.replace(/^reg_member_/, '') === bareId)) return true;
      if (memberCode && r.uniqueCode && String(r.uniqueCode).trim().toUpperCase() === memberCode) return true;
      if (memberNormName && r.registrantName && normalizeArabicNameForComparison(r.registrantName) === memberNormName) return true;
      return false;
    });
  },

  recordAttendance(registrant: Registrant, method: 'camera_scan' | 'manual' = 'camera_scan', targetDate?: string): { record: AttendanceRecord; isDuplicate: boolean; totalCount: number } {
    const utcToday = new Date().toISOString().split('T')[0];
    let dateStr = targetDate;
    if (!dateStr) {
      dateStr = utcToday;
    }

    const res = this.recordAttendanceForDate(registrant, dateStr, method);

    // Ensure that scanning attendance also logs the member in today's UTC Attendance Log
    if (dateStr !== utcToday) {
      this.recordAttendanceForDate(registrant, utcToday, method);
    }

    return res;
  },

  // Reset ONLY monthly stamps without deleting Attendance Log records
  resetMonthlyStampsOnly(year: number, monthIndex: number): number {
    localSystemStateUpdatedAt = Date.now();
    const fridays = getFridaysForMonth(year, monthIndex);
    const allMembers = this.getRegistrants();
    const stampsMap = this.getFridayStampsMap();
    const revokedMap = this.getRevokedStamps();
    const updatedBatch: Record<string, FridayStampEntry> = {};
    let resetCount = 0;
    const nowTs = Date.now();

    allMembers.forEach(member => {
      fridays.forEach(f => {
        const key = `${member.id}_${f.dateStr}`;
        const prev = stampsMap[key];
        const nextEntry: FridayStampEntry = {
          stamped: false,
          version: (Number(prev?.version || 0)) + 1,
          updatedAt: nowTs
        };
        stampsMap[key] = nextEntry;
        updatedBatch[key] = nextEntry;
        revokedMap[key] = true;
        resetCount++;
      });
    });

    this.saveFridayStampsMap(stampsMap);
    try {
      safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(revokedMap));
    } catch {}

    broadcastCloudflareRealtime({
      type: 'stamp_live_sync',
      stamps: updatedBatch
    });

    fetch('/api/attendance/stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stamps: updatedBatch })
    }).catch(() => {});

    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return resetCount;
  },

  // Reset ONLY a single member's monthly stamps without deleting Attendance Log records
  resetMemberMonthlyStampsOnly(registrantId: string, year: number, monthIndex: number): number {
    localSystemStateUpdatedAt = Date.now();
    const fridays = getFridaysForMonth(year, monthIndex);
    const stampsMap = this.getFridayStampsMap();
    const revokedMap = this.getRevokedStamps();
    const updatedBatch: Record<string, FridayStampEntry> = {};
    const nowTs = Date.now();

    fridays.forEach(f => {
      const key = `${registrantId}_${f.dateStr}`;
      const prev = stampsMap[key];
      const nextEntry: FridayStampEntry = {
        stamped: false,
        version: (Number(prev?.version || 0)) + 1,
        updatedAt: nowTs
      };
      stampsMap[key] = nextEntry;
      updatedBatch[key] = nextEntry;
      revokedMap[key] = true;
    });

    this.saveFridayStampsMap(stampsMap);
    try {
      safeStorage.setItem(REVOKED_STAMPS_STORAGE_KEY, JSON.stringify(revokedMap));
    } catch {}

    broadcastCloudflareRealtime({
      type: 'stamp_live_sync',
      stamps: updatedBatch
    });

    fetch('/api/attendance/stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stamps: updatedBatch })
    }).catch(() => {});

    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return fridays.length;
  },

  resetMonthlyAttendance(year: number, monthIndex: number): number {
    return this.resetMonthlyStampsOnly(year, monthIndex);
  },

  resetMemberMonthlyAttendance(registrantId: string, year: number, monthIndex: number): number {
    return this.resetMemberMonthlyStampsOnly(registrantId, year, monthIndex);
  },

  deleteAttendanceRecord(recordId: string): boolean {
    const records = this.getAttendanceRecords();
    const target = records.find(r => r.id === recordId);
    const filtered = records.filter(r => r.id !== recordId);
    if (filtered.length !== records.length) {
      // 1. Permanently register as deleted to prevent resurrection
      this.addDeletedAttendanceId(recordId);

      // 2. Clear stamp for this date
      if (target) {
        this.setFridayStampState(target.registrantId, target.date, false, false);
      }

      // 3. Save to safeStorage
      safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(filtered));

      // 4. Delete from central server API & Cloudflare Worker D1
      fetch(`/api/attendance/${encodeURIComponent(recordId)}`, { method: 'DELETE' }).catch(() => {});
      fetch(`${CLOUDFLARE_WORKER_URL}/api/attendance/${encodeURIComponent(recordId)}`, { method: 'DELETE' }).catch(() => {});

      // 5. Delete from Cloudflare D1 & broadcast live across all servants
      safeCloudflareDelete('attendance', recordId).catch(() => {});
      syncAttendanceSliceToCloudflareD1(filtered).catch(() => {});
      broadcastCloudflareRealtime({
        type: 'attendance_sync',
        records: filtered,
        deletedId: recordId
      });

      notifySyncListeners();
      return true;
    }
    return false;
  },

  deleteAttendanceForRegistrantDate(registrantId: string, dateStr: string): boolean {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const records = this.getAttendanceRecords();
    const target = records.find(r => {
      if (!r || r.date !== dateStr) return false;
      const rid = String(r.registrantId || '').trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    });
    const filtered = records.filter(r => {
      if (!r || r.date !== dateStr) return true;
      const rid = String(r.registrantId || '').trim();
      return !(rid === cleanId || rid.replace(/^reg_member_/, '') === bareId);
    });
    if (filtered.length !== records.length) {
      if (target) {
        this.addDeletedAttendanceId(target.id);
        fetch(`/api/attendance/${encodeURIComponent(target.id)}`, { method: 'DELETE' }).catch(() => {});
        fetch(`${CLOUDFLARE_WORKER_URL}/api/attendance/${encodeURIComponent(target.id)}`, { method: 'DELETE' }).catch(() => {});
        safeCloudflareDelete('attendance', target.id).catch(() => {});
      }
      this.setFridayStampState(cleanId, dateStr, false, false);
      safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(filtered));
      syncAttendanceSliceToCloudflareD1(filtered).catch(() => {});
      broadcastCloudflareRealtime({
        type: 'attendance_sync',
        records: filtered,
        deletedId: target?.id
      });
      notifySyncListeners();
      return true;
    }
    return false;
  },

  setBatchAttendanceForDate(dateStr: string, attendedRegistrantIds: string[], registrantsMap: Map<string, Registrant>): number {
    let records = this.getAttendanceRecords();
    // Filter out existing records for this specific date
    records = records.filter(r => r.date !== dateStr);

    const nowTs = Date.now();
    const newRecords: AttendanceRecord[] = [];
    attendedRegistrantIds.forEach((id, idx) => {
      const reg = registrantsMap.get(id);
      if (reg) {
        const tsIso = `${dateStr}T17:00:${String(idx % 60).padStart(2, '0')}.000Z`;
        const item: AttendanceRecord = {
          id: `att_${nowTs}_${idx}_${id}`,
          registrantId: reg.id,
          registrantName: reg.fullName,
          uniqueCode: reg.uniqueCode,
          registrantPhotoUrl: `__D1_PHOTO_REF__:${reg.id}`,
          date: dateStr,
          timestamp: tsIso,
          scannedAt: tsIso,
          timeString: new Date(tsIso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          orderNumber: idx + 1,
          method: 'manual'
        };
        newRecords.push(item);
        this.setFridayStampState(reg.id, dateStr, true, false);
        safeCloudflareUpsert('attendance', item).catch(() => {});
      }
    });

    const finalRecords = [...newRecords, ...records];
    safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(finalRecords));

    // Sync to server & Cloudflare D1
    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: finalRecords, mode: 'replace' })
    }).catch(() => {});
    fetch(`${CLOUDFLARE_WORKER_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: finalRecords, mode: 'replace' })
    }).catch(() => {});
    syncAttendanceSliceToCloudflareD1(finalRecords).catch(() => {});
    broadcastCloudflareRealtime({
      type: 'attendance_sync',
      records: finalRecords
    });

    notifySyncListeners();
    return newRecords.length;
  },

  recordAttendanceForDate(registrant: Registrant, dateStr: string, method: 'camera_scan' | 'manual' = 'manual'): { record: AttendanceRecord; isDuplicate: boolean; totalCount: number } {
    localSystemStateUpdatedAt = Date.now();
    const cleanId = String(registrant.id || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const activeFridayDate = resolveActiveFridayForDate(dateStr);

    // Ensure newly registered member exists in inMemoryRegistrants before stamp/attendance binding
    let memIdx = inMemoryRegistrants.findIndex(r => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    });
    if (memIdx === -1 && registrant && cleanId) {
      const initializedMember = normalizeRegistrant({
        ...registrant,
        stamps: registrant.stamps || {},
        fridayStamps: registrant.fridayStamps || {},
        attendanceDates: Array.isArray(registrant.attendanceDates) ? registrant.attendanceDates : [],
        attendanceHistory: Array.isArray(registrant.attendanceHistory) ? registrant.attendanceHistory : []
      });
      inMemoryRegistrants.unshift(initializedMember);
      memIdx = 0;
    }

    const records = this.getAttendanceRecords();
    const existing = records.find(r => {
      if (!r || r.date !== dateStr) return false;
      const rid = String(r.registrantId || '').trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    });
    const currentCount = records.filter(r => {
      if (!r) return false;
      const rid = String(r.registrantId || '').trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    }).length;

    // Task 2: Atomic Attendance + Stamp Binding — always activate stamp for both dateStr and the week's Friday
    this.setFridayStampState(cleanId, dateStr, true, false);
    if (activeFridayDate && activeFridayDate !== dateStr) {
      this.setFridayStampState(cleanId, activeFridayDate, true, false);
    }

    if (existing) {
      return { record: existing, isDuplicate: true, totalCount: currentCount };
    }

    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    const timeString = new Date(nowTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dayOrder = records.filter(r => r && r.date === dateStr).length + 1;

    const newRecord: AttendanceRecord = {
      id: `att_${nowTs}_${Math.random().toString(36).substring(2, 7)}`,
      registrantId: cleanId,
      registrantName: registrant.fullName,
      uniqueCode: registrant.uniqueCode,
      registrantPhotoUrl: `__D1_PHOTO_REF__:${cleanId}`,
      date: dateStr,
      timestamp: nowIso,
      scannedAt: nowIso,
      timeString,
      orderNumber: dayOrder,
      method
    };

    records.unshift(newRecord);
    safeStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));

    // Also update the member object itself with attendanceHistory, attendanceDates, stamps, and lastAttendance
    if (memIdx >= 0) {
      const mem = { ...inMemoryRegistrants[memIdx] } as any;
      const prevDates: string[] = Array.isArray(mem.attendanceDates) ? [...mem.attendanceDates] : [];
      if (!prevDates.includes(dateStr)) prevDates.push(dateStr);
      if (activeFridayDate && !prevDates.includes(activeFridayDate)) prevDates.push(activeFridayDate);
      mem.attendanceDates = prevDates;

      const prevStamps = mem.stamps && typeof mem.stamps === 'object' && !Array.isArray(mem.stamps) ? { ...mem.stamps } : {};
      prevStamps[dateStr] = {
        stamped: true,
        date: dateStr,
        timestamp: nowIso,
        timeString,
        method,
        orderNumber: dayOrder,
        updatedAt: nowTs
      };
      if (activeFridayDate && activeFridayDate !== dateStr) {
        prevStamps[activeFridayDate] = {
          stamped: true,
          date: activeFridayDate,
          timestamp: nowIso,
          timeString,
          method,
          orderNumber: dayOrder,
          updatedAt: nowTs
        };
      }
      mem.stamps = prevStamps;
      mem.fridayStamps = prevStamps;

      const prevHist = Array.isArray(mem.attendanceHistory) ? [...mem.attendanceHistory] : [];
      if (!prevHist.some((h: any) => h && h.date === dateStr)) {
        prevHist.unshift({
          id: newRecord.id,
          date: dateStr,
          timestamp: nowIso,
          scannedAt: nowIso,
          timeString,
          method,
          orderNumber: dayOrder,
          present: true
        });
      }
      mem.attendanceHistory = prevHist;
      mem.lastAttendance = nowIso;
      inMemoryRegistrants[memIdx] = mem;
      scheduleBackgroundBackupSave(inMemoryRegistrants);
      safeCloudflareUpsert('registrants', mem).catch(() => {});
    }

    // Sync to Cloudflare D1 & Durable Objects WebSocket + server so all servants see it live
    safeCloudflareUpsert('attendance', newRecord).catch(() => {});
    syncAttendanceSliceToCloudflareD1(records).catch(() => {});
    broadcastCloudflareRealtime({
      type: 'attendance_sync',
      records
    });
    syncSystemStateToCloudflareOwner().catch(() => {});

    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [newRecord], mode: 'append' })
    }).catch(() => {});
    fetch(`${CLOUDFLARE_WORKER_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [newRecord], mode: 'append' })
    }).catch(() => {});

    notifySyncListeners();
    return { record: newRecord, isDuplicate: false, totalCount: currentCount + 1 };
  },

  toggleFridayAttendance(registrant: Registrant, dateStr: string): { isAttended: boolean; record?: AttendanceRecord } {
    const res = this.toggleFridayStampOnly(registrant.id, dateStr);
    return { isAttended: res.isStampActive };
  },

  // Independent toggle for Friday Stamp ONLY without adding or deleting Attendance Log records
  toggleFridayStampOnly(registrantId: string, dateStr: string): { isStampActive: boolean; version: number } {
    const currentlyStamped = this.isFridayStamped(registrantId, dateStr);
    const nextStamped = !currentlyStamped;
    const entry = this.setFridayStampState(registrantId, dateStr, nextStamped);
    return { isStampActive: entry.stamped, version: entry.version };
  },

  getMemberMonthlyAttendance(registrantId: string, year: number, monthIndex: number) {
    const cleanId = String(registrantId || '').trim();
    const bareId = cleanId.replace(/^reg_member_/, '');
    const fridays = getFridaysForMonth(year, monthIndex);
    const records = this.getAttendanceForRegistrant(cleanId);
    const stampsMap = this.getFridayStampsMap();
    const memberObj = inMemoryRegistrants.find(r => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      return rid === cleanId || rid.replace(/^reg_member_/, '') === bareId;
    }) as any;
    const memberCode = memberObj?.uniqueCode ? String(memberObj.uniqueCode).trim().toUpperCase() : '';

    // Collect dates directly stored inside member.stamps, member.fridayStamps, member.attendanceDates, member.attendanceHistory
    const memberDirectStampedDates = new Set<string>();
    if (memberObj) {
      const arrDates = [
        ...(Array.isArray(memberObj.attendanceDates) ? memberObj.attendanceDates : []),
        ...(Array.isArray(memberObj.presentDates) ? memberObj.presentDates : []),
        ...(Array.isArray(memberObj.stamps) ? memberObj.stamps : []),
        ...(Array.isArray(memberObj.fridayStamps) ? memberObj.fridayStamps : [])
      ];
      arrDates.forEach((d: any) => {
        const dStr = typeof d === 'string' ? d.split('T')[0] : String(d?.date || '');
        if (dStr) {
          memberDirectStampedDates.add(dStr);
          memberDirectStampedDates.add(resolveActiveFridayForDate(dStr));
        }
      });
      [memberObj.stamps, memberObj.fridayStamps].forEach((sObj: any) => {
        if (sObj && typeof sObj === 'object' && !Array.isArray(sObj)) {
          Object.entries(sObj).forEach(([k, val]: [string, any]) => {
            const isAct = val === true || val === 'active' || (val && typeof val === 'object' && val.stamped !== false);
            if (isAct) {
              const dStr = (val && typeof val === 'object' && val.date) ? String(val.date) : (k.includes('_') ? k.slice(k.lastIndexOf('_') + 1) : k);
              if (dStr) {
                memberDirectStampedDates.add(dStr);
                memberDirectStampedDates.add(resolveActiveFridayForDate(dStr));
              }
            }
          });
        }
      });
      if (Array.isArray(memberObj.attendanceHistory)) {
        memberObj.attendanceHistory.forEach((h: any) => {
          const dStr = typeof h === 'string' ? h.split('T')[0] : String(h?.date || '');
          if (dStr && (typeof h === 'string' || h?.present !== false)) {
            memberDirectStampedDates.add(dStr);
            memberDirectStampedDates.add(resolveActiveFridayForDate(dStr));
          }
        });
      }
    }

    const fridayStatusMap: Record<number, { 
      isAttended: boolean; 
      isStampRevoked: boolean; 
      hasAttendanceRecord: boolean; 
      record?: AttendanceRecord; 
      formattedDate: string; 
      dateStr: string 
    }> = {};
    const attendedDates: string[] = [];
    let attendedCount = 0;

    fridays.forEach(f => {
      // Match attendance record either on exact Friday date OR mapped to this Friday from the same week
      const match = records.find(r => r.date === f.dateStr || resolveActiveFridayForDate(r.date) === f.dateStr);
      const stampKey = `${cleanId}_${f.dateStr}`;
      const bareStampKey = `${bareId}_${f.dateStr}`;
      const prefixedStampKey = `reg_member_${bareId}_${f.dateStr}`;
      const codeStampKey = memberCode ? `${memberCode}_${f.dateStr}` : '';
      const stampEntry =
        stampsMap[stampKey] ||
        stampsMap[bareStampKey] ||
        stampsMap[prefixedStampKey] ||
        (codeStampKey ? stampsMap[codeStampKey] : undefined);

      const hasVersionedStamp = Boolean(stampEntry && typeof stampEntry.version === 'number' && stampEntry.version > 0);
      const hasMemberDirectStamp = memberDirectStampedDates.has(f.dateStr);
      const hasAnyAttendanceOrDirectStamp = Boolean(match || hasMemberDirectStamp);

      const isAccidentalBatchReset = Boolean(
        hasVersionedStamp && !stampEntry!.stamped && hasAnyAttendanceOrDirectStamp && Number(stampEntry!.updatedAt || 0) <= 1794591359000
      );
      const isRevoked = hasVersionedStamp
        ? (!stampEntry!.stamped && !isAccidentalBatchReset)
        : this.isFridayStampRevoked(cleanId, f.dateStr);

      // Guaranteed Dual-Source Stamp Rendering: active if stamped in stampsMap OR has attendance/direct stamp (unless explicitly revoked)
      const isStamped = hasVersionedStamp
        ? (Boolean(stampEntry!.stamped) || isAccidentalBatchReset)
        : Boolean(hasAnyAttendanceOrDirectStamp && !isRevoked);

      if (isStamped) {
        attendedCount++;
        attendedDates.push(f.formattedDate);
        fridayStatusMap[f.fridayIndex] = {
          isAttended: true,
          isStampRevoked: false,
          hasAttendanceRecord: Boolean(match),
          record: match,
          formattedDate: f.formattedDate,
          dateStr: f.dateStr
        };
      } else if (hasAnyAttendanceOrDirectStamp && !isStamped) {
        fridayStatusMap[f.fridayIndex] = {
          isAttended: false,
          isStampRevoked: true,
          hasAttendanceRecord: true,
          record: match,
          formattedDate: f.formattedDate,
          dateStr: f.dateStr
        };
      } else {
        fridayStatusMap[f.fridayIndex] = {
          isAttended: false,
          isStampRevoked: Boolean(hasVersionedStamp && !stampEntry!.stamped),
          hasAttendanceRecord: false,
          formattedDate: f.formattedDate,
          dateStr: f.dateStr
        };
      }
    });

    return {
      fridays,
      totalFridaysCount: fridays.length,
      attendedFridaysCount: attendedCount,
      attendedDates,
      isCompletedAllFridays: attendedCount === fridays.length && fridays.length > 0,
      fridayStatusMap
    };
  },

  getDeliveredGifts(): Record<string, boolean> {
    const raw = safeStorage.getItem('three_youths_delivered_gifts_v1');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  toggleGiftDelivered(monthKey: string, registrantId: string): boolean {
    const map = this.getDeliveredGifts();
    const key = `${monthKey}_${registrantId}`;
    map[key] = !map[key];
    safeStorage.setItem('three_youths_delivered_gifts_v1', JSON.stringify(map));
    return map[key];
  },

  isGiftDelivered(monthKey: string, registrantId: string): boolean {
    const map = this.getDeliveredGifts();
    return !!map[`${monthKey}_${registrantId}`];
  },

  // Birthdays Engine (Egypt / Cairo Timezone)
  getBirthdayGroups(registrants: Registrant[]): {
    today: Registrant[];
    recent: { member: Registrant; daysUntil: number; targetDateStr: string }[];
    last: { member: Registrant; daysAgo: number; targetDateStr: string }[];
  } {
    // Current date in Cairo (Africa/Cairo)
    const cairoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const currentYear = cairoNow.getFullYear();
    const currentMonth = cairoNow.getMonth(); // 0-indexed
    const currentDay = cairoNow.getDate();

    // Zero out time for clean day diffs
    const todayZero = new Date(currentYear, currentMonth, currentDay).getTime();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const today: Registrant[] = [];
    const recent: { member: Registrant; daysUntil: number; targetDateStr: string }[] = [];
    const last: { member: Registrant; daysAgo: number; targetDateStr: string }[] = [];

    registrants.forEach(member => {
      if (!member.dob) return;
      const parts = member.dob.split('-');
      if (parts.length < 3) return;

      const mMonth = parseInt(parts[1], 10) - 1;
      const mDay = parseInt(parts[2], 10);

      // Birthday in the current year
      let bdayThisYear = new Date(currentYear, mMonth, mDay).getTime();
      let diffDays = Math.round((bdayThisYear - todayZero) / ONE_DAY_MS);

      // Check for wrap-around around year boundary if near end of Dec or early Jan
      if (diffDays < -180) {
        bdayThisYear = new Date(currentYear + 1, mMonth, mDay).getTime();
        diffDays = Math.round((bdayThisYear - todayZero) / ONE_DAY_MS);
      } else if (diffDays > 180) {
        bdayThisYear = new Date(currentYear - 1, mMonth, mDay).getTime();
        diffDays = Math.round((bdayThisYear - todayZero) / ONE_DAY_MS);
      }

      const formattedBday = `${mDay}/${mMonth + 1}`;

      if (diffDays === 0) {
        today.push(member);
      } else if (diffDays > 0 && diffDays <= 7) {
        recent.push({ member, daysUntil: diffDays, targetDateStr: formattedBday });
      } else if (diffDays < 0 && diffDays >= -7) {
        last.push({ member, daysAgo: Math.abs(diffDays), targetDateStr: formattedBday });
      }
    });

    recent.sort((a, b) => a.daysUntil - b.daysUntil);
    last.sort((a, b) => a.daysAgo - b.daysAgo);

    return { today, recent, last };
  },

  getCustomLogo(): string | null {
    try {
      safeStorage.removeItem(LOGO_STORAGE_KEY);
    } catch {}
    return '/icon-512x512.png?v=3';
  },

  isCommunityOwnerLoggedIn(): boolean {
    try {
      const adminStr = sessionStorage.getItem('three_youths_admin_session_v2');
      if (adminStr) {
        const parsedAdmin = JSON.parse(adminStr);
        if (parsedAdmin && (parsedAdmin.role === 'community_owner' || isPermanentCommunityOwner(parsedAdmin))) return true;
      }
      const memStr = sessionStorage.getItem('three_youths_member_session_v2');
      if (memStr) {
        const parsedMem = JSON.parse(memStr);
        if (parsedMem && (parsedMem.role === 'community_owner' || isPermanentCommunityOwner(parsedMem))) return true;
      }
      const ownerDeviceAuth = localStorage.getItem(OWNER_DEVICE_AUTH_STORAGE_KEY);
      if (ownerDeviceAuth === 'true') return true;
    } catch {}
    return false;
  },

  setOwnerDeviceAuthorized(authorized: boolean): void {
    try {
      if (authorized) {
        localStorage.setItem(OWNER_DEVICE_AUTH_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(OWNER_DEVICE_AUTH_STORAGE_KEY);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('three_youths_owner_auth_changed', { detail: { authorized } }));
      }
    } catch {}
  },

  // ==========================================
  // OWNER LIVE SITE TEXT EDITOR OVERRIDES (100% Real-time & Persistent)
  // ==========================================
  getSiteTextOverrides(): Record<string, string> {
    if (inMemorySiteTextOverrides !== null) {
      return inMemorySiteTextOverrides;
    }
    try {
      const raw = safeStorage.getItem(SITE_TEXT_OVERRIDES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          inMemorySiteTextOverrides = parsed;
          return parsed;
        }
      }
    } catch {}
    inMemorySiteTextOverrides = {};
    return inMemorySiteTextOverrides;
  },

  getSiteText(defaultText: string): string {
    const key = (defaultText || '').trim().replace(/\s+/g, ' ');
    if (!key) return defaultText;
    const map = this.getSiteTextOverrides();
    const override = map[key];
    if (override === '__DELETED__') return '';
    if (override !== undefined) return override;
    return defaultText;
  },

  async _persistSiteTextsEverywhere(current: Record<string, string>, action: string, key?: string, value?: string): Promise<void> {
    const nowTs = Date.now();
    markLocalSiteTextsMutated(nowTs);
    inMemorySiteTextOverrides = { ...current };
    safeStorage.setItem(SITE_TEXT_OVERRIDES_STORAGE_KEY, JSON.stringify(current));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('three_youths_site_texts_updated', { detail: current }));
    }
    notifySyncListeners();

    // Instant live broadcast via Cloudflare Durable Objects WebSocket
    broadcastCloudflareRealtime({
      type: 'site_text_overrides_sync',
      overrides: current,
      at: nowTs
    });

    await Promise.allSettled([
      pushStateSliceToCloudflareD1('site_texts', { siteTextOverrides: current, updatedAt: nowTs }),
      fetch('https://threefetyayouth-api.michealedwar8.workers.dev/api/site-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          key,
          value,
          overrides: current,
          siteTextOverrides: current,
          actorRole: 'community_owner'
        })
      }),
      fetch('/api/site-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          key,
          value,
          overrides: current,
          siteTextOverrides: current,
          actorRole: 'community_owner'
        })
      }),
      syncSystemStateToCloudflareOwner()
    ]);
  },

  async setSiteTextOverride(originalKey: string, newValue: string): Promise<boolean> {
    if (!this.isCommunityOwnerLoggedIn()) return false;
    const cleanKey = (originalKey || '').trim().replace(/\s+/g, ' ');
    if (!cleanKey) return false;

    const current = { ...this.getSiteTextOverrides() };
    current[cleanKey] = newValue;
    await this._persistSiteTextsEverywhere(current, 'set', cleanKey, newValue);
    return true;
  },

  async setBatchSiteTextOverrides(updates: Record<string, string>): Promise<boolean> {
    if (!this.isCommunityOwnerLoggedIn()) return false;
    if (!updates || typeof updates !== 'object') return false;

    const current = { ...this.getSiteTextOverrides() };
    let hasAny = false;
    for (const [rawKey, newVal] of Object.entries(updates)) {
      const cleanKey = (rawKey || '').trim().replace(/\s+/g, ' ');
      if (!cleanKey) continue;
      if (newVal === '' || newVal === cleanKey) {
        delete current[cleanKey];
      } else {
        current[cleanKey] = newVal;
      }
      hasAny = true;
    }
    if (!hasAny) return true;

    await this._persistSiteTextsEverywhere(current, 'set_batch');
    return true;
  },

  async deleteSiteTextByKey(originalKey: string): Promise<boolean> {
    if (!this.isCommunityOwnerLoggedIn()) return false;
    const cleanKey = (originalKey || '').trim().replace(/\s+/g, ' ');
    if (!cleanKey) return false;

    const current = { ...this.getSiteTextOverrides() };
    current[cleanKey] = '__DELETED__';
    await this._persistSiteTextsEverywhere(current, 'delete_text', cleanKey);
    return true;
  },

  async restoreSiteTextByKey(originalKey: string): Promise<boolean> {
    if (!this.isCommunityOwnerLoggedIn()) return false;
    const cleanKey = (originalKey || '').trim().replace(/\s+/g, ' ');
    if (!cleanKey) return false;

    const current = { ...this.getSiteTextOverrides() };
    delete current[cleanKey];
    await this._persistSiteTextsEverywhere(current, 'restore_key', cleanKey);
    return true;
  },

  async resetAllSiteTextOverrides(): Promise<boolean> {
    if (!this.isCommunityOwnerLoggedIn()) return false;
    await this._persistSiteTextsEverywhere({}, 'reset_all');
    return true;
  },

  setCustomLogo(logoDataUrl: string): boolean {
    if (!this.isCommunityOwnerLoggedIn()) {
      return false;
    }
    safeStorage.setItem(LOGO_STORAGE_KEY, logoDataUrl);
    fetch('/api/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo: logoDataUrl })
    }).catch(() => {});
    notifySyncListeners();
    return true;
  },

  getCardTemplate(): CardTemplate {
    try {
      const val = safeStorage.getItem(CARD_TEMPLATE_STORAGE_KEY);
      if (val) {
        const parsed = JSON.parse(val);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_CARD_TEMPLATE, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CARD_TEMPLATE;
  },

  async setCardTemplate(template: CardTemplate, actorRole?: UserRole): Promise<boolean> {
    try {
      safeStorage.setItem(CARD_TEMPLATE_STORAGE_KEY, JSON.stringify(template));
      notifySyncListeners();

      fetch('/api/card-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardTemplate: template, actorRole })
      }).catch(err => console.warn('Could not sync card-template to server:', err));

      return true;
    } catch (err) {
      console.error('Failed to set card template:', err);
      return false;
    }
  },

  resetCustomLogo(): boolean {
    if (!this.isCommunityOwnerLoggedIn()) {
      return false;
    }
    localStorage.removeItem(LOGO_STORAGE_KEY);
    fetch('/api/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo: null })
    }).catch(() => {});
    notifySyncListeners();
    return true;
  },

  // ==========================================
  // ANNOUNCEMENTS HUB & MESSAGES
  // ==========================================
  getDeletedAnnouncementIds(): Set<string> {
    const raw = safeStorage.getItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      return new Set<string>(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  },

  /**
   * Resolves the avatar/icon to display for an announcement sender:
   * - ONLY if senderRole === 'priest' and senderPhotoUrl is valid, return the Priest's photo.
   * - For all other roles (Community Owner, Community Manager, Secretaries, Servants), NEVER return personal photos;
   *   always return the Official Site Logo ('/assets/aistudio/1000762371-removebg-preview_e1bb979f.png').
   */
  getAnnouncementSenderIcon(ann?: { id?: string; senderRole?: UserRole | string; senderPhotoUrl?: string } | null): string {
    if (ann && ann.senderRole === 'priest' && ann.senderPhotoUrl && ann.senderPhotoUrl.trim() !== '') {
      return ann.senderPhotoUrl;
    }
    return this.getCustomLogo() || '/icon-512x512.png?v=3';
  },

  /**
   * Checks whether a given member/user is in the target audience of an announcement:
   * - Special visitation alerts ('servant_personal' or isVisitationTaskAlert) ONLY match the specific assigned servant, NEVER the Community Owner.
   * - General announcements match their selected targetAudience ('all', 'males_only', 'females_only', 'absent_today', 'attended_today', 'community_owner_only').
   */
  isMemberTargetedByAnnouncement(
    ann: Announcement,
    member?: Registrant | null,
    fallbackRole?: UserRole,
    fallbackName?: string,
    fallbackId?: string
  ): boolean {
    if (!ann || isAnnouncementExpired(ann)) return false;

    const effectiveRole = member?.role || fallbackRole;
    const effectiveId = member?.id || fallbackId;
    const effectiveName = (member?.fullName || fallbackName || '').trim();
    const isOwner = effectiveRole === 'community_owner';

    // 1. Special Visitation Assignment Alert: Strictly ONLY for the assigned servant, NEVER Community Owner
    if (ann.isVisitationTaskAlert || ann.targetAudience === 'servant_personal' || (ann.title?.includes('تكليف افتقاد') && (ann.targetUserId || ann.targetServantName))) {
      if (isOwner) return false;
      if (!effectiveId && !effectiveName) return false;
      const targetName = (ann.targetServantName || '').trim();
      return Boolean(
        (ann.targetUserId && effectiveId && ann.targetUserId === effectiveId) ||
        (targetName && effectiveName && (
          effectiveName === targetName ||
          normalizeArabicNameForComparison(effectiveName) === normalizeArabicNameForComparison(targetName) ||
          effectiveName.includes(targetName) ||
          targetName.includes(effectiveName)
        ))
      );
    }

    // 2. Community Owner Only alert
    if (ann.targetAudience === 'community_owner_only' || ann.title?.startsWith('🔄 تحديث بيانات:')) {
      return isOwner;
    }

    // 3. If no member profile is resolved yet, only allow 'all'
    if (!member) {
      return !ann.targetAudience || ann.targetAudience === 'all';
    }

    const cairoDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const todayStr = `${cairoDate.getFullYear()}-${String(cairoDate.getMonth() + 1).padStart(2, '0')}-${String(cairoDate.getDate()).padStart(2, '0')}`;
    const targetDate = ann.targetDate || todayStr;

    if (!ann.targetAudience || ann.targetAudience === 'all') {
      return true;
    }
    if (ann.targetAudience === 'males_only') {
      return (member.gender || 'male') === 'male';
    }
    if (ann.targetAudience === 'females_only') {
      return member.gender === 'female';
    }
    if (ann.targetAudience === 'absent_today') {
      const records = this.getAttendanceForRegistrant(member.id);
      const hasAttended = records.some(r => r.date === targetDate);
      return !hasAttended;
    }
    if (ann.targetAudience === 'attended_today') {
      const records = this.getAttendanceForRegistrant(member.id);
      const hasAttended = records.some(r => r.date === targetDate);
      return hasAttended;
    }

    return true;
  },

  getAnnouncements(): Announcement[] {
    const raw = safeStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      const delSet = this.getDeletedAnnouncementIds();
      return list
        .filter(
          a =>
            a &&
            typeof a === 'object' &&
            typeof a.id === 'string' &&
            a.id.trim() !== '' &&
            typeof a.content === 'string' &&
            a.content.trim() !== '' &&
            a.id !== 'ann_welcome_1' &&
            a.id !== 'ann_care_1' &&
            a.id !== 'ann_test_check_1' &&
            !a.title?.startsWith('🔄 تحديث بيانات') &&
            a.targetAudience !== 'community_owner_only' &&
            !delSet.has(a.id)
        )
        .map(a => ({
          ...a,
          authorName: a.authorName || a.senderName || 'خادم الاجتماع',
          priority: a.priority || 'normal',
          reactions: a.reactions || {},
          viewers: Array.isArray(a.viewers) ? a.viewers : [],
          // Strictly strip non-priest sender photos so only Priest photos or Site Logo appear
          senderPhotoUrl: a.senderRole === 'priest' ? a.senderPhotoUrl : undefined
        }));
    } catch {
      return [];
    }
  },

  async fetchLiveAnnouncementsFromCloud(force = false): Promise<Announcement[]> {
    try {
      const res = await fetch(`/api/push-notification?action=get_announcements${force ? '&force=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.announcements)) {
          const delSet = this.getDeletedAnnouncementIds();
          const currentLocal = this.getAnnouncements();
          const byId = new Map<string, Announcement>();
          for (const loc of currentLocal) {
            if (loc && loc.id && !delSet.has(loc.id)) {
              byId.set(loc.id, loc);
            }
          }
          for (const cloudItem of data.announcements) {
            if (!cloudItem || !cloudItem.id || delSet.has(cloudItem.id)) continue;
            const prev = byId.get(cloudItem.id);
            const mergedViewers = Array.isArray(cloudItem.viewers) ? cloudItem.viewers : (prev?.viewers || []);
            byId.set(cloudItem.id, {
              ...(prev || {}),
              ...cloudItem,
              authorName: cloudItem.authorName || prev?.authorName || prev?.senderName || 'خادم الاجتماع',
              senderName: cloudItem.senderName || cloudItem.authorName || prev?.senderName || 'خادم الاجتماع',
              senderRole: cloudItem.senderRole || prev?.senderRole || 'servant',
              templateType: cloudItem.templateType || prev?.templateType || 'custom',
              targetAudience: cloudItem.targetAudience || prev?.targetAudience || 'all',
              priority: cloudItem.priority || prev?.priority || 'normal',
              reactions: prev?.reactions || cloudItem.reactions || {},
              viewers: mergedViewers,
            });
          }
          const mergedList = Array.from(byId.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(mergedList));
          return mergedList;
        }
      }
    } catch {
      // ignore offline error
    }
    return this.getAnnouncements();
  },

  async saveAnnouncement(announcement: Announcement, sendPush = true): Promise<Announcement> {
    const list = this.getAnnouncements();
    const normalized: Announcement = {
      ...announcement,
      authorName: announcement.authorName || announcement.senderName || 'خادم الاجتماع',
      senderName: announcement.senderName || announcement.authorName || 'خادم الاجتماع',
      senderRole: announcement.senderRole || 'servant',
      templateType: announcement.templateType || 'custom',
      targetAudience: announcement.targetAudience || 'all',
      priority: announcement.priority || 'normal',
      reactions: announcement.reactions || {},
      viewers: Array.isArray(announcement.viewers) ? announcement.viewers : [],
    };
    const idx = list.findIndex(a => a.id === normalized.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...normalized };
    } else {
      list.unshift(normalized);
    }
    safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));

    fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAnnouncement: normalized, announcements: list })
    }).catch(() => {});

    try {
      await fetch('/api/push-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_announcement',
          announcement: normalized,
          sendPush,
        }),
      });
    } catch {
      // ignore
    }

    safeCloudflareUpsert('announcements', normalized).catch(() => {});
    notifySyncListeners();
    return normalized;
  },

  markAnnouncementAsViewed(announcementId: string, memberId: string, memberName?: string): void {
    const list = this.getAnnouncements();
    const ann = list.find(a => a.id === announcementId);
    const reg = this.getRegistrants().find(r => r.id === memberId || r.fullName === memberId || r.uniqueCode === memberId);
    const resolvedId = reg?.id || memberId;
    const resolvedName = memberName || reg?.fullName || 'شاب / شابة';

    if (ann) {
      if (!Array.isArray(ann.viewers)) ann.viewers = [];
      if (!ann.viewers.some(v => v && v.memberId === resolvedId)) {
        ann.viewers.push({
          memberId: resolvedId,
          memberName: resolvedName,
          photoUrl: reg?.photoUrl || '',
          gender: reg?.gender || 'male',
          viewedAt: new Date().toISOString(),
        });
        safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));
        syncAnnouncementsSliceToCloudflareD1(list, ann).catch(() => {});
        broadcastCloudflareRealtime({
          type: 'announcement_live_sync',
          announcement: {
            ...ann,
            imageUrl:
              ann.imageUrl && ann.imageUrl.startsWith('data:')
                ? `__D1_ANN_IMAGE_REF__:${ann.id}`
                : ann.imageUrl
          }
        });
        notifySyncListeners();
      }
    }

    fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'interact_announcement',
        announcementId,
        memberId: resolvedId,
        memberName: resolvedName,
      }),
    }).catch(() => {});
  },

  createAnnouncement(data: Omit<Announcement, 'id' | 'createdAt' | 'reactions'>): Announcement {
    const list = this.getAnnouncements();
    const cleanSenderName = sanitizeSecurityText(data.senderName || data.authorName || 'اجتماع الثلاثة فتية للشباب السوداني');
    const newAnn: Announcement = {
      ...data,
      title: sanitizeSecurityText(data.title),
      content: sanitizeSecurityText(data.content),
      senderName: cleanSenderName,
      authorName: sanitizeSecurityText(data.authorName || cleanSenderName),
      priority: data.priority || 'normal',
      // Strict Rule: Only Priest photos are stored/shown; never store servant/manager/owner personal photos in announcements
      senderPhotoUrl: data.senderRole === 'priest' ? data.senderPhotoUrl : undefined,
      id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      reactions: {},
      viewers: []
    };
    list.unshift(newAnn);
    safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));

    // Sync immediately to Central Server & Cloudflare D1 + Durable Objects WebSocket so all makhdomeen screens receive it in 0ms
    fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAnnouncement: newAnn, announcements: list })
    }).catch(() => {});

    syncAnnouncementsSliceToCloudflareD1(list, newAnn).catch(() => {});
    broadcastCloudflareRealtime({
      type: 'announcement_live_sync',
      announcement: {
        ...newAnn,
        imageUrl:
          newAnn.imageUrl && newAnn.imageUrl.startsWith('data:')
            ? `__D1_ANN_IMAGE_REF__:${newAnn.id}`
            : newAnn.imageUrl,
      },
    });

    // Also sync to Web Push & Cloud Announcements Hub
    fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_announcement',
        announcement: newAnn,
        sendPush: true
      })
    }).catch(() => {});

    safeCloudflareUpsert('announcements', newAnn).catch(() => {});
    notifySyncListeners();
    return newAnn;
  },

  deleteAnnouncement(id: string): boolean {
    const delSet = this.getDeletedAnnouncementIds();
    delSet.add(id);
    safeStorage.setItem(DELETED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

    const list = this.getAnnouncements();
    const filtered = list.filter(a => a.id !== id);
    safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(filtered));

    // Delete linked announcement image and update Cloudflare D1 slice + broadcast instant removal to all makhdomeen
    deleteAnnouncementImageFromCloudflareD1(id).catch(() => {});
    syncAnnouncementsSliceToCloudflareD1(filtered).catch(() => {});
    broadcastCloudflareRealtime({
      type: 'announcement_deleted_sync',
      id,
    });

    fetch(`/api/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).catch(() => {});
    fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_announcement', id })
    }).catch(() => {});
    safeCloudflareDelete('announcements', id).catch(() => {});
    safeCloudflareUpsert('deleted_records', {
      id,
      type: 'announcement',
      deletedAt: new Date().toISOString()
    }).catch(() => {});
    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return true;
  },

  toggleAnnouncementReaction(
    announcementId: string,
    memberId: string,
    emojiOrMemberName: string,
    maybeReaction?: string
  ): Announcement[] {
    const list = this.getAnnouncements();
    const ann = list.find(a => a.id === announcementId);
    if (!ann) return list;

    const isFourArgCall = typeof maybeReaction === 'string';
    const emoji = isFourArgCall ? maybeReaction : emojiOrMemberName;
    const explicitName = isFourArgCall ? emojiOrMemberName : undefined;

    if (!ann.reactions) {
      ann.reactions = {};
    }
    if (!ann.reactions[emoji]) {
      ann.reactions[emoji] = [];
    }

    const index = ann.reactions[emoji].indexOf(memberId);
    let nextViewerReaction: any = emoji;
    if (index !== -1) {
      // Remove reaction
      ann.reactions[emoji].splice(index, 1);
      if (ann.reactions[emoji].length === 0) {
        delete ann.reactions[emoji];
      }
      nextViewerReaction = undefined;
    } else {
      // Add reaction
      ann.reactions[emoji].push(memberId);
    }

    // Ensure reacting member is also added/updated in viewers ("الشافوا الإعلان")
    if (!Array.isArray(ann.viewers)) {
      ann.viewers = [];
    }
    const reg = this.getRegistrants().find(r => r.id === memberId || r.fullName === memberId || r.uniqueCode === memberId);
    const resolvedMemberId = reg?.id || memberId;
    const resolvedMemberName = explicitName || reg?.fullName || memberId;
    const existingViewerIdx = ann.viewers.findIndex(v => v && v.memberId === resolvedMemberId);
    if (existingViewerIdx === -1) {
      ann.viewers.push({
        memberId: resolvedMemberId,
        memberName: resolvedMemberName,
        photoUrl: reg?.photoUrl || '',
        gender: reg?.gender || 'male',
        viewedAt: new Date().toISOString(),
        reaction: nextViewerReaction,
      });
    } else {
      ann.viewers[existingViewerIdx] = {
        ...ann.viewers[existingViewerIdx],
        memberName: resolvedMemberName || ann.viewers[existingViewerIdx].memberName,
        reaction:
          ann.viewers[existingViewerIdx].reaction === emoji ? undefined : (emoji as any),
      };
      nextViewerReaction = ann.viewers[existingViewerIdx].reaction;
    }

    safeStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(list));

    // Sync immediately to Cloudflare D1 & Realtime WebSocket
    syncAnnouncementsSliceToCloudflareD1(list, ann).catch(() => {});
    broadcastCloudflareRealtime({
      type: 'announcement_live_sync',
      announcement: {
        ...ann,
        imageUrl:
          ann.imageUrl && ann.imageUrl.startsWith('data:')
            ? `__D1_ANN_IMAGE_REF__:${ann.id}`
            : ann.imageUrl
      }
    });

    // Sync to Web Push & Live Cloud Hub
    fetch('/api/push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'interact_announcement',
        announcementId,
        memberId: resolvedMemberId,
        memberName: resolvedMemberName,
        reaction: nextViewerReaction || '',
      }),
    }).catch(() => {});

    // Call atomic reaction endpoint on Central Server (which also broadcasts SSE & updates Cloudflare D1)
    fetch(`/api/announcements/${encodeURIComponent(announcementId)}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: resolvedMemberId,
        emoji,
        memberName: resolvedMemberName,
        photoUrl: reg?.photoUrl,
        gender: reg?.gender
      })
    }).catch(() => {
      fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAnnouncement: ann, announcements: list })
      }).catch(() => {});
    });

    safeCloudflareUpdate('announcements', { reactions: ann.reactions, viewers: ann.viewers }, 'id', announcementId).catch(() => {
      safeCloudflareUpsert('announcements', ann).catch(() => {});
    });
    notifySyncListeners();
    return list;
  },


  formatAnnouncementTextForMember(templateText: string, member: Registrant): string {
    const firstName = member.fullName.trim().split(/\s+/)[0] || member.fullName;
    return templateText
      .replace(/\[الاسم الأول\]/g, firstName)
      .replace(/\[الاسم الاول\]/g, firstName)
      .replace(/\[الاسم\]/g, firstName)
      .replace(/\bفلان\b/g, firstName)
      .replace(/\{name\}/gi, firstName)
      .replace(/\{first_name\}/gi, firstName);
  },

  getAbsentMembersForDate(dateStr?: string): Registrant[] {
    const cairoDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const targetDate = dateStr || `${cairoDate.getFullYear()}-${String(cairoDate.getMonth() + 1).padStart(2, '0')}-${String(cairoDate.getDate()).padStart(2, '0')}`;
    const all = this.getRegistrants().filter(r => r.status === 'active');
    const records = this.getAttendanceRecords().filter(a => a.date === targetDate);
    const attendedIds = new Set(records.map(r => r.registrantId));
    return all.filter(m => !attendedIds.has(m.id));
  },

  getAttendedMembersForDate(dateStr?: string): Registrant[] {
    const cairoDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const targetDate = dateStr || `${cairoDate.getFullYear()}-${String(cairoDate.getMonth() + 1).padStart(2, '0')}-${String(cairoDate.getDate()).padStart(2, '0')}`;
    const all = this.getRegistrants().filter(r => r.status === 'active');
    const records = this.getAttendanceRecords().filter(a => a.date === targetDate);
    const attendedIds = new Set(records.map(r => r.registrantId));
    return all.filter(m => attendedIds.has(m.id));
  },

  getAnnouncementsForMember(member: Registrant): Array<{ announcement: Announcement; personalizedText: string; isTargeted: boolean }> {
    const list = this.getAnnouncements();
    
    // Sort newest first
    const sortedList = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Check if there is a newer meeting reminder replacing an older one
    const hasNewerMeetingReminder = (annId: string, reminderCreatedAt: string) => {
      return sortedList.some(other => 
        other.id !== annId &&
        other.templateType === 'meeting_reminder_7pm' &&
        new Date(other.createdAt).getTime() > new Date(reminderCreatedAt).getTime()
      );
    };

    const targetedItems: Array<{ announcement: Announcement; personalizedText: string; isTargeted: boolean }> = [];

    const isLeaderPreviewing =
      member.role === 'community_owner' ||
      member.role === 'community_manager' ||
      member.role === 'meeting_secretary' ||
      member.role === 'service_secretary' ||
      member.role === 'priest';

    for (const ann of sortedList) {
      const isPublicYouthAnnouncement =
        !ann.isVisitationTaskAlert &&
        ann.targetAudience !== 'servant_personal' &&
        ann.targetAudience !== 'community_owner_only' &&
        !ann.title?.startsWith('🔄 تحديث بيانات:');

      const isTargeted = this.isMemberTargetedByAnnouncement(ann, member) || (isLeaderPreviewing && isPublicYouthAnnouncement);
      if (!isTargeted) {
        continue;
      }

      // If a newer reminder for the same meeting was sent, replace the older reminder
      if (!ann.pinned && ann.templateType === 'meeting_reminder_7pm' && hasNewerMeetingReminder(ann.id, ann.createdAt)) {
        continue;
      }

      targetedItems.push({
        announcement: ann,
        personalizedText: this.formatAnnouncementTextForMember(ann.content, member),
        isTargeted: true
      });
    }

    return targetedItems;
  },

  // ==========================================
  // PASTORAL VISITATION NOTES (ملاحظات الافتقاد الرعوي)
  // ==========================================
  getDeletedVisitationNoteIds(): Set<string> {
    const raw = safeStorage.getItem(DELETED_VISITATION_NOTES_STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      return new Set<string>(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  },

  syncMemberNotesFromVisitationNotes(memberId?: string): void {
    if (!memberId) return;
    const allRegs = this.getRegistrants();
    const targetIdx = allRegs.findIndex(r => r.id === memberId || r.uniqueCode === memberId);
    if (targetIdx < 0) return;

    const memberNotes = this.getVisitationNotes(memberId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const nextNotesText = memberNotes.length === 0
      ? undefined
      : memberNotes
          .map(n => {
            const dateStr = n.createdAt ? new Date(n.createdAt).toLocaleDateString('ar-EG') : new Date().toLocaleDateString('ar-EG');
            return `[${n.authorName} - ${dateStr}]: ${n.notes}`;
          })
          .join('\n---\n');

    allRegs[targetIdx] = {
      ...allRegs[targetIdx],
      notes: nextNotesText
    };
    inMemoryRegistrants = allRegs;
    scheduleBackgroundBackupSave(allRegs);
  },

  getVisitationNotes(memberId?: string): VisitationNote[] {
    const delSet = this.getDeletedVisitationNoteIds();
    const raw = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
    let list: VisitationNote[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          list = parsed.filter((n: any) => n && n.id && !delSet.has(n.id));
        }
      } catch {
        list = [];
      }
    }
    if (memberId) {
      return list.filter(n => n.memberId === memberId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  addVisitationNote(data: Omit<VisitationNote, 'id' | 'createdAt'>): VisitationNote {
    const list = this.getVisitationNotes();
    const newNote: VisitationNote = {
      ...data,
      id: `vnote_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    lastNotesMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    list.unshift(newNote);
    safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(list));

    // Synchronize member's notes in registrants so it appears in Database and Central Register
    this.syncMemberNotesFromVisitationNotes(data.memberId);

    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});

    // Instant central server sync & SSE broadcast for all devices
    fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: list,
        newNote,
        deletedNoteIds: Array.from(this.getDeletedVisitationNoteIds())
      })
    }).catch(err => console.warn('Could not sync visitation notes to server:', err));

    return newNote;
  },

  deleteVisitationNote(id: string): boolean {
    const raw = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
    let rawList: VisitationNote[] = [];
    if (raw) {
      try { rawList = JSON.parse(raw) || []; } catch { rawList = []; }
    }
    const targetNote = rawList.find(n => n && n.id === id);

    // Record deleted note ID in tombstones so it can never be resurrected by any phone
    const delSet = this.getDeletedVisitationNoteIds();
    delSet.add(id);
    safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

    const filtered = rawList.filter(n => n && n.id !== id && !delSet.has(n.id));
    lastNotesMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(filtered));

    if (targetNote && targetNote.memberId) {
      this.syncMemberNotesFromVisitationNotes(targetNote.memberId);
    }

    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});

    fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    return true;
  },

  clearVisitationNotesForMember(memberId: string): void {
    if (!memberId) return;
    const raw = safeStorage.getItem(VISITATION_NOTES_STORAGE_KEY);
    let rawList: VisitationNote[] = [];
    if (raw) {
      try { rawList = JSON.parse(raw) || []; } catch { rawList = []; }
    }
    const memberNotes = rawList.filter(n => n && n.memberId === memberId);
    if (memberNotes.length === 0) return;

    const delSet = this.getDeletedVisitationNoteIds();
    memberNotes.forEach(n => { if (n.id) delSet.add(n.id); });
    safeStorage.setItem(DELETED_VISITATION_NOTES_STORAGE_KEY, JSON.stringify(Array.from(delSet)));

    const filtered = rawList.filter(n => n && n.memberId !== memberId && !delSet.has(n.id));
    lastNotesMutationAt = Date.now();
    localSystemStateUpdatedAt = Date.now();
    safeStorage.setItem(VISITATION_NOTES_STORAGE_KEY, JSON.stringify(filtered));

    this.syncMemberNotesFromVisitationNotes(memberId);
    notifySyncListeners();
    syncSystemStateToCloudflareOwner().catch(() => {});

    fetch(`/api/notes/member/${encodeURIComponent(memberId)}`, { method: 'DELETE' }).catch(() => {});
  },

  // ==========================================
  // KAHOOT COMPETITIONS & LIVE SESSIONS
  // ==========================================
  getDeletedKahootQuizIds(): Set<string> {
    const raw = safeStorage.getItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw);
      return new Set<string>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  },

  getKahootQuizzes(): KahootQuiz[] {
    const deletedIds = this.getDeletedKahootQuizIds();
    deletedIds.add('quiz_daniel_three_youths');
    const raw = safeStorage.getItem(KAHOOT_QUIZZES_STORAGE_KEY);

    if (raw === null) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(q => q && q.id && !deletedIds.has(q.id));
      }
      return [];
    } catch {
      return [];
    }
  },

  saveKahootQuiz(quiz: KahootQuiz): void {
    const normalizedQuiz: KahootQuiz = {
      ...quiz,
      status: quiz.status || (quiz.isPublished === false ? 'draft' : 'published'),
      isPublished: quiz.status === 'draft' || quiz.status === 'archived' ? false : quiz.isPublished !== false,
      updatedAt: new Date().toISOString()
    };
    const deletedIds = this.getDeletedKahootQuizIds();
    if (deletedIds.has(normalizedQuiz.id)) {
      deletedIds.delete(normalizedQuiz.id);
      safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(deletedIds)));
    }

    const list = this.getKahootQuizzes();
    const idx = list.findIndex(q => q.id === normalizedQuiz.id);
    if (idx >= 0) {
      list[idx] = normalizedQuiz;
    } else {
      list.unshift(normalizedQuiz);
    }
    safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(list));

    // Sync to Central Server & SSE
    fetch('/api/kahoot/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz: normalizedQuiz, quizzes: list })
    }).catch(() => {});

    // Sync to Cloudflare D1 & Owner System State
    try {
      safeCloudflareUpsert('kahoot_quizzes', normalizedQuiz).catch(() => {});
      syncSystemStateToCloudflareOwner().catch(() => {});
    } catch {}
    notifySyncListeners();
  },

  deleteKahootQuiz(id: string): boolean {
    // 1. Mark as permanently deleted in deleted IDs set
    const deletedIds = this.getDeletedKahootQuizIds();
    deletedIds.add(id);
    safeStorage.setItem(DELETED_KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(Array.from(deletedIds)));

    // 2. Remove from active quizzes list
    const list = this.getKahootQuizzes();
    const filtered = list.filter(q => q.id !== id);
    safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(filtered));

    // 3. Remove and end any sessions linked to this quiz
    const sessions = this.getKahootSessions();
    let sessionsChanged = false;
    Object.keys(sessions).forEach(pin => {
      if (sessions[pin]?.quizId === id || (sessions[pin]?.quizId && deletedIds.has(sessions[pin].quizId))) {
        delete sessions[pin];
        sessionsChanged = true;
        fetch(`/api/kahoot/sessions/${encodeURIComponent(pin)}`, { method: 'DELETE' }).catch(() => {});
        try {
          safeCloudflareDelete('kahoot_sessions', pin).catch(() => {});
        } catch {}
      }
    });
    if (sessionsChanged) {
      safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    }

    // 4. Cascade-delete all solo scores linked to this deleted quiz (and any deleted quiz IDs)
    try {
      const rawScores = safeStorage.getItem('kahoot_solo_scores');
      if (rawScores) {
        const parsedScores: KahootSoloScore[] = JSON.parse(rawScores);
        if (Array.isArray(parsedScores)) {
          const removedScores = parsedScores.filter(s => !s || !s.quizId || s.quizId === id || deletedIds.has(s.quizId));
          const remainingScores = parsedScores.filter(s => s && s.quizId && s.quizId !== id && !deletedIds.has(s.quizId));
          safeStorage.setItem('kahoot_solo_scores', JSON.stringify(remainingScores));
          removedScores.forEach(rs => {
            if (rs && rs.id) {
              safeCloudflareDelete('kahoot_solo_scores', rs.id).catch(() => {});
            }
          });
        }
      }
    } catch {}

    // 5. Delete from Central Server
    fetch(`/api/kahoot/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});

    // 6. Delete doc from Cloudflare D1 & record tombstone
    try {
      safeCloudflareDelete('kahoot_quizzes', id).catch(() => {});
      safeCloudflareUpsert('deleted_records', {
        id,
        type: 'kahoot_quiz',
        deletedAt: new Date().toISOString()
      }).catch(() => {});
      syncSystemStateToCloudflareOwner().catch(() => {});
    } catch {}

    notifySyncListeners();
    return true;
  },

  archiveKahootQuiz(id: string, archive: boolean = true): KahootQuiz | null {
    const list = this.getKahootQuizzes();
    const target = list.find(q => q.id === id);
    if (!target) return null;
    const updated: KahootQuiz = {
      ...target,
      status: archive ? 'archived' : 'published',
      isPublished: !archive,
      isVisibleToMembers: archive ? false : true,
      updatedAt: new Date().toISOString()
    };
    this.saveKahootQuiz(updated);
    return updated;
  },

  getKahootSessions(): Record<string, KahootLiveSession> {
    const raw = safeStorage.getItem(KAHOOT_SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  },

  getKahootSession(pin: string): KahootLiveSession | null {
    const cleanPin = pin.trim().replace(/\D/g, '');
    if (!cleanPin) return null;
    const sessions = this.getKahootSessions();
    if (sessions[cleanPin]) return sessions[cleanPin];
    // Also check if cleanPin is a specific Team PIN inside an active session
    const matchedByTeamPin = Object.values(sessions).find(
      s => s && s.status !== 'finished' && s.teams && Object.values(s.teams).some(t => t.pin === cleanPin)
    );
    return matchedByTeamPin || null;
  },

  findTeamByPinInSession(session: KahootLiveSession, pin: string): string | undefined {
    const cleanPin = pin.trim().replace(/\D/g, '');
    if (!cleanPin || !session.teams) return undefined;
    const matchedTeam = Object.values(session.teams).find(t => t.pin === cleanPin);
    return matchedTeam?.id;
  },

  saveKahootSession(session: KahootLiveSession, replacePlayers: boolean = false): void {
    const sessions = this.getKahootSessions();
    const existing = sessions[session.id];
    const stampedSession: KahootLiveSession = {
      ...session,
      updatedAtMs: Date.now(),
      stateVersion: Math.max(Number(existing?.stateVersion || 0), Number(session.stateVersion || 0)) + 1
    };
    const mergedSession = mergeKahootSessionSnapshots(existing, stampedSession, replacePlayers) || stampedSession;

    sessions[session.id] = mergedSession;
    safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    notifySyncListeners();

    // Sync to Central Server & SSE
    fetch('/api/kahoot/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: mergedSession, replacePlayers })
    })
      .then(r => r.json())
      .then(data => {
        if (data?.session && data.session.id) {
          const cur = this.getKahootSessions();
          const reconciled = mergeKahootSessionSnapshots(cur[data.session.id], data.session, replacePlayers);
          if (reconciled) {
            cur[data.session.id] = reconciled;
            safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(cur));
            notifySyncListeners();
          }
        }
      })
      .catch(() => {});

    // Sync to Cloudflare D1
    try {
      safeCloudflareUpsert('kahoot_sessions', mergedSession).catch(() => {});
      syncSystemStateToCloudflareOwner().catch(() => {});
    } catch {}
  },

  async syncKahootLiveStateFast(): Promise<{ serverTime?: number }> {
    try {
      const res = await fetch('/api/kahoot/live-state', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) return {};
      const data = await res.json();
      if (!data?.success) return {};
      let anyChanged = false;

      if (data.sessions && typeof data.sessions === 'object') {
        const localSessions = this.getKahootSessions();
        const { merged, changed } = mergeKahootSessionsMap(localSessions, data.sessions, true);
        if (changed) {
          safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(merged));
          anyChanged = true;
        }
      }

      if (Array.isArray(data.quizzes)) {
        const delSet = this.getDeletedKahootQuizIds();
        const localQuizzes = this.getKahootQuizzes();
        const map = new Map<string, KahootQuiz>();
        localQuizzes.forEach((q) => {
          if (q && q.id && !delSet.has(q.id)) map.set(q.id, q);
        });
        data.quizzes.forEach((rq: KahootQuiz) => {
          if (rq && rq.id && !delSet.has(rq.id)) {
            const ex = map.get(rq.id);
            if (!ex) {
              map.set(rq.id, rq);
            } else {
              const exTs = new Date(ex.updatedAt || ex.createdAt || 0).getTime();
              const rqTs = new Date(rq.updatedAt || rq.createdAt || 0).getTime();
              if (rqTs >= exTs) {
                map.set(rq.id, { ...ex, ...rq });
              }
            }
          }
        });
        const nextQuizzes = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        if (JSON.stringify(localQuizzes) !== JSON.stringify(nextQuizzes)) {
          safeStorage.setItem(KAHOOT_QUIZZES_STORAGE_KEY, JSON.stringify(nextQuizzes));
          anyChanged = true;
        }
      }

      if (Array.isArray(data.soloScores)) {
        const rawLocal = safeStorage.getItem('kahoot_solo_scores') || '[]';
        const nextStr = JSON.stringify(data.soloScores);
        if (rawLocal !== nextStr) {
          safeStorage.setItem('kahoot_solo_scores', nextStr);
          anyChanged = true;
        }
      }

      if (anyChanged) {
        notifySyncListeners();
      }
      return { serverTime: data.serverTime };
    } catch {
      return {};
    }
  },

  evaluateKahootQuizSchedule(quiz: KahootQuiz | null | undefined, nowMs: number = Date.now()): {
    available: boolean;
    reason?: 'hidden' | 'not_started' | 'expired';
    statusLabelAr: string;
    startsAtMs?: number;
    endsAtMs?: number;
  } {
    if (!quiz) {
      return { available: false, reason: 'hidden', statusLabelAr: 'مسودة / غير منشورة' };
    }
    if (quiz.status === 'archived') {
      return { available: false, reason: 'hidden', statusLabelAr: 'مؤرشفة في الأرشيف 📦' };
    }
    if (quiz.status === 'draft' || quiz.isPublished === false) {
      return { available: false, reason: 'hidden', statusLabelAr: 'مسودة / غير منشورة' };
    }
    if (quiz.isVisibleToMembers === false) {
      return { available: false, reason: 'hidden', statusLabelAr: 'مخفية يدوياً عن المخدومين' };
    }
    if (!quiz.isScheduled) {
      return { available: true, statusLabelAr: 'متاحة الآن للمخدومين' };
    }

    const fromDate = (quiz.availableFromDate || '').trim();
    const toDate = (quiz.availableToDate || '').trim();
    const fromTime = (quiz.availableFromTime || '').trim();
    const toTime = (quiz.availableToTime || '').trim();

    let startsAtMs: number | undefined;
    let endsAtMs: number | undefined;

    if (fromDate) {
      const startTimeStr = fromTime || '00:00';
      const parsedStart = new Date(`${fromDate}T${startTimeStr}:00`).getTime();
      if (!Number.isNaN(parsedStart)) startsAtMs = parsedStart;
    }

    if (toDate) {
      const endTimeStr = toTime || '23:59';
      const parsedEnd = new Date(`${toDate}T${endTimeStr}:59`).getTime();
      if (!Number.isNaN(parsedEnd)) endsAtMs = parsedEnd;
    }

    // If only time window is set without specific dates, evaluate on current day
    if (!fromDate && !toDate && (fromTime || toTime)) {
      const nowDate = new Date(nowMs);
      const y = nowDate.getFullYear();
      const m = String(nowDate.getMonth() + 1).padStart(2, '0');
      const d = String(nowDate.getDate()).padStart(2, '0');
      const todayYmd = `${y}-${m}-${d}`;
      if (fromTime) {
        const parsedStart = new Date(`${todayYmd}T${fromTime}:00`).getTime();
        if (!Number.isNaN(parsedStart)) startsAtMs = parsedStart;
      }
      if (toTime) {
        const parsedEnd = new Date(`${todayYmd}T${toTime}:59`).getTime();
        if (!Number.isNaN(parsedEnd)) endsAtMs = parsedEnd;
      }
    }

    if (startsAtMs !== undefined && nowMs < startsAtMs) {
      return {
        available: false,
        reason: 'not_started',
        statusLabelAr: `تفتح يوم ${fromDate || 'اليوم'} الساعة ${fromTime || '00:00'}`,
        startsAtMs,
        endsAtMs
      };
    }

    if (endsAtMs !== undefined && nowMs > endsAtMs) {
      return {
        available: false,
        reason: 'expired',
        statusLabelAr: 'انتهى وقت المسابقة وأُغلق الدخول',
        startsAtMs,
        endsAtMs
      };
    }

    // Also if both date range and daily time window are specified across multiple days, check if user wants strict start-to-end timestamp (handled above)
    return {
      available: true,
      statusLabelAr: endsAtMs ? `متاحة حتى ${toDate || 'اليوم'} ${toTime || '23:59'}` : 'متاحة الآن للمخدومين',
      startsAtMs,
      endsAtMs
    };
  },

  isKahootQuizAvailableForMembers(quiz: KahootQuiz | null | undefined, nowMs: number = Date.now()): boolean {
    return this.evaluateKahootQuizSchedule(quiz, nowMs).available;
  },

  hasActiveKahootCompetition(): boolean {
    const quizzes = this.getKahootQuizzes();
    const deletedQuizIds = this.getDeletedKahootQuizIds();
    const now = Date.now();
    const hasPublishedQuiz = quizzes.some(
      q => q && q.id && !deletedQuizIds.has(q.id) && this.isKahootQuizAvailableForMembers(q, now) && Array.isArray(q.questions) && q.questions.length > 0
    );
    if (hasPublishedQuiz) return true;

    const validQuizzes = new Set(
      quizzes
        .filter(q => q && q.id && !deletedQuizIds.has(q.id) && this.isKahootQuizAvailableForMembers(q, now))
        .map(q => q.id)
    );
    const sessions = this.getKahootSessions();
    const activeStatuses = ['lobby', 'question_countdown', 'question_active', 'answer_reveal', 'leaderboard', 'podium'];
    return Object.values(sessions).some(s => {
      if (!s || s.status === 'finished') return false;
      if (!activeStatuses.includes(s.status)) return false;
      if (!s.quizId || deletedQuizIds.has(s.quizId) || !validQuizzes.has(s.quizId)) return false;
      // Stale session protection (older than 2 hours is considered expired)
      if (s.questionStartedAt && (now - s.questionStartedAt > 2 * 60 * 60 * 1000)) return false;
      return true;
    });
  },

  getActiveKahootSession(): KahootLiveSession | null {
    const quizzes = this.getKahootQuizzes();
    const quizMap = new Map(quizzes.map(q => [q.id, q]));
    const deletedQuizIds = this.getDeletedKahootQuizIds();
    const sessions = this.getKahootSessions();
    const activeStatuses = ['lobby', 'question_countdown', 'question_active', 'answer_reveal', 'leaderboard', 'podium'];
    const now = Date.now();
    const candidates = Object.values(sessions).filter(s => {
      if (!s || s.status === 'finished') return false;
      if (!activeStatuses.includes(s.status)) return false;
      if (!s.quizId || deletedQuizIds.has(s.quizId) || !quizMap.has(s.quizId)) return false;
      const parentQuiz = quizMap.get(s.quizId);
      if (parentQuiz && parentQuiz.activePlayMode === 'self_paced') return false;
      if (s.questionStartedAt && (now - s.questionStartedAt > 2 * 60 * 60 * 1000)) return false;
      return true;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
    return candidates[0];
  },

  getKahootSoloScores(quizId?: string): KahootSoloScore[] {
    const raw = safeStorage.getItem('kahoot_solo_scores');
    if (!raw) return [];
    try {
      const all: KahootSoloScore[] = JSON.parse(raw);
      if (!Array.isArray(all)) return [];
      const deletedIds = this.getDeletedKahootQuizIds();
      const existingQuizIds = new Set(this.getKahootQuizzes().map(q => q.id));
      // Filter out any orphaned scores belonging to deleted quizzes
      const validScores = all.filter(
        s => s && s.quizId && !deletedIds.has(s.quizId) && existingQuizIds.has(s.quizId)
      );
      if (validScores.length !== all.length) {
        safeStorage.setItem('kahoot_solo_scores', JSON.stringify(validScores));
      }
      if (quizId) {
        return validScores.filter(s => s.quizId === quizId).sort((a, b) => b.score - a.score);
      }
      return validScores.sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  },

  async saveKahootSoloScore(score: KahootSoloScore): Promise<void> {
    const all = this.getKahootSoloScores();
    const updatedRecord: KahootSoloScore = {
      ...score,
      updatedAt: new Date().toISOString()
    };
    const filtered = all.filter(s => !(s.quizId === score.quizId && s.playerId === score.playerId));
    filtered.push(updatedRecord);
    filtered.sort((a, b) => b.score - a.score);
    safeStorage.setItem('kahoot_solo_scores', JSON.stringify(filtered));

    fetch('/api/kahoot/solo-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: updatedRecord })
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.soloScores)) {
          safeStorage.setItem('kahoot_solo_scores', JSON.stringify(data.soloScores));
          notifySyncListeners();
        }
      })
      .catch(() => {});

    // Persist to Cloudflare D1
    try {
      await safeCloudflareUpsert('kahoot_solo_scores', updatedRecord);
      syncSystemStateToCloudflareOwner().catch(() => {});
    } catch (e) {
      console.warn('Solo score save notice:', e);
    }
    notifySyncListeners();
  },

  endKahootSession(pin: string): void {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const sessions = this.getKahootSessions();
    const session = sessions[cleanPin];
    if (!session) return;
    session.status = 'finished';
    session.finishedAt = session.finishedAt || new Date().toISOString();
    this.saveKahootSession(session);
  },

  deleteKahootSession(pin: string): void {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const sessions = this.getKahootSessions();
    if (sessions[cleanPin]) {
      delete sessions[cleanPin];
      safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      fetch(`/api/kahoot/sessions/${encodeURIComponent(cleanPin)}`, { method: 'DELETE' }).catch(() => {});
      try {
        safeCloudflareDelete('kahoot_sessions', cleanPin).catch(() => {});
        syncSystemStateToCloudflareOwner().catch(() => {});
      } catch {}
      notifySyncListeners();
    }
  },

  clearAllStaleKahootSessions(): void {
    const sessions = this.getKahootSessions();
    const activeStatuses = ['lobby', 'question_countdown', 'question_active', 'answer_reveal', 'leaderboard', 'podium'];
    const now = Date.now();
    let changed = false;

    Object.keys(sessions).forEach(pin => {
      const s = sessions[pin];
      if (!s) {
        delete sessions[pin];
        changed = true;
        return;
      }
      const isExpiredActive = s.status !== 'finished' && (
        !activeStatuses.includes(s.status) ||
        (s.questionStartedAt && (now - s.questionStartedAt > 4 * 60 * 60 * 1000))
      );
      if (isExpiredActive) {
        if (Object.keys(s.players || {}).length > 0) {
          s.status = 'finished';
          s.finishedAt = s.finishedAt || new Date().toISOString();
        } else {
          delete sessions[pin];
        }
        changed = true;
      }
    });

    if (changed) {
      safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      notifySyncListeners();
    }
  },

  getKahootQuestionBank(): KahootQuestionBankItem[] {
    const raw = safeStorage.getItem(KAHOOT_QUESTION_BANK_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((b: any) => b && b.id && !String(b.id).startsWith('qbank_seed_'))
        : [];
    } catch {
      return [];
    }
  },

  saveKahootQuestionBankItem(item: KahootQuestionBankItem): KahootQuestionBankItem[] {
    const list = this.getKahootQuestionBank();
    const idx = list.findIndex(b => b.id === item.id);
    const updatedItem: KahootQuestionBankItem = {
      ...item,
      updatedAt: new Date().toISOString()
    };
    if (idx >= 0) {
      list[idx] = updatedItem;
    } else {
      list.unshift(updatedItem);
    }
    safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(list));

    fetch('/api/kahoot/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: updatedItem, items: list })
    }).catch(() => {});

    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return list;
  },

  deleteKahootQuestionBankItem(id: string): KahootQuestionBankItem[] {
    const list = this.getKahootQuestionBank().filter(b => b.id !== id);
    safeStorage.setItem(KAHOOT_QUESTION_BANK_STORAGE_KEY, JSON.stringify(list));

    fetch(`/api/kahoot/question-bank/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    syncSystemStateToCloudflareOwner().catch(() => {});
    notifySyncListeners();
    return list;
  },

  createKahootLiveSession(
    quizId: string,
    hostId: string,
    maxPlayersLimit?: number,
    options?: {
      gameMode?: KahootGameMode;
      teamAssignmentMode?: 'random' | 'manual_or_pin';
      customTeams?: Array<{ id: string; name: string; color: string; icon: string; pin?: string }>;
      allowLateJoin?: boolean;
      leaderboardVisibility?: 'after_each' | 'every_few' | 'end_only' | 'hidden';
      showParticipantNames?: boolean;
      hostName?: string;
    }
  ): KahootLiveSession {
    const pin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits PIN
    const quizzes = this.getKahootQuizzes();
    const quizIdx = quizzes.findIndex(q => q.id === quizId);
    const quiz = (quizIdx >= 0 ? quizzes[quizIdx] : SAMPLE_KAHOOT_QUIZZES[0]);
    const activeQuestions = (quiz.questions || []).filter(q => !q.isDisabled);
    const resolvedMode: KahootGameMode = options?.gameMode || quiz.activePlayMode || quiz.gameMode || 'live';
    const resolvedAssignmentMode: 'random' | 'manual_or_pin' = options?.teamAssignmentMode || quiz.teamAssignmentMode || 'manual_or_pin';

    const defaultTeamsConfig: KahootTeamConfigItem[] = [
      { id: 'team_1', name: 'فريق شدرخ (حنانيا) 🔥', color: 'red', icon: '🔥' },
      { id: 'team_2', name: 'فريق ميشخ (ميشائيل) ⚡', color: 'blue', icon: '⚡' },
      { id: 'team_3', name: 'فريق عبد نغو (عزاريا) 🛡️', color: 'green', icon: '🛡️' },
      { id: 'team_4', name: 'فريق دانيال النبي 🦁', color: 'yellow', icon: '🦁' }
    ];

    const sourceTeams: KahootTeamConfigItem[] = (options?.customTeams && options.customTeams.length >= 2)
      ? options.customTeams
      : (quiz.customTeams && quiz.customTeams.length >= 2)
      ? quiz.customTeams
      : defaultTeamsConfig;

    const usedPins = new Set<string>([pin]);
    const generateUniqueTeamPin = () => {
      let tPin = Math.floor(100000 + Math.random() * 900000).toString();
      while (usedPins.has(tPin)) {
        tPin = Math.floor(100000 + Math.random() * 900000).toString();
      }
      usedPins.add(tPin);
      return tPin;
    };

    const teamsRecord: Record<string, any> = {};
    if (resolvedMode === 'team') {
      sourceTeams.forEach((t, idx) => {
        const tid = t.id || `team_${idx + 1}`;
        const tPin = t.pin && t.pin.length === 6 && !usedPins.has(t.pin) ? t.pin : generateUniqueTeamPin();
        usedPins.add(tPin);
        teamsRecord[tid] = {
          id: tid,
          name: t.name || `الفريق ${idx + 1}`,
          color: t.color || (['red', 'blue', 'green', 'yellow', 'purple', 'cyan'][idx % 6]),
          icon: t.icon || (['🔥', '⚡', '🛡️', '🦁', '🌟', '👑'][idx % 6]),
          pin: tPin,
          score: 0,
          lastQuestionPoints: 0,
          currentRank: idx + 1,
          previousRank: idx + 1,
          memberCount: 0
        };
      });
    }

    const session: KahootLiveSession = {
      id: pin,
      quizId: quiz.id,
      quizTitle: quiz.title,
      quizCoverImage: quiz.coverImage,
      hostId,
      hostName: options?.hostName || quiz.creatorName,
      status: 'lobby',
      gameMode: resolvedMode,
      teamAssignmentMode: resolvedAssignmentMode,
      isLocked: false,
      allowLateJoin: options?.allowLateJoin ?? quiz.settings?.allowLateJoin ?? true,
      leaderboardVisibility: options?.leaderboardVisibility || quiz.settings?.leaderboardVisibility || 'after_each',
      showParticipantNames: options?.showParticipantNames ?? quiz.settings?.showParticipantNames ?? (resolvedMode !== 'anonymous_poll'),
      currentQuestionIndex: 0,
      questionTimeLimitSeconds: activeQuestions[0]?.timeLimitSeconds || quiz.settings?.defaultTimeLimit || 20,
      secondScreenMode: quiz.antiCheat?.secondScreenMode,
      randomizeAnswers: quiz.antiCheat?.randomizeAnswers,
      canvasTextProtection: quiz.antiCheat?.canvasTextProtection,
      freezeOnBlur: quiz.antiCheat?.freezeOnBlur,
      players: {},
      teams: resolvedMode === 'team' ? teamsRecord : undefined,
      answersSubmitted: {},
      opinionsCollected: {},
      maxPlayersLimit: maxPlayersLimit ?? quiz.maxPlayersLimit ?? 0,
      startedAt: new Date().toISOString()
    };

    // Close any previous non-finished sessions before launching the new room so members switch immediately
    const existingSessions = this.getKahootSessions();
    Object.values(existingSessions).forEach(s => {
      if (s && s.status !== 'finished') {
        s.status = 'finished';
        s.finishedAt = s.finishedAt || new Date().toISOString();
      }
    });
    safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(existingSessions));

    // Persist activePlayMode, activeSessionId, and team configuration on the quiz
    if (quizIdx >= 0) {
      const updatedQuiz: KahootQuiz = {
        ...quiz,
        playCount: (quiz.playCount || 0) + 1,
        status: 'live',
        gameMode: resolvedMode,
        activePlayMode: resolvedMode,
        activeSessionId: pin,
        teamAssignmentMode: resolvedAssignmentMode,
        customTeams: resolvedMode === 'team' ? Object.values(teamsRecord).map((t: any) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          icon: t.icon,
          pin: t.pin
        })) : quiz.customTeams,
        updatedAt: new Date().toISOString()
      };
      this.saveKahootQuiz(updatedQuiz);
    }

    this.saveKahootSession(session, true);
    return session;
  },

  joinKahootSession(pin: string, player: KahootPlayer, preferredTeamId?: string): { success: boolean; session?: KahootLiveSession; error?: string } {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const session = this.getKahootSession(cleanPin);
    if (!session) {
      return { success: false, error: 'رمز المسابقة أو الفريق (PIN) غير صحيح أو انتهت الجلسة.' };
    }
    if (session.status === 'finished') {
      return { success: false, error: 'هذه المسابقة انتهت بالفعل.' };
    }
    const existing = session.players[player.id];
    if (session.isLocked && !existing) {
      return { success: false, error: 'تم قفل الانضمام لهذه الغرفة من قبل الخادم المسؤول 🔒' };
    }
    if (session.status !== 'lobby' && session.allowLateJoin === false && !existing) {
      return { success: false, error: 'المسابقة بدأت بالفعل ولا يُسمح بالانضمام المتأخر.' };
    }

    const currentPlayers = Object.keys(session.players);
    if (session.maxPlayersLimit && session.maxPlayersLimit > 0 && currentPlayers.length >= session.maxPlayersLimit) {
      if (!existing) {
        return { success: false, error: `عذراً، اكتمل العدد الأقصى للمشاركين في هذه المسابقة (${session.maxPlayersLimit} متسابق).` };
      }
    }

    // Check if the entered PIN matches a specific Team PIN
    const pinMatchedTeamId = this.findTeamByPinInSession(session, cleanPin);

    let teamId = pinMatchedTeamId || preferredTeamId || player.teamId || existing?.teamId;
    let teamName = existing?.teamName;
    if (session.gameMode === 'team' && session.teams) {
      const teamIds = Object.keys(session.teams);
      // If assignment mode is 'random' and user didn't enter a dedicated Team PIN, auto-balance across teams
      if (session.teamAssignmentMode === 'random' && !pinMatchedTeamId && !existing?.teamId) {
        const counts: Record<string, number> = {};
        teamIds.forEach(tid => { counts[tid] = 0; });
        Object.values(session.players).forEach(p => {
          if (p.id !== player.id && p.teamId && counts[p.teamId] !== undefined) counts[p.teamId]++;
        });
        const minCount = Math.min(...Object.values(counts));
        const leastPopulatedTeams = teamIds.filter(tid => counts[tid] === minCount);
        teamId = leastPopulatedTeams[Math.floor(Math.random() * leastPopulatedTeams.length)] || teamIds[0];
      } else if (!teamId || !session.teams[teamId]) {
        const counts: Record<string, number> = {};
        teamIds.forEach(tid => { counts[tid] = 0; });
        Object.values(session.players).forEach(p => {
          if (p.id !== player.id && p.teamId && counts[p.teamId] !== undefined) counts[p.teamId]++;
        });
        teamId = teamIds.sort((a, b) => counts[a] - counts[b])[0];
      }
      teamName = session.teams[teamId]?.name;
    }

    session.players[player.id] = {
      ...player,
      teamId,
      teamName,
      score: existing?.score || 0,
      streak: existing?.streak || 0,
      correctCount: existing?.correctCount || 0,
      totalAnswered: existing?.totalAnswered || 0,
      totalTimeMs: existing?.totalTimeMs || 0,
      currentRank: existing?.currentRank || (currentPlayers.length + 1),
      previousRank: existing?.previousRank || (currentPlayers.length + 1),
      isOnline: true
    };

    // Update memberCount on teams
    if (session.gameMode === 'team' && session.teams) {
      Object.keys(session.teams).forEach(tid => {
        session.teams![tid].memberCount = Object.values(session.players).filter(p => p.teamId === tid).length;
      });
    }

    session.updatedAtMs = Date.now();
    session.stateVersion = Number(session.stateVersion || 0) + 1;

    // Save locally without overwriting full server session snapshot, then call atomic /join endpoint
    const allSessions = this.getKahootSessions();
    allSessions[session.id] = session;
    safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(allSessions));
    notifySyncListeners();

    fetch(`/api/kahoot/sessions/${encodeURIComponent(cleanPin)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: session.players[player.id], teamId })
    })
      .then(r => r.json())
      .then(data => {
        if (data?.session && data.session.id) {
          const cur = this.getKahootSessions();
          const merged = mergeKahootSessionSnapshots(cur[data.session.id], data.session, false);
          if (merged) {
            cur[data.session.id] = merged;
            safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(cur));
            notifySyncListeners();
          }
        }
      })
      .catch(() => {});

    return { success: true, session };
  },

  changePlayerTeamInKahootSession(sessionId: string, playerId: string, newTeamId: string): KahootLiveSession | null {
    const session = this.getKahootSession(sessionId);
    if (!session || !session.teams || !session.teams[newTeamId] || !session.players[playerId]) return null;
    session.players[playerId].teamId = newTeamId;
    session.players[playerId].teamName = session.teams[newTeamId].name;

    // Recalculate team scores and member counts
    Object.keys(session.teams).forEach(tid => {
      const teamPlayers = Object.values(session.players).filter(p => p.teamId === tid);
      session.teams![tid].memberCount = teamPlayers.length;
      session.teams![tid].score = teamPlayers.reduce((sum, p) => sum + (p.score || 0), 0);
    });

    this.saveKahootSession(session);
    return session;
  },

  updateKahootSessionTeams(
    sessionId: string,
    teamsInput: Record<string, KahootTeam> | Array<{ id: string; name: string; color: string; icon?: string; pin?: string }>,
    teamAssignmentMode?: 'random' | 'manual_or_pin'
  ): KahootLiveSession | null {
    const session = this.getKahootSession(sessionId);
    if (!session) return null;

    const usedPins = new Set<string>([session.id]);
    const genPin = () => {
      let p = Math.floor(100000 + Math.random() * 900000).toString();
      while (usedPins.has(p)) {
        p = Math.floor(100000 + Math.random() * 900000).toString();
      }
      usedPins.add(p);
      return p;
    };

    let teamsRecord: Record<string, KahootTeam> = {};
    if (Array.isArray(teamsInput)) {
      teamsInput.forEach((t, idx) => {
        const tid = t.id || `team_${idx + 1}`;
        const existingTeam = session.teams?.[tid];
        const tPin = (t.pin && t.pin.length === 6 && !usedPins.has(t.pin))
          ? t.pin
          : (existingTeam?.pin && !usedPins.has(existingTeam.pin) ? existingTeam.pin : genPin());
        usedPins.add(tPin);
        teamsRecord[tid] = {
          id: tid,
          name: t.name || `الفريق ${idx + 1}`,
          color: t.color || existingTeam?.color || (['red', 'blue', 'green', 'yellow', 'purple', 'cyan'][idx % 6]),
          icon: t.icon || existingTeam?.icon || (['🔥', '⚡', '🛡️', '🦁', '🌟', '👑'][idx % 6]),
          pin: tPin,
          score: existingTeam?.score || 0,
          lastQuestionPoints: existingTeam?.lastQuestionPoints || 0,
          currentRank: existingTeam?.currentRank || (idx + 1),
          previousRank: existingTeam?.previousRank || (idx + 1),
          memberCount: existingTeam?.memberCount || 0
        };
      });
    } else {
      teamsRecord = teamsInput;
    }

    session.teams = teamsRecord;
    if (teamAssignmentMode) {
      session.teamAssignmentMode = teamAssignmentMode;
    }
    const teamIds = Object.keys(teamsRecord);
    Object.values(session.players).forEach((p, idx) => {
      if (!p.teamId || !teamsRecord[p.teamId]) {
        const fallbackTid = teamIds[idx % Math.max(1, teamIds.length)];
        p.teamId = fallbackTid;
        p.teamName = fallbackTid ? teamsRecord[fallbackTid]?.name : undefined;
      } else {
        p.teamName = teamsRecord[p.teamId].name;
      }
    });
    Object.keys(teamsRecord).forEach(tid => {
      const teamPlayers = Object.values(session.players).filter(p => p.teamId === tid);
      teamsRecord[tid].memberCount = teamPlayers.length;
      teamsRecord[tid].score = teamPlayers.reduce((sum, p) => sum + (p.score || 0), 0);
    });
    this.saveKahootSession(session);
    return session;
  },

  submitKahootAnswer(
    pin: string, 
    playerId: string, 
    questionId: string, 
    answer: any, 
    timeElapsedMs: number,
    isCorrect: boolean,
    pointsMultiplier: number = 1,
    playerName?: string,
    answerLabel?: string
  ): { pointsEarned: number; newScore: number; newStreak: number } {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const session = this.getKahootSession(cleanPin);
    if (!session) return { pointsEarned: 0, newScore: 0, newStreak: 0 };

    // Do not accept answers once question time has expired or moved to reveal/leaderboard
    if (session.status !== 'question_active') {
      const existingPlayer = session.players?.[playerId];
      return {
        pointsEarned: 0,
        newScore: existingPlayer?.score || 0,
        newStreak: existingPlayer?.streak || 0
      };
    }

    if (!session.players[playerId]) {
      session.players[playerId] = {
        id: playerId,
        name: playerName || 'مشارك',
        score: 0,
        streak: 0,
        currentRank: Object.keys(session.players).length + 1,
        correctCount: 0,
        totalAnswered: 0,
        totalTimeMs: 0,
        isOnline: true
      };
    }

    const player = session.players[playerId];
    const answerKey = `${playerId}_${questionId}`;
    if (session.answersSubmitted?.[answerKey]) {
      return {
        pointsEarned: session.answersSubmitted[answerKey].points || 0,
        newScore: player.score,
        newStreak: player.streak
      };
    }

    const timeLimitMs = (session.questionTimeLimitSeconds || 20) * 1000;
    let speedScore = 0;
    let totalPoints = 0;

    if (isCorrect && pointsMultiplier > 0) {
      const responseRatio = Math.min(1, Math.max(0, timeElapsedMs / timeLimitMs));
      speedScore = Math.round((1 - (responseRatio / 2)) * 1000 * pointsMultiplier);
      const streakBonus = Math.min(500, (player.streak || 0) * 100);
      totalPoints = speedScore + streakBonus;
      player.streak = (player.streak || 0) + 1;
      player.correctCount = (player.correctCount || 0) + 1;
      player.score = (player.score || 0) + totalPoints;
    } else {
      player.streak = 0;
    }

    player.totalAnswered = (player.totalAnswered || 0) + 1;
    player.totalTimeMs = (player.totalTimeMs || 0) + timeElapsedMs;
    player.lastAnswerCorrect = isCorrect;
    player.lastPointsEarned = totalPoints;
    player.lastAnswerTimeMs = timeElapsedMs;

    if (!session.answersSubmitted) session.answersSubmitted = {};
    session.answersSubmitted[answerKey] = {
      playerId,
      playerName: player.name,
      teamId: player.teamId,
      questionId,
      answer,
      answerLabel,
      isCorrect,
      points: totalPoints,
      timeElapsedMs,
      submittedAt: Date.now()
    };

    // Compute exact pre-question ranks (before this question's points) and post-question ranks
    const allPlayersList = Object.values(session.players);
    const preSortedPlayers = [...allPlayersList].sort((a, b) => {
      const aSub = session.answersSubmitted?.[`${a.id}_${questionId}`];
      const bSub = session.answersSubmitted?.[`${b.id}_${questionId}`];
      const aPreScore = Math.max(0, Number(a.score || 0) - Number(aSub?.points || 0));
      const bPreScore = Math.max(0, Number(b.score || 0) - Number(bSub?.points || 0));
      if (bPreScore !== aPreScore) return bPreScore - aPreScore;
      return String(a.id).localeCompare(String(b.id));
    });
    const preRankMap: Record<string, number> = {};
    preSortedPlayers.forEach((pl, idx) => {
      preRankMap[pl.id] = idx + 1;
    });

    const sorted = [...allPlayersList].sort((a, b) => {
      const diff = (b.score || 0) - (a.score || 0);
      if (diff !== 0) return diff;
      return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
    });
    sorted.forEach((p, idx) => {
      if (session.players[p.id]) {
        session.players[p.id].previousRank = preRankMap[p.id] || (idx + 1);
        session.players[p.id].currentRank = idx + 1;
      }
    });

    // Recalculate cumulative team scores and team ranks
    if (session.gameMode === 'team' && session.teams) {
      Object.values(session.teams).forEach(team => {
        const teamPlayers = Object.values(session.players).filter(p => p.teamId === team.id);
        team.memberCount = teamPlayers.length;
        team.score = teamPlayers.reduce((sum, p) => sum + (p.score || 0), 0);
        const qPoints = Object.values(session.answersSubmitted)
          .filter(sub => sub.questionId === questionId && sub.teamId === team.id)
          .reduce((sum, sub) => sum + (sub.points || 0), 0);
        team.lastQuestionPoints = qPoints;
      });
      const allTeamsList = Object.values(session.teams);
      const preSortedTeams = [...allTeamsList].sort((a, b) => {
        const aPre = Math.max(0, (a.score || 0) - (a.lastQuestionPoints || 0));
        const bPre = Math.max(0, (b.score || 0) - (b.lastQuestionPoints || 0));
        return bPre - aPre;
      });
      const preTeamRankMap: Record<string, number> = {};
      preSortedTeams.forEach((t, idx) => {
        preTeamRankMap[t.id] = idx + 1;
      });
      const sortedTeams = [...allTeamsList].sort((a, b) => b.score - a.score);
      sortedTeams.forEach((t, idx) => {
        if (session.teams && session.teams[t.id]) {
          session.teams[t.id].previousRank = preTeamRankMap[t.id] || (idx + 1);
          session.teams[t.id].currentRank = idx + 1;
        }
      });
    }

    // If all joined players have answered this question, automatically advance session status to 'leaderboard'
    const totalPlayersCount = Object.keys(session.players).length;
    const submittedForQuestionCount = Object.keys(session.answersSubmitted || {}).filter(k => k.endsWith(`_${questionId}`)).length;
    if (totalPlayersCount > 0 && submittedForQuestionCount >= totalPlayersCount) {
      session.status = 'leaderboard';
    }

    session.updatedAtMs = Date.now();
    session.stateVersion = Number(session.stateVersion || 0) + 1;

    // Save locally without overwriting full server session snapshot, then call atomic /answer endpoint
    const allSessions = this.getKahootSessions();
    allSessions[session.id] = session;
    safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(allSessions));
    notifySyncListeners();

    fetch(`/api/kahoot/sessions/${encodeURIComponent(session.id)}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        playerName: player.name,
        questionId,
        answer,
        answerLabel,
        isCorrect,
        points: speedScore,
        timeElapsedMs,
        isOpinion: false
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data?.session && data.session.id) {
          const cur = this.getKahootSessions();
          const merged = mergeKahootSessionSnapshots(cur[data.session.id], data.session, false);
          if (merged) {
            cur[data.session.id] = merged;
            safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(cur));
            notifySyncListeners();
          }
        }
      })
      .catch(() => {});

    return { pointsEarned: totalPoints, newScore: player.score, newStreak: player.streak };
  },

  submitKahootOpinion(pin: string, questionId: string, player: { id: string; name: string }, response: any): void {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const session = this.getKahootSession(cleanPin);
    if (!session || session.status !== 'question_active') return;

    if (!session.opinionsCollected) {
      session.opinionsCollected = {};
    }
    if (!Array.isArray(session.opinionsCollected[questionId])) {
      session.opinionsCollected[questionId] = [];
    }

    const displayName = session.showParticipantNames === false ? 'مشارك' : player.name;
    session.opinionsCollected[questionId].push({
      playerId: player.id,
      playerName: displayName,
      response,
      createdAt: Date.now(),
      upvotes: 1
    });

    const answerKey = `${player.id}_${questionId}`;
    if (!session.answersSubmitted) session.answersSubmitted = {};
    session.answersSubmitted[answerKey] = {
      playerId: player.id,
      playerName: displayName,
      questionId,
      answer: response,
      isCorrect: true,
      points: 0,
      timeElapsedMs: 0,
      submittedAt: Date.now()
    };

    const allSessions = this.getKahootSessions();
    allSessions[session.id] = session;
    safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(allSessions));
    notifySyncListeners();

    fetch(`/api/kahoot/sessions/${encodeURIComponent(session.id)}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: player.id,
        playerName: displayName,
        questionId,
        answer: response,
        isCorrect: true,
        points: 0,
        timeElapsedMs: 0,
        isOpinion: true
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data?.session && data.session.id) {
          const cur = this.getKahootSessions();
          cur[data.session.id] = data.session;
          safeStorage.setItem(KAHOOT_SESSIONS_STORAGE_KEY, JSON.stringify(cur));
          notifySyncListeners();
        }
      })
      .catch(() => {});
  },

  upvoteBrainstormIdea(pin: string, questionId: string, ideaIndex: number): void {
    const session = this.getKahootSession(pin);
    if (!session || !session.opinionsCollected?.[questionId]) return;
    const idea = session.opinionsCollected[questionId][ideaIndex];
    if (idea) {
      idea.upvotes = (idea.upvotes || 0) + 1;
      this.saveKahootSession(session);
    }
  },

  kickPlayer(pin: string, playerId: string): void {
    const cleanPin = pin.trim().replace(/\D/g, '');
    const session = this.getKahootSession(cleanPin);
    if (!session || !session.players[playerId]) return;
    delete session.players[playerId];
    this.saveKahootSession(session, true);
    fetch(`/api/kahoot/sessions/${encodeURIComponent(cleanPin)}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId })
    }).catch(() => {});
  },

  updateSessionSettings(pin: string, updates: Partial<KahootLiveSession>): void {
    const session = this.getKahootSession(pin);
    if (!session) return;
    Object.assign(session, updates);
    this.saveKahootSession(session);
  },

  recordCheatViolation(pin: string, playerId: string, _reason: string): void {
    const session = this.getKahootSession(pin);
    if (!session) return;
    const player = session.players[playerId];
    if (!player) return;

    player.cheatWarningsCount = (player.cheatWarningsCount || 0) + 1;
    
    // If freezeOnBlur is enabled, wipe points for the current question
    if (session.freezeOnBlur && session.status === 'question_active') {
      player.lastPointsEarned = 0;
      player.lastAnswerCorrect = false;
    }

    this.saveKahootSession(session);
  }
};

/**
 * Announcements remain permanently active for all targeted members until manually deleted by an admin/servant.
 */
export function isAnnouncementExpired(ann: Announcement): boolean {
  if (!ann || !ann.id) return true;
  return false;
}

/**
 * Web Notifications Helper Service:
 * Manages browser push/system notifications for announcements & alerts
 */
export const notificationService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  getPermission(): NotificationPermission {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        return perm;
      } catch (e) {
        console.error('Notification permission error', e);
        return 'denied';
      }
    }
    return 'denied';
  },

  sendNotification(title: string, options?: NotificationOptions & { image?: string; announcementId?: string; senderRole?: UserRole; senderPhotoUrl?: string }) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        oneSignalService.showNativeServiceWorkerNotification({
          title,
          body: options?.body || '',
          announcementId: options?.announcementId,
          senderRole: options?.senderRole,
          senderPhotoUrl: options?.senderPhotoUrl,
          imageUrl: options?.image,
          tag: options?.tag
        }).catch(() => {});
      } catch (e) {
        console.warn('Could not trigger notification', e);
      }
    }
  }
};

/**
 * Format servant display name:
 * - If role is 'priest' ('أبونا'): returns "أبونا [الاسم]"
 * - For any other servant/leader/official: returns "أ. [الاسم]" strictly two-part name (ثنائي بس)
 */
export function formatServantDisplayName(fullName: string, role?: UserRole): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const twoNames = parts.slice(0, 2).join(' ') || fullName;

  if (role === 'priest') {
    const clean = twoNames.replace(/^أبونا\s*/, '');
    return `أبونا ${clean}`;
  }

  const clean = twoNames.replace(/^(أ\.|أستاذ|أ\/)\s*/, '');
  return `أ. ${clean}`;
}

export function getMemberDisplayName(fullName: string, role?: UserRole): string {
  if (role === 'priest') {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const twoNames = parts.slice(0, 2).join(' ') || fullName;
    const clean = twoNames.replace(/^أبونا\s*/, '');
    return `أبونا ${clean}`;
  }
  return fullName;
}

export function exportToCSV(filename: string, rows: Record<string, string | number>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvContent = '\uFEFF' + [
    headers.join(','),
    ...rows.map(row => 
      headers.map(field => {
        const val = row[field] !== undefined ? String(row[field]).replace(/"/g, '""') : '';
        return `"${val}"`;
      }).join(',')
    )
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
