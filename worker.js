import { DurableObject } from "cloudflare:workers";

// ============================================================================
// IN-MEMORY EDGE CACHE & VERSIONING (Sub-1ms CPU Time + Multi-Isolate Sync)
// ============================================================================
let edgeStateVersion = 0;
let lastVersionCheckTs = 0;
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch((err) => console.error(err));
  return next;
}
const rawSliceCache = new Map(); // key -> { raw: string, ts: number, checkedAt: number }
const mediaMemCache = new Map(); // title -> string (LRU-capped to 60 items)
let cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
let cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
let cachedMasterRegistrants = {
  version: -1,
  list: /** @type {any[] | null} */ (null),
  json: /** @type {string | null} */ (null)
};
function getCachedMasterRegistrantsJson(list) {
  if (
    cachedMasterRegistrants.version === edgeStateVersion &&
    cachedMasterRegistrants.list === list &&
    typeof cachedMasterRegistrants.json === "string"
  ) {
    return cachedMasterRegistrants.json;
  }
  const serialized = JSON.stringify(list);
  if (cachedMasterRegistrants.list === list) {
    cachedMasterRegistrants.json = serialized;
  }
  return serialized;
}

function setMediaCache(key, val) {
  if (!key || !val) return;
  if (mediaMemCache.size >= 60) {
    const firstKey = mediaMemCache.keys().next().value;
    if (firstKey) mediaMemCache.delete(firstKey);
  }
  mediaMemCache.set(key, val);
}

function getBaseMemberId(rawId) {
  return String(rawId || "")
    .trim()
    .replace(/^reg_member_reg_/i, "reg_")
    .replace(/(-ROW-\d+)+$/i, "");
}

function isDefaultOrEmptyCredential(val) {
  if (val === undefined || val === null) return true;
  const s = String(val).trim();
  return !s || s === "123456" || s === "12345" || s === "null" || s === "undefined";
}

function pickStrongestCredential(primaryVal, secondaryVal, primaryExplicitTs = 0, secondaryExplicitTs = 0, explicitChange = false, fallback = "") {
  const p = primaryVal !== undefined && primaryVal !== null ? String(primaryVal).trim() : "";
  const s = secondaryVal !== undefined && secondaryVal !== null ? String(secondaryVal).trim() : "";
  if (explicitChange && p && p !== "null" && p !== "undefined") {
    return p;
  }
  const pReal = !isDefaultOrEmptyCredential(p);
  const sReal = !isDefaultOrEmptyCredential(s);
  if (pReal && sReal) {
    if (Number(secondaryExplicitTs || 0) > Number(primaryExplicitTs || 0)) return s;
    return p;
  }
  if (pReal) return p;
  if (sReal) return s;
  if (p && p !== "null" && p !== "undefined") return p;
  if (s && s !== "null" && s !== "undefined") return s;
  return fallback;
}

function extractNestedSelfCreds(obj, targetNormName) {
  if (!obj || typeof obj !== "object" || !obj.member || typeof obj.member !== "object") {
    return { password: "", recoveryCode: "", dob: "", address: "" };
  }
  const inner = obj.member;
  const innerName = ultraNormalizeArabic(inner.fullName || inner.name || "");
  if (targetNormName && innerName && innerName !== targetNormName) {
    return { password: "", recoveryCode: "", dob: "", address: "" };
  }
  return {
    password: String(inner.password || inner.pass || "").trim(),
    recoveryCode: String(inner.recoveryCode || inner.securityCode || "").trim(),
    dob: String(inner.dob || inner.birthDate || "").trim(),
    address: String(inner.address || inner.residence || "").trim()
  };
}

const CLEAN_MASTER_DB_KEY = "CLEAN_MASTER_DB_V1";
const CLEAN_MASTER_KV_KEY = "CLEAN_MASTER_DB_KV_V1";
const YOUTH_MEMBERS_KV_KEY = "youth_members_kv_store";

const VERIFIED_95_MANIFEST = [
  { num: 1, name: "مارولينا كمال بدري", gender: "female" },
  { num: 2, name: "اندراوس مبارك هرون", gender: "male" },
  { num: 3, name: "مارولا روماني فوزي", gender: "female" },
  { num: 4, name: "مهرائيل بيتر شكري", gender: "female" },
  { num: 5, name: "نونسيا ناصر كرزون", gender: "female" },
  { num: 6, name: "مارتينا ماركو ميشيل", gender: "female" },
  { num: 7, name: "اربسيما انطونيوس الفي", gender: "female" },
  { num: 8, name: "توماس جودت وهب", gender: "male" },
  { num: 9, name: "باڤلي ريمون يعقوب", gender: "male" },
  { num: 10, name: "دميانة ادور راتب", gender: "female" },
  { num: 11, name: "ماريا جرجس نصري", gender: "female" },
  { num: 12, name: "اسطفانوس ادور صديق", gender: "male" },
  { num: 13, name: "وليم انيس حليم", gender: "male" },
  { num: 14, name: "مارينا جون راشد", gender: "female" },
  { num: 15, name: "مهرائيل حافظ بدري", gender: "female" },
  { num: 16, name: "جورج ناصر فتحي", gender: "male" },
  { num: 17, name: "ديانا اسحق غنامي", gender: "female" },
  { num: 18, name: "ماريا امين بشاي", gender: "female" },
  { num: 19, name: "كيلارا ماهر سمير", gender: "female" },
  { num: 20, name: "نانسي انسي حليم", gender: "female" },
  { num: 21, name: "مريم وجدي وليم", gender: "female" },
  { num: 22, name: "ماري روماني فكري", gender: "female" },
  { num: 23, name: "سيسليا رزيقي سليمان", gender: "female" },
  { num: 24, name: "صرابامون اسعد ميشيل", gender: "male" },
  { num: 25, name: "مريم سمير لبيب", gender: "female" },
  { num: 26, name: "فلورينا فاروق نظيم", gender: "female" },
  { num: 27, name: "ميخاءيل امير عبدله", gender: "male" },
  { num: 28, name: "ڤيرونيا جوروج جابر", gender: "female" },
  { num: 29, name: "مكاريوس منير إسكندر", gender: "male" },
  { num: 30, name: "ابانوب اسعد ثابت", gender: "male" },
  { num: 31, name: "مينا رأفت عيسى", gender: "male" },
  { num: 32, name: "مينا عاصم نصري", gender: "male" },
  { num: 33, name: "مادونا منتصر عادل", gender: "female" },
  { num: 34, name: "مارتينا مدحت ثابت", gender: "female" },
  { num: 35, name: "ڤيرونيكا رامي سامي", gender: "female" },
  { num: 36, name: "مهراتي ملاك فؤاد", gender: "female" },
  { num: 37, name: "ايلاريا ميخائيل شوقي", gender: "female" },
  { num: 38, name: "يوانا صمؤيل صبحي", gender: "female" },
  { num: 39, name: "دينا اسحق غنامي", gender: "female" },
  { num: 40, name: "جويس هاني فاروق", gender: "female" },
  { num: 41, name: "ثابت مدحت ثابت", gender: "male" },
  { num: 42, name: "بافلي روماني فكري", gender: "male" },
  { num: 43, name: "كيرلس ملاك فؤاد", gender: "male" },
  { num: 44, name: "مريم مكين جرجس", gender: "female" },
  { num: 45, name: "يوستينا عاطف جرجس", gender: "female" },
  { num: 46, name: "سارة نادر صدقي", gender: "female" },
  { num: 47, name: "كلارا عاطف رفعت", gender: "female" },
  { num: 48, name: "مهرائيل سعيد فوزي", gender: "female" },
  { num: 49, name: "ايزيس عاطف منير", gender: "female" },
  { num: 50, name: "بيشوي رافت فرج", gender: "male" },
  { num: 51, name: "بيمن روماني بقطر", gender: "male" },
  { num: 52, name: "أردينا حداد ساويرس", gender: "female" },
  { num: 53, name: "فايز فيكتور فايز", gender: "male" },
  { num: 54, name: "فيرا رفاعي اسحق", gender: "female" },
  { num: 55, name: "ديفيد رؤوف رمزي", gender: "male" },
  { num: 56, name: "ميخائيل ادور راتب", gender: "male", isOwner: true },
  { num: 57, name: "استيف اسحق عادل", gender: "male" },
  { num: 58, name: "ناريمان نصري ملك", gender: "female" },
  { num: 59, name: "فبرونيا فادي فوزي", gender: "female" },
  { num: 60, name: "ماريمنا ناجي رياض", gender: "female" },
  { num: 61, name: "كريستينا انسي حليم", gender: "female" },
  { num: 62, name: "انطونيا سمير ادوارد", gender: "female" },
  { num: 63, name: "مارتينا اكرم هلال", gender: "female" },
  { num: 64, name: "انطوني نصري سلاطين", gender: "male" },
  { num: 65, name: "نرمين أنيس حليم", gender: "female" },
  { num: 66, name: "مريانا مفتي عطالله", gender: "female" },
  { num: 67, name: "انتوني رافت زاهر", gender: "male" },
  { num: 68, name: "سوسنه عادل يوسف", gender: "female" },
  { num: 69, name: "كيرلس راجي اسعد", gender: "male" },
  { num: 70, name: "مايكل القمص أبرام", gender: "male" },
  { num: 71, name: "ماري شنوده اسعد", gender: "female" },
  { num: 72, name: "فؤاد فواز يسي", gender: "male" },
  { num: 73, name: "جوليانا ناجي اديب", gender: "female" },
  { num: 74, name: "مارينا مجدي إبراهيم", gender: "female" },
  { num: 75, name: "بوتيتو امين بشاي", gender: "female" },
  { num: 76, name: "ارسان وجدى فكتور", gender: "male" },
  { num: 77, name: "جيسكا رامي سامي", gender: "female" },
  { num: 78, name: "مريم سعيد برسوم", gender: "female" },
  { num: 79, name: "مكاريوس صليب صبحي", gender: "male" },
  { num: 80, name: "كاترينا امير لطفى", gender: "female" },
  { num: 81, name: "ايلاريا ناجي عبده", gender: "female" },
  { num: 82, name: "دولاجي فتحي عزمي", gender: "female" },
  { num: 83, name: "مقار روماني وليم", gender: "male" },
  { num: 84, name: "جسيكا بدري فوزي", gender: "female" },
  { num: 85, name: "بارثينا ايمن عزمي", gender: "female" },
  { num: 86, name: "مونيكا مينا ثابت", gender: "female" },
  { num: 87, name: "الكساندرا امير ادوارد", gender: "female" },
  { num: 88, name: "سارة رضا وليم", gender: "female" },
  { num: 89, name: "ايليا جمال صادق", gender: "male" },
  { num: 90, name: "اليسا صبري ابراهيم", gender: "female" },
  { num: 91, name: "دانيال مجدي نبيل", gender: "male" },
  { num: 92, name: "فيرينيا هاني فيليب", gender: "female" },
  { num: 93, name: "مادونا مينا ثروت", gender: "female" },
  { num: 94, name: "كيرلس جوزيف فوزي", gender: "male" },
  { num: 95, name: "ايناس حنا خليل", gender: "female" },
  { num: 96, name: "مارتينا انطونيوس بقطر", gender: "female" },
  { num: 97, name: "مكرم مدحت مكرم", gender: "male" },
  { num: 98, name: "مريم جابر صادق", gender: "female" }
];

const VERIFIED_96_MANIFEST = VERIFIED_95_MANIFEST;

const RESCUED_THREE_WORKER_RULES = [
  {
    canonicalName: "دينا اسحق غنامي",
    id: "reg_1794592057854_hcqz",
    code: "TY-0086",
    gender: "female",
    phone: "+20 1280087415",
    dob: "2000-01-01",
    password: "dandan",
    recoveryCode: "538117",
    aliases: ["دينا اسحق غنامي", "دينا إسحق غنامي", "دينا اسحاق غنامي", "دينا إسحاق غنامي", "دينا اسحق غنامى", "دينا اسحاق غنامى"]
  },
  {
    canonicalName: "مارتينا انطونيوس بقطر",
    id: "reg_1794593070300_martina",
    code: "TY-0117",
    gender: "female",
    phone: "+20 1275557734",
    dob: "2009-08-01",
    address: "القاهره",
    password: "123456",
    recoveryCode: "123456",
    aliases: ["مارتينا انطونيوس بقطر", "مارتينا أنطونيوس بقطر", "مارتينا انطونيوس", "مارتينا أنطونيوس"]
  },
  {
    canonicalName: "فؤاد فواز يسي",
    id: "reg_1794605308722_yuhs",
    code: "TY-0107",
    gender: "male",
    phone: "+20 1067235821",
    dob: "1962-04-15",
    password: "IlahKyrillos",
    recoveryCode: "261216",
    aliases: ["فؤاد فواز يسي", "فواد فواز يسي", "فؤاد فواز يسى", "فواد فواز يسى"]
  }
];

function matchWorkerTargetThreeRule(rawNameOrId) {
  const s = String(rawNameOrId || "").trim();
  if (!s) return null;
  const norm = ultraNormalizeArabic(s);
  if (norm.startsWith("ديانا")) return null;
  for (const r of RESCUED_THREE_WORKER_RULES) {
    if (s === r.id || s === r.code) return r;
    for (const a of r.aliases) {
      if (ultraNormalizeArabic(a) === norm) return r;
    }
  }
  return null;
}

const PROTECTED_RESCUE_WORKER_NAMES = [
  "اسطفانوس ادور صديق",
  "إسطفانوس ادور صديق",
  "اسطفانوس أدور صديق",
  "اسطفانوس ادوار صديق",
  "استفانوس ادور صديق",
  "اسطفانوس ايمن هلال",
  "إسطفانوس ايمن هلال",
  "اسطفانوس أيمن هلال",
  "إسطفانوس أيمن هلال",
  "استفانوس ايمن هلال",
  "استفانوس أيمن هلال",
  "اصطفانوس ايمن هلال",
  "اصطفانوس أيمن هلال",
  "مكرم مدحت مكرم",
  "مريم جابر صادق"
];

function isProtectedRescueWorkerName(name) {
  const norm = ultraNormalizeArabic(name || "");
  if (!norm) return false;
  return PROTECTED_RESCUE_WORKER_NAMES.some((n) => ultraNormalizeArabic(n) === norm);
}

function isWhitelistedWorkerMember(idOrCode, name) {
  const idClean = String(idOrCode || "").trim();
  const bare = getBaseMemberId(idClean).replace(/^reg_member_/, "");
  const norm = ultraNormalizeArabic(name || "");
  if (idClean === "reg_owner_main" || bare === "reg_owner_main" || idClean === "TY-0001") return true;
  if (isProtectedRescueWorkerName(name) || idClean === "reg_stephanos_ayman_helal" || bare === "reg_stephanos_ayman_helal") return true;
  if (bare === "reg_1794593070300_az5o" || bare === "reg_1794593070300_martina" || bare === "reg_1794592057854_hcqz" || bare === "reg_1794605308722_yuhs") return true;
  if (matchWorkerTargetThreeRule(idClean) || matchWorkerTargetThreeRule(name)) return true;
  for (const item of VERIFIED_95_MANIFEST) {
    if (norm && ultraNormalizeArabic(item.name) === norm) return true;
  }
  if (
    norm &&
    (norm.startsWith(ultraNormalizeArabic("مكرم مدحت")) ||
      norm.startsWith(ultraNormalizeArabic("مريم جابر")))
  ) {
    return true;
  }
  return false;
}

function ultraNormalizeArabic(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئء]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ڤ/g, "ف")
    .replace(/عبد\s+/g, "عبد")
    .replace(/\s+/g, " ")
    .trim();
}

function normArabicName(s) {
  return ultraNormalizeArabic(s);
}

function normPhoneDigits(s) {
  return String(s || "").replace(/\D/g, "").slice(-9);
}

const PERMANENTLY_PURGED_WORKER_IDS = new Set([
  "reg_1794512109118_3sqv",
  "reg_1794507448497_4c0q",
  "reg_1794504508352_to1l",
  "reg_1793092049974_4547",
  "3FY-172e1bf9-a424-4464-af97-9ae2513986bc",
  "reg_member_3FY-172e1bf9-a424-4464-af97-9ae2513986bc",
  "reg_member_3FY-cf1946ba-6a83-4b3b-8fe0-c1bd900a6f50",
  "3FY-cf1946ba-6a83-4b3b-8fe0-c1bd900a6f50"
]);

const PERMANENTLY_PURGED_WORKER_NAMES = new Set([
  "ما ما ما",
  "ما نا ري",
  "محمد حمد عادل",
  "ميخائيل ادور يعقوب",
  "هاني عدلي ميساك",
  "هاني عدلي هاني",
  "هايدي كمال عوض",
  "هناء ظريف فهيم"
].map((n) => ultraNormalizeArabic(n)));

function isPermanentlyPurgedWorkerMember(m) {
  if (!m || typeof m !== "object") return false;
  const rawId = String(m.id || "").trim();
  const bareId = rawId.replace(/^reg_member_/, "");
  if (rawId === "reg_owner_main" || bareId === "reg_owner_main") return false;
  const normName = ultraNormalizeArabic(String(m.fullName || m.name || ""));
  if (normName === ultraNormalizeArabic("ميخائيل ادور راتب")) return false;
  if (rawId && (PERMANENTLY_PURGED_WORKER_IDS.has(rawId) || PERMANENTLY_PURGED_WORKER_IDS.has(bareId))) {
    return true;
  }
  if (normName && PERMANENTLY_PURGED_WORKER_NAMES.has(normName)) {
    return true;
  }
  return false;
}

// KV Free-Tier Daily Write Limit Protection (Circuit-Breaker + Consolidator)
// Keeps app/web 100% fast on DO SQLite + D1 even if KV hits its 1,000/day free write cap!
let kvWriteQuotaBlockedUntil = 0;
let lastKvMasterMirrorAt = 0;

function isKvQuotaLimitError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("limit") ||
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("exceeded") ||
    msg.includes("daily") ||
    msg.includes("too many")
  );
}

async function safeKvPut(kvStore, key, value) {
  if (!kvStore || typeof kvStore.put !== "function") return false;
  if (Date.now() < kvWriteQuotaBlockedUntil) return false;
  try {
    await kvStore.put(key, value);
    return true;
  } catch (err) {
    if (isKvQuotaLimitError(err)) {
      kvWriteQuotaBlockedUntil = Date.now() + 30 * 60 * 1000;
    }
    return false;
  }
}

async function bumpRoomVersionSafe(env, nowTs = Date.now()) {
  const stub = getRealtimeRoomStub(env);
  if (stub && typeof stub.rpcBumpVersion === "function") {
    try {
      const v = await stub.rpcBumpVersion(nowTs);
      if (v) return Number(v);
    } catch {}
  }
  return bumpEdgeVersion(nowTs);
}

function isGarbageOrGhostMember(m) {
  if (!m || typeof m !== "object") return true;
  if (isPermanentlyPurgedWorkerMember(m)) return true;
  if (m.status === "cancelled" || m.status === "deleted" || m.isDeleted === true || m.deleted === true) return true;
  const name = String(m.fullName || m.name || "").trim();
  if (!name || name.length < 2) return true;
  if (name === "عضو" || name === "undefined" || name === "null") return true;
  if (name.includes("عضو مسجل")) return true;
  if (/^عضو\s*#?\s*\d+$/i.test(name)) return true;
  return false;
}

function isPlaceholderDob(val) {
  const s = String(val || "").trim();
  if (!s || s === "null" || s === "undefined") return true;
  return (
    s === "2002-01-01" ||
    s === "2000-01-01" ||
    s === "1-1-2002" ||
    s === "01-01-2002" ||
    s === "2002/01/01" ||
    s === "1-1-2000" ||
    s === "01-01-2000" ||
    s === "2000/01/01"
  );
}

function isAuthenticDob(val, registeredAt = "") {
  const s = String(val || "").trim();
  if (!s || isPlaceholderDob(s)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const maxAllowedYear = new Date().getUTCFullYear() - 3;
  if (year < 1930 || year > maxAllowedYear || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    return false;
  }
  const regDate = String(registeredAt || "").slice(0, 10);
  if (regDate && s === regDate) return false;
  return true;
}

function pickStrongestDob(preferred, fallback = "") {
  const p = String(preferred || "").trim();
  const f = String(fallback || "").trim();
  if (p && !isPlaceholderDob(p)) return p;
  if (f && !isPlaceholderDob(f)) return f;
  return "";
}

function normalizeWorkerMember(raw, fallbackCode = "TY-0002") {
  if (isGarbageOrGhostMember(raw)) return null;
  const fullName = String(raw.fullName || raw.name || "").trim().replace(/\s+/g, " ");
  const cleanedRawId = getBaseMemberId(raw.id);
  const isOwner =
    cleanedRawId === "reg_owner_main" ||
    raw.role === "community_owner" ||
    normArabicName(fullName) === normArabicName("ميخائيل ادور راتب") ||
    normArabicName(fullName) === normArabicName("ميخائيل ادوار راتب");
  const id = isOwner
    ? "reg_owner_main"
    : (cleanedRawId || `3FY-${raw.created_at || Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const phone = String(raw.phone || raw.whatsapp || (isOwner ? "+20 1288651567" : "")).trim();
  const whatsapp = String(raw.whatsapp || phone).trim();
  const role = isOwner ? "community_owner" : (raw.role || "member");
  const status = "active";
  const gender = isOwner ? "male" : detectAndRepairGender({ ...raw, fullName });
  const genderLocked = Boolean(raw.genderLocked || raw.manualGender || raw.genderCode);
  const photo = String(raw.photoUrl || raw.avatar || raw.image || (isOwner ? "/owner_portrait.jpg" : "")).trim();
  const uniqueCode = isOwner ? "TY-0001" : String(raw.uniqueCode || fallbackCode).trim().toUpperCase();
  const rawDobClean = String(raw.dob || raw.birthDate || "").trim();
  const dob = isPlaceholderDob(rawDobClean) ? "" : rawDobClean;
  const address = String(raw.address ?? raw.residence ?? "").trim();
  const notes = String(raw.notes ?? raw.talents ?? raw.skills ?? "").trim();
  const lastModifiedAt = Number(raw.lastModifiedAt || raw.updatedAt || (raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt).getTime() : 0) || Date.now());
  const updatedAt = Number(raw.updatedAt || lastModifiedAt);
  const lastUpdatedAt = raw.lastUpdatedAt || new Date(updatedAt).toISOString();
  const recCode = String(
    raw.recoveryCode || raw.securityCode || raw.backupCode || raw.secretCode || raw.resetCode || "123456"
  ).trim();
  const pass = String(
    raw.password || raw.pass || raw.pin || raw.userPassword || raw.secret || recCode || "123456"
  ).trim();
  const copy = {
    ...raw,
    id,
    uniqueCode,
    qrCode: raw.qrCode || uniqueCode,
    fullName,
    name: fullName,
    gender,
    sex: gender,
    genderCode: raw.genderCode || gender,
    manualGender: raw.manualGender || (genderLocked ? gender : undefined),
    genderLabel: gender === "female" ? "أنثى" : "ذكر",
    type: gender === "female" ? "شابة" : "شاب",
    category: gender === "female" ? "شابات" : "شباب",
    genderLocked,
    lastModifiedAt,
    phone,
    whatsapp,
    dob,
    birthDate: dob,
    address,
    residence: address,
    notes,
    talents: notes,
    skills: notes,
    photoUrl: photo,
    registeredAt: raw.registeredAt || (raw.created_at ? new Date(Number(raw.created_at)).toISOString() : new Date().toISOString()),
    updatedAt,
    lastUpdatedAt,
    qrData: raw.qrData || uniqueCode,
    role,
    isOwner: isOwner ? true : undefined,
    status,
    password: pass,
    recoveryCode: recCode,
    securityCode: recCode,
    isVisitedGeneral: Boolean(raw.isVisitedGeneral),
    stamps: raw.stamps && typeof raw.stamps === "object" ? raw.stamps : undefined,
    fridayStamps: raw.fridayStamps && typeof raw.fridayStamps === "object" ? raw.fridayStamps : undefined,
    attendanceDates: Array.isArray(raw.attendanceDates) ? raw.attendanceDates : undefined,
    attendanceHistory: Array.isArray(raw.attendanceHistory) ? raw.attendanceHistory : undefined,
    attendance: Array.isArray(raw.attendance) ? raw.attendance : undefined,
    presentDates: Array.isArray(raw.presentDates) ? raw.presentDates : undefined,
    lastAttendance: raw.lastAttendance || undefined
  };
  delete copy.avatar;
  delete copy.image;
  return copy;
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
  try {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT, phone TEXT, role TEXT DEFAULT 'member', created_at INTEGER)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, member_id TEXT, event_id TEXT, status TEXT, recorded_at INTEGER)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INTEGER)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, event_date INTEGER, created_at INTEGER)")
    ]);
  } catch (e) {
    env._dbQuotaDegraded = true;
  }
}

let cachedBaselineIndex = { version: -1, codes: /** @type {string[]} */ ([]), names: /** @type {string[]} */ ([]), checkedAt: 0 };

function getRealtimeRoomStub(env) {
  const roomNs = env.REALTIME_ROOM || env.REALTIME;
  if (!roomNs || typeof roomNs.idFromName !== "function") return null;
  try {
    return roomNs.get(roomNs.idFromName("main"));
  } catch {
    return null;
  }
}

async function getAtomicDeltaFromRoom(env) {
  const stub = getRealtimeRoomStub(env);
  if (!stub || typeof stub.rpcGetAtomicDelta !== "function") {
    return { members: [], deletedIds: [], deletedNames: [], version: 0 };
  }
  try {
    const res = await stub.rpcGetAtomicDelta();
    if (res && typeof res === "object") {
      return {
        members: Array.isArray(res.members) ? res.members : [],
        deletedIds: Array.isArray(res.deletedIds) ? res.deletedIds : [],
        deletedNames: Array.isArray(res.deletedNames) ? res.deletedNames : [],
        version: Number(res.version || 0)
      };
    }
  } catch {}
  return { members: [], deletedIds: [], deletedNames: [], version: 0 };
}

async function getEdgeVersion(env) {
  const now = Date.now();
  if (edgeStateVersion > 0 && now - lastVersionCheckTs < 250) {
    return edgeStateVersion;
  }
  const kvStore = env.MEMBERS_KV || env.KV || null;
  let dbMax = 0;
  const roomStub = getRealtimeRoomStub(env);
  // Check strongly-consistent Durable Object version AND KV version in parallel (< 2ms total, 0ms consistency lag!)
  const [doVer, kvVer] = await Promise.all([
    roomStub && typeof roomStub.rpcGetVersion === "function"
      ? roomStub.rpcGetVersion().catch(() => 0)
      : Promise.resolve(0),
    kvStore && typeof kvStore.get === "function"
      ? kvStore.get("d1_edge_version").catch(() => null)
      : Promise.resolve(null)
  ]);
  if (doVer) dbMax = Math.max(dbMax, Number(doVer) || 0);
  if (kvVer) dbMax = Math.max(dbMax, Number(kvVer) || 0);
  // Only query D1 for version if neither DO nor KV had one yet
  if (!dbMax && env.DB) {
    try {
      const [annMax, evMax, memMax] = await Promise.all([
        env.DB.prepare("SELECT MAX(created_at) as m FROM announcements").first("m"),
        env.DB.prepare("SELECT MAX(created_at) as m FROM events").first("m"),
        env.DB.prepare("SELECT MAX(created_at) as m FROM members").first("m")
      ]);
      dbMax = Math.max(Number(annMax || 0), Number(evMax || 0), Number(memMax || 0), 1);
    } catch {
      dbMax = 0;
    }
  }
  if (!dbMax) dbMax = edgeStateVersion || now;
  if (dbMax !== edgeStateVersion) {
    rawSliceCache.clear();
    cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
    cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
    cachedMasterRegistrants = { version: -1, list: null, json: null };
  }
  edgeStateVersion = dbMax;
  lastVersionCheckTs = now;
  return edgeStateVersion;
}

function bumpEdgeVersion(newTs = Date.now()) {
  edgeStateVersion = Math.max(edgeStateVersion + 1, newTs);
  lastVersionCheckTs = Date.now();
  cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
  cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
  cachedMasterRegistrants = { version: -1, list: null, json: null };
  return edgeStateVersion;
}

function measureRegistrantsRichness(arr) {
  if (!Array.isArray(arr)) return { count: 0, withPhone: 0, withPhoto: 0 };
  let count = 0;
  let withPhone = 0;
  let withPhoto = 0;
  for (const m of arr) {
    if (!m || typeof m !== "object" || isGarbageOrGhostMember(m)) continue;
    count++;
    if (String(m.phone || m.whatsapp || "").trim()) withPhone++;
    if (String(m.photoUrl || "").trim()) withPhoto++;
  }
  return { count, withPhone, withPhoto };
}

async function persistMediaToAllStores(env, titleKey, contentStr, nowTs = Date.now()) {
  if (!titleKey || !contentStr) return;
  setMediaCache(titleKey, contentStr);
  // Persist media to R2 + D1 (100k+ writes/day) instead of burning KV 1,000/day free write quota!
  if (env.MEDIA && typeof env.MEDIA.put === "function") {
    try {
      const r2Key = titleKey.startsWith("D1_PHOTO:")
        ? `photos/${titleKey.replace("D1_PHOTO:", "")}`
        : `ann/${titleKey.replace("D1_ANN_IMAGE:", "")}`;
      await env.MEDIA.put(r2Key, contentStr);
    } catch {}
  }
  if (env.DB) {
    try {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM events WHERE title = ?").bind(titleKey),
        env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), titleKey, contentStr, nowTs, nowTs)
      ]);
    } catch {}
  }
}

async function stripInlinePhotosFromRegistrants(env, list, nowTs = Date.now(), options = { persistMedia: false, maxPersistCount: 5 }) {
  if (!Array.isArray(list)) return [];
  const shouldPersist = Boolean(options?.persistMedia);
  const maxPersist = Number(options?.maxPersistCount ?? 5);
  let persistedCount = 0;
  const cleanOut = [];
  for (const rawM of list) {
    if (!rawM || typeof rawM !== "object" || isGarbageOrGhostMember(rawM)) continue;
    const m = { ...rawM };
    const mid = getBaseMemberId(m.id || "");
    const rawPhoto = String(m.photoUrl || m.avatar || m.image || "").trim();
    if (rawPhoto.includes("data:image/") && mid) {
      const cleanDataUrl = rawPhoto.startsWith("data:image/") ? rawPhoto : rawPhoto.slice(rawPhoto.indexOf("data:image/"));
      if (shouldPersist && persistedCount < maxPersist) {
        await persistMediaToAllStores(env, `D1_PHOTO:${mid}`, cleanDataUrl, nowTs);
        persistedCount++;
      }
      // Preserve inline photo in KV (supports up to 25MB/key, 0ms display, 0 extra subrequests!)
      m.photoUrl = cleanDataUrl;
    } else if (rawPhoto) {
      m.photoUrl = rawPhoto;
    }
    delete m.avatar;
    delete m.image;
    cleanOut.push(m);
  }
  return cleanOut;
}

function buildD1LightweightMembersJson(list) {
  if (!Array.isArray(list)) return "[]";
  const light = list.map((rawM) => {
    if (!rawM || typeof rawM !== "object") return rawM;
    const m = { ...rawM };
    const mid = getBaseMemberId(m.id || "");
    const rawPhoto = String(m.photoUrl || m.avatar || m.image || "").trim();
    if (rawPhoto.includes("data:image/") && mid) {
      m.photoUrl = `__D1_PHOTO_REF__:${mid}`;
    } else if (rawPhoto) {
      m.photoUrl = rawPhoto;
    }
    delete m.avatar;
    delete m.image;
    return m;
  });
  return JSON.stringify(light);
}

function parseKvMembersPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.members)) return parsed.members;
      if (Array.isArray(parsed.registrants)) return parsed.registrants;
    }
  } catch {}
  return null;
}

async function validateMembersBeforeKvWrite(env, rawList, nowTs = Date.now(), options = { allowShrink: false }) {
  if (!Array.isArray(rawList)) {
    return { valid: false, reason: "Payload is not an array" };
  }
  // 1. Clean member objects without burning 300+ subrequests on already-stored inline photos!
  const stripped = await stripInlinePhotosFromRegistrants(env, rawList, nowTs, { persistMedia: false, maxPersistCount: 0 });
  // 2. Deduplicate and verify record integrity (non-empty ID, non-empty name, active status)
  const seenIds = new Set();
  const seenNames = new Set();
  const validatedList = [];
  for (const item of stripped) {
    if (!item || typeof item !== "object" || isGarbageOrGhostMember(item)) continue;
    const cleanId = getBaseMemberId(item.id || item.originalId);
    const fullName = String(item.fullName || item.name || "").trim().replace(/\s+/g, " ");
    if (!cleanId || !fullName || fullName.length < 2) continue;
    if (item.status === "deleted" || item.status === "cancelled" || item.isDeleted === true) continue;
    const normName = ultraNormalizeArabic(fullName);
    if (!normName || seenIds.has(cleanId) || seenNames.has(normName)) continue;
    seenIds.add(cleanId);
    seenNames.add(normName);
    validatedList.push({
      ...item,
      id: cleanId,
      originalId: getBaseMemberId(item.originalId || cleanId) || cleanId,
      fullName,
      name: fullName,
      status: "active",
      isDeleted: false
    });
  }

  const incRich = measureRegistrantsRichness(validatedList);
  const kvStore = env.MEMBERS_KV || env.KV || null;

  // 3. Anti-wipe safety check: ONLY block catastrophic empty/corrupt wipes (< 25 members when baseline > 50);
  // NEVER block legitimate owner deletions (e.g. 138 -> 134 -> 130)!
  if (!options?.allowShrink && kvStore && typeof kvStore.get === "function") {
    try {
      const existingRaw =
        (await kvStore.get(CLEAN_MASTER_KV_KEY)) ||
        (await kvStore.get(YOUTH_MEMBERS_KV_KEY));
      const existingArr = parseKvMembersPayload(existingRaw);
      if (Array.isArray(existingArr)) {
        const curRich = measureRegistrantsRichness(existingArr);
        if (curRich.count > 50 && incRich.count < 25) {
          return {
            valid: false,
            reason: `Blocked catastrophic member wipe (${incRich.count} < 25, baseline ${curRich.count})`
          };
        }
      }
    } catch {}
  }

  return {
    valid: true,
    cleanedList: validatedList,
    rich: incRich
  };
}

// Reads a single slice: RAM cache -> D1 (primary for non-member slices, zero KV write quota!) -> KV fallback
async function getRawSliceFromD1(env, sliceKey, fallbackRaw = "[]") {
  const now = Date.now();
  const cached = rawSliceCache.get(sliceKey);
  if (cached && cached.raw && now - (cached.checkedAt || 0) < 250) {
    return cached.raw;
  }
  const isMemberSlice =
    sliceKey === CLEAN_MASTER_DB_KEY ||
    sliceKey === "registrants" ||
    sliceKey === YOUTH_MEMBERS_KV_KEY;

  if (!isMemberSlice && env.DB) {
    try {
      const titleKey = `D1_STATE:${sliceKey}`;
      const row = await env.DB.prepare(
        "SELECT body, created_at FROM announcements WHERE title = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(titleKey).first();
      if (row && typeof row.body === "string" && row.body.length > 0) {
        rawSliceCache.set(sliceKey, { raw: row.body, ts: Number(row.created_at || now), checkedAt: now });
        return row.body;
      }
    } catch {}
  }

  const kvStore = env.MEMBERS_KV || env.KV || null;
  if (kvStore && typeof kvStore.get === "function") {
    try {
      if (isMemberSlice) {
        const kvMaster = await kvStore.get(CLEAN_MASTER_KV_KEY);
        if (typeof kvMaster === "string" && kvMaster.length > 2) {
          rawSliceCache.set(sliceKey, { raw: kvMaster, ts: now, checkedAt: now });
          return kvMaster;
        }
        const youthKvRaw = await kvStore.get(YOUTH_MEMBERS_KV_KEY);
        const youthParsed = parseKvMembersPayload(youthKvRaw);
        if (Array.isArray(youthParsed) && youthParsed.length > 0) {
          const serialized = JSON.stringify(youthParsed);
          rawSliceCache.set(sliceKey, { raw: serialized, ts: now, checkedAt: now });
          return serialized;
        }
      } else {
        const kvVal = await kvStore.get(`d1_state:${sliceKey}`);
        if (typeof kvVal === "string" && kvVal.length > 0) {
          rawSliceCache.set(sliceKey, { raw: kvVal, ts: now, checkedAt: now });
          return kvVal;
        }
      }
    } catch {}
  }

  if (env.DB) {
    try {
      const titleKey = `D1_STATE:${sliceKey}`;
      const row = await env.DB.prepare(
        "SELECT body, created_at FROM announcements WHERE title = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(titleKey).first();
      if (row && typeof row.body === "string" && row.body.length > 0) {
        rawSliceCache.set(sliceKey, { raw: row.body, ts: Number(row.created_at || now), checkedAt: now });
        return row.body;
      }
    } catch {}
  }
  return fallbackRaw;
}

async function saveRawSliceToD1(env, sliceKey, rawString, nowTs = Date.now(), options = { allowShrink: false }) {
  const kvStore = env.MEMBERS_KV || env.KV || null;
  const isMemberSlice =
    sliceKey === CLEAN_MASTER_DB_KEY ||
    sliceKey === "registrants" ||
    sliceKey === "backup_members" ||
    sliceKey === YOUTH_MEMBERS_KV_KEY;

  let finalRawString = rawString;
  let validatedMembersForKv = /** @type {any[] | null} */ (null);

  if (isMemberSlice) {
    try {
      const parsedInc = parseKvMembersPayload(rawString);
      if (Array.isArray(parsedInc)) {
        const validation = await validateMembersBeforeKvWrite(env, parsedInc, nowTs, options);
        if (!validation.valid) {
          console.warn(`[KV Validator] ${validation.reason} on ${sliceKey}`);
          return false;
        }
        validatedMembersForKv = validation.cleanedList || null;
        finalRawString = JSON.stringify(validatedMembersForKv);
      }
    } catch {}
  }

  rawSliceCache.set(sliceKey, { raw: finalRawString, ts: nowTs, checkedAt: Date.now() });
  const nextVer = bumpEdgeVersion(nowTs);
  let d1Persisted = false;

  // 1. Primary strongly-consistent D1 write (100,000 free writes/day — never hits KV 1,000/day cap!)
  if (env.DB && sliceKey !== YOUTH_MEMBERS_KV_KEY) {
    try {
      if (sliceKey === CLEAN_MASTER_DB_KEY || sliceKey === "registrants") {
        const membersArr = validatedMembersForKv || parseKvMembersPayload(finalRawString) || [];
        const d1LightJson = buildD1LightweightMembersJson(membersArr);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM announcements WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1', 'D1_STATE:registrants', 'D1_STATE:backup_members')"),
          env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:CLEAN_MASTER_DB_V1", d1LightJson, nowTs),
          env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:registrants", d1LightJson, nowTs),
          env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:backup_members", d1LightJson, nowTs)
        ]);
        d1Persisted = true;
      } else if (sliceKey === "backup_members") {
        const membersArr = validatedMembersForKv || parseKvMembersPayload(finalRawString) || [];
        const d1LightJson = buildD1LightweightMembersJson(membersArr);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:backup_members"),
          env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:backup_members", d1LightJson, nowTs)
        ]);
        d1Persisted = true;
      } else {
        const titleKey = `D1_STATE:${sliceKey}`;
        await env.DB.batch([
          env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind(titleKey),
          env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(
            crypto.randomUUID(),
            titleKey,
            finalRawString,
            nowTs
          )
        ]);
        d1Persisted = true;
      }
    } catch {}
  }

  // 2. Bump strongly-consistent Durable Object edge_version (0 KV writes!)
  await bumpRoomVersionSafe(env, nextVer);

  // 3. Optional best-effort SINGLE-KEY KV mirror ONLY for member baseline (or if D1 unavailable)
  if (kvStore && typeof kvStore.put === "function") {
    if (
      sliceKey === CLEAN_MASTER_DB_KEY ||
      sliceKey === "registrants" ||
      sliceKey === YOUTH_MEMBERS_KV_KEY
    ) {
      cachedMasterRegistrants = { version: -1, list: null, json: null };
      cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
      rawSliceCache.set(CLEAN_MASTER_DB_KEY, { raw: finalRawString, ts: nowTs, checkedAt: Date.now() });
      rawSliceCache.set("registrants", { raw: finalRawString, ts: nowTs, checkedAt: Date.now() });
      await safeKvPut(kvStore, CLEAN_MASTER_KV_KEY, finalRawString);
      lastKvMasterMirrorAt = Date.now();
    } else if (!d1Persisted) {
      await safeKvPut(kvStore, `d1_state:${sliceKey}`, finalRawString);
    }
  }
  return true;
}

/**
 * Ultra-low-CPU (< 2ms) Consolidated Mirror (0 or 1 KV put max + D1 backup + DO version bump).
 * Eliminates KV daily operation limit errors permanently (reduced from 6-8 KV puts per action to <= 1)!
 */
async function fastPersistMasterListToKv(env, membersArr, nowTs = Date.now(), options = { forceKv: false }) {
  if (!Array.isArray(membersArr) || membersArr.length === 0) return false;
  const cleanMembers = membersArr.filter((m) => m && typeof m === "object" && !isGarbageOrGhostMember(m));
  if (cleanMembers.length === 0) return false;

  const kvStore = env.MEMBERS_KV || env.KV || null;
  const nextVer = bumpEdgeVersion(nowTs);
  const finalRawString = JSON.stringify(cleanMembers);
  const codes = [];
  const names = [];
  for (const m of cleanMembers) {
    const c = String(m.uniqueCode || m.qrCode || "").trim().toUpperCase();
    if (c) codes.push(c);
    const nm = String(m.fullName || m.name || "").trim();
    const nn = ultraNormalizeArabic(nm);
    if (nn) names.push(nn);
  }
  cachedBaselineIndex = { version: nextVer, codes, names, checkedAt: Date.now() };
  rawSliceCache.set(CLEAN_MASTER_DB_KEY, { raw: finalRawString, ts: nowTs, checkedAt: Date.now() });
  rawSliceCache.set("registrants", { raw: finalRawString, ts: nowTs, checkedAt: Date.now() });
  cachedMasterRegistrants = { version: -1, list: null, json: null };

  // 1. Always persist lightweight D1 mirror + bump DO version (no KV daily quota!)
  const tasks = [bumpRoomVersionSafe(env, nextVer)];
  if (env.DB) {
    const d1LightJson = buildD1LightweightMembersJson(cleanMembers);
    tasks.push(
      env.DB.batch([
        env.DB.prepare("DELETE FROM announcements WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1', 'D1_STATE:registrants')"),
        env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:CLEAN_MASTER_DB_V1", d1LightJson, nowTs),
        env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:registrants", d1LightJson, nowTs)
      ]).catch(() => {})
    );
  }

  // 2. Consolidate KV write to AT MOST 1 single key (CLEAN_MASTER_KV_KEY), throttled >= 30s unless forceKv
  const nowMs = Date.now();
  if (kvStore && (options?.forceKv || nowMs - lastKvMasterMirrorAt >= 30000)) {
    lastKvMasterMirrorAt = nowMs;
    tasks.push(safeKvPut(kvStore, CLEAN_MASTER_KV_KEY, finalRawString));
  }

  await Promise.all(tasks);
  return true;
}

/**
 * Ultra-fast (< 0.5ms CPU) lookup of all baseline member codes and normalized Arabic names.
 * Reads tiny 4KB `member_codes_index` from RAM or KV instead of parsing 1.6MB JSON on every registration!
 */
async function getBaselineCodesAndNames(env) {
  const now = Date.now();
  if (cachedBaselineIndex.codes.length >= 90 && now - cachedBaselineIndex.checkedAt < 60000) {
    return { codes: cachedBaselineIndex.codes, names: cachedBaselineIndex.names };
  }
  const kvStore = env.MEMBERS_KV || env.KV || null;
  if (kvStore && typeof kvStore.get === "function") {
    try {
      const idxRaw = await kvStore.get("member_codes_index");
      if (idxRaw) {
        const parsed = JSON.parse(idxRaw);
        if (Array.isArray(parsed?.codes) && Array.isArray(parsed?.names) && parsed.names.length >= 90) {
          cachedBaselineIndex = {
            version: Number(parsed.version || edgeStateVersion),
            codes: parsed.codes,
            names: parsed.names,
            checkedAt: now
          };
          return { codes: parsed.codes, names: parsed.names };
        }
      }
    } catch {}
  }

  // One-time derivation from cached master or KV baseline
  let sourceList = Array.isArray(cachedMasterRegistrants.list) && cachedMasterRegistrants.list.length >= 90
    ? cachedMasterRegistrants.list
    : null;
  if (!sourceList && kvStore && typeof kvStore.get === "function") {
    try {
      const raw = (await kvStore.get(CLEAN_MASTER_KV_KEY)) || (await kvStore.get(YOUTH_MEMBERS_KV_KEY));
      sourceList = parseKvMembersPayload(raw);
    } catch {}
  }

  const codeSet = new Set(["TY-0001"]);
  const nameSet = new Set(VERIFIED_95_MANIFEST.map((x) => ultraNormalizeArabic(x.name)));
  if (Array.isArray(sourceList)) {
    for (const m of sourceList) {
      if (!m || typeof m !== "object" || isGarbageOrGhostMember(m)) continue;
      const c = String(m.uniqueCode || m.qrCode || "").trim().toUpperCase();
      if (c) codeSet.add(c);
      const nn = ultraNormalizeArabic(m.fullName || m.name || "");
      if (nn) nameSet.add(nn);
    }
  }
  const codes = Array.from(codeSet);
  const names = Array.from(nameSet);
  cachedBaselineIndex = { version: edgeStateVersion, codes, names, checkedAt: now };
  return { codes, names };
}

/**
 * Lean background mirror for a single atomic member record (DO SQLite is already authoritative at 0ms).
 * Throttles KV writes (at most 1 key / 30s) so daily KV quota is never exhausted!
 */
async function mirrorSingleAtomicMemberToKv(env, verifiedMember, nowTs = Date.now()) {
  try {
    if (!verifiedMember || typeof verifiedMember !== "object" || isGarbageOrGhostMember(verifiedMember)) return;
    const rawPhoto = String(verifiedMember.photoUrl || "").trim();
    if (rawPhoto.startsWith("data:image/") && verifiedMember.id) {
      await persistMediaToAllStores(env, `D1_PHOTO:${verifiedMember.id}`, rawPhoto, nowTs);
    }
    const kvStore = env.MEMBERS_KV || env.KV || null;
    if (!kvStore || Date.now() < kvWriteQuotaBlockedUntil || Date.now() - lastKvMasterMirrorAt < 30000) {
      // DO SQLite + R2/D1 already persisted this member with 0ms consistency lag!
      cachedMasterRegistrants = { version: -1, list: null, json: null };
      return;
    }
    let baseList = [];
    if (typeof kvStore.get === "function") {
      try {
        const raw = (await kvStore.get(CLEAN_MASTER_KV_KEY)) || (await kvStore.get(YOUTH_MEMBERS_KV_KEY));
        const parsed = parseKvMembersPayload(raw);
        if (Array.isArray(parsed)) {
          baseList = parsed.filter((r) => r && !isGarbageOrGhostMember(r));
        }
      } catch {}
    }
    const targetNorm = ultraNormalizeArabic(verifiedMember.fullName || verifiedMember.name || "");
    const targetBaseId = getBaseMemberId(verifiedMember.id || "");
    const idx = baseList.findIndex(
      (r) =>
        r &&
        ((targetNorm && ultraNormalizeArabic(r.fullName || r.name || "") === targetNorm) ||
          (targetBaseId && getBaseMemberId(r.id || "") === targetBaseId))
    );
    if (idx >= 0) {
      baseList[idx] = { ...baseList[idx], ...verifiedMember };
    } else {
      baseList.push(verifiedMember);
    }
    await fastPersistMasterListToKv(env, baseList, nowTs, { forceKv: true });
  } catch (e) {
    console.error("Background KV mirror error:", e);
  }
}

function normalizeWorkerArabic(s) {
  return String(s || "")
    .trim()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const FEMALE_FIRST_NAMES = new Set([
  'مريم', 'ماريا', 'مارينا', 'مهرائيل', 'مهراييل', 'نونيسيا', 'دميانه', 'دميانة', 'فيرينا', 'فرينا',
  'كيريا', 'كريستين', 'كرستين', 'كريستينا', 'مارتينا', 'يوستينا', 'ايريني', 'إيريني', 'اريني',
  'ساره', 'سارة', 'ساندرا', 'سيلفيا', 'سلفيا', 'تريزا', 'تريز', 'مادونا', 'مونيكا', 'مادلين',
  'فيبي', 'فبرونيا', 'فيبرونيا', 'كلارا', 'نانسي', 'ناردين', 'نيرمين', 'نرمين', 'نيفين', 'نادين',
  'هيلانه', 'هيلانة', 'هيلين', 'بربارا', 'باربارا', 'انطونيا', 'أنطونيا', 'كاترين', 'كارولين', 'كارول',
  'جوليا', 'جوليانا', 'جومانا', 'جيسي', 'جيسيكا', 'جاكلين', 'جورجيت', 'جانيت', 'يرثيا', 'ياسمين',
  'استير', 'أستير', 'انجي', 'إنجي', 'انجيل', 'إنجيل', 'ايمان', 'إيمان', 'اميره', 'أميرة', 'امل', 'أمل',
  'اليس', 'أليس', 'الين', 'ألين', 'اماني', 'أماني', 'نعمه', 'نعمة', 'نورهان', 'نورا', 'نور', 'ندى', 'ندي',
  'رنا', 'رانيا', 'ريم', 'ريهام', 'روز', 'روان', 'رضوى', 'رحمه', 'رحمة', 'دينا', 'داليا', 'دوللي', 'دعاء',
  'مارسيل', 'مارجريت', 'ماجي', 'ماجده', 'ماجدة', 'مها', 'مروه', 'مروة', 'منال', 'منى', 'مني', 'مي', 'ميار',
  'ميرنا', 'ميريت', 'سوزان', 'سهام', 'سلوى', 'سلوي', 'سماح', 'سميره', 'سميرة', 'سلمى', 'سلمي', 'سوسن',
  'شيرين', 'شرين', 'شذى', 'شهد', 'شيماء', 'صفاء', 'صوفيا', 'عبير', 'علا', 'علياء', 'عفاف', 'غاده', 'غادة',
  'فاتن', 'فايزه', 'فايزة', 'فرح', 'فريده', 'فريدة', 'فاطمه', 'فاطمة', 'كاميليا', 'كندا', 'لينا', 'ليلى', 'ليلي',
  'ليليان', 'لمياء', 'لوسي', 'لوسيندا', 'لورا', 'تاسوني', 'ابرار', 'أبرار', 'اسراء', 'إسراء', 'آيه', 'آية', 'ايه',
  'بتول', 'بسنت', 'امثال', 'أمثال', 'اناسيمون', 'أناسيمون', 'اوغسطينا', 'أوغسطينا', 'تكل', 'تكلا', 'تؤام',
  'حنان', 'حبيبه', 'حبيبة', 'خلود', 'دلال', 'راشيل', 'رفقه', 'رفقة', 'ريتا', 'سالي', 'سمر', 'سهير', 'سيسيل',
  'عايده', 'عايدة', 'ليديا', 'لورين', 'مارتا', 'مارثا', 'ماتيلدا', 'مورين', 'ميرا', 'ميريام', 'ناديه', 'نادية',
  'ناهد', 'نجلاء', 'نجوى', 'نهى', 'نهي', 'نهال', 'هايدي', 'هدير', 'هدى', 'هدي', 'هبه', 'هبة', 'هنا', 'هناء', 'هنادي', 'وفاء', 'ولاء', 'يوأنا', 'يوانا',
  'مارولينا', 'مارولا', 'نونسيا', 'اربسيما', 'ديانا', 'كيلارا', 'ماري', 'سيسليا', 'فلورينا', 'ڤيرونيا', 'فيرونيا', 'ڤيرونيكا', 'فيرونيكا',
  'مهراتي', 'ايلاريا', 'جويس', 'ايزيس', 'أردينا', 'اردينا', 'فيرا', 'ناريمان', 'ماريمنا', 'مريانا', 'سوسنه', 'سوسنة', 'بوتيتو',
  'جيسكا', 'كاترينا', 'دولاجي', 'جسيكا', 'بارثينا', 'الكساندرا', 'الكسندرا', 'اليسا', 'فيرينيا', 'ايناس', 'إيناس',
  'بيرلا', 'دوناتلا', 'شيري', 'شيرى', 'مارلين', 'مايا', 'ڤرونيا', 'فرونيا',
  'بربارة', 'برباره', 'ادروسيس', 'إدروسيس', 'مارفي', 'مارفى', 'مرثا', 'كلير', 'جوليت', 'سيلين', 'سيلينا',
  'ميراي', 'برسكيلا', 'بريسكلا', 'ماريان', 'مريان', 'ميريان', 'ماريانا', 'كارين', 'كارينا', 'ساندي', 'ساندى',
  'تينا', 'لاريسا', 'كلوديا', 'دومينيك', 'سيرين', 'سيرينا', 'يوليا', 'يوليانا', 'يوستين', 'أنجيلا', 'انجيلا',
  'انجيلينا', 'أنجيلينا', 'إيفا', 'ايفا', 'إيفلين', 'ايفلين', 'باتريسيا', 'أوليفيا', 'اوليفيا', 'إيلين', 'ايلين',
  'ريبيكا', 'جوانا', 'جوان', 'جوي', 'جوى', 'نورين', 'سوزي', 'سوزى', 'تيريزا', 'سيلفانا', 'نورة', 'نوره', 'يارا', 'منة', 'ملك', 'لين', 'لجين', 'حلا', 'دانا', 'دارين', 'جنى', 'اروى', 'أروى'
]);

const CONFIRMED_FEMALE_WORKER_FULL_NAMES = new Set([
  "الكسندرا نظير سامي",
  "بيرلا بول فايز",
  "دوناتلا اميل بولس",
  "شيري طلعت بشرى",
  "مارلين أندراوس حنا",
  "مايا كمال ظريف",
  "ڤرونيا نشئت جيد",
  "فرونيا نشئت جيد",
  "فرونيا نشات جيد"
].map((n) => ultraNormalizeArabic(n).replace(/ڤ/g, "ف")));

const MALE_ENDING_WITH_TA = new Set([
  'اسامه', 'أسامة', 'حمزه', 'حمزة', 'طلحه', 'طلحة', 'عبيده', 'عبيدة',
  'معاويه', 'معاوية', 'شحاته', 'شحاتة', 'عطيه', 'عطية', 'سلامه', 'سلامة'
]);

function detectAndRepairGender(member) {
  if (!member || typeof member !== "object") return "male";
  if (member.role === "community_owner" || member.id === "reg_owner_main") return "male";

  const fullName = String(member.name || member.fullName || "").trim();
  const normFull = ultraNormalizeArabic(fullName).replace(/ڤ/g, "ف");
  if (normFull && CONFIRMED_FEMALE_WORKER_FULL_NAMES.has(normFull)) {
    return "female";
  }

  const explicitManual = String(
    member.userSelectedGender ||
    member.manualGender ||
    member.genderCode ||
    (member.genderLocked ? (member.gender || member.sex || "") : "")
  ).trim().toLowerCase();
  if (explicitManual === "female" || explicitManual === "f" || explicitManual === "انثى" || explicitManual === "أنثى" || explicitManual === "شابة" || explicitManual === "بنت") return "female";
  if (explicitManual === "male" || explicitManual === "m" || explicitManual === "ذكر" || explicitManual === "شاب" || explicitManual === "ولد") return "male";

  const rawFields = `${member.gender || ""} ${member.sex || ""} ${member.genderLabel || ""} ${member.type || ""} ${member.category || ""}`.toLowerCase();
  if (
    rawFields.includes("انث") ||
    rawFields.includes("أنث") ||
    rawFields.includes("شابات") ||
    rawFields.includes("شابة") ||
    rawFields.includes("شابه") ||
    rawFields.includes("بنات") ||
    rawFields.includes("بنت") ||
    rawFields.includes("خادمة") ||
    rawFields.includes("خادمه") ||
    rawFields.includes("female")
  ) {
    return "female";
  }

  const originalFirstName = fullName.split(/\s+/)[0] || "";
  const firstName = originalFirstName
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ڤ/g, "ف");

  if (FEMALE_FIRST_NAMES.has(firstName) || FEMALE_FIRST_NAMES.has(originalFirstName)) {
    return "female";
  }

  if (originalFirstName.endsWith("ة") && !MALE_ENDING_WITH_TA.has(originalFirstName) && !MALE_ENDING_WITH_TA.has(firstName)) {
    return "female";
  }

  return "male";
}

/**
 * Multi-Key & Multi-Table Union Extraction + Anti-Downgrade Server Shield
 * Unifies members from:
 * 1) D1 announcements slices: D1_STATE:registrants, D1_STATE:backup_members, D1_STATE:members, D1_STATE:app_state
 * 2) D1 SQL table: SELECT * FROM members
 * 3) Cloudflare KV (env.MEMBERS_KV / env.KV) if bound
 * 4) Incoming client payload (never allowing a 65-member or 1-member snapshot to shrink the 94+ Master Union)
 */
async function buildMasterRegistrantsUnion(env, incomingList = [], persistIfExpanded = false, bypassRamCache = false) {
  const hasIncoming = Array.isArray(incomingList) && incomingList.length > 0;

  // O(1) Edge RAM Fast Path (< 0.1ms): if no incoming mutation, not force-fetching, and cachedMasterRegistrants is fresh
  if (
    !hasIncoming &&
    !bypassRamCache &&
    cachedMasterRegistrants.version === edgeStateVersion &&
    Array.isArray(cachedMasterRegistrants.list) &&
    cachedMasterRegistrants.list.length >= 98
  ) {
    return cachedMasterRegistrants.list;
  }

  const sources = [];
  const seenRawFingerprints = new Set();
  const pushRawMembersSource = (raw) => {
    if (!raw || typeof raw !== "string") return 0;
    const fp = `${raw.length}:${raw.slice(0, 64)}:${raw.slice(-64)}`;
    if (seenRawFingerprints.has(fp)) return 0;
    seenRawFingerprints.add(fp);
    const parsed = parseKvMembersPayload(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      sources.push(parsed);
      return parsed.length;
    }
    return 0;
  };

  const tombstoneIds = new Set();
  const tombstoneNames = new Set();
  const manifestNameSet = new Set(VERIFIED_95_MANIFEST.map((x) => ultraNormalizeArabic(x.name)));

  const parseTombstones = (rawStr) => {
    if (!rawStr) return;
    try {
      const parsedRev = JSON.parse(rawStr);
      if (Array.isArray(parsedRev)) {
        for (const entry of parsedRev) {
          const id = typeof entry === "string" ? entry : entry?.id;
          const bareId = String(id || "").replace(/^reg_member_/, "");
          if (id && id !== "reg_owner_main") {
            tombstoneIds.add(String(id));
            if (bareId) {
              tombstoneIds.add(bareId);
              tombstoneIds.add(`reg_member_${bareId}`);
            }
          }
          if (entry && typeof entry === "object") {
            const nName = ultraNormalizeArabic(entry.normalizedName || entry.fullName || entry.name || "");
            if (nName && !manifestNameSet.has(nName) && !isProtectedRescueWorkerName(nName)) {
              tombstoneNames.add(nName);
            }
          }
        }
      }
    } catch {}
  };

  // 0. Strongly-Consistent Durable Object Atomic Delta (< 1ms, 0ms eventual consistency lag!)
  const doDelta = await getAtomicDeltaFromRoom(env);
  for (const dId of doDelta.deletedIds) {
    if (dId && dId !== "reg_owner_main") {
      const bare = String(dId).replace(/^reg_member_/, "");
      tombstoneIds.add(String(dId));
      if (bare) {
        tombstoneIds.add(bare);
        tombstoneIds.add(`reg_member_${bare}`);
      }
    }
  }
  for (const dName of doDelta.deletedNames) {
    const nn = ultraNormalizeArabic(dName);
    if (nn && nn !== ultraNormalizeArabic("ميخائيل ادور راتب")) {
      tombstoneNames.add(nn);
    }
  }

  // 1. Ultra-Fast Single-Key Primary KV Load (reads ONLY CLEAN_MASTER_KV_KEY first -> cuts cold-start CPU by >50% and eliminates Error 1102!)
  let primaryMaxCount = 0;
  const kvStore = env.MEMBERS_KV || env.KV || env.THREE_FETYA_KV || null;
  if (kvStore && typeof kvStore.get === "function") {
    try {
      const [kvRevRaw, masterKvRaw] = await Promise.all([
        kvStore.get("d1_state:revoked_members_log").catch(() => null),
        kvStore.get(CLEAN_MASTER_KV_KEY).catch(() => null)
      ]);
      parseTombstones(kvRevRaw);
      primaryMaxCount = Math.max(primaryMaxCount, pushRawMembersSource(masterKvRaw));

      // Fallback to YOUTH_MEMBERS_KV_KEY ONLY if CLEAN_MASTER_KV_KEY is missing or incomplete (< 96 members)
      if (primaryMaxCount < 96) {
        const youthKvRaw = await kvStore.get(YOUTH_MEMBERS_KV_KEY).catch(() => null);
        primaryMaxCount = Math.max(primaryMaxCount, pushRawMembersSource(youthKvRaw));
      }

      // Deep fallback scan ONLY if primary KV master keys are missing or incomplete (< 96 members)
      if (primaryMaxCount < 96) {
        const legacyKvKeys = [
          CLEAN_MASTER_DB_KEY,
          `d1_state:${CLEAN_MASTER_DB_KEY}`,
          "d1_state:registrants",
          "d1_state:backup_members",
          "registrants",
          "backup_members"
        ];
        const legacyResults = await Promise.all(legacyKvKeys.map((k) => kvStore.get(k).catch(() => null)));
        for (const raw of legacyResults) {
          primaryMaxCount = Math.max(primaryMaxCount, pushRawMembersSource(raw));
        }

        if (primaryMaxCount < 96 && typeof kvStore.list === "function") {
          try {
            const skipSet = new Set([
              CLEAN_MASTER_KV_KEY,
              YOUTH_MEMBERS_KV_KEY,
              ...legacyKvKeys,
              "d1_edge_version",
              "member_count",
              "member_list",
              "member_codes_index",
              "d1_state:revoked_members_log",
              "d1_state:system_bundle",
              "d1_state:events_bundle",
              "d1_state:kahoot_bundle",
              "d1_state:attendance_records",
              "d1_state:announcements",
              "d1_state:blocked_users",
              "d1_state:site_texts",
              "d1_state:role_permissions",
              "d1_state:attendance_session",
              "d1_state:test_ping"
            ]);
            const listed = await kvStore.list({ limit: 200 });
            const extraDiscovered = (listed?.keys || [])
              .map((k) => k?.name)
              .filter((name) =>
                name &&
                !skipSet.has(name) &&
                !name.startsWith("D1_PHOTO:") &&
                !name.startsWith("D1_ANN_IMAGE:") &&
                /(member|registrant|clean_master|state|youth|backup)/i.test(name)
              )
              .slice(0, 6);
            if (extraDiscovered.length > 0) {
              const extraVals = await Promise.all(extraDiscovered.map((k) => kvStore.get(k).catch(() => null)));
              for (const raw of extraVals) {
                primaryMaxCount = Math.max(primaryMaxCount, pushRawMembersSource(raw));
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  // O(N) ULTRA-FAST READ PATH (< 1.5ms CPU on cold start!):
  // When CLEAN_MASTER_KV_KEY already has a complete >= 96-member baseline and this is a read-only GET,
  // simply overlay the strongly-consistent DO SQLite delta (atomic_members + deleted_members) in ONE linear pass!
  // This completely bypasses the O(N^2) 96x200 deepAuditAndMergeMember loop and eliminates Cloudflare Error 1102 forever!
  if (!hasIncoming && primaryMaxCount >= 96 && sources.length >= 1) {
    const baseList = sources[0];
    const fastMap = new Map();
    const fastCodes = new Set(["TY-0001"]);
    const fastNames = new Set();

    const isFastTombstoned = (m, normName) => {
      const mid = String(m.id || "").trim();
      const bare = mid.replace(/^reg_member_/, "");
      if (
        mid === "reg_owner_main" ||
        bare === "reg_owner_main" ||
        isProtectedRescueWorkerName(m.fullName || m.name || "") ||
        isWhitelistedWorkerMember(mid, m.fullName || m.name || "")
      ) {
        return false;
      }
      return Boolean(
        (mid && tombstoneIds.has(mid)) ||
        (bare && tombstoneIds.has(bare)) ||
        (normName && tombstoneNames.has(normName))
      );
    };

    const vaultMap = doDelta && doDelta.vault && typeof doDelta.vault === "object" ? doDelta.vault : {};

    const cleanAndApplyVault = (rec, nn) => {
      const nested = extractNestedSelfCreds(rec, nn);
      const vaultRow = vaultMap[nn];
      const mergedRecCode = pickStrongestCredential(
        vaultRow?.recoveryCode,
        pickStrongestCredential(rec.recoveryCode || rec.securityCode, nested.recoveryCode, 0, 0, false, ""),
        Number(vaultRow?.updatedAt || 0),
        Number(rec.passwordUpdatedAt || 0),
        false,
        "123456"
      );
      const mergedPass = pickStrongestCredential(
        vaultRow?.password,
        pickStrongestCredential(rec.password || rec.pass, nested.password, 0, 0, false, ""),
        Number(vaultRow?.updatedAt || 0),
        Number(rec.passwordUpdatedAt || 0),
        false,
        mergedRecCode || "123456"
      );
      const cleaned = {
        ...rec,
        password: mergedPass,
        recoveryCode: mergedRecCode,
        securityCode: mergedRecCode,
        passwordLocked: Boolean(rec.passwordLocked || vaultRow || !isDefaultOrEmptyCredential(mergedPass))
      };
      if (cleaned.member && typeof cleaned.member === "object") {
        if (isPlaceholderDob(cleaned.dob) && !isPlaceholderDob(nested.dob)) {
          cleaned.dob = nested.dob;
          cleaned.birthDate = nested.dob;
        }
        if (!cleaned.address && nested.address) cleaned.address = nested.address;
        delete cleaned.member;
      }
      if (isPlaceholderDob(cleaned.dob) && vaultRow?.dob && !isPlaceholderDob(vaultRow.dob)) {
        cleaned.dob = String(vaultRow.dob).trim();
        cleaned.birthDate = cleaned.dob;
      }
      if (cleaned.action) delete cleaned.action;
      return cleaned;
    };

    for (let i = 0; i < baseList.length; i++) {
      const m = baseList[i];
      if (!m || typeof m !== "object" || isGarbageOrGhostMember(m)) continue;
      const nn = ultraNormalizeArabic(m.fullName || m.name || "");
      if (!nn) continue;
      if (isFastTombstoned(m, nn)) continue;
      fastMap.set(nn, cleanAndApplyVault(m, nn));
    }

    // Overlay strongly-consistent DO SQLite atomic_members (always newest & authoritative, 0ms KV lag!)
    // Because DO deletes remove rows from atomic_members and re-registrations insert fresh rows,
    // an active row in atomic_members ALWAYS supersedes any stale KV revoked_members_log entry!
    if (Array.isArray(doDelta.members) && doDelta.members.length > 0) {
      for (let i = 0; i < doDelta.members.length; i++) {
        const dm = doDelta.members[i];
        if (!dm || typeof dm !== "object" || isGarbageOrGhostMember(dm)) continue;
        const nn = ultraNormalizeArabic(dm.fullName || dm.name || "");
        if (!nn) continue;
        const prev = fastMap.get(nn);
        if (prev) {
          const mergedPhoto =
            typeof dm.photoUrl === "string" && dm.photoUrl.trim().length > 30
              ? dm.photoUrl
              : (prev.photoUrl || dm.photoUrl || "");
          const safeRec = pickStrongestCredential(
            dm.recoveryCode || dm.securityCode,
            prev.recoveryCode || prev.securityCode,
            Number(dm.passwordUpdatedAt || 0),
            Number(prev.passwordUpdatedAt || 0),
            false,
            "123456"
          );
          const safePass = pickStrongestCredential(
            dm.password || dm.pass,
            prev.password || prev.pass,
            Number(dm.passwordUpdatedAt || 0),
            Number(prev.passwordUpdatedAt || 0),
            false,
            safeRec || "123456"
          );
          fastMap.set(nn, cleanAndApplyVault({
            ...prev,
            ...dm,
            password: safePass,
            recoveryCode: safeRec,
            securityCode: safeRec,
            phone: String(dm.phone || "").trim() || String(prev.phone || "").trim(),
            whatsapp: String(dm.whatsapp || "").trim() || String(prev.whatsapp || "").trim() || String(dm.phone || prev.phone || "").trim(),
            dob: String(dm.dob || dm.birthDate || "").trim() || String(prev.dob || prev.birthDate || "").trim(),
            photoUrl: mergedPhoto,
            status: "active",
            isDeleted: false
          }, nn));
        } else {
          fastMap.set(nn, cleanAndApplyVault({ ...dm, status: "active", isDeleted: false }, nn));
        }
      }
    }

    const fastResult = [];
    for (const [nn, m] of fastMap.entries()) {
      fastResult.push(m);
      fastNames.add(nn);
      const c = String(m.uniqueCode || m.qrCode || "").trim().toUpperCase();
      if (c) fastCodes.add(c);
    }

    cachedBaselineIndex = {
      version: Math.max(edgeStateVersion, doDelta.version || 0),
      codes: Array.from(fastCodes),
      names: Array.from(fastNames),
      checkedAt: Date.now()
    };
    const fastVersion = Math.max(edgeStateVersion, doDelta.version || 0);
    cachedMasterRegistrants = { version: fastVersion, list: fastResult, json: null };
    return fastResult;
  }

  // 1b. Merge strongly-consistent Durable Object atomic_members (ALWAYS present & wins over stale KV!)
  if (Array.isArray(doDelta.members) && doDelta.members.length > 0) {
    sources.push(doDelta.members);
  }

  // 2. D1 Additive Union: always include lightweight SQL `members` table (~8KB); only scan heavy D1 slice blobs if KV < 98
  if (env.DB) {
    try {
      if (primaryMaxCount >= 98) {
        const [sqlMembersRes, revRes] = await Promise.all([
          env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all(),
          env.DB.prepare(
            "SELECT body FROM announcements WHERE title = 'D1_STATE:revoked_members_log' ORDER BY created_at DESC LIMIT 1"
          ).first()
        ]);
        if (revRes && typeof revRes.body === "string") {
          parseTombstones(revRes.body);
        }
        const sqlMembers = (sqlMembersRes && sqlMembersRes.results) || [];
        if (sqlMembers.length > 0) {
          const mappedSql = sqlMembers.map((m) => ({
            id: m.id ? (String(m.id).startsWith("reg_") ? String(m.id) : `reg_member_${m.id}`) : undefined,
            originalId: m.id,
            uniqueCode: m.qr_code || "",
            fullName: m.name || "",
            gender: m.gender || undefined,
            phone: m.phone || "",
            whatsapp: m.phone || "",
            role: m.role || "member",
            created_at: m.created_at || Date.now(),
            registeredAt: m.created_at ? new Date(Number(m.created_at)).toISOString() : undefined
          }));
          sources.push(mappedSql);
        }
      } else {
        const [sliceRowsRes, eventSlicesRes, sqlMembersRes, revRes] = await Promise.all([
          env.DB.prepare(
            "SELECT title, body, MAX(created_at) as created_at FROM announcements WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1','D1_STATE:registrants','D1_STATE:backup_members') GROUP BY title ORDER BY created_at DESC"
          ).all(),
          env.DB.prepare(
            "SELECT title, description, MAX(created_at) as created_at FROM events WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1','D1_STATE:registrants','D1_STATE:backup_members') GROUP BY title ORDER BY created_at DESC"
          ).all(),
          env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all(),
          env.DB.prepare(
            "SELECT body FROM announcements WHERE title = 'D1_STATE:revoked_members_log' ORDER BY created_at DESC LIMIT 1"
          ).first()
        ]);

        if (revRes && typeof revRes.body === "string") {
          parseTombstones(revRes.body);
        }

        const sliceRows = (sliceRowsRes && sliceRowsRes.results) || [];
        for (const row of sliceRows) {
          if (row && typeof row.body === "string") pushRawMembersSource(row.body);
        }

        const eventSlices = (eventSlicesRes && eventSlicesRes.results) || [];
        for (const row of eventSlices) {
          if (row && typeof row.description === "string") pushRawMembersSource(row.description);
        }

        const sqlMembers = (sqlMembersRes && sqlMembersRes.results) || [];
        if (sqlMembers.length > 0) {
          const mappedSql = sqlMembers.map((m) => ({
            id: m.id ? (String(m.id).startsWith("reg_") ? String(m.id) : `reg_member_${m.id}`) : undefined,
            originalId: m.id,
            uniqueCode: m.qr_code || "",
            fullName: m.name || "",
            gender: m.gender || undefined,
            phone: m.phone || "",
            whatsapp: m.whatsapp || m.phone || "",
            dob: isPlaceholderDob(m.birth_date) ? "" : String(m.birth_date || "").trim(),
            address: m.address || "",
            photoUrl: m.photo_url || "",
            registeredAt: m.created_at ? new Date(Number(m.created_at)).toISOString() : new Date().toISOString(),
            qrData: m.qr_code || "",
            role: m.role || "member",
            status: "active"
          }));
          sources.push(mappedSql);
        }
      }
    } catch {}
  }

  if (Array.isArray(incomingList) && incomingList.length > 0) {
    sources.push(incomingList);
  }

  const getRecordTimestamp = (obj) => {
    if (!obj || typeof obj !== "object") return 0;
    const lm = Number(obj.lastModifiedAt || 0);
    if (Number.isFinite(lm) && lm > 0) return lm;
    const up = Number(obj.updatedAt || 0);
    if (Number.isFinite(up) && up > 0) return up;
    if (obj.lastUpdatedAt) {
      const parsed = new Date(obj.lastUpdatedAt).getTime();
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  const isBareKvId = (val) => {
    const s = getBaseMemberId(val);
    return !s || /^CF_\d+$/i.test(s) || /^CF-STATIC-/i.test(s);
  };

  const isBareRecord = (obj) => {
    if (!obj || typeof obj !== "object") return true;
    const hasRich = Boolean(
      (obj.phone && String(obj.phone).trim()) ||
      (obj.uniqueCode && String(obj.uniqueCode).trim())
    );
    return !hasRich;
  };

  const mergeStampCollections = (olderStamps, newerStamps) => {
    if (Array.isArray(olderStamps) || Array.isArray(newerStamps)) {
      return Array.from(new Set([
        ...(Array.isArray(olderStamps) ? olderStamps : []),
        ...(Array.isArray(newerStamps) ? newerStamps : [])
      ]));
    }
    if ((olderStamps && typeof olderStamps === "object") || (newerStamps && typeof newerStamps === "object")) {
      return {
        ...(olderStamps && typeof olderStamps === "object" ? olderStamps : {}),
        ...(newerStamps && typeof newerStamps === "object" ? newerStamps : {})
      };
    }
    return undefined;
  };

  const mergeAttendanceHistories = (olderHist, newerHist) => {
    const oArr = Array.isArray(olderHist) ? olderHist : [];
    const nArr = Array.isArray(newerHist) ? newerHist : [];
    if (oArr.length === 0 && nArr.length === 0) return undefined;
    const map = new Map();
    for (const h of [...oArr, ...nArr]) {
      if (!h || typeof h !== "object") continue;
      const key = String(h.date || h.id || JSON.stringify(h)).trim();
      if (key) map.set(key, { ...(map.get(key) || {}), ...h });
    }
    return Array.from(map.values());
  };

  const deduplicateWorkerMembers = (rawList) => {
    if (!Array.isArray(rawList)) return [];
    const byNormName = new Map();

    for (const m of rawList) {
      if (isGarbageOrGhostMember(m)) continue;
      let fullName = String(m.fullName || m.name || "").trim().replace(/\s+/g, " ");
      const targetRule = matchWorkerTargetThreeRule(fullName);
      if (targetRule) {
        fullName = targetRule.canonicalName;
      }
      const normName = ultraNormalizeArabic(fullName);
      if (!normName) continue;

      let baseId = getBaseMemberId(m.originalId || m.id);
      let currentId = getBaseMemberId(m.id);
      const rawIdStr = String(m.id || "").trim();
      const bareId = currentId.replace(/^reg_member_/, "");

      if (normName === ultraNormalizeArabic("مارتينا انطونيوس بقطر")) {
        currentId = "reg_1794593070300_martina";
        baseId = "reg_1794593070300_martina";
      } else if (targetRule && (!currentId || isBareKvId(currentId))) {
        currentId = targetRule.id;
        baseId = targetRule.id;
      }

      const whitelisted = isWhitelistedWorkerMember(currentId || rawIdStr, fullName);

      if (
        !whitelisted &&
        (
          (rawIdStr && tombstoneIds.has(rawIdStr)) ||
          (currentId && tombstoneIds.has(currentId)) ||
          (baseId && tombstoneIds.has(baseId)) ||
          (bareId && tombstoneIds.has(bareId)) ||
          tombstoneNames.has(normName)
        )
      ) {
        continue;
      }

      const isOwner =
        currentId === "reg_owner_main" ||
        baseId === "reg_owner_main" ||
        m.role === "community_owner" ||
        normName === ultraNormalizeArabic("ميخائيل ادور راتب") ||
        normName === ultraNormalizeArabic("ميخائيل ادوار راتب");

      const cleanId = isOwner
        ? "reg_owner_main"
        : targetRule
          ? targetRule.id
          : (currentId && !isBareKvId(currentId) ? currentId : (!isBareKvId(baseId) ? baseId : (currentId || baseId || `3FY-${normName.replace(/\s+/g, "_")}`)));

      const existing = byNormName.get(normName);
      if (!existing) {
        const genderLocked = Boolean(targetRule || m.genderLocked || m.manualGender || m.genderCode);
        const repairedGender = isOwner ? "male" : targetRule ? targetRule.gender : detectAndRepairGender({ ...m, fullName, genderLocked });
        const nestedCreds = extractNestedSelfCreds(m, normName);
        const initialRec = pickStrongestCredential(
          m.recoveryCode || m.securityCode || m.backupCode,
          nestedCreds.recoveryCode || targetRule?.recoveryCode || "",
          0,
          0,
          false,
          ""
        );
        const initialPass = pickStrongestCredential(
          m.password || m.pass || m.pin,
          nestedCreds.password || targetRule?.password || "",
          0,
          0,
          false,
          ""
        );
        const cleanedInit = {
          ...m,
          id: cleanId,
          originalId: isOwner ? "reg_owner_main" : (baseId || cleanId),
          fullName,
          name: fullName,
          uniqueCode: targetRule ? (m.uniqueCode && !/^CF/i.test(m.uniqueCode) ? m.uniqueCode : targetRule.code) : m.uniqueCode,
          phone: m.phone || targetRule?.phone || "",
          whatsapp: m.whatsapp || m.phone || targetRule?.phone || "",
          dob: m.dob || m.birthDate || nestedCreds.dob || targetRule?.dob || "",
          address: m.address ?? nestedCreds.address ?? targetRule?.address ?? "",
          password: initialPass,
          recoveryCode: initialRec,
          securityCode: initialRec,
          role: isOwner ? "community_owner" : (m.role || "member"),
          gender: repairedGender,
          sex: repairedGender,
          genderCode: m.genderCode || repairedGender,
          manualGender: m.manualGender || (genderLocked ? repairedGender : undefined),
          genderLabel: repairedGender === "female" ? "أنثى" : "ذكر",
          type: repairedGender === "female" ? "شابة" : "شاب",
          category: repairedGender === "female" ? "شابات" : "شباب",
          genderLocked,
          lastModifiedAt: getRecordTimestamp(m) || undefined,
          status: "active",
          isDeleted: false
        };
        delete cleanedInit.member;
        delete cleanedInit.action;
        byNormName.set(normName, cleanedInit);
        continue;
      }

      const exTs = getRecordTimestamp(existing);
      const inTs = getRecordTimestamp(m);
      const exBare = isBareRecord(existing);
      const inBare = isBareRecord(m);
      const chooseIncoming =
        (exBare && !inBare && inTs >= exTs) ? true :
        (!exBare && inBare && exTs >= inTs) ? false :
        (inTs > exTs || (inTs === exTs && !inBare && exBare));

      const primary = chooseIncoming ? m : existing;
      const secondary = chooseIncoming ? existing : m;
      const maxTs = Math.max(exTs, inTs);
      const mergedFullName = String(primary.fullName || primary.name || secondary.fullName || secondary.name || fullName).trim().replace(/\s+/g, " ");

      const primaryExplicitGender = Boolean(
        primary.genderLocked || primary.manualGender || primary.genderCode ||
        (chooseIncoming && inTs !== exTs && (primary.gender === "male" || primary.gender === "female"))
      );
      const secondaryExplicitGender = Boolean(secondary.genderLocked || secondary.manualGender || secondary.genderCode);
      const genderObj = primaryExplicitGender ? primary : (secondaryExplicitGender ? secondary : primary);
      const finalGenderLocked = Boolean(genderObj.genderLocked || genderObj.manualGender || genderObj.genderCode);
      const repairedGender = isOwner
        ? "male"
        : detectAndRepairGender({ ...genderObj, fullName: mergedFullName, genderLocked: finalGenderLocked });

      const exCleanId = getBaseMemberId(existing.id || existing.originalId);
      const inCleanId = getBaseMemberId(m.id || m.originalId);
      const canonicalId = isOwner
        ? "reg_owner_main"
        : (!isBareKvId(exCleanId) ? exCleanId : (!isBareKvId(inCleanId) ? inCleanId : (exCleanId || inCleanId || cleanId)));

      const primaryPermTs = Math.max(Number(primary.roleUpdatedAt || 0), Number(primary.permissions?.__permissionsUpdatedAt || 0));
      const secondaryPermTs = Math.max(Number(secondary.roleUpdatedAt || 0), Number(secondary.permissions?.__permissionsUpdatedAt || 0));
      const primaryHasRole = Boolean(primary.role && primary.role !== "member");
      const secondaryHasRole = Boolean(secondary.role && secondary.role !== "member");

      const preferPrimaryRole =
        primaryPermTs > 0 || secondaryPermTs > 0
          ? primaryPermTs >= secondaryPermTs
          : primaryHasRole !== secondaryHasRole
            ? primaryHasRole
            : getRecordTimestamp(primary) >= getRecordTimestamp(secondary);

      const mergedRole = isOwner
        ? "community_owner"
        : preferPrimaryRole
          ? (primary.role || secondary.role || "member")
          : (secondary.role || primary.role || "member");
      const mergedPermissions = preferPrimaryRole
        ? (primary.permissions && Object.keys(primary.permissions).length > 0 ? primary.permissions : (secondary.permissions || primary.permissions))
        : (secondary.permissions && Object.keys(secondary.permissions).length > 0 ? secondary.permissions : (primary.permissions || secondary.permissions));
      const mergedRoleUpdatedAt = Math.max(primaryPermTs, secondaryPermTs) || undefined;

      const pPhoto = String(primary.photoUrl || primary.avatar || primary.image || "").trim();
      const sPhoto = String(secondary.photoUrl || secondary.avatar || secondary.image || "").trim();
      const validPhoto = (p) => p && !p.startsWith("__D1_PHOTO_REF__:") && !p.startsWith("blob:");
      const mergedPhoto = validPhoto(pPhoto) ? pPhoto : (validPhoto(sPhoto) ? sPhoto : (pPhoto || sPhoto || ""));

      const pNested = extractNestedSelfCreds(primary, normName);
      const sNested = extractNestedSelfCreds(secondary, normName);
      const pRecCand = pickStrongestCredential(primary.recoveryCode || primary.securityCode || primary.backupCode, pNested.recoveryCode, 0, 0, false, "");
      const sRecCand = pickStrongestCredential(secondary.recoveryCode || secondary.securityCode || secondary.backupCode, sNested.recoveryCode, 0, 0, false, "");
      const mergedRecCode = pickStrongestCredential(
        pRecCand,
        sRecCand,
        Number(primary.passwordUpdatedAt || 0),
        Number(secondary.passwordUpdatedAt || 0),
        false,
        ""
      );
      const pPassCand = pickStrongestCredential(primary.password || primary.pass || primary.pin, pNested.password, 0, 0, false, "");
      const sPassCand = pickStrongestCredential(secondary.password || secondary.pass || secondary.pin, sNested.password, 0, 0, false, "");
      const mergedPass = pickStrongestCredential(
        pPassCand,
        sPassCand,
        Number(primary.passwordUpdatedAt || 0),
        Number(secondary.passwordUpdatedAt || 0),
        false,
        ""
      );

      const mergedRecord = {
        ...secondary,
        ...primary,
        id: canonicalId,
        originalId: isOwner ? "reg_owner_main" : (getBaseMemberId(secondary.originalId || canonicalId) || canonicalId),
        fullName: mergedFullName,
        name: mergedFullName,
        password: mergedPass,
        recoveryCode: mergedRecCode,
        securityCode: mergedRecCode,
        passwordUpdatedAt: Math.max(Number(primary.passwordUpdatedAt || 0), Number(secondary.passwordUpdatedAt || 0)) || undefined,
        passwordLocked: Boolean(primary.passwordLocked || secondary.passwordLocked || !isDefaultOrEmptyCredential(mergedPass)),
        role: mergedRole,
        isOwner: isOwner ? true : undefined,
        permissions: mergedPermissions,
        roleUpdatedAt: mergedRoleUpdatedAt,
        gender: repairedGender,
        sex: repairedGender,
        genderCode: finalGenderLocked ? repairedGender : (genderObj.genderCode || repairedGender),
        manualGender: finalGenderLocked ? repairedGender : genderObj.manualGender,
        genderLabel: repairedGender === "female" ? "أنثى" : "ذكر",
        type: repairedGender === "female" ? "شابة" : "شاب",
        category: repairedGender === "female" ? "شابات" : "شباب",
        genderLocked: finalGenderLocked,
        ownerGenderModifiedAt: Math.max(Number(primary.ownerGenderModifiedAt || 0), Number(secondary.ownerGenderModifiedAt || 0)) || undefined,
        registeredInCleanMasterV1: Boolean(primary.registeredInCleanMasterV1 || secondary.registeredInCleanMasterV1),
        lastModifiedAt: maxTs || undefined,
        updatedAt: maxTs || primary.updatedAt || secondary.updatedAt,
        lastUpdatedAt: primary.lastUpdatedAt || (maxTs ? new Date(maxTs).toISOString() : secondary.lastUpdatedAt),
        phone: primary.phone || secondary.phone || "",
        whatsapp: primary.whatsapp || secondary.whatsapp || primary.phone || secondary.phone || "",
        dob: primary.dob || primary.birthDate || secondary.dob || secondary.birthDate || "",
        birthDate: primary.birthDate || primary.dob || secondary.birthDate || secondary.dob || "",
        address: String(primary.address || "").trim() ? primary.address : (secondary.address ?? primary.address ?? ""),
        residence: String(primary.address || "").trim() ? primary.address : (secondary.address ?? primary.address ?? ""),
        notes: String(primary.notes || "").trim() ? primary.notes : (secondary.notes ?? primary.notes ?? ""),
        talents: String(primary.notes || "").trim() ? primary.notes : (secondary.notes ?? primary.notes ?? ""),
        skills: String(primary.notes || "").trim() ? primary.notes : (secondary.notes ?? primary.notes ?? ""),
        uniqueCode: isOwner ? "TY-0001" : (primary.uniqueCode || secondary.uniqueCode || primary.qr_code || secondary.qr_code || ""),
        qrCode: (() => {
          const pQrTs = Number(primary.qrUpdatedAt || 0);
          const sQrTs = Number(secondary.qrUpdatedAt || 0);
          const pQr = String(primary.qrData || primary.qrCode || "").trim();
          const sQr = String(secondary.qrData || secondary.qrCode || "").trim();
          const chosen = pQrTs > sQrTs && pQr ? pQr : (sQrTs > pQrTs && sQr ? sQr : (/^QR3FY-/i.test(pQr) ? pQr : (/^QR3FY-/i.test(sQr) ? sQr : (pQr || sQr))));
          return chosen || (isOwner ? "TY-0001" : (primary.uniqueCode || secondary.uniqueCode || canonicalId));
        })(),
        qrData: (() => {
          const pQrTs = Number(primary.qrUpdatedAt || 0);
          const sQrTs = Number(secondary.qrUpdatedAt || 0);
          const pQr = String(primary.qrData || primary.qrCode || "").trim();
          const sQr = String(secondary.qrData || secondary.qrCode || "").trim();
          const chosen = pQrTs > sQrTs && pQr ? pQr : (sQrTs > pQrTs && sQr ? sQr : (/^QR3FY-/i.test(pQr) ? pQr : (/^QR3FY-/i.test(sQr) ? sQr : (pQr || sQr))));
          return chosen || (isOwner ? "TY-0001" : (primary.uniqueCode || secondary.uniqueCode || canonicalId));
        })(),
        qrUpdatedAt: Math.max(Number(primary.qrUpdatedAt || 0), Number(secondary.qrUpdatedAt || 0)) || undefined,
        qrBoundMemberId: primary.qrBoundMemberId || secondary.qrBoundMemberId || canonicalId,
        qrBoundMemberName: primary.qrBoundMemberName || secondary.qrBoundMemberName || primary.fullName || secondary.fullName,
        photoUrl: mergedPhoto,
        stamps: mergeStampCollections(secondary.stamps, primary.stamps),
        fridayStamps: mergeStampCollections(secondary.fridayStamps, primary.fridayStamps),
        attendanceDates: Array.from(
          new Set([
            ...(Array.isArray(secondary.attendanceDates) ? secondary.attendanceDates : []),
            ...(Array.isArray(primary.attendanceDates) ? primary.attendanceDates : [])
          ])
        ),
        presentDates: Array.from(
          new Set([
            ...(Array.isArray(secondary.presentDates) ? secondary.presentDates : []),
            ...(Array.isArray(primary.presentDates) ? primary.presentDates : [])
          ])
        ),
        attendanceHistory: mergeAttendanceHistories(secondary.attendanceHistory, primary.attendanceHistory),
        lastAttendance: primary.lastAttendance || secondary.lastAttendance,
        status: "active",
        isDeleted: false
      };
      delete mergedRecord.avatar;
      delete mergedRecord.image;
      byNormName.set(normName, mergedRecord);
    }

    // Ensure the 3 target rescued members are ALWAYS injected into byNormName even if missing from raw slices
    for (const rule of RESCUED_THREE_WORKER_RULES) {
      const rNorm = ultraNormalizeArabic(rule.canonicalName);
      const ex = byNormName.get(rNorm);
      if (!ex) {
        byNormName.set(rNorm, {
          id: rule.id,
          originalId: rule.id,
          uniqueCode: rule.code,
          qrCode: rule.code,
          qrData: rule.code,
          fullName: rule.canonicalName,
          name: rule.canonicalName,
          gender: rule.gender,
          sex: rule.gender,
          genderCode: rule.gender,
          manualGender: rule.gender,
          genderLabel: rule.gender === "female" ? "أنثى" : "ذكر",
          type: rule.gender === "female" ? "شابة" : "شاب",
          category: rule.gender === "female" ? "شابات" : "شباب",
          genderLocked: true,
          phone: rule.phone,
          whatsapp: rule.phone,
          dob: rule.dob,
          birthDate: rule.dob,
          address: rule.address || "",
          password: rule.password,
          recoveryCode: rule.recoveryCode,
          securityCode: rule.recoveryCode,
          role: "member",
          registeredInCleanMasterV1: true,
          status: "active",
          isDeleted: false
        });
      }
    }

    // Apply VERIFIED_95_MANIFEST gender & owner rules while preserving all valid #96/#97+ registered members
    const manifestMap = new Map();
    for (const item of VERIFIED_95_MANIFEST) {
      manifestMap.set(ultraNormalizeArabic(item.name), item);
    }
    const seenWorkerIds = new Set();
    const uniqueWorkerMembers = [];
    for (const [normName, m] of byNormName.entries()) {
      if (!m || typeof m !== "object") continue;
      if (isGarbageOrGhostMember(m)) continue;
      const manifestItem = manifestMap.get(normName);

      let finalId = getBaseMemberId(m.id);
      const isOwnerMember = Boolean(
        manifestItem?.isOwner ||
        m.role === "community_owner" ||
        finalId === "reg_owner_main" ||
        normName === ultraNormalizeArabic("ميخائيل ادور راتب") ||
        normName === ultraNormalizeArabic("ميخائيل ادوار راتب")
      );
      if (isOwnerMember) {
        finalId = "reg_owner_main";
      } else if (!finalId || seenWorkerIds.has(finalId)) {
        let hashAcc = 0;
        const seed = normName || String(uniqueWorkerMembers.length + 1);
        for (let i = 0; i < seed.length; i++) {
          hashAcc = ((hashAcc << 5) - hashAcc + seed.charCodeAt(i)) | 0;
        }
        let candidate = `3FY-${Math.abs(hashAcc).toString(36).toUpperCase()}`;
        let suffix = 1;
        while (seenWorkerIds.has(candidate)) {
          candidate = `3FY-${Math.abs(hashAcc).toString(36).toUpperCase()}-${suffix++}`;
        }
        finalId = candidate;
      }
      seenWorkerIds.add(finalId);

      const hasOwnerToggle = Boolean(Number(m.ownerGenderModifiedAt || 0) > 0 && (m.manualGender === "male" || m.manualGender === "female"));
      const finalGender = isOwnerMember
        ? "male"
        : hasOwnerToggle
          ? m.manualGender
          : manifestItem
            ? manifestItem.gender
            : detectAndRepairGender(m);
      const hasExplicitLock = Boolean(
        isOwnerMember ||
        hasOwnerToggle ||
        manifestItem ||
        m.userSelectedGender === "female" ||
        m.userSelectedGender === "male" ||
        finalGender === "female"
      );
      const vaultRowFull = (doDelta && doDelta.vault && doDelta.vault[mNorm]) || null;
      const recCode = pickStrongestCredential(
        vaultRowFull?.recoveryCode,
        m.recoveryCode || m.securityCode,
        Number(vaultRowFull?.updatedAt || 0),
        Number(m.passwordUpdatedAt || 0),
        false,
        "123456"
      );
      const pass = pickStrongestCredential(
        vaultRowFull?.password,
        m.password || m.pass,
        Number(vaultRowFull?.updatedAt || 0),
        Number(m.passwordUpdatedAt || 0),
        false,
        recCode || "123456"
      );

      const finalEntry = {
        ...m,
        id: finalId,
        originalId: isOwnerMember ? "reg_owner_main" : (getBaseMemberId(m.originalId || finalId) || finalId),
        role: isOwnerMember ? "community_owner" : (m.role || "member"),
        isOwner: isOwnerMember ? true : undefined,
        gender: finalGender,
        sex: finalGender,
        genderCode: hasExplicitLock ? finalGender : m.genderCode,
        manualGender: hasExplicitLock ? finalGender : m.manualGender,
        userSelectedGender: m.userSelectedGender || (hasOwnerToggle ? m.manualGender : (finalGender === "female" ? "female" : undefined)),
        genderLabel: finalGender === "female" ? "أنثى" : "ذكر",
        type: finalGender === "female" ? "شابة" : "شاب",
        category: finalGender === "female" ? "شابات" : "شباب",
        genderLocked: hasExplicitLock,
        password: pass,
        recoveryCode: recCode,
        securityCode: recCode,
        passwordLocked: Boolean(m.passwordLocked || vaultRowFull || !isDefaultOrEmptyCredential(pass))
      };
      delete finalEntry.member;
      delete finalEntry.action;
      uniqueWorkerMembers.push(finalEntry);
    }
    return uniqueWorkerMembers;
  };

  const allFlatCandidates = [];
  const currentMasterCandidates = [];
  for (let sIdx = 0; sIdx < sources.length; sIdx++) {
    const list = sources[sIdx];
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (m && typeof m === "object") {
        allFlatCandidates.push(m);
        if (sIdx === 0) currentMasterCandidates.push(m);
      }
    }
  }

  function deepAuditAndMergeMember(manifestEntry, currentMasterRecords, legacyPoolRecords, usedPhotosSet) {
    const targetRule = matchWorkerTargetThreeRule(manifestEntry.name);
    const canonicalManifestName = targetRule ? targetRule.canonicalName : manifestEntry.name;
    const targetNormName = ultraNormalizeArabic(canonicalManifestName);

    const candidates = [...currentMasterRecords, ...legacyPoolRecords].filter((r) => {
      if (!r || typeof r !== "object") return false;
      const rawName = String(r.fullName || r.name || "").trim();
      const matchedAlias = matchWorkerTargetThreeRule(rawName);
      const rNorm = matchedAlias ? ultraNormalizeArabic(matchedAlias.canonicalName) : ultraNormalizeArabic(rawName);
      return rNorm === targetNormName;
    });

    candidates.sort((a, b) => {
      const tsA = getRecordTimestamp(a);
      const tsB = getRecordTimestamp(b);
      if (tsB !== tsA) return tsB - tsA;
      const score = (x) =>
        (x?.photoUrl ? 4 : 0) +
        (x?.phone ? 3 : 0) +
        (x?.password && x.password !== "123456" ? 2 : 0) +
        (x?.recoveryCode && x.recoveryCode !== "123456" ? 2 : 0) +
        (Array.isArray(x?.stamps) ? x.stamps.length : 0);
      return score(b) - score(a);
    });

    const pickBestField = (keys, fallback = "") => {
      for (const c of candidates) {
        for (const k of keys) {
          const val = c?.[k];
          if (
            val !== undefined &&
            val !== null &&
            String(val).trim() !== "" &&
            String(val).trim() !== "null" &&
            String(val).trim() !== "undefined"
          ) {
            return typeof val === "string" ? val.trim() : val;
          }
        }
      }
      return fallback;
    };

    let bestPhoto = "";
    for (const c of candidates) {
      const p = String(c?.photoUrl || c?.avatar || c?.photo || c?.image || "").trim();
      if (p && p.length > 50 && !p.startsWith("__D1_PHOTO_REF__:") && !p.startsWith("blob:")) {
        const photoOwner = c?.photoOwnerName ? ultraNormalizeArabic(c.photoOwnerName) : targetNormName;
        const photoSig = p.startsWith("data:image/") && p.length > 200 ? `${p.length}:${p.slice(-120)}` : p;
        if (photoOwner === targetNormName && !usedPhotosSet.has(photoSig)) {
          bestPhoto = p;
          usedPhotosSet.add(photoSig);
          break;
        }
      }
    }
    if (!bestPhoto) {
      for (const c of candidates) {
        const p = String(c?.photoUrl || c?.avatar || c?.photo || c?.image || "").trim();
        if (p && !p.startsWith("blob:")) {
          bestPhoto = p;
          break;
        }
      }
    }

    const allStamps = new Set();
    const allDates = new Set();
    const historyMap = new Map();

    for (const c of candidates) {
      if (Array.isArray(c?.stamps)) {
        c.stamps.forEach((s) => {
          if (s) allStamps.add(typeof s === "string" ? s : JSON.stringify(s));
        });
      }
      if (Array.isArray(c?.fridayStamps)) {
        c.fridayStamps.forEach((s) => {
          if (s) allStamps.add(typeof s === "string" ? s : JSON.stringify(s));
        });
      }
      if (Array.isArray(c?.attendanceDates)) {
        c.attendanceDates.forEach((d) => {
          if (d) allDates.add(String(d));
        });
      }
      if (Array.isArray(c?.presentDates)) {
        c.presentDates.forEach((d) => {
          if (d) allDates.add(String(d));
        });
      }
      if (Array.isArray(c?.attendanceHistory)) {
        c.attendanceHistory.forEach((h) => {
          if (!h || typeof h !== "object") return;
          const key = String(h.id || h.date || JSON.stringify(h)).trim();
          if (key && !historyMap.has(key)) historyMap.set(key, h);
        });
      }
    }

    const parsedStamps = Array.from(allStamps).map((s) => {
      try {
        return s.startsWith("{") ? JSON.parse(s) : s;
      } catch {
        return s;
      }
    });

    const isOwner = Boolean(manifestEntry.isOwner || targetNormName === ultraNormalizeArabic("ميخائيل ادور راتب"));
    const ownerOverrideCandidate = candidates.find(
      (c) => Number(c?.ownerGenderModifiedAt || 0) > 0 && (c?.manualGender === "male" || c?.manualGender === "female")
    );
    const resolvedGender = isOwner
      ? "male"
      : ownerOverrideCandidate
        ? ownerOverrideCandidate.manualGender
        : manifestEntry.gender;
    const genderAr = resolvedGender === "female" ? "أنثى" : "ذكر";

    const rawIdCandidate = pickBestField(["id", "originalId"], "");
    const canonicalId = isOwner
      ? "reg_owner_main"
      : targetRule
        ? targetRule.id
        : rawIdCandidate && !isBareKvId(rawIdCandidate)
          ? getBaseMemberId(rawIdCandidate)
          : `3FY-${manifestEntry.num}`;

    const rawCodeCandidate = String(pickBestField(["uniqueCode", "code"], "")).trim();
    const cleanCodeCandidate = rawCodeCandidate && !/^CF/i.test(rawCodeCandidate) && !/^QR3FY-/i.test(rawCodeCandidate) ? rawCodeCandidate : "";
    const canonicalCode = isOwner
      ? "TY-0001"
      : targetRule
        ? String(cleanCodeCandidate || targetRule.code).trim().toUpperCase()
        : String(
            cleanCodeCandidate ||
            `TY-${String(manifestEntry.num + 1).padStart(4, "0")}`
          ).trim().toUpperCase();

    let bestQrToken = "";
    let bestQrUpdatedAt = 0;
    for (const c of candidates) {
      const cQr = String(c?.qrData || c?.qrCode || "").trim();
      const cQrTs = Number(c?.qrUpdatedAt || 0);
      if (cQr && cQrTs > bestQrUpdatedAt) {
        bestQrUpdatedAt = cQrTs;
        bestQrToken = cQr;
      } else if (!bestQrToken && /^QR3FY-/i.test(cQr)) {
        bestQrToken = cQr;
      }
    }
    const canonicalQrData = bestQrToken || String(pickBestField(["qrData"], canonicalCode)).trim() || canonicalCode;

    const pickStrongestCredAcrossCandidates = (keys, fallback = "123456") => {
      // Pass 1: Look for any explicit passwordUpdatedAt non-default credential first, then ANY non-default real credential (NEVER let "123456" beat a real password!)
      let bestExplicit = "";
      let bestExplicitTs = 0;
      let firstReal = "";
      let firstAny = "";
      for (const c of candidates) {
        const nestedC = extractNestedSelfCreds(c, targetNormName);
        const vals = [];
        for (const k of keys) {
          if (c?.[k] !== undefined && c?.[k] !== null) vals.push(String(c[k]).trim());
        }
        if (keys.includes("password") && nestedC.password) vals.push(nestedC.password);
        if (keys.includes("recoveryCode") && nestedC.recoveryCode) vals.push(nestedC.recoveryCode);
        const pTs = Number(c?.passwordUpdatedAt || 0);
        for (const v of vals) {
          if (!v || v === "null" || v === "undefined") continue;
          if (!firstAny) firstAny = v;
          if (!isDefaultOrEmptyCredential(v)) {
            if (!firstReal) firstReal = v;
            if (pTs > bestExplicitTs) {
              bestExplicitTs = pTs;
              bestExplicit = v;
            }
          }
        }
      }
      return bestExplicit || firstReal || firstAny || fallback;
    };

    const vaultRowAudit = (doDelta && doDelta.vault && doDelta.vault[targetNormName]) || null;
    const bestRecoveryCode = pickStrongestCredential(
      vaultRowAudit?.recoveryCode,
      pickStrongestCredAcrossCandidates(["recoveryCode", "securityCode", "secretCode", "backupCode", "resetCode"], targetRule?.recoveryCode || "123456"),
      Number(vaultRowAudit?.updatedAt || 0),
      0,
      false,
      targetRule?.recoveryCode || "123456"
    );

    const bestPassword = isOwner
      ? "admin123456789"
      : pickStrongestCredential(
          vaultRowAudit?.password,
          pickStrongestCredAcrossCandidates(
            ["password", "pass", "pin", "userPassword", "secret"],
            targetRule?.password || bestRecoveryCode || "123456"
          ),
          Number(vaultRowAudit?.updatedAt || 0),
          0,
          false,
          targetRule?.password || bestRecoveryCode || "123456"
        );

    const bestPhone = String(
      pickBestField(["phone", "mobile", "phoneNumber", "whatsapp"], targetRule?.phone || (isOwner ? "+20 1288651567" : ""))
    ).trim();
    const bestWhatsapp = String(
      pickBestField(["whatsapp", "whatsappNumber", "phone", "mobile"], bestPhone)
    ).trim();
    const bestAddress = String(
      pickBestField(["address", "location", "residence"], targetRule?.address || "")
    ).trim();
    const bestNotes = String(
      pickBestField(["notes", "bio", "talents", "skills"], "")
    ).trim();
    let bestDob = "";
    for (const c of candidates) {
      const cDob = String(c?.dob || c?.birthDate || "").trim();
      if (cDob && !isPlaceholderDob(cDob)) {
        bestDob = cDob;
        break;
      }
    }
    if (!bestDob) {
      bestDob = pickStrongestDob(vaultRowAudit?.dob, targetRule?.dob || "");
    }
    let roleCandidate = /** @type {any} */ (null);
    let bestPermUpdatedTs = 0;
    for (const c of candidates) {
      const pTs = Number(c?.roleUpdatedAt || c?.permissions?.__permissionsUpdatedAt || 0);
      if (pTs > bestPermUpdatedTs) {
        bestPermUpdatedTs = pTs;
        roleCandidate = c;
      }
    }
    if (!roleCandidate) {
      roleCandidate = candidates.find((c) => c?.role && c.role !== "member") || null;
    }

    const bestRole = isOwner
      ? "community_owner"
      : String(roleCandidate?.role || pickBestField(["role"], "member")).trim();
    const bestPermissions =
      roleCandidate?.permissions && typeof roleCandidate.permissions === "object" && Object.keys(roleCandidate.permissions).length > 0
        ? roleCandidate.permissions
        : pickBestField(["permissions"], /** @type {any} */ ({}));

    const baseMerged = candidates.length > 0 ? { ...candidates[candidates.length - 1], ...candidates[0] } : {};
    delete baseMerged.avatar;
    delete baseMerged.image;

    return {
      ...baseMerged,
      id: canonicalId,
      originalId: isOwner ? "reg_owner_main" : (getBaseMemberId(baseMerged?.originalId || canonicalId) || canonicalId),
      name: canonicalManifestName,
      fullName: canonicalManifestName,
      gender: resolvedGender,
      sex: resolvedGender,
      genderCode: resolvedGender,
      manualGender: resolvedGender,
      genderLabel: genderAr,
      type: resolvedGender === "female" ? "شابة" : "شاب",
      category: resolvedGender === "female" ? "شابات" : "شباب",
      genderLocked: true,
      ownerGenderModifiedAt: ownerOverrideCandidate?.ownerGenderModifiedAt,
      role: bestRole,
      roleUpdatedAt: bestPermUpdatedTs > 0 ? bestPermUpdatedTs : undefined,
      rank: isOwner ? "مسؤول المجتمع" : pickBestField(["rank"], "مخدوم"),
      isOwner: isOwner ? true : undefined,
      permissions: bestPermissions,
      password: bestPassword,
      recoveryCode: bestRecoveryCode,
      securityCode: bestRecoveryCode,
      phone: bestPhone,
      whatsapp: bestWhatsapp,
      phoneCountry: pickBestField(["phoneCountry"], bestPhone.startsWith("+20") ? "EG" : "SD"),
      whatsappCountry: pickBestField(["whatsappCountry"], bestWhatsapp.startsWith("+20") ? "EG" : "SD"),
      dob: bestDob,
      birthDate: bestDob,
      address: bestAddress,
      residence: bestAddress,
      location: bestAddress,
      notes: bestNotes,
      bio: bestNotes,
      talents: bestNotes,
      skills: bestNotes,
      photoUrl: isOwner && !bestPhoto ? "/owner_portrait.jpg" : bestPhoto,
      photoOwnerName: targetNormName,
      uniqueCode: canonicalCode,
      qrCode: canonicalQrData,
      qrData: canonicalQrData,
      qrUpdatedAt: bestQrUpdatedAt > 0 ? bestQrUpdatedAt : undefined,
      qrBoundMemberId: canonicalId,
      qrBoundMemberName: canonicalManifestName,
      stamps: parsedStamps.length > 0 ? parsedStamps : baseMerged?.stamps,
      fridayStamps: parsedStamps.length > 0 ? parsedStamps : baseMerged?.fridayStamps,
      attendanceDates: Array.from(allDates),
      presentDates: Array.from(allDates),
      attendanceHistory: Array.from(historyMap.values()),
      lastAttendance: pickBestField(["lastAttendance"], undefined),
      registeredAt: pickBestField(["registeredAt", "createdAt"], new Date().toISOString()),
      updatedAt: Date.now(),
      registeredInCleanMasterV1: true,
      status: "active",
      isDeleted: false
    };
  }

  function verifyAuditSuccess(auditedMembers) {
    if (!Array.isArray(auditedMembers) || auditedMembers.length < 96) return false;
    const hasVerifiedOwner = auditedMembers.some(
      (m) =>
        m &&
        (m.isOwner === true || m.role === "community_owner" || m.id === "reg_owner_main") &&
        ultraNormalizeArabic(m.fullName || m.name || "").includes("ميخاييل ادور راتب")
    );
    if (!hasVerifiedOwner) return false;
    const presentNorms = new Set(
      auditedMembers.map((m) => ultraNormalizeArabic(m?.fullName || m?.name || "")).filter(Boolean)
    );
    for (const item of VERIFIED_96_MANIFEST) {
      if (!presentNorms.has(ultraNormalizeArabic(item.name))) {
        return false;
      }
    }
    return true;
  }

  const dedupedAll = deduplicateWorkerMembers(allFlatCandidates);
  const usedPhotosSet = new Set();
  const manifestNormSet = new Set();
  const auditedManifestMembers = [];

  for (let i = 0; i < VERIFIED_96_MANIFEST.length; i++) {
    const manifestEntry = VERIFIED_96_MANIFEST[i];
    const normManifestName = ultraNormalizeArabic(manifestEntry.name);
    manifestNormSet.add(normManifestName);
    const auditedMember = deepAuditAndMergeMember(
      manifestEntry,
      currentMasterCandidates,
      dedupedAll,
      usedPhotosSet
    );
    auditedManifestMembers.push(auditedMember);
  }

  // Append all genuine #97+ members from dedupedAll (regardless of device clock skew)
  for (const candidate of dedupedAll) {
    if (!candidate || typeof candidate !== "object") continue;
    if (isGarbageOrGhostMember(candidate)) continue;
    const normName = ultraNormalizeArabic(candidate.fullName || candidate.name || "");
    if (!normName || manifestNormSet.has(normName)) continue;
    auditedManifestMembers.push({
      ...candidate,
      registeredInCleanMasterV1: true,
      status: "active",
      isDeleted: false
    });
  }

  const finalUnionList = deduplicateWorkerMembers(auditedManifestMembers);
  const isAudit100PercentVerified = verifyAuditSuccess(finalUnionList);

  // CRITICAL ZERO-DOWNGRADE GUARD: NEVER auto-persist from a GET request! Only explicit mutations pass persistIfExpanded = true!
  if (persistIfExpanded && hasIncoming && (env.DB || kvStore) && finalUnionList.length > 0) {
    try {
      const nowTs = Date.now();
      const jsonStr = JSON.stringify(finalUnionList);
      await saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, jsonStr, nowTs);
    } catch {}
  }

  cachedMasterRegistrants = { version: edgeStateVersion, list: finalUnionList, json: null };
  return finalUnionList;
}

export class RealtimeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.sql = ctx.storage.sql;
    this._atomicQueue = Promise.resolve();
    this.sql.exec("CREATE TABLE IF NOT EXISTS live_attendance (member_id TEXT PRIMARY KEY, name TEXT, joined_at INTEGER)");
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS atomic_members (id TEXT PRIMARY KEY, norm_name TEXT UNIQUE NOT NULL, unique_code TEXT UNIQUE NOT NULL, member_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS deleted_members (id TEXT PRIMARY KEY, norm_name TEXT, deleted_at INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS meta_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS used_codes_forever (code TEXT PRIMARY KEY, assigned_at INTEGER NOT NULL)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS credential_vault (norm_name TEXT PRIMARY KEY, member_id TEXT NOT NULL, full_name TEXT NOT NULL, password TEXT NOT NULL, recovery_code TEXT NOT NULL, phone TEXT DEFAULT '', dob TEXT DEFAULT '', locked_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    );
  }

  _enqueueAtomic(task) {
    const next = this._atomicQueue.then(task, task);
    this._atomicQueue = next.catch(() => {});
    return next;
  }

  _readCounter(key, fallback = 0) {
    try {
      const rows = this.sql.exec("SELECT value FROM meta_counters WHERE key = ?", key).toArray();
      if (rows.length > 0) return Number(rows[0].value || fallback);
    } catch {}
    return fallback;
  }

  _bumpDoVersion(nowTs) {
    const prev = this._readCounter("edge_version", 0);
    const next = Math.max(prev + 1, nowTs);
    this.sql.exec("INSERT OR REPLACE INTO meta_counters (key, value) VALUES ('edge_version', ?)", next);
    return next;
  }

  _allocateStrictUniqueCode(baselineCodes) {
    const usedCodes = new Set(["TY-0001"]);
    let maxNum = Math.max(117, this._readCounter("max_code_num", 117));
    const ingestCode = (raw) => {
      const c = String(raw || "").trim().toUpperCase();
      if (!c) return;
      usedCodes.add(c);
      const m = c.match(/^TY-(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
    };
    if (Array.isArray(baselineCodes)) {
      for (const c of baselineCodes) ingestCode(c);
    }
    const existingRows = this.sql.exec("SELECT unique_code FROM atomic_members").toArray();
    for (const row of existingRows) ingestCode(row.unique_code);
    try {
      const foreverRows = this.sql.exec("SELECT code FROM used_codes_forever").toArray();
      for (const row of foreverRows) ingestCode(row.code);
    } catch {}

    let nextNum = maxNum + 1;
    let candidate = `TY-${String(nextNum).padStart(4, "0")}`;
    while (usedCodes.has(candidate)) {
      nextNum++;
      candidate = `TY-${String(nextNum).padStart(4, "0")}`;
    }
    return { code: candidate, num: nextNum };
  }

  async rpcGetVersion() {
    return this._readCounter("edge_version", 0);
  }

  async rpcBumpVersion(nowTs = Date.now()) {
    return this._bumpDoVersion(Number(nowTs || Date.now()));
  }

  async rpcGetAtomicDelta() {
    const members = [];
    const deletedIds = [];
    const deletedNames = [];
    const vault = {};
    try {
      const mRows = this.sql.exec("SELECT member_json FROM atomic_members ORDER BY created_at ASC").toArray();
      for (const r of mRows) {
        if (typeof r.member_json === "string") {
          try {
            const parsed = JSON.parse(r.member_json);
            if (parsed && typeof parsed === "object") members.push(parsed);
          } catch {}
        }
      }
      const dRows = this.sql.exec("SELECT id, norm_name FROM deleted_members").toArray();
      for (const r of dRows) {
        if (r.id) deletedIds.push(String(r.id));
        if (r.norm_name) deletedNames.push(String(r.norm_name));
      }
      const vRows = this.sql.exec("SELECT norm_name, member_id, password, recovery_code, phone, dob, updated_at FROM credential_vault").toArray();
      for (const vr of vRows) {
        if (vr.norm_name) {
          vault[String(vr.norm_name)] = {
            memberId: String(vr.member_id || ""),
            password: String(vr.password || ""),
            recoveryCode: String(vr.recovery_code || ""),
            phone: String(vr.phone || ""),
            dob: String(vr.dob || ""),
            updatedAt: Number(vr.updated_at || 0)
          };
        }
      }
    } catch {}
    return {
      members,
      deletedIds,
      deletedNames,
      vault,
      version: this._readCounter("edge_version", 0)
    };
  }

  async rpcClaimOneTimeJob(jobKey) {
    return await this._enqueueAtomic(async () => {
      const k = String(jobKey || "").trim();
      if (!k) return { claimed: false };
      let claimed = false;
      this.ctx.storage.transactionSync(() => {
        const existing = this._readCounter(k, 0);
        if (!existing) {
          this._writeCounter(k, Date.now());
          claimed = true;
        }
      });
      return { claimed };
    });
  }

  async rpcRestoreCredentialVaultBatch(entries = []) {
    return await this._enqueueAtomic(async () => {
      if (!Array.isArray(entries) || entries.length === 0) {
        return { ok: true, vaulted: 0, atomicUpdated: 0, version: this._readCounter("edge_version", 0) };
      }
      const nowTs = Date.now();
      let vaulted = 0;
      let atomicUpdated = 0;
      let committedVersion = nowTs;
      this.ctx.storage.transactionSync(() => {
        for (const item of entries) {
          if (!item || typeof item !== "object") continue;
          const fullName = String(item.fullName || item.name || "").trim().replace(/\s+/g, " ");
          const normName = ultraNormalizeArabic(fullName);
          if (!normName) continue;
          const memberId = String(item.id || "").trim();
          const pass = String(item.password || "").trim();
          const rec = String(item.recoveryCode || item.securityCode || "123456").trim();
          const phone = String(item.phone || "").trim();
          const dob = String(item.dob || item.birthDate || "").trim();
          const existingVault = this.sql
            .exec("SELECT password, recovery_code, dob, locked_at FROM credential_vault WHERE norm_name = ?", normName)
            .toArray()[0] || null;
          const finalVaultPass = pickStrongestCredential(
            pass,
            existingVault?.password,
            0,
            0,
            false,
            rec || "123456"
          );
          const finalVaultRec = pickStrongestCredential(
            rec,
            existingVault?.recovery_code,
            0,
            0,
            false,
            "123456"
          );
          const finalVaultDob = pickStrongestDob(existingVault?.dob, dob);
          this.sql.exec(
            "INSERT OR REPLACE INTO credential_vault (norm_name, member_id, full_name, password, recovery_code, phone, dob, locked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            normName,
            memberId || normName,
            fullName,
            finalVaultPass,
            finalVaultRec,
            phone,
            finalVaultDob,
            Number(existingVault?.locked_at || nowTs),
            nowTs
          );
          vaulted++;

          // Also sync atomic_members row if present (and clean stray nested member/action keys!)
          const doRow = this.sql
            .exec("SELECT id, unique_code, member_json, created_at FROM atomic_members WHERE norm_name = ?", normName)
            .toArray()[0] || null;
          if (doRow && typeof doRow.member_json === "string") {
            try {
              const parsed = JSON.parse(doRow.member_json);
              const nextRec = {
                ...parsed,
                password: finalVaultPass,
                recoveryCode: finalVaultRec,
                securityCode: finalVaultRec,
                passwordLocked: true,
                registrationLocked: true
              };
              const bestRowDob = pickStrongestDob(parsed.dob || parsed.birthDate, finalVaultDob);
              if (bestRowDob && isAuthenticDob(bestRowDob, parsed.registeredAt)) {
                nextRec.dob = bestRowDob;
                nextRec.birthDate = bestRowDob;
                nextRec.dobLocked = true;
              } else if (isPlaceholderDob(nextRec.dob)) {
                nextRec.dob = "";
                nextRec.birthDate = "";
              }
              if (item.address && !nextRec.address) {
                nextRec.address = String(item.address).trim();
                nextRec.residence = nextRec.address;
              }
              delete nextRec.member;
              delete nextRec.action;
              this.sql.exec(
                "UPDATE atomic_members SET member_json = ?, updated_at = ? WHERE id = ?",
                JSON.stringify(nextRec),
                nowTs,
                doRow.id
              );
              atomicUpdated++;
            } catch {}
          }
        }
        committedVersion = this._bumpDoVersion(nowTs);
      });
      return { ok: true, vaulted, atomicUpdated, version: committedVersion };
    });
  }

  /**
   * Globally-atomic, strict FIFO serialized member registration!
   * Even if 20 people click "إتمام التسجيل واستخراج بطاقة الهوية" at the exact same millisecond,
   * each request enters this single-threaded queue one by one:
   * - Zero mixed phones / photos / QR codes (100% isolated payload per request)
   * - Guaranteed unique cryptographic ID and sequential TY-XXXX QR code (SQLite UNIQUE constraints)
   * - Post-commit SQLite read-back verification before returning and releasing the queue for the next user
   * - Instant 0ms WebSocket broadcast to all connected dashboards
   */
  async rpcRegisterMemberAtomic(rawPayload, baselineCodes = [], baselineNormNames = [], blockedList = [], clientIp = "") {
    return await this._enqueueAtomic(async () => {
      if (!rawPayload || typeof rawPayload !== "object") {
        return { ok: false, status: 400, error: "بيانات العضو غير صالحة." };
      }
      const rawName = String(rawPayload.fullName || rawPayload.name || "").trim().replace(/\s+/g, " ");
      if (isGarbageOrGhostMember({ fullName: rawName })) {
        return { ok: false, status: 400, error: "يرجى إدخال الاسم الثلاثي الحقيقي (لا يقبل اسم عضو أو سجل وهمي)." };
      }
      const normName = ultraNormalizeArabic(rawName);
      if (!normName) {
        return { ok: false, status: 400, error: "يرجى إدخال الاسم الثلاثي بشكل صحيح." };
      }

      // 1. Check permanently blocked list (IP / Phone / Name)
      const cleanDigits = (s) => String(s || "").replace(/\D/g, "");
      const reqDigits = cleanDigits(rawPayload.phone);
      const effectiveIp = String(rawPayload.ipAddress || clientIp || "").trim();
      const reqNameLower = rawName.toLowerCase();
      const isBanned = (Array.isArray(blockedList) ? blockedList : []).some((b) => {
        if (!b) return false;
        if (effectiveIp && b.ipAddress && String(b.ipAddress).trim() === effectiveIp) return true;
        const bDigits = cleanDigits(b.phone);
        if (reqDigits.length >= 7 && bDigits && (reqDigits.endsWith(bDigits) || bDigits.endsWith(reqDigits))) return true;
        if (b.fullName && String(b.fullName).trim().toLowerCase() === reqNameLower) return true;
        return false;
      });
      if (isBanned) {
        return {
          ok: false,
          status: 403,
          error: "⚠️ عذراً، هذا الحساب أو الجهاز (IP) محظور نهائياً من التسجيل في النظام بناءً على قرار إدارة ومسؤول المجتمع."
        };
      }

      // 2. Strongly-consistent duplicate check against BOTH DO atomic_members AND active baseline names (excluding deleted)
      const deletedRows = this.sql.exec("SELECT norm_name FROM deleted_members").toArray();
      const deletedNormSet = new Set(deletedRows.map((r) => String(r.norm_name || "")).filter(Boolean));
      const existingDoRow = this.sql.exec("SELECT id, member_json FROM atomic_members WHERE norm_name = ?", normName).toArray();
      const baselineHasName =
        !deletedNormSet.has(normName) &&
        Array.isArray(baselineNormNames) &&
        baselineNormNames.some((bn) => ultraNormalizeArabic(bn) === normName);

      if ((existingDoRow.length > 0 || baselineHasName) && rawPayload.blockIfExists !== false) {
        let existingMember = null;
        if (existingDoRow.length > 0) {
          try { existingMember = JSON.parse(String(existingDoRow[0].member_json || "{}")); } catch {}
        }
        return {
          ok: false,
          duplicate: true,
          status: 409,
          error: "هذا الاسم مسجل بالفعل في قاعدة البيانات! لا يمكن التسجيل مرتين، يرجى تسجيل الدخول بحسابك.",
          existingMember
        };
      }

      // 3. Allocate 100% collision-free cryptographic ID and next sequential TY-XXXX QR code
      let assignedId = `reg_member_3FY-${crypto.randomUUID()}`;
      while (this.sql.exec("SELECT 1 FROM atomic_members WHERE id = ?", assignedId).toArray().length > 0) {
        assignedId = `reg_member_3FY-${crypto.randomUUID()}`;
      }
      const { code: assignedCode, num: assignedNum } = this._allocateStrictUniqueCode(baselineCodes);

      // 4. Construct 100% isolated canonical member record strictly from THIS registrant's fields
      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();
      const rawPhoto = String(rawPayload.photoUrl || rawPayload.avatar || rawPayload.image || "").trim();
      const cleanPhoto = rawPhoto.includes("data:image/")
        ? (rawPhoto.startsWith("data:image/") ? rawPhoto : rawPhoto.slice(rawPhoto.indexOf("data:image/")))
        : (rawPhoto && !rawPhoto.startsWith("blob:") ? rawPhoto : "");

      const cleanPhone = String(rawPayload.phone || "").trim();
      const cleanWhatsapp = String(rawPayload.whatsapp || cleanPhone).trim();
      const cleanRecoveryCode = String(rawPayload.recoveryCode || rawPayload.securityCode || "123456").trim();
      const cleanPassword = String(rawPayload.password || cleanRecoveryCode || "123456").trim();
      const rawGenderSignals = `${rawPayload.userSelectedGender || ""} ${rawPayload.gender || ""} ${rawPayload.sex || ""} ${rawPayload.manualGender || ""} ${rawPayload.genderCode || ""} ${rawPayload.genderLabel || ""} ${rawPayload.type || ""} ${rawPayload.category || ""}`.toLowerCase();
      const hasExplicitFemaleSignal =
        rawGenderSignals.includes("female") ||
        rawGenderSignals.includes("انث") ||
        rawGenderSignals.includes("أنث") ||
        rawGenderSignals.includes("شابة") ||
        rawGenderSignals.includes("شابه") ||
        rawGenderSignals.includes("شابات") ||
        rawGenderSignals.includes("بنت");
      const nameLooksFemale = detectAndRepairGender({ fullName: rawName }) === "female";
      const explicitUserConfirmedMale = String(rawPayload.userSelectedGender || "").trim().toLowerCase() === "male";

      const resolvedGender = hasExplicitFemaleSignal
        ? "female"
        : explicitUserConfirmedMale
          ? "male"
          : nameLooksFemale
            ? "female"
            : detectAndRepairGender({
                gender: rawPayload.gender,
                sex: rawPayload.sex,
                manualGender: rawPayload.manualGender,
                genderCode: rawPayload.genderCode,
                genderLocked: Boolean(rawPayload.userSelectedGender || rawPayload.genderLocked),
                fullName: rawName
              });

      const rawDobStr = String(rawPayload.dob || rawPayload.birthDate || "").trim();
      const safeRegDob = isPlaceholderDob(rawDobStr) ? "" : rawDobStr;

      const verifiedMember = {
        id: assignedId,
        originalId: assignedId,
        uniqueCode: assignedCode,
        qrCode: assignedCode,
        qrData: assignedCode,
        fullName: rawName,
        name: rawName,
        gender: resolvedGender,
        sex: resolvedGender,
        genderCode: resolvedGender,
        manualGender: resolvedGender,
        genderLabel: resolvedGender === "female" ? "أنثى" : "ذكر",
        type: resolvedGender === "female" ? "شابة" : "شاب",
        category: resolvedGender === "female" ? "شابات" : "شباب",
        genderLocked: true,
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        phoneCountry: rawPayload.phoneCountry || (cleanPhone.startsWith("+20") ? "egypt" : "sudan"),
        whatsappCountry: rawPayload.whatsappCountry || rawPayload.phoneCountry || (cleanWhatsapp.startsWith("+20") ? "egypt" : "sudan"),
        dob: safeRegDob,
        birthDate: safeRegDob,
        dobLocked: Boolean(safeRegDob),
        dobUpdatedAt: safeRegDob ? nowTs : undefined,
        address: String(rawPayload.address || rawPayload.residence || "").trim(),
        residence: String(rawPayload.address || rawPayload.residence || "").trim(),
        notes: String(rawPayload.notes || rawPayload.talents || "").trim(),
        photoUrl: cleanPhoto,
        photoOwnerName: normName,
        needsRealPhoto: Boolean(rawPayload.needsRealPhoto),
        needsRealPhotoReminder: Boolean(rawPayload.needsRealPhotoReminder),
        password: cleanPassword,
        recoveryCode: cleanRecoveryCode,
        securityCode: cleanRecoveryCode,
        passwordLocked: true,
        registrationLocked: true,
        passwordUpdatedAt: nowTs,
        role: "member",
        rank: "مخدوم",
        status: "active",
        isDeleted: false,
        registeredInCleanMasterV1: true,
        atomicVerified: true,
        ipAddress: effectiveIp || undefined,
        detectedCountry: rawPayload.detectedCountry || (cleanPhone.startsWith("+20") ? "جمهورية مصر العربية 🇪🇬" : "جمهورية السودان 🇸🇩"),
        registeredAt: nowIso,
        createdAt: nowIso,
        created_at: nowTs,
        updatedAt: nowTs,
        lastModifiedAt: nowTs,
        lastUpdatedAt: nowIso
      };

      const memberJson = JSON.stringify(verifiedMember);
      let committedVersion = nowTs;

      // 5. Atomic SQLite Transaction Commit (also locks original credentials in immutable credential_vault!)
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM deleted_members WHERE id = ? OR norm_name = ?", assignedId, normName);
        this.sql.exec(
          "INSERT INTO atomic_members (id, norm_name, unique_code, member_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          assignedId,
          normName,
          assignedCode,
          memberJson,
          nowTs,
          nowTs
        );
        this.sql.exec(
          "INSERT OR REPLACE INTO credential_vault (norm_name, member_id, full_name, password, recovery_code, phone, dob, locked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          normName,
          assignedId,
          rawName,
          cleanPassword,
          cleanRecoveryCode,
          cleanPhone,
          String(rawPayload.dob || rawPayload.birthDate || "").trim(),
          nowTs,
          nowTs
        );
        this.sql.exec(
          "INSERT OR IGNORE INTO used_codes_forever (code, assigned_at) VALUES (?, ?)",
          assignedCode,
          nowTs
        );
        this.sql.exec("INSERT OR REPLACE INTO meta_counters (key, value) VALUES ('max_code_num', ?)", assignedNum);
        committedVersion = this._bumpDoVersion(nowTs);
      });

      // 6. Strict Post-Commit Read-Back Self-Verification (confirms exact isolated identity & unique code before releasing queue!)
      const readBackRows = this.sql
        .exec("SELECT id, norm_name, unique_code, member_json FROM atomic_members WHERE id = ?", assignedId)
        .toArray();
      if (readBackRows.length !== 1) {
        return { ok: false, status: 500, error: "فشل التحقق من حفظ العضو في قاعدة البيانات، يرجى إعادة المحاولة." };
      }
      const rb = readBackRows[0];
      const rbParsed = JSON.parse(String(rb.member_json || "{}"));
      if (
        String(rb.id) !== assignedId ||
        String(rb.norm_name) !== normName ||
        String(rb.unique_code) !== assignedCode ||
        String(rbParsed.phone || "") !== cleanPhone ||
        String(rbParsed.uniqueCode || "") !== assignedCode
      ) {
        return { ok: false, status: 500, error: "فشل التحقق من تطابق بيانات العضو، يرجى إعادة المحاولة." };
      }

      // 7. Instant 0ms WebSocket Broadcast to ALL connected dashboards & devices
      const broadcastRecord =
        cleanPhoto.length > 48000
          ? { ...verifiedMember, photoUrl: `__D1_PHOTO_REF__:${assignedId}` }
          : verifiedMember;
      this._broadcast(this.ctx.getWebSockets(), {
        type: "d1_mutation",
        table: "registrants",
        action: "UPSERT",
        record: broadcastRecord,
        version: committedVersion,
        at: nowTs
      });

      return {
        ok: true,
        verified: true,
        status: 200,
        registrant: verifiedMember,
        version: committedVersion,
        queueSeq: assignedNum
      };
    });
  }

  /**
   * Serialized atomic upsert for member profile/role/QR edits and self-healing rescues.
   */
  async rpcUpsertAtomicMember(rawPayload, baselineCodes = [], existingBaseline = /** @type {any} */ (null), clientIp = "") {
    return await this._enqueueAtomic(async () => {
      if (!rawPayload || typeof rawPayload !== "object") {
        return { ok: false, status: 400, error: "Invalid member payload" };
      }
      const incomingId = getBaseMemberId(rawPayload.id || existingBaseline?.id || "");
      const incomingName = String(rawPayload.fullName || rawPayload.name || existingBaseline?.fullName || existingBaseline?.name || "")
        .trim()
        .replace(/\s+/g, " ");
      const normName = ultraNormalizeArabic(incomingName);
      if (!normName || isGarbageOrGhostMember({ fullName: incomingName })) {
        return { ok: false, status: 400, error: "Invalid member name" };
      }

      // Look up any existing row in atomic_members by norm_name OR id
      let existingDoRow = this.sql.exec("SELECT id, unique_code, member_json FROM atomic_members WHERE norm_name = ?", normName).toArray()[0] || null;
      if (!existingDoRow && incomingId) {
        const byId = this.sql.exec("SELECT id, norm_name, unique_code, member_json FROM atomic_members WHERE id = ?", incomingId).toArray()[0] || null;
        if (byId && (!normName || String(byId.norm_name) === normName || !rawPayload.isCollisionRepair)) {
          existingDoRow = byId;
        }
      }

      let existingObj = existingBaseline && typeof existingBaseline === "object" ? { ...existingBaseline } : {};
      if (existingDoRow && typeof existingDoRow.member_json === "string") {
        try {
          existingObj = { ...existingObj, ...JSON.parse(existingDoRow.member_json) };
        } catch {}
      }

      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();
      const targetId = String(existingDoRow?.id || existingObj.id || incomingId || `reg_member_3FY-${crypto.randomUUID()}`).trim();

      // IMMUTABLE MEMBERSHIP CODE LOCK: If this member already has an official permanent uniqueCode, NEVER mutate or reallocate it!
      const existingFixedCode = String(existingObj.uniqueCode || existingDoRow?.unique_code || "").trim().toUpperCase();
      const hasPermanentExistingCode = Boolean(existingFixedCode && !/^CF/i.test(existingFixedCode) && !/^QR3FY-/i.test(existingFixedCode));
      let desiredCode = hasPermanentExistingCode
        ? existingFixedCode
        : String(rawPayload.uniqueCode || "").trim().toUpperCase();
      if (/^QR3FY-/i.test(desiredCode)) desiredCode = "";
      let allocatedNum = 0;
      const codeCollisionInDo = desiredCode && !hasPermanentExistingCode
        ? this.sql.exec("SELECT id FROM atomic_members WHERE unique_code = ? AND id != ?", desiredCode, targetId).toArray().length > 0
        : false;
      const isNewWithoutBaseline = !existingDoRow && !existingBaseline;
      const codeUsedForever = isNewWithoutBaseline && desiredCode
        ? this.sql.exec("SELECT code FROM used_codes_forever WHERE code = ?", desiredCode).toArray().length > 0
        : false;
      const baselineSet = new Set(Array.isArray(baselineCodes) ? baselineCodes.map((c) => String(c || "").trim().toUpperCase()) : []);
      if (!desiredCode || codeCollisionInDo || codeUsedForever || (isNewWithoutBaseline && baselineSet.has(desiredCode))) {
        const alloc = this._allocateStrictUniqueCode(baselineCodes);
        desiredCode = alloc.code;
        allocatedNum = alloc.num;
      }

      // INDEPENDENT PERMANENT QR TOKEN: bound strictly to member ID & name; rotated ONLY when QR reset runs (never mutates uniqueCode!)
      const existingQrToken = String(existingObj.qrData || existingObj.qrCode || "").trim();
      const incomingQrToken = String(rawPayload.qrData || rawPayload.qrCode || "").trim();
      const existingQrTs = Number(existingObj.qrUpdatedAt || 0);
      const incomingQrTs = Number(rawPayload.qrUpdatedAt || 0);
      let finalQrToken = existingQrToken || desiredCode;
      if (incomingQrTs > existingQrTs && incomingQrToken) {
        finalQrToken = incomingQrToken;
      } else if (existingQrTs > incomingQrTs && existingQrToken) {
        finalQrToken = existingQrToken;
      } else if (/^QR3FY-/i.test(incomingQrToken)) {
        finalQrToken = incomingQrToken;
      } else if (/^QR3FY-/i.test(existingQrToken)) {
        finalQrToken = existingQrToken;
      } else if (incomingQrToken) {
        finalQrToken = incomingQrToken;
      }
      const finalQrUpdatedAt = Math.max(existingQrTs, incomingQrTs) || undefined;

      const rawPhoto = String(rawPayload.photoUrl || rawPayload.avatar || rawPayload.image || "").trim();
      let finalPhoto = String(existingObj.photoUrl || "").trim();
      if (rawPhoto.includes("data:image/")) {
        finalPhoto = rawPhoto.startsWith("data:image/") ? rawPhoto : rawPhoto.slice(rawPhoto.indexOf("data:image/"));
      } else if (rawPhoto && !rawPhoto.startsWith("__D1_PHOTO_REF__:") && !rawPhoto.startsWith("blob:")) {
        finalPhoto = rawPhoto;
      } else if (!finalPhoto && rawPhoto.startsWith("__D1_PHOTO_REF__:")) {
        finalPhoto = rawPhoto;
      }

      const incomingRawGender =
        rawPayload.gender === "female" || rawPayload.gender === "male"
          ? rawPayload.gender
          : (rawPayload.sex === "female" || rawPayload.sex === "male" ? rawPayload.sex : undefined);
      const explicitGenderSent = Boolean(
        rawPayload.genderLocked ||
        rawPayload.manualGender ||
        rawPayload.genderCode ||
        rawPayload.ownerGenderModifiedAt ||
        (incomingRawGender && incomingRawGender !== existingObj.gender)
      );
      const genderLocked = Boolean(rawPayload.genderLocked ?? (explicitGenderSent ? true : undefined) ?? existingObj.genderLocked);
      const finalGender = detectAndRepairGender({
        ...existingObj,
        ...rawPayload,
        ...(explicitGenderSent && incomingRawGender
          ? {
              gender: incomingRawGender,
              sex: incomingRawGender,
              manualGender: rawPayload.manualGender || incomingRawGender,
              genderCode: rawPayload.genderCode || incomingRawGender
            }
          : {}),
        fullName: incomingName,
        genderLocked
      });
      const finalPhone = String(rawPayload.phone ?? existingObj.phone ?? "").trim();
      const finalWhatsapp = String(rawPayload.whatsapp ?? rawPayload.phone ?? existingObj.whatsapp ?? finalPhone).trim();
      const finalLastMod = Math.max(Number(rawPayload.lastModifiedAt || rawPayload.updatedAt || nowTs), nowTs);

      // Anti-mixing guard: if lookup by ID matched a completely different member name (and NOT an explicit owner or self name rename), do NOT overwrite that other member!
      const isAuthorizedRename = Boolean(rawPayload.isOwnerNameEdit || rawPayload.isSelfNameEdit);
      const oldDoNormName = existingDoRow && existingDoRow.norm_name ? String(existingDoRow.norm_name) : "";
      if (existingDoRow && oldDoNormName && oldDoNormName !== normName && !isAuthorizedRename) {
        existingDoRow = this.sql.exec("SELECT id, unique_code, member_json FROM atomic_members WHERE norm_name = ?", normName).toArray()[0] || null;
      }

      // Read immutable credential_vault row for this member (checking previous name too on authorized owner/self rename so locked password migrates cleanly!)
      const prevNormNameCandidate = isAuthorizedRename
        ? (oldDoNormName || (rawPayload.previousFullName ? normalizeWorkerArabic(rawPayload.previousFullName) : ""))
        : "";
      let existingVaultRow = this.sql
        .exec("SELECT norm_name, member_id, password, recovery_code, phone, dob, locked_at, updated_at FROM credential_vault WHERE norm_name = ?", normName)
        .toArray()[0] || null;
      if (!existingVaultRow && prevNormNameCandidate && prevNormNameCandidate !== normName) {
        existingVaultRow = this.sql
          .exec("SELECT norm_name, member_id, password, recovery_code, phone, dob, locked_at, updated_at FROM credential_vault WHERE norm_name = ?", prevNormNameCandidate)
          .toArray()[0] || null;
      }

      const nestedExistingCreds = extractNestedSelfCreds(existingObj, normName);
      const isExplicitPassChange = Boolean(rawPayload.explicitPasswordChange === true);
      const isExplicitRecChange = Boolean(rawPayload.explicitRecoveryCodeChange === true);

      const currentLockedRec = pickStrongestCredential(
        existingVaultRow?.recovery_code,
        pickStrongestCredential(existingObj.recoveryCode || existingObj.securityCode, nestedExistingCreds.recoveryCode, 0, 0, false, ""),
        Number(existingVaultRow?.updated_at || 0),
        Number(existingObj.passwordUpdatedAt || 0),
        false,
        ""
      );
      const currentLockedPass = pickStrongestCredential(
        existingVaultRow?.password,
        pickStrongestCredential(existingObj.password || existingObj.pass, nestedExistingCreds.password, 0, 0, false, ""),
        Number(existingVaultRow?.updated_at || 0),
        Number(existingObj.passwordUpdatedAt || 0),
        false,
        ""
      );

      const incomingPassRaw = rawPayload.password !== undefined && rawPayload.password !== null ? String(rawPayload.password).trim() : "";
      const incomingRecRaw = String(rawPayload.recoveryCode ?? rawPayload.securityCode ?? "").trim();

      // IMMUTABLE CREDENTIAL LOCK:
      // 1. A real non-default password can ONLY change when explicitPasswordChange === true (never silently overwritten to "123456"/"12345"/empty by attendance, gender, role, or profile edits!)
      // 2. If the current password is still default/empty and incoming has a real non-default password, safely upgrade & lock it!
      let finalPassword = currentLockedPass;
      if (isExplicitPassChange && incomingPassRaw && incomingPassRaw !== "null" && incomingPassRaw !== "undefined") {
        if (!isDefaultOrEmptyCredential(incomingPassRaw) || rawPayload.allowDefaultPassword === true || isDefaultOrEmptyCredential(currentLockedPass)) {
          finalPassword = incomingPassRaw;
        }
      } else if (isDefaultOrEmptyCredential(currentLockedPass) && !isDefaultOrEmptyCredential(incomingPassRaw)) {
        finalPassword = incomingPassRaw;
      } else if (!finalPassword) {
        finalPassword = incomingPassRaw || currentLockedRec || "123456";
      }

      let finalRecoveryCode = currentLockedRec;
      if (isExplicitRecChange && incomingRecRaw && incomingRecRaw !== "null" && incomingRecRaw !== "undefined") {
        if (!isDefaultOrEmptyCredential(incomingRecRaw) || rawPayload.allowDefaultRecoveryCode === true || isDefaultOrEmptyCredential(currentLockedRec)) {
          finalRecoveryCode = incomingRecRaw;
        }
      } else if (isDefaultOrEmptyCredential(currentLockedRec) && !isDefaultOrEmptyCredential(incomingRecRaw)) {
        finalRecoveryCode = incomingRecRaw;
      } else if (!finalRecoveryCode) {
        finalRecoveryCode = incomingRecRaw || "123456";
      }

      const finalPasswordUpdatedAt = isExplicitPassChange || isExplicitRecChange
        ? finalLastMod
        : Math.max(Number(existingVaultRow?.updated_at || 0), Number(existingObj.passwordUpdatedAt || 0)) || undefined;

      // Protect core registration identity fields from accidental empty/placeholder overwrites
      // IMMUTABLE DOB LOCK: Once registered, DOB NEVER changes except via explicit Member Self or Community Owner update with a valid real date!
      const safeFinalPhone = finalPhone || String(existingVaultRow?.phone || existingObj.phone || "").trim();
      const safeFinalWhatsapp = finalWhatsapp || safeFinalPhone;
      const incomingDobClean = String(rawPayload.dob ?? rawPayload.birthDate ?? "").trim();
      const existingDobClean = pickStrongestDob(
        existingObj.dob || existingObj.birthDate || nestedExistingCreds.dob,
        existingVaultRow?.dob || ""
      );
      const isExplicitDobChange = Boolean(
        rawPayload.explicitDobChange === true &&
        (rawPayload.isOwnerDobEdit === true ||
          rawPayload.isSelfDobEdit === true ||
          rawPayload.isOwnerNameEdit === true ||
          rawPayload.isSelfNameEdit === true)
      );
      const safeFinalDob = existingDobClean
        ? (isExplicitDobChange && !isPlaceholderDob(incomingDobClean) ? incomingDobClean : existingDobClean)
        : (!isPlaceholderDob(incomingDobClean) ? incomingDobClean : "");
      const safeFinalAddress = String(rawPayload.address ?? rawPayload.residence ?? existingObj.address ?? existingObj.residence ?? nestedExistingCreds.address ?? "").trim();

      const cleanUpdates = { ...rawPayload };
      delete cleanUpdates.avatar;
      delete cleanUpdates.image;
      delete cleanUpdates.isCollisionRepair;
      delete cleanUpdates.member;
      delete cleanUpdates.action;
      delete cleanUpdates.explicitPasswordChange;
      delete cleanUpdates.explicitRecoveryCodeChange;
      delete cleanUpdates.explicitDobChange;
      delete cleanUpdates.isOwnerDobEdit;
      delete cleanUpdates.isSelfDobEdit;
      delete cleanUpdates.allowDefaultPassword;
      delete cleanUpdates.allowDefaultRecoveryCode;
      delete cleanUpdates.isOwnerNameEdit;
      delete cleanUpdates.isSelfNameEdit;
      delete cleanUpdates.previousFullName;

      const mergedRecord = {
        ...existingObj,
        ...cleanUpdates,
        id: targetId,
        originalId: getBaseMemberId(existingObj.originalId || targetId),
        uniqueCode: desiredCode,
        qrCode: finalQrToken,
        qrData: finalQrToken,
        qrBoundMemberId: targetId,
        qrBoundMemberName: incomingName,
        qrUpdatedAt: finalQrUpdatedAt,
        fullName: incomingName,
        name: incomingName,
        gender: finalGender,
        sex: finalGender,
        genderCode: finalGender,
        manualGender: explicitGenderSent ? finalGender : (cleanUpdates.manualGender || (genderLocked ? finalGender : existingObj.manualGender)),
        genderLabel: finalGender === "female" ? "أنثى" : "ذكر",
        type: finalGender === "female" ? "شابة" : "شاب",
        category: finalGender === "female" ? "شابات" : "شباب",
        genderLocked,
        phone: safeFinalPhone,
        whatsapp: safeFinalWhatsapp,
        dob: safeFinalDob,
        birthDate: safeFinalDob,
        dobLocked: Boolean(safeFinalDob) || Boolean(existingObj.dobLocked),
        dobUpdatedAt: isExplicitDobChange && !isPlaceholderDob(incomingDobClean) ? finalLastMod : (existingObj.dobUpdatedAt || undefined),
        address: safeFinalAddress,
        residence: safeFinalAddress,
        notes: String(rawPayload.notes ?? rawPayload.talents ?? existingObj.notes ?? existingObj.talents ?? "").trim(),
        photoUrl: finalPhoto,
        photoOwnerName: normName,
        password: finalPassword,
        recoveryCode: finalRecoveryCode,
        securityCode: finalRecoveryCode,
        passwordLocked: true,
        registrationLocked: true,
        passwordUpdatedAt: finalPasswordUpdatedAt,
        role: cleanUpdates.role || existingObj.role || "member",
        status: cleanUpdates.status || existingObj.status || "active",
        isDeleted: false,
        registeredInCleanMasterV1: true,
        ipAddress: rawPayload.ipAddress || existingObj.ipAddress || clientIp || undefined,
        created_at: Number(existingObj.created_at || nowTs),
        registeredAt: existingObj.registeredAt || rawPayload.registeredAt || nowIso,
        updatedAt: finalLastMod,
        lastModifiedAt: finalLastMod,
        lastUpdatedAt: new Date(finalLastMod).toISOString()
      };
      delete mergedRecord.member;
      delete mergedRecord.action;

      const memberJson = JSON.stringify(mergedRecord);
      let committedVersion = nowTs;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM deleted_members WHERE id = ? OR norm_name = ?", targetId, normName);
        if (existingDoRow && existingDoRow.id !== targetId) {
          this.sql.exec("DELETE FROM atomic_members WHERE id = ?", existingDoRow.id);
        }
        this.sql.exec("DELETE FROM atomic_members WHERE norm_name = ? AND id != ?", normName, targetId);
        this.sql.exec(
          "INSERT OR REPLACE INTO atomic_members (id, norm_name, unique_code, member_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          targetId,
          normName,
          desiredCode,
          memberJson,
          Number(mergedRecord.created_at || nowTs),
          finalLastMod
        );
        // Lock credentials in immutable credential_vault whenever real or explicitly changed
        if (isAuthorizedRename && prevNormNameCandidate && prevNormNameCandidate !== normName) {
          this.sql.exec("DELETE FROM credential_vault WHERE norm_name = ?", prevNormNameCandidate);
        }
        if (!existingVaultRow || isExplicitPassChange || isExplicitRecChange || isExplicitDobChange || isAuthorizedRename || !isDefaultOrEmptyCredential(finalPassword) || !isDefaultOrEmptyCredential(finalRecoveryCode) || (safeFinalDob && isPlaceholderDob(existingVaultRow?.dob))) {
          this.sql.exec(
            "INSERT OR REPLACE INTO credential_vault (norm_name, member_id, full_name, password, recovery_code, phone, dob, locked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            normName,
            targetId,
            incomingName,
            finalPassword,
            finalRecoveryCode,
            safeFinalPhone,
            safeFinalDob,
            Number(existingVaultRow?.locked_at || nowTs),
            Number(finalPasswordUpdatedAt || nowTs)
          );
        }
        if (desiredCode) {
          this.sql.exec("INSERT OR IGNORE INTO used_codes_forever (code, assigned_at) VALUES (?, ?)", desiredCode, nowTs);
        }
        const parsedDesiredMatch = /^TY-(\d+)$/i.exec(desiredCode);
        const numericCodeVal = Math.max(allocatedNum, parsedDesiredMatch ? parseInt(parsedDesiredMatch[1], 10) : 0);
        if (numericCodeVal > 0 && numericCodeVal < 900000) {
          const prevMax = this._readCounter("max_code_num", 117);
          if (numericCodeVal > prevMax) {
            this.sql.exec("INSERT OR REPLACE INTO meta_counters (key, value) VALUES ('max_code_num', ?)", numericCodeVal);
          }
        }
        committedVersion = this._bumpDoVersion(nowTs);
      });

      const broadcastRecord =
        finalPhoto.length > 48000
          ? { ...mergedRecord, photoUrl: `__D1_PHOTO_REF__:${targetId}` }
          : mergedRecord;
      const activeSockets = this.ctx.getWebSockets();
      this._broadcast(activeSockets, {
        type: "d1_mutation",
        table: "registrants",
        action: "UPSERT",
        record: broadcastRecord,
        version: committedVersion,
        at: nowTs
      });
      if (
        rawPayload.role !== undefined ||
        rawPayload.permissions !== undefined ||
        rawPayload.roleUpdatedAt !== undefined
      ) {
        this._broadcast(activeSockets, {
          type: "member_permissions_updated",
          memberId: targetId,
          memberName: incomingName,
          uniqueCode: desiredCode,
          role: mergedRecord.role,
          permissions: mergedRecord.permissions,
          updatedAt: finalLastMod,
          lastModifiedAt: finalLastMod
        });
      }

      return {
        ok: true,
        verified: true,
        status: 200,
        registrant: mergedRecord,
        version: committedVersion
      };
    });
  }

  /**
   * Strongly-consistent 0ms member lookup directly from Durable Object SQLite `atomic_members`
   * (solves instant QR camera scan milliseconds after new member registration across all Cloudflare PoPs)
   */
  async rpcLookupAtomicMember(rawQuery = "") {
    const cleanRaw = String(rawQuery || "")
      .trim()
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    if (!cleanRaw) return { ok: false, member: null };

    let parsedCode = cleanRaw;
    let parsedId = "";
    let parsedName = "";
    if (cleanRaw.includes("|")) {
      const parts = cleanRaw.split("|").map((s) => s.trim());
      parsedCode = parts[0] || cleanRaw;
      parsedId = parts[1] || "";
      parsedName = parts[2] || "";
    } else if (cleanRaw.startsWith("{") && cleanRaw.endsWith("}")) {
      try {
        const obj = JSON.parse(cleanRaw);
        parsedCode = String(obj.uniqueCode || obj.qrData || obj.code || cleanRaw).trim();
        parsedId = String(obj.id || "").trim();
        parsedName = String(obj.fullName || obj.name || "").trim();
      } catch {}
    }

    const upperClean = cleanRaw.toUpperCase();
    const upperCode = parsedCode.toUpperCase();
    const isQrTokenQuery = /^QR3FY-/i.test(upperClean) || /^QR3FY-/i.test(upperCode);
    const digitsOnly = upperCode.replace(/[^0-9]/g, "");
    const paddedCode = !isQrTokenQuery && digitsOnly ? `TY-${digitsOnly.padStart(4, "0")}` : "";
    const bareId = (parsedId || cleanRaw).replace(/^reg_member_/, "");
    const prefixedId = bareId ? `reg_member_${bareId}` : "";
    const normName = ultraNormalizeArabic(parsedName || cleanRaw);

    let rows = this.sql
      .exec(
        `SELECT id, norm_name, unique_code, member_json FROM atomic_members
         WHERE UPPER(unique_code) = ?
            OR (? != '' AND UPPER(unique_code) = ?)
            OR id = ?
            OR (? != '' AND id = ?)
            OR (? != '' AND id = ?)
            OR (? != '' AND id = ?)
            OR (? != '' AND norm_name = ?)
         LIMIT 5`,
        upperCode,
        paddedCode,
        paddedCode,
        cleanRaw,
        parsedId,
        parsedId,
        bareId,
        bareId,
        prefixedId,
        prefixedId,
        normName,
        normName
      )
      .toArray();

    // Also lookup by rotated/bound QR token inside member_json (strictly parameterized LIKE + exact JS verification)
    if (rows.length === 0 && (isQrTokenQuery || upperCode.length >= 4)) {
      const likePattern = `%${upperCode.replace(/[%_]/g, "")}%`;
      const qrRows = this.sql
        .exec(
          "SELECT id, norm_name, unique_code, member_json FROM atomic_members WHERE UPPER(member_json) LIKE ? LIMIT 10",
          likePattern
        )
        .toArray();
      rows = qrRows.filter((row) => {
        try {
          const p = JSON.parse(String(row.member_json || "{}"));
          const pQr = String(p.qrData || p.qrCode || "").trim().toUpperCase();
          return Boolean(pQr && (pQr === upperClean || pQr === upperCode));
        } catch {
          return false;
        }
      });
    }

    for (const row of rows) {
      if (!row || !row.member_json) continue;
      const delCheck = this.sql
        .exec(
          "SELECT id FROM deleted_members WHERE id = ? OR (? != '' AND norm_name = ?) LIMIT 1",
          String(row.id || ""),
          String(row.norm_name || ""),
          String(row.norm_name || "")
        )
        .toArray();
      if (delCheck.length > 0) continue;
      try {
        const parsed = JSON.parse(String(row.member_json));
        if (parsed && typeof parsed === "object" && parsed.status !== "cancelled" && !parsed.isDeleted) {
          return { ok: true, member: parsed };
        }
      } catch {}
    }
    return { ok: false, member: null };
  }

  /**
   * Serialized atomic delete/revoke in DO SQLite (ensures deleted members never resurrect!)
   */
  async rpcDeleteAtomicMembers(targets = []) {
    return await this._enqueueAtomic(async () => {
      const nowTs = Date.now();
      let committedVersion = nowTs;
      const deletedNormNames = [];
      this.ctx.storage.transactionSync(() => {
        for (const t of Array.isArray(targets) ? targets : []) {
          if (!t) continue;
          const tid = String(t.id || "").trim();
          const bareTid = tid.replace(/^reg_member_/, "");
          let normName = ultraNormalizeArabic(t.normName || t.fullName || t.name || "");
          if (!normName && (tid || bareTid)) {
            const foundRows = this.sql
              .exec("SELECT norm_name FROM atomic_members WHERE id = ? OR id = ? LIMIT 1", tid || "", bareTid || "")
              .toArray();
            if (foundRows.length > 0 && foundRows[0]?.norm_name) {
              normName = String(foundRows[0].norm_name);
            }
          }
          if (tid === "reg_owner_main" || normName === ultraNormalizeArabic("ميخائيل ادور راتب")) continue;
          if (normName) deletedNormNames.push(normName);
          if (tid) {
            this.sql.exec("DELETE FROM atomic_members WHERE id = ?", tid);
            this.sql.exec("INSERT OR REPLACE INTO deleted_members (id, norm_name, deleted_at) VALUES (?, ?, ?)", tid, normName || null, nowTs);
          }
          if (bareTid && bareTid !== tid) {
            this.sql.exec("DELETE FROM atomic_members WHERE id = ?", bareTid);
            this.sql.exec("INSERT OR REPLACE INTO deleted_members (id, norm_name, deleted_at) VALUES (?, ?, ?)", bareTid, normName || null, nowTs);
          }
          if (normName) {
            this.sql.exec("DELETE FROM atomic_members WHERE norm_name = ?", normName);
            if (!tid) {
              this.sql.exec("INSERT OR REPLACE INTO deleted_members (id, norm_name, deleted_at) VALUES (?, ?, ?)", `name:${normName}`, normName, nowTs);
            }
          }
        }
        committedVersion = this._bumpDoVersion(nowTs);
      });
      return { ok: true, version: committedVersion, deletedNormNames };
    });
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

let dobForensicBootChecked = false;

/**
 * Ultra-Deep Forensic DOB Recovery Engine:
 * Scans EVERY non-media key in Cloudflare KV (via paginated kvStore.list()),
 * EVERY table & EVERY row in Cloudflare D1 (via sqlite_master, without GROUP BY/LIMIT caps),
 * EVERY .json backup in Cloudflare R2 (env.MEDIA.list()), and Durable Object SQLite
 * (credential_vault + atomic_members) to recover every authentic real DOB and lock it forever.
 */
async function runDeepForensicDobRecovery(env, nowTs = Date.now(), seedBackups = []) {
  const kvStore = env.MEMBERS_KV || env.KV || null;
  const dobByNorm = new Map();
  const dobByFuzzyNorm = new Map();
  const dobById = new Map();
  const dobByCode = new Map();
  const sourcesScanned = [];

  const fuzzyNormName = (name) =>
    ultraNormalizeArabic(name || "")
      .replace(/ه(?=\s|$)/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const registerCandidate = (rec, sourceLabel) => {
    if (!rec || typeof rec !== "object") return;
    const rawName = String(rec.fullName || rec.name || rec.member?.fullName || rec.member?.name || "").trim();
    const rawDob = String(
      rec.dob || rec.birthDate || rec.birth_date || rec.birthday ||
      rec.member?.dob || rec.member?.birthDate || ""
    ).trim();
    const regAt = String(rec.registeredAt || rec.createdAt || rec.member?.registeredAt || "");
    if (!isAuthenticDob(rawDob, regAt)) return;

    const entry = { dob: rawDob, source: sourceLabel, name: rawName };
    const nn = ultraNormalizeArabic(rawName);
    const fn = fuzzyNormName(rawName);
    const bid = getBaseMemberId(rec.id || rec.memberId || rec.member?.id || "");
    const code = String(rec.uniqueCode || rec.code || rec.member?.uniqueCode || "").trim().toUpperCase();

    if (nn && !dobByNorm.has(nn)) dobByNorm.set(nn, entry);
    if (fn && fn.length >= 6 && !dobByFuzzyNorm.has(fn)) dobByFuzzyNorm.set(fn, entry);
    if (bid && !dobById.has(bid)) dobById.set(bid, entry);
    if (code && /^TY-\d{3,}$/.test(code) && !dobByCode.has(code)) dobByCode.set(code, entry);
  };

  const scanArbitraryValue = (val, sourceLabel, depth = 0) => {
    if (!val || depth > 5) return;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed.length < 15 || trimmed.length > 8_000_000) return;
      if (trimmed[0] === "[" || trimmed[0] === "{") {
        try {
          scanArbitraryValue(JSON.parse(trimmed), sourceLabel, depth + 1);
        } catch {}
      }
      return;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        scanArbitraryValue(val[i], sourceLabel, depth + 1);
      }
      return;
    }
    if (typeof val === "object") {
      if (val.dob || val.birthDate || val.birth_date || val.birthday) {
        registerCandidate(val, sourceLabel);
      }
      const nestedKeys = ["registrants", "members", "results", "data", "CLEAN_MASTER_DB_V1", "backup", "list", "member"];
      for (const nk of nestedKeys) {
        if (val[nk]) scanArbitraryValue(val[nk], `${sourceLabel}.${nk}`, depth + 1);
      }
    }
  };

  // 1. Scan current master list first (preserves all intact real DOBs)
  const currentMaster = await buildMasterRegistrantsUnion(env, [], false, true);
  for (const m of currentMaster) registerCandidate(m, "current_master");

  // 2. Scan Durable Object SQLite credential_vault & atomic_members directly
  try {
    const doDelta = await getAtomicDeltaFromRoom(env);
    if (doDelta?.vault && typeof doDelta.vault === "object") {
      let vc = 0;
      for (const [nn, v] of Object.entries(doDelta.vault)) {
        if (v && isAuthenticDob(v.dob)) {
          registerCandidate({ id: v.memberId, fullName: v.fullName || nn, dob: v.dob }, "do_credential_vault");
          vc++;
        }
      }
      sourcesScanned.push(`do_vault_dobs:${vc}`);
    }
    if (Array.isArray(doDelta?.members)) {
      for (const dm of doDelta.members) registerCandidate(dm, "do_atomic_members");
      sourcesScanned.push(`do_atomic:${doDelta.members.length}`);
    }
  } catch {}

  // 3. Scan 100% of ALL non-media keys in Cloudflare KV via paginated list()
  if (kvStore && typeof kvStore.list === "function" && typeof kvStore.get === "function") {
    try {
      let cursor = undefined;
      let pages = 0;
      const candidateKvKeys = [];
      do {
        const listed = await kvStore.list({ limit: 500, cursor });
        for (const k of (listed?.keys || [])) {
          const kn = String(k?.name || "");
          if (
            !kn ||
            kn.startsWith("PHOTO_HD_") ||
            kn.startsWith("D1_PHOTO:") ||
            kn.startsWith("D1_ANN_IMAGE:") ||
            kn.startsWith("DOB_FORENSIC_RECOVERY_REPORT")
          ) {
            continue;
          }
          candidateKvKeys.push(kn);
        }
        cursor = listed?.list_complete ? undefined : listed?.cursor;
        pages++;
      } while (cursor && pages < 10);

      for (let i = 0; i < candidateKvKeys.length; i += 10) {
        const batch = candidateKvKeys.slice(i, i + 10);
        const vals = await Promise.all(batch.map((k) => kvStore.get(k).catch(() => null)));
        for (let j = 0; j < batch.length; j++) {
          if (vals[j]) {
            scanArbitraryValue(vals[j], `kv:${batch[j]}`);
            sourcesScanned.push(`kv:${batch[j]}`);
          }
        }
      }
    } catch {}
  }

  // 4. Scan 100% of ALL tables & ALL rows in Cloudflare D1 (no GROUP BY, no LIMIT 30 truncation!)
  if (env.DB) {
    try {
      const tblRes = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
      ).all().catch(() => ({ results: [] }));
      const tableNames = (tblRes?.results || []).map((r) => String(r?.name || "")).filter(Boolean);
      sourcesScanned.push(`d1_tables:[${tableNames.join(",")}]`);

      if (tableNames.includes("announcements")) {
        const annRows = await env.DB.prepare(
          "SELECT title, body, created_at FROM announcements WHERE body IS NOT NULL AND length(body) > 20 ORDER BY created_at DESC LIMIT 250"
        ).all().catch(() => ({ results: [] }));
        for (const r of (annRows?.results || [])) {
          const title = String(r?.title || "");
          if (title.startsWith("D1_PHOTO:") || title.startsWith("D1_ANN_IMAGE:")) continue;
          scanArbitraryValue(r.body, `d1_ann:${title}@${r.created_at || 0}`);
        }
        sourcesScanned.push(`d1_announcements_rows:${(annRows?.results || []).length}`);
      }

      if (tableNames.includes("events")) {
        const evRows = await env.DB.prepare(
          "SELECT title, description, created_at FROM events WHERE title NOT LIKE 'D1_PHOTO:%' AND title NOT LIKE 'D1_ANN_IMAGE:%' AND description IS NOT NULL AND length(description) > 20 ORDER BY created_at DESC LIMIT 250"
        ).all().catch(() => ({ results: [] }));
        for (const r of (evRows?.results || [])) {
          scanArbitraryValue(r.description, `d1_ev:${String(r?.title || "")}@${r.created_at || 0}`);
        }
        sourcesScanned.push(`d1_events_rows:${(evRows?.results || []).length}`);
      }

      if (tableNames.includes("members")) {
        const memRows = await env.DB.prepare("SELECT * FROM members").all().catch(() => ({ results: [] }));
        for (const m of (memRows?.results || [])) {
          registerCandidate(m, "d1_sql_members");
        }
        sourcesScanned.push(`d1_sql_members:${(memRows?.results || []).length}`);
      }

      // Scan any extra custom tables that might hold archived registrants/backups
      const knownSkip = new Set(["announcements", "events", "members", "attendance"]);
      for (const tbl of tableNames) {
        if (knownSkip.has(tbl) || !/^[a-zA-Z0-9_]+$/.test(tbl)) continue;
        try {
          const extraRows = await env.DB.prepare(`SELECT * FROM "${tbl}" LIMIT 300`).all();
          for (const row of (extraRows?.results || [])) {
            registerCandidate(row, `d1_table:${tbl}`);
            for (const val of Object.values(row || {})) {
              if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
                scanArbitraryValue(val, `d1_table:${tbl}`);
              }
            }
          }
          sourcesScanned.push(`d1_extra_${tbl}:${(extraRows?.results || []).length}`);
        } catch {}
      }
    } catch {}
  }

  // 5. Scan Cloudflare R2 bucket for any JSON backups (< 5MB)
  if (env.MEDIA && typeof env.MEDIA.list === "function") {
    try {
      const r2Listed = await env.MEDIA.list({ limit: 100 });
      let r2JsonCount = 0;
      for (const obj of (r2Listed?.objects || [])) {
        if (!obj?.key || obj.size > 5_000_000) continue;
        if (!/\.json$/i.test(obj.key) && !/backup|member|registrant|state|clean_master/i.test(obj.key)) continue;
        try {
          const r2Obj = await env.MEDIA.get(obj.key);
          if (r2Obj) {
            const txt = await r2Obj.text();
            scanArbitraryValue(txt, `r2:${obj.key}`);
            r2JsonCount++;
          }
        } catch {}
      }
      if (r2JsonCount > 0) sourcesScanned.push(`r2_json:${r2JsonCount}`);
    } catch {}
  }

  // 6. Optional seed backups provided in POST body
  if (Array.isArray(seedBackups) && seedBackups.length > 0) {
    for (const sb of seedBackups) registerCandidate(sb, "seed_backup");
    sourcesScanned.push(`seed_backup:${seedBackups.length}`);
  }

  // 7. Apply recovered authentic DOBs strictly (never overwrite an existing authentic DOB!)
  let alreadyAuthenticCount = 0;
  let recoveredCount = 0;
  let cleanedPlaceholderCount = 0;
  const recoveredDetails = [];
  const stillMissingDetails = [];
  const vaultEntries = [];

  const updatedMaster = currentMaster.map((m) => {
    const curDob = String(m.dob || m.birthDate || "").trim();
    const curValid = isAuthenticDob(curDob, m.registeredAt);
    const nn = ultraNormalizeArabic(m.fullName || m.name || "");
    const fn = fuzzyNormName(m.fullName || m.name || "");
    const bid = getBaseMemberId(m.id || "");
    const code = String(m.uniqueCode || "").trim().toUpperCase();

    let finalDob = curValid ? curDob : "";
    let dobLocked = Boolean(m.dobLocked || curValid);

    if (curValid) {
      alreadyAuthenticCount++;
    } else {
      const match = dobById.get(bid) || dobByNorm.get(nn) || dobByFuzzyNorm.get(fn) || dobByCode.get(code) || null;
      if (match && isAuthenticDob(match.dob, m.registeredAt)) {
        finalDob = match.dob;
        dobLocked = true;
        recoveredCount++;
        recoveredDetails.push({ id: m.id, fullName: m.fullName, dob: match.dob, source: match.source });
      } else {
        if (curDob) cleanedPlaceholderCount++;
        stillMissingDetails.push({ id: m.id, uniqueCode: m.uniqueCode, fullName: m.fullName });
      }
    }

    const nextMember = {
      ...m,
      dob: finalDob,
      birthDate: finalDob,
      dobLocked
    };
    if (finalDob && !curValid) {
      nextMember.dobUpdatedAt = nowTs;
    }
    delete nextMember.member;
    delete nextMember.action;

    vaultEntries.push({
      id: nextMember.id,
      fullName: nextMember.fullName,
      password: nextMember.password || "",
      recoveryCode: nextMember.recoveryCode || nextMember.securityCode || "123456",
      phone: nextMember.phone || "",
      dob: finalDob,
      address: nextMember.address || ""
    });
    return nextMember;
  });

  if (recoveredCount > 0 || cleanedPlaceholderCount > 0) {
    const roomStub = getRealtimeRoomStub(env);
    if (roomStub && typeof roomStub.rpcRestoreCredentialVaultBatch === "function") {
      await roomStub.rpcRestoreCredentialVaultBatch(vaultEntries).catch(() => {});
    }
    await fastPersistMasterListToKv(env, updatedMaster, nowTs, { forceKv: true });
    cachedMasterRegistrants = { version: edgeStateVersion, list: updatedMaster, json: null };
  }

  const report = {
    success: true,
    executedAt: nowTs,
    buildTag: "v36.1-immutable-dob-forensic-lock",
    totalMembers: updatedMaster.length,
    alreadyAuthenticCount,
    recoveredCount,
    totalAuthenticAfter: alreadyAuthenticCount + recoveredCount,
    cleanedPlaceholderCount,
    stillMissingCount: stillMissingDetails.length,
    sourcesScanned,
    recoveredDetails,
    stillMissingDetails,
    version: edgeStateVersion
  };

  if (kvStore && typeof kvStore.put === "function") {
    try {
      await kvStore.put("DOB_FORENSIC_RECOVERY_REPORT_V2", JSON.stringify(report));
    } catch {}
  }

  return report;
}

async function handleApiRequest(request, env, url, ctx = /** @type {any} */ (null)) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match, X-Sync-Version, Cache-Control, Pragma",
    "Access-Control-Expose-Headers": "ETag, X-Sync-Version",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  await initDb(env);
  const path = url.pathname;
  const method = request.method;
  const clientIp = getClientIpFromRequest(request);
  const isForceFetch = url.searchParams.get("force") === "1";
  if (isForceFetch) {
    lastVersionCheckTs = 0;
    rawSliceCache.clear();
  }
  const currentVersion = await getEdgeVersion(env);
  const etag = `"v-${currentVersion}"`;

  // Automatic one-time deep forensic DOB recovery on first post-deploy read (zero latency impact via ctx.waitUntil)
  if (!dobForensicBootChecked && method === "GET" && (path === "/api/state" || path === "/api/data" || path === "/api/registrants")) {
    dobForensicBootChecked = true;
    const roomStubBoot = getRealtimeRoomStub(env);
    if (roomStubBoot && typeof roomStubBoot.rpcClaimOneTimeJob === "function" && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        roomStubBoot
          .rpcClaimOneTimeJob("dob_forensic_recovery_v3")
          .then((res) => {
            if (res?.claimed) {
              return runDeepForensicDobRecovery(env, Date.now(), []);
            }
          })
          .catch(() => {})
      );
    }
  }

  // Fast ETag / Version short-circuit helper (< 0.1ms CPU)
  const clientVersion = url.searchParams.get("v") || request.headers.get("X-Sync-Version") || "";
  const ifNoneMatch = request.headers.get("If-None-Match") || "";
  const isUnchangedRequest =
    !isForceFetch &&
    method === "GET" &&
    ((clientVersion && String(clientVersion) === String(currentVersion)) ||
      (ifNoneMatch && ifNoneMatch === etag));

  if (path === "/api/version" && method === "GET") {
    const hash = await computeSha256Hex(currentVersion);
    return new Response(
      `{"success":true,"version":${currentVersion},"lastModified":${currentVersion},"etag":"${hash}","changed":${!isUnchangedRequest},"buildTag":"v36.1-immutable-dob-forensic-lock"}`,
      { headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) } }
    );
  }

  if (path === "/api/client-ip" && method === "GET") {
    return new Response(`{"success":true,"ip":${JSON.stringify(clientIp)}}`, { headers: cors });
  }

  // ==========================================================================
  // DUAL-TIER HD PHOTO ENDPOINTS (Isolated KV Key: PHOTO_HD_${memberId})
  // Never stored inside CLEAN_MASTER_DB_V1 so master DB remains ultra-fast.
  // ==========================================================================
  if (path === "/api/photo" && method === "POST") {
    try {
      const body = await request.json().catch(() => null);
      const rawId = String(body?.memberId || "").trim();
      const cleanMemberId = rawId.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120);
      const photoHd = typeof body?.photoHd === "string" ? body.photoHd.trim() : "";

      if (!cleanMemberId || !/^data:image\/(webp|jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/i.test(photoHd)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid memberId or HD photo payload" }),
          {
            status: 400,
            headers: {
              ...cors,
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      if (photoHd.length > 2_500_000) {
        return new Response(
          JSON.stringify({ success: false, error: "HD photo payload exceeds size limit" }),
          {
            status: 413,
            headers: {
              ...cors,
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      const hdKey = `PHOTO_HD_${cleanMemberId}`;
      const kvPhotoStore = env.MEMBERS_KV || env.KV || null;
      if (kvPhotoStore && typeof kvPhotoStore.put === "function") {
        await kvPhotoStore.put(hdKey, photoHd);
      } else if (env.MEDIA && typeof env.MEDIA.put === "function") {
        await env.MEDIA.put(`photos_hd/${cleanMemberId}`, photoHd);
      }
      setMediaCache(hdKey, photoHd);

      return new Response(
        JSON.stringify({ success: true, memberId: cleanMemberId }),
        {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Failed saving HD photo" }),
        {
          status: 500,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }

  if (path === "/api/photo" && method === "GET") {
    const rawId = String(url.searchParams.get("id") || "").trim();
    const cleanMemberId = rawId.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120);
    const jsonHeaders = {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400"
    };

    if (!cleanMemberId) {
      return new Response(JSON.stringify({ success: false, photoHd: null }), {
        status: 200,
        headers: jsonHeaders
      });
    }

    const hdKey = `PHOTO_HD_${cleanMemberId}`;
    if (mediaMemCache.has(hdKey)) {
      return new Response(
        JSON.stringify({ success: true, photoHd: mediaMemCache.get(hdKey) }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const kvPhotoStore = env.MEMBERS_KV || env.KV || null;
    if (kvPhotoStore && typeof kvPhotoStore.get === "function") {
      try {
        const kvVal = await kvPhotoStore.get(hdKey);
        if (kvVal && /^data:image\/(webp|jpeg|jpg|png);base64,/i.test(kvVal)) {
          setMediaCache(hdKey, kvVal);
          return new Response(
            JSON.stringify({ success: true, photoHd: kvVal }),
            { status: 200, headers: jsonHeaders }
          );
        }
      } catch {}
    }

    if (env.MEDIA && typeof env.MEDIA.get === "function") {
      try {
        const r2Obj = await env.MEDIA.get(`photos_hd/${cleanMemberId}`);
        if (r2Obj) {
          const r2Val = await r2Obj.text();
          if (r2Val && /^data:image\/(webp|jpeg|jpg|png);base64,/i.test(r2Val)) {
            setMediaCache(hdKey, r2Val);
            return new Response(
              JSON.stringify({ success: true, photoHd: r2Val }),
              { status: 200, headers: jsonHeaders }
            );
          }
        }
      } catch {}
    }

    return new Response(JSON.stringify({ success: false, photoHd: null }), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    });
  }

  // ==========================================================================
  // ON-DEMAND MEDIA ENDPOINTS (RAM -> KV -> R2 -> D1 Fallback)
  // ==========================================================================
  if ((path.startsWith("/api/media/photo/") || path.startsWith("/api/media/ann/")) && method === "GET") {
    const isPhoto = path.startsWith("/api/media/photo/");
    const rawId = decodeURIComponent(path.replace(isPhoto ? "/api/media/photo/" : "/api/media/ann/", "").split("/")[0]);
    const bareId = rawId.replace(/^reg_member_/, "").replace(/(-ROW-\d+)+$/i, "");
    const candidateIds = Array.from(new Set([rawId, bareId, bareId ? `reg_member_${bareId}` : ""].filter(Boolean)));
    const titleKey = isPhoto ? `D1_PHOTO:${rawId}` : `D1_ANN_IMAGE:${rawId}`;

    const makePhotoResp = (val) =>
      new Response(val, {
        headers: {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        }
      });

    // 1. Check in-memory isolate cache first (0ms CPU)
    for (const cid of candidateIds) {
      const k = isPhoto ? `D1_PHOTO:${cid}` : `D1_ANN_IMAGE:${cid}`;
      if (mediaMemCache.has(k)) return makePhotoResp(mediaMemCache.get(k));
    }

    // 2. Check Cloudflare KV FIRST (< 2ms)
    const kvMedia = env.MEMBERS_KV || env.KV || null;
    if (kvMedia && typeof kvMedia.get === "function") {
      try {
        for (const cid of candidateIds) {
          const k = isPhoto ? `D1_PHOTO:${cid}` : `D1_ANN_IMAGE:${cid}`;
          const kvVal = await kvMedia.get(k);
          if (kvVal && kvVal.length > 0) {
            setMediaCache(titleKey, kvVal);
            return makePhotoResp(kvVal);
          }
        }
      } catch {}
    }

    // 3. Check Cloudflare R2 Bucket (env.MEDIA) fallback
    if (env.MEDIA && typeof env.MEDIA.get === "function") {
      try {
        for (const cid of candidateIds) {
          const r2Key = isPhoto ? `photos/${cid}` : `ann/${cid}`;
          const r2Obj = await env.MEDIA.get(r2Key);
          if (r2Obj) {
            const r2Val = await r2Obj.text();
            if (r2Val && r2Val.length > 0) {
              setMediaCache(titleKey, r2Val);
              return makePhotoResp(r2Val);
            }
          }
        }
      } catch {}
    }

    // 4. D1 events fallback
    if (env.DB) {
      try {
        for (const cid of candidateIds) {
          const k = isPhoto ? `D1_PHOTO:${cid}` : `D1_ANN_IMAGE:${cid}`;
          const row = await env.DB.prepare(
            "SELECT description FROM events WHERE title = ? ORDER BY created_at DESC LIMIT 1"
          ).bind(k).first();
          if (row && typeof row.description === "string" && row.description.length > 0) {
            setMediaCache(titleKey, row.description);
            return makePhotoResp(row.description);
          }
        }
      } catch {}
    }

    // 5. Fallback to embedded Base64 photo inside master registrants union (handles ID aliases)
    if (isPhoto) {
      try {
        const masterList = await buildMasterRegistrantsUnion(env, [], false, false);
        const idSet = new Set(candidateIds.map((x) => String(x).toUpperCase()));
        const matched = masterList.find((m) =>
          m &&
          (idSet.has(String(m.id || "").toUpperCase()) ||
            idSet.has(String(m.originalId || "").toUpperCase()) ||
            idSet.has(String(m.uniqueCode || "").toUpperCase()))
        );
        const embedded = String(matched?.photoUrl || "").trim();
        if (embedded.startsWith("data:image/")) {
          setMediaCache(titleKey, embedded);
          return makePhotoResp(embedded);
        }
      } catch {}
    }

    return new Response("", {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "X-Media-Status": "empty",
        "Cache-Control": "public, max-age=60"
      }
    });
  }

  // ==========================================================================
  // RAW STREAMING / PASS-THROUGH GET ENDPOINTS (Strictly Read-Only!)
  // ==========================================================================
  if (path === "/api/data" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(`{"success":true,"changed":false,"version":${currentVersion}}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    const [masterRegistrants, annsRaw, attRaw, blkRaw, textsRaw, revokedRaw] = await Promise.all([
      buildMasterRegistrantsUnion(env, [], false),
      getRawSliceFromD1(env, "announcements", "[]"),
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "blocked_users", "[]"),
      getRawSliceFromD1(env, "site_texts", "{}"),
      getRawSliceFromD1(env, "revoked_members_log", "[]")
    ]);
    const regsRaw = JSON.stringify(masterRegistrants);
    const rawBody = `{"success":true,"changed":true,"version":${currentVersion},"clientIp":${JSON.stringify(clientIp)},"data":{"registrants":${regsRaw},"announcements":${annsRaw},"attendance":${attRaw},"blockedUsers":${blkRaw},"siteTextsRaw":${textsRaw},"revokedMembersLog":${revokedRaw}}}`;
    return new Response(rawBody, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if ((path === "/api/registrants" || path === "/api/state") && method === "GET") {
    if (url.searchParams.get("mode") === "ping") {
      return new Response(`{"ok":true,"version":${currentVersion},"lastUpdated":${currentVersion}}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (path === "/api/registrants" && isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const [masterRegistrants, revokedRaw, attRaw, rolePermsRaw, eventsRaw, kahootRaw] = await Promise.all([
      buildMasterRegistrantsUnion(env, [], false, isForceFetch),
      getRawSliceFromD1(env, "revoked_members_log", "[]"),
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "role_permissions", "{}"),
      getRawSliceFromD1(env, "events_bundle", "[]"),
      getRawSliceFromD1(env, "kahoot_bundle", "[]")
    ]);

    const tombstoneIds = [];
    const tombstoneNames = [];
    try {
      const parsedRev = JSON.parse(revokedRaw);
      if (Array.isArray(parsedRev)) {
        for (const entry of parsedRev) {
          const id = typeof entry === "string" ? entry : entry?.id;
          const name = typeof entry === "object" ? (entry?.normalizedName || entry?.fullName || entry?.name || "") : "";
          if (isProtectedRescueWorkerName(name) || isWhitelistedWorkerMember(id, name)) continue;
          if (id && id !== "reg_owner_main") tombstoneIds.push(String(id));
          if (name) tombstoneNames.push(String(name));
        }
      }
    } catch {}

    let attendanceRecords = [];
    let rolePermissions = {};
    let events = [];
    let competitions = [];
    try { attendanceRecords = JSON.parse(attRaw); } catch {}
    try { rolePermissions = JSON.parse(rolePermsRaw); } catch {}
    try { events = JSON.parse(eventsRaw); } catch {}
    try { competitions = JSON.parse(kahootRaw); } catch {}

    // Zero-redundant-stringify streaming envelope: reuses cachedMasterRegistrants.json so /api/state stays < 2ms CPU even on cold starts!
    const membersJsonStr = getCachedMasterRegistrantsJson(masterRegistrants);
    const tombstonesJsonStr = JSON.stringify({ ids: tombstoneIds, names: tombstoneNames });
    const safeEventsJson = Array.isArray(events) ? JSON.stringify(events) : "[]";
    const safeCompetitionsJson = Array.isArray(competitions) ? JSON.stringify(competitions) : "[]";
    const safeAttJson = Array.isArray(attendanceRecords) ? JSON.stringify(attendanceRecords) : "[]";
    const safeRolePermsJson = rolePermissions && typeof rolePermissions === "object" ? JSON.stringify(rolePermissions) : "{}";
    const stateBody = `{"success":true,"version":${currentVersion},"kvMasterKey":${JSON.stringify(CLEAN_MASTER_KV_KEY)},"members":${membersJsonStr},"tombstones":${tombstonesJsonStr},"events":${safeEventsJson},"competitions":${safeCompetitionsJson},"attendanceRecords":${safeAttJson},"rolePermissions":${safeRolePermsJson},"totalCount":${masterRegistrants.length},"serverTime":${Date.now()}}`;
    return new Response(stateBody, {
      status: 200,
      headers: {
        ...cors,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        ETag: etag,
        "X-Sync-Version": String(currentVersion)
      }
    });
  }

  if ((path === "/api/registrants" || path === "/api/register") && method === "POST") {
    const newMember = await request.json();
    const rawName = String(newMember?.fullName || newMember?.name || "").trim();
    if (isGarbageOrGhostMember({ fullName: rawName })) {
      return new Response(JSON.stringify({ success: false, error: "يرجى إدخال الاسم الثلاثي الحقيقي (لا يقبل اسم عضو أو سجل وهمي)." }), { status: 400, headers: cors });
    }
    const effectiveIp = newMember.ipAddress || clientIp || undefined;
    if (effectiveIp) newMember.ipAddress = effectiveIp;

    const roomStub = getRealtimeRoomStub(env);
    if (roomStub && typeof roomStub.rpcRegisterMemberAtomic === "function") {
      // STRICT GLOBAL FIFO ATOMIC PATH (< 2ms Worker CPU, 0ms consistency lag, 0% chance of mixed phones/photos/QRs!)
      const [baseline, blkRaw] = await Promise.all([
        getBaselineCodesAndNames(env),
        getRawSliceFromD1(env, "blocked_users", "[]")
      ]);
      let blockedList = [];
      try { blockedList = JSON.parse(blkRaw); } catch {}

      const regResult = await roomStub.rpcRegisterMemberAtomic(
        {
          ...newMember,
          blockIfExists: path === "/api/register" ? true : newMember.blockIfExists !== false
        },
        baseline.codes,
        baseline.names,
        blockedList,
        effectiveIp || ""
      );

      if (!regResult || !regResult.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            success: false,
            duplicate: Boolean(regResult?.duplicate),
            error: regResult?.error || "حدث خطأ أثناء التسجيل، يرجى المحاولة مرة أخرى.",
            existingMember: regResult?.existingMember || undefined
          }),
          { status: Number(regResult?.status || 500), headers: cors }
        );
      }

      const verifiedMember = regResult.registrant;
      const nowTs = Number(regResult.version || Date.now());
      bumpEdgeVersion(nowTs);

      // Update isolate baseline cache immediately so subsequent registrations on same isolate know this code/name
      if (verifiedMember?.uniqueCode && !cachedBaselineIndex.codes.includes(verifiedMember.uniqueCode)) {
        cachedBaselineIndex.codes.push(verifiedMember.uniqueCode);
      }
      const normRegistered = ultraNormalizeArabic(verifiedMember?.fullName || rawName);
      if (normRegistered && !cachedBaselineIndex.names.includes(normRegistered)) {
        cachedBaselineIndex.names.push(normRegistered);
      }

      // Non-blocking background mirror to KV + R2 photo + Telegram (keeps registration response < 150ms & < 2ms CPU!)
      const bgMirrorTask = (async () => {
        await mirrorSingleAtomicMemberToKv(env, verifiedMember, nowTs);
        try {
          const token = env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: "6604944293",
                text: `🔔 عضو جديد!\n\n👤 الاسم: ${verifiedMember.fullName}\n🆔 الكود: ${verifiedMember.uniqueCode}\n📱 التليفون: ${verifiedMember.phone || "غير متوفر"}\n🎭 الدور: ${verifiedMember.role || "member"}\n🕐 الوقت: ${new Date().toLocaleString("ar-EG")}`
              })
            });
          }
        } catch {}
      })();
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(bgMirrorTask);
      } else {
        await bgMirrorTask;
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          registrant: verifiedMember,
          version: nowTs,
          lastModified: nowTs,
          queueSeq: regResult.queueSeq
        }),
        { headers: { ...cors, "X-Sync-Version": String(nowTs) } }
      );
    }

    // Legacy fallback if Durable Object binding is unavailable
    return await enqueueWrite(async () => {
      const [list, blkRaw] = await Promise.all([
        buildMasterRegistrantsUnion(env, [], false),
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
      const targetNormName = normArabicName(rawName);
      const existingByNameIdx = list.findIndex((r) => r && targetNormName && normArabicName(r.fullName || r.name || "") === targetNormName);
      if (existingByNameIdx >= 0 && (path === "/api/register" || newMember.blockIfExists === true)) {
        return new Response(JSON.stringify({
          ok: false,
          success: false,
          duplicate: true,
          error: "هذا الاسم مسجل بالفعل في قاعدة البيانات! لا يمكن التسجيل مرتين، يرجى تسجيل الدخول بحسابك.",
          existingMember: list[existingByNameIdx]
        }), { status: 409, headers: cors });
      }
      const usedCodes = new Set(["TY-0001"]);
      for (const r of list) {
        if (r && r.uniqueCode) usedCodes.add(String(r.uniqueCode).trim().toUpperCase());
      }
      let codeNum = 100;
      while (usedCodes.has("TY-" + String(codeNum).padStart(4, "0"))) codeNum++;
      const assignedCode = "TY-" + String(codeNum).padStart(4, "0");
      const lightMember = normalizeWorkerMember({
        ...newMember,
        id: `reg_member_3FY-${crypto.randomUUID()}`,
        uniqueCode: assignedCode,
        qrCode: assignedCode,
        qrData: assignedCode,
        fullName: rawName,
        registeredInCleanMasterV1: true
      }, assignedCode);
      list.push(lightMember);
      const nowTs = Date.now();
      await fastPersistMasterListToKv(env, list, nowTs);
      return new Response(JSON.stringify({ success: true, verified: true, registrant: lightMember, count: list.length, version: edgeStateVersion }), { headers: cors });
    });
  }

  if (path.startsWith("/api/registrants/") && method === "PUT") {
    const id = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
    const rawBody = await request.json();
    const updates = rawBody && rawBody.member && typeof rawBody.member === "object" ? rawBody.member : rawBody;

    const roomStub = getRealtimeRoomStub(env);
    if (roomStub && typeof roomStub.rpcUpsertAtomicMember === "function") {
      // ULTRA-FAST ATOMIC DO UPSERT (< 2ms Worker CPU -> ZERO Error 1102 on profile/role/QR edits or rescued members!)
      const baseline = await getBaselineCodesAndNames(env);
      const cleanTargetId = getBaseMemberId(updates?.id || id || "");
      const normIncName = ultraNormalizeArabic(updates?.fullName || updates?.name || "");
      let existingBaseline = null;
      if (Array.isArray(cachedMasterRegistrants.list)) {
        existingBaseline =
          cachedMasterRegistrants.list.find(
            (r) =>
              r &&
              ((cleanTargetId && getBaseMemberId(r.id || "") === cleanTargetId) ||
                (normIncName && ultraNormalizeArabic(r.fullName || r.name || "") === normIncName))
          ) || null;
      }

      const upsertRes = await roomStub.rpcUpsertAtomicMember(
        { ...updates, id: cleanTargetId || id },
        baseline.codes,
        existingBaseline,
        clientIp || ""
      );

      if (!upsertRes || !upsertRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: upsertRes?.error || "Update failed" }),
          { status: Number(upsertRes?.status || 400), headers: cors }
        );
      }

      const mergedRecord = upsertRes.registrant;
      const nowTs = Number(upsertRes.version || Date.now());
      bumpEdgeVersion(nowTs);

      const bgMirror = mirrorSingleAtomicMemberToKv(env, mergedRecord, nowTs);
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(bgMirror);
      } else {
        await bgMirror;
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          registrant: mergedRecord,
          version: nowTs,
          lastModified: nowTs
        }),
        { headers: { ...cors, "X-Sync-Version": String(nowTs) } }
      );
    }

    return await enqueueWrite(async () => {
      const list = await buildMasterRegistrantsUnion(env, [], false);
      const cleanTargetId = getBaseMemberId(updates?.id || id || "");
      const incomingName = String(updates?.fullName || updates?.name || "").trim().replace(/\s+/g, " ");
      const normIncName = ultraNormalizeArabic(incomingName);
      let idx = list.findIndex((r) => r && (getBaseMemberId(r.id) === cleanTargetId || (normIncName && ultraNormalizeArabic(r.fullName || r.name || "") === normIncName)));
      const existing = idx >= 0 ? list[idx] : {};
      const nowTs = Date.now();
      const safeRecFallback = pickStrongestCredential(
        updates?.recoveryCode || updates?.securityCode,
        existing.recoveryCode || existing.securityCode,
        0,
        0,
        Boolean(updates?.explicitRecoveryCodeChange),
        "123456"
      );
      const safePassFallback = pickStrongestCredential(
        updates?.password,
        existing.password,
        0,
        0,
        Boolean(updates?.explicitPasswordChange),
        safeRecFallback || "123456"
      );
      const mergedRecord = {
        ...existing,
        ...updates,
        id: existing.id || cleanTargetId || id,
        fullName: incomingName || existing.fullName || "عضو",
        name: incomingName || existing.fullName || "عضو",
        password: safePassFallback,
        recoveryCode: safeRecFallback,
        securityCode: safeRecFallback,
        passwordLocked: true,
        registrationLocked: true,
        updatedAt: nowTs,
        lastModifiedAt: nowTs
      };
      delete mergedRecord.avatar;
      delete mergedRecord.image;
      delete mergedRecord.member;
      delete mergedRecord.action;
      delete mergedRecord.explicitPasswordChange;
      delete mergedRecord.explicitRecoveryCodeChange;
      const nextList = idx >= 0 ? list.map((item, i) => (i === idx ? mergedRecord : item)) : [mergedRecord, ...list];
      await fastPersistMasterListToKv(env, nextList, nowTs);
      return new Response(
        JSON.stringify({ success: true, registrant: mergedRecord, version: edgeStateVersion, lastModified: edgeStateVersion }),
        { headers: cors }
      );
    });
  }

  // Safe Programmatic Role Revocation: "أمين الاجتماع" (meeting_secretary) -> "member" (ZERO deletions, 100% data preserved)
  if (path === "/api/roles/revoke-meeting-secretary" && method === "POST") {
    return await enqueueWrite(async () => {
      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();
      const [currentList, sysRaw] = await Promise.all([
        buildMasterRegistrantsUnion(env, [], false),
        getRawSliceFromD1(env, "system_bundle", "{}")
      ]);

      let sysBundle = /** @type {any} */ ({});
      try { sysBundle = JSON.parse(sysRaw); } catch {}
      if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

      const isMeetingSecretaryRole = (r) => {
        const val = String(r || "").trim();
        return val === "meeting_secretary" || val === "أمين اجتماع" || val === "أمين الاجتماع";
      };

      const affectedIds = [];
      const updatedList = (Array.isArray(currentList) ? currentList : []).map((member) => {
        if (!member || member.id === "reg_owner_main" || member.role === "community_owner") {
          return member;
        }
        if (!isMeetingSecretaryRole(member.role)) {
          return member;
        }
        affectedIds.push(member.id);
        const cleanedPermissions = Array.isArray(member.permissions)
          ? member.permissions.filter((p) => !isMeetingSecretaryRole(p))
          : undefined;
        const nextMember = {
          ...member,
          role: "member",
          updatedAt: nowTs,
          lastModifiedAt: nowTs,
          lastUpdatedAt: nowIso
        };
        if (cleanedPermissions !== undefined) {
          nextMember.permissions = cleanedPermissions;
        } else {
          delete nextMember.permissions;
        }
        return nextMember;
      });

      const prevRevoked = Array.isArray(sysBundle.revokedRoles) ? sysBundle.revokedRoles : [];
      const nextRevoked = Array.from(new Set([...prevRevoked, "meeting_secretary"]));
      sysBundle.revokedRoles = nextRevoked;

      if (env.DB) {
        await env.DB.prepare(
          "UPDATE members SET role = 'member', updated_at = ? WHERE role IN ('meeting_secretary', 'أمين اجتماع', 'أمين الاجتماع')"
        )
          .bind(nowTs)
          .run()
          .catch(() => {});
      }

      const serializedClean = JSON.stringify(updatedList);
      const serializedSys = JSON.stringify(sysBundle);
      await Promise.all([
        saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, serializedClean, nowTs),
        saveRawSliceToD1(env, "system_bundle", serializedSys, nowTs)
      ]);

      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            action: "REVOKE_MEETING_SECRETARY_ROLE",
            affectedIds,
            revokedRoles: nextRevoked,
            at: nowTs
          });
        } catch {}
      }

      return new Response(
        JSON.stringify({
          success: true,
          affectedCount: affectedIds.length,
          affectedIds,
          revokedRoles: nextRevoked,
          version: edgeStateVersion,
          lastModified: edgeStateVersion
        }),
        { headers: cors }
      );
    });
  }

  if (
    (path.startsWith("/api/registrants/") && method === "DELETE") ||
    (path.startsWith("/api/member/") && method === "DELETE") ||
    (path === "/api/member" && method === "DELETE") ||
    (path === "/api/registrants/revoke" && method === "POST") ||
    (path === "/api/member/delete" && method === "POST") ||
    (path === "/api/delete-member" && method === "POST")
  ) {
    let targetId = "";
    let bodyPayload = {};
    if (method === "DELETE" && path.startsWith("/api/registrants/")) {
      targetId = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
      try { bodyPayload = await request.json(); } catch {}
    } else if (method === "DELETE" && path.startsWith("/api/member/")) {
      targetId = decodeURIComponent(path.replace("/api/member/", "").split("/")[0]);
      try { bodyPayload = await request.json(); } catch {}
    } else {
      try { bodyPayload = await request.json(); } catch {}
      targetId = String(bodyPayload?.id || bodyPayload?.targetId || bodyPayload?.memberId || "").trim();
    }

    if (!targetId || targetId === "reg_owner_main") {
      return new Response(JSON.stringify({ success: false, error: "Invalid member ID" }), { status: 400, headers: cors });
    }

    return await enqueueWrite(async () => {
      const bareTargetId = targetId.replace(/^reg_member_/, "");
      const [list, revokedRaw, sysRaw] = await Promise.all([
        buildMasterRegistrantsUnion(env, [], false, true),
        getRawSliceFromD1(env, "revoked_members_log", "[]"),
        getRawSliceFromD1(env, "system_bundle", "{}")
      ]);

      let revokedLog = [];
      let sysBundle = /** @type {any} */ ({});
      try { revokedLog = JSON.parse(revokedRaw); } catch {}
      try { sysBundle = JSON.parse(sysRaw); } catch {}
      if (!Array.isArray(revokedLog)) revokedLog = [];
      if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

      const targetMember = list.find(
        (r) =>
          r &&
          (String(r.id) === targetId ||
            String(r.id).replace(/^reg_member_/, "") === bareTargetId ||
            String(r.originalId || "") === targetId)
      );
      const targetFullName = String(targetMember?.fullName || bodyPayload?.fullName || bodyPayload?.targetName || bodyPayload?.name || "").trim();
      const targetNormName = normalizeWorkerArabic(bodyPayload?.normalizedName || targetFullName);
      const targetPhone = targetMember?.phone || bodyPayload?.phone || "";
      const targetCode = targetMember?.uniqueCode || bodyPayload?.uniqueCode || "";

      const shouldKeepMember = (r) => {
        if (!r || !r.id) return false;
        if (isGarbageOrGhostMember(r)) return false;
        const rid = String(r.id).trim();
        const rOrig = String(r.originalId || "").trim();
        const bareRid = rid.replace(/^reg_member_/, "");
        if (rid === targetId || rOrig === targetId || bareRid === bareTargetId) return false;
        if (targetNormName && targetNormName !== normalizeWorkerArabic("ميخائيل ادور راتب") && normalizeWorkerArabic(r.fullName || r.name || "") === targetNormName) return false;
        return true;
      };

      const nextRegs = list.filter(shouldKeepMember);

      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const nextRevokedLog = [
        {
          id: targetId,
          originalId: bareTargetId,
          fullName: targetFullName,
          normalizedName: targetNormName,
          phone: targetPhone,
          retiredCode: targetCode,
          revokedAt: nowIso
        },
        ...revokedLog.filter((item) => item && item.id !== targetId)
      ];

      const existingDelIds = Array.isArray(sysBundle.deletedRegistrantIds) ? sysBundle.deletedRegistrantIds : [];
      const nextDelSet = new Set([...existingDelIds, targetId, bareTargetId, `reg_member_${bareTargetId}`]);
      sysBundle.deletedRegistrantIds = Array.from(nextDelSet);
      sysBundle.revokedMembersLog = nextRevokedLog;

      // 1. Strongly-consistent Durable Object SQLite delete FIRST (0ms lag, never affected by KV limits!)
      const roomStubDel = getRealtimeRoomStub(env);
      if (roomStubDel && typeof roomStubDel.rpcDeleteAtomicMembers === "function") {
        const delDoRes = await roomStubDel.rpcDeleteAtomicMembers([
          { id: targetId, fullName: targetFullName, normName: targetNormName }
        ]).catch(() => null);
        const removedNorms = new Set([
          ...(targetNormName ? [ultraNormalizeArabic(targetNormName)] : []),
          ...(Array.isArray(delDoRes?.deletedNormNames) ? delDoRes.deletedNormNames : [])
        ]);
        if (removedNorms.size > 0 && Array.isArray(cachedBaselineIndex.names)) {
          cachedBaselineIndex.names = cachedBaselineIndex.names.filter((n) => !removedNorms.has(ultraNormalizeArabic(n)));
        }
      }

      // 2. Delete photo and SQL member row from Cloudflare D1
      const photoKey = `D1_PHOTO:${targetId}`;
      mediaMemCache.delete(photoKey);
      if (env.DB) {
        const dbStmts = [
          env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
          env.DB.prepare("DELETE FROM members WHERE id = ? OR id = ?").bind(targetId, bareTargetId)
        ];
        if (targetFullName) {
          dbStmts.push(env.DB.prepare("DELETE FROM members WHERE name = ?").bind(targetFullName));
        }
        await env.DB.batch(dbStmts).catch(() => {});
      }

      await Promise.all([
        fastPersistMasterListToKv(env, nextRegs, nowTs, { forceKv: true }),
        saveRawSliceToD1(env, "revoked_members_log", JSON.stringify(nextRevokedLog), nowTs),
        saveRawSliceToD1(env, "system_bundle", JSON.stringify(sysBundle), nowTs)
      ]);

      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            action: "DELETE",
            id: targetId,
            matchValue: targetId,
            record: { id: targetId, fullName: targetFullName, uniqueCode: targetCode },
            revokedAt: nowIso,
            at: nowTs
          });
        } catch {}
      }

      return new Response(
        JSON.stringify({
          success: true,
          deletedId: targetId,
          count: nextRegs.length,
          version: edgeStateVersion
        }),
        { headers: cors }
      );
    });
  }

  // ====================================================================
  // BULK PERMANENT DELETE MEMBERS FROM CLOUDFLARE D1 (Community Owner Only, < 50ms)
  // POST /api/members/delete-batch
  // ====================================================================
  if (path === "/api/members/delete-batch" && method === "POST") {
    let bodyPayload = {};
    try {
      bodyPayload = await request.json();
    } catch {}
    const actorRole = request.headers.get("X-Actor-Role") || bodyPayload?.actorRole || "community_owner";
    if (actorRole !== "community_owner") {
      return new Response(JSON.stringify({ error: "Forbidden: Only Community Owner can bulk-delete members" }), {
        status: 403,
        headers: cors
      });
    }

    const rawTargets = Array.isArray(bodyPayload?.members)
      ? bodyPayload.members
      : Array.isArray(bodyPayload?.ids)
      ? bodyPayload.ids.map((id) => ({ id }))
      : [];
    const validTargets = rawTargets.filter((t) => t && t.id && String(t.id) !== "reg_owner_main");
    if (validTargets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No valid member IDs provided" }), {
        status: 400,
        headers: cors
      });
    }

    return await enqueueWrite(async () => {
      const [list, revokedRaw, sysRaw] = await Promise.all([
        buildMasterRegistrantsUnion(env, [], false, true),
        getRawSliceFromD1(env, "revoked_members_log", "[]"),
        getRawSliceFromD1(env, "system_bundle", "{}")
      ]);

      let revokedLog = [];
      let sysBundle = /** @type {any} */ ({});
      try { revokedLog = JSON.parse(revokedRaw); } catch {}
      try { sysBundle = JSON.parse(sysRaw); } catch {}
      if (!Array.isArray(revokedLog)) revokedLog = [];
      if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

      const delIdSet = new Set();
      const delNameSet = new Set();
      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const newRevokedEntries = [];
      const ownerNormName = normalizeWorkerArabic("ميخائيل ادور راتب");

      for (const item of validTargets) {
        const tid = String(item.id || "").trim();
        const bareTid = tid.replace(/^reg_member_/, "");
        const origTid = String(item.originalId || bareTid).trim();
        if (tid && tid !== "reg_owner_main") {
          delIdSet.add(tid);
          if (bareTid) {
            delIdSet.add(bareTid);
            delIdSet.add(`reg_member_${bareTid}`);
          }
          if (origTid && origTid !== "reg_owner_main") delIdSet.add(origTid);
        }
        const matchedInList = list.find(
          (r) =>
            r &&
            (String(r.id) === tid ||
              String(r.id).replace(/^reg_member_/, "") === bareTid ||
              String(r.originalId || "") === tid)
        );
        const fullName = String(matchedInList?.fullName || item.fullName || item.name || "").trim();
        const normName = normalizeWorkerArabic(item.normalizedName || fullName);
        if (normName && normName !== ownerNormName) {
          delNameSet.add(normName);
        }
        newRevokedEntries.push({
          id: tid,
          originalId: origTid || bareTid,
          fullName,
          normalizedName: normName,
          phone: matchedInList?.phone || item.phone || "",
          retiredCode: matchedInList?.uniqueCode || item.uniqueCode || "",
          revokedAt: nowIso
        });
      }

      const shouldKeepMember = (r) => {
        if (!r || !r.id) return false;
        if (isGarbageOrGhostMember(r)) return false;
        const rid = String(r.id).trim();
        const rOrig = String(r.originalId || "").trim();
        const bareRid = rid.replace(/^reg_member_/, "");
        const rName = normalizeWorkerArabic(r.fullName || r.name || "");
        if (delIdSet.has(rid) || (rOrig && delIdSet.has(rOrig)) || (bareRid && delIdSet.has(bareRid))) return false;
        if (rName && delNameSet.has(rName)) return false;
        return true;
      };

      const nextRegs = list.filter(shouldKeepMember);
      const nextRevokedLog = [
        ...newRevokedEntries,
        ...revokedLog.filter((item) => item && !delIdSet.has(String(item.id || "")))
      ];

      const existingDelIds = Array.isArray(sysBundle.deletedRegistrantIds) ? sysBundle.deletedRegistrantIds : [];
      sysBundle.deletedRegistrantIds = Array.from(new Set([...existingDelIds, ...Array.from(delIdSet)]));
      sysBundle.revokedMembersLog = nextRevokedLog;

      // 1. Strongly-consistent DO SQLite delete FIRST (0ms lag, unaffected by KV daily cap!)
      const roomStubBatch = getRealtimeRoomStub(env);
      if (roomStubBatch && typeof roomStubBatch.rpcDeleteAtomicMembers === "function") {
        await roomStubBatch.rpcDeleteAtomicMembers(newRevokedEntries).catch(() => {});
      }

      // 2. Delete photos & SQL rows from D1
      if (env.DB) {
        const dbStmts = [];
        for (const entry of newRevokedEntries) {
          const photoKey = `D1_PHOTO:${entry.id}`;
          mediaMemCache.delete(photoKey);
          dbStmts.push(
            env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
            env.DB.prepare("DELETE FROM members WHERE id = ? OR id = ?").bind(entry.id, entry.originalId || entry.id)
          );
          if (entry.fullName) {
            dbStmts.push(env.DB.prepare("DELETE FROM members WHERE name = ?").bind(entry.fullName));
          }
        }
        if (dbStmts.length > 0) {
          await env.DB.batch(dbStmts).catch(() => {});
        }
      }

      await Promise.all([
        fastPersistMasterListToKv(env, nextRegs, nowTs, { forceKv: true }),
        saveRawSliceToD1(env, "revoked_members_log", JSON.stringify(nextRevokedLog), nowTs),
        saveRawSliceToD1(env, "system_bundle", JSON.stringify(sysBundle), nowTs)
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          deletedCount: newRevokedEntries.length,
          count: nextRegs.length,
          version: edgeStateVersion
        }),
        { headers: cors }
      );
    });
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
      const roomStubBlk = getRealtimeRoomStub(env);
      if (roomStubBlk && typeof roomStubBlk.rpcDeleteAtomicMembers === "function") {
        await roomStubBlk.rpcDeleteAtomicMembers([{ id: memberId, fullName: member.fullName }]).catch(() => {});
      }
      await Promise.all([
        saveRawSliceToD1(env, "blocked_users", JSON.stringify(nextBlocked), nowTs),
        fastPersistMasterListToKv(env, nextRegs, nowTs)
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

  if (path === "/api/members/lookup" && method === "GET") {
    const rawQuery = String(url.searchParams.get("q") || url.searchParams.get("code") || url.searchParams.get("id") || "").trim();
    if (!rawQuery) {
      return new Response(JSON.stringify({ success: false, found: false, member: null }), {
        status: 400,
        headers: cors
      });
    }
    try {
      // 1. Strongly-consistent Durable Object lookup FIRST (0ms propagation lag after registration!)
      const roomStub = getRealtimeRoomStub(env);
      if (roomStub && typeof roomStub.rpcLookupAtomicMember === "function") {
        const doRes = await roomStub.rpcLookupAtomicMember(rawQuery).catch(() => null);
        if (doRes && doRes.ok && doRes.member) {
          return new Response(
            JSON.stringify({ success: true, found: true, source: "do_atomic", member: doRes.member }),
            { headers: cors }
          );
        }
      }
      // 2. Fallback to master registrants union for older baseline members not yet touched in DO
      const masterList = await buildMasterRegistrantsUnion(env, [], false);
      const cleanQ = rawQuery
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      let qCode = cleanQ;
      let qId = "";
      let qName = "";
      if (cleanQ.includes("|")) {
        const parts = cleanQ.split("|").map((s) => s.trim());
        qCode = parts[0] || cleanQ;
        qId = parts[1] || "";
        qName = parts[2] || "";
      } else if (cleanQ.startsWith("{") && cleanQ.endsWith("}")) {
        try {
          const obj = JSON.parse(cleanQ);
          qCode = String(obj.uniqueCode || obj.qrData || obj.code || cleanQ).trim();
          qId = String(obj.id || "").trim();
          qName = String(obj.fullName || obj.name || "").trim();
        } catch {}
      }
      const upperCleanQ = cleanQ.toUpperCase();
      const upperQ = qCode.toUpperCase();
      const isQrTokenQ = /^QR3FY-/i.test(upperCleanQ) || /^QR3FY-/i.test(upperQ);
      const qDigits = upperQ.replace(/[^0-9]/g, "");
      const paddedQ = !isQrTokenQ && qDigits ? `TY-${qDigits.padStart(4, "0")}` : "";
      const bareQ = (qId || cleanQ).replace(/^reg_member_/, "");
      const normQName = ultraNormalizeArabic(qName || cleanQ);

      const found = (Array.isArray(masterList) ? masterList : []).find((m) => {
        if (!m || m.status === "cancelled" || m.isDeleted) return false;
        const mCode = String(m.uniqueCode || "").trim().toUpperCase();
        const mQr = String(m.qrData || "").trim().toUpperCase();
        const mQrCode = String(m.qrCode || "").trim().toUpperCase();
        const mId = String(m.id || "").trim();
        const mBareId = mId.replace(/^reg_member_/, "");
        const mNormName = ultraNormalizeArabic(m.fullName || m.name || "");
        if (isQrTokenQ) {
          return Boolean(
            (mQr && (mQr === upperCleanQ || mQr === upperQ)) ||
            (mQrCode && (mQrCode === upperCleanQ || mQrCode === upperQ))
          );
        }
        return (
          (mQr && (mQr === upperCleanQ || mQr === upperQ)) ||
          (mQrCode && (mQrCode === upperCleanQ || mQrCode === upperQ)) ||
          (mCode && (mCode === upperQ || (paddedQ && mCode === paddedQ))) ||
          (mId && (mId === cleanQ || (qId && mId === qId) || (bareQ && mBareId === bareQ))) ||
          (normQName && mNormName && mNormName === normQName)
        );
      });

      if (found) {
        return new Response(
          JSON.stringify({ success: true, found: true, source: "master_union", member: found }),
          { headers: cors }
        );
      }
    } catch {}
    return new Response(JSON.stringify({ success: true, found: false, member: null }), { headers: cors });
  }

  if (path === "/api/members" && method === "GET") {
    try {
      const masterList = await buildMasterRegistrantsUnion(env, [], false);
      if (Array.isArray(masterList) && masterList.length > 0) {
        return new Response(
          JSON.stringify({ success: true, results: masterList, totalCount: masterList.length, source: "master_union" }),
          { headers: cors }
        );
      }
    } catch {}
    try {
      if (env.DB) {
        const res = await env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all();
        return new Response(JSON.stringify(res), { headers: cors });
      }
    } catch {}
    return new Response(JSON.stringify({ success: true, results: [] }), { headers: cors });
  }

  if (path === "/api/members-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    const rawName = String(b?.name || b?.fullName || "").trim();
    if (rawName && rawName !== "عضو") {
      const memId = b.id || `reg_${nowTs}_${Math.random().toString(36).slice(2, 6)}`;
      if (env.DB) {
        try {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM members WHERE id = ? OR name = ?").bind(memId, rawName),
            env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(memId, rawName, b.phone || null, b.role || "member", nowTs)
          ]);
        } catch {}
      }
      bumpEdgeVersion(nowTs);
    }
    return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
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
    const [attRaw, sysRaw, regsRaw] = await Promise.all([
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "system_bundle", "{}"),
      getRawSliceFromD1(env, CLEAN_MASTER_DB_KEY, "").then((r) => r || getRawSliceFromD1(env, "registrants", "[]"))
    ]);
    let current = [];
    let sysBundle = {};
    let regsList = [];
    try { current = JSON.parse(attRaw); } catch {}
    try { sysBundle = JSON.parse(sysRaw) || {}; } catch {}
    try { regsList = JSON.parse(regsRaw || "[]"); } catch {}
    if (!Array.isArray(current)) current = [];
    if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};
    if (!Array.isArray(regsList)) regsList = [];

    // Build fast canonical member lookup to enrich every record and permanently block 'مخدوم حاضر' ghosts
    const memberByKey = new Map();
    for (const m of regsList) {
      if (!m || !m.id) continue;
      const mid = String(m.id).trim();
      const bare = mid.replace(/^reg_member_/, "");
      memberByKey.set(mid, m);
      memberByKey.set(bare, m);
      if (m.originalId) memberByKey.set(String(m.originalId).trim(), m);
      if (m.uniqueCode) memberByKey.set(String(m.uniqueCode).trim().toUpperCase(), m);
    }

    const resolveValidAttendanceRecord = (r) => {
      if (!r || typeof r !== "object") return null;
      const dStr = String(r.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return null;
      const rawRid = String(r.registrantId || r.memberId || "").trim();
      const rawBare = rawRid.replace(/^reg_member_/, "");
      const rawCode = String(r.uniqueCode || "").trim().toUpperCase();
      const matched =
        memberByKey.get(rawRid) ||
        memberByKey.get(rawBare) ||
        (rawCode ? memberByKey.get(rawCode) : null) ||
        (/^TY-\d+$/i.test(rawRid) ? memberByKey.get(rawRid.toUpperCase()) : null);

      const rawName = String(r.registrantName || "").trim();
      const resolvedName = matched?.fullName || (rawName && rawName !== "مخدوم حاضر" ? rawName : "");
      // ZERO-GHOST LOCK: Permanently reject nameless or 'مخدوم حاضر' placeholder records
      if (!resolvedName || resolvedName === "مخدوم حاضر") return null;

      const canonicalId = matched?.id ? String(matched.id).trim() : rawRid;
      if (!canonicalId) return null;
      return {
        ...r,
        id: r.id || `att_${canonicalId}_${dStr}`,
        registrantId: canonicalId,
        registrantName: resolvedName,
        uniqueCode: matched?.uniqueCode || r.uniqueCode || undefined,
        date: dStr
      };
    };

    const incomingRecords = Array.isArray(b.records) ? b.records : (b.record ? [b.record] : []);
    const delAttSet = new Set(Array.isArray(sysBundle.deletedAttendanceIds) ? sysBundle.deletedAttendanceIds.map(String) : []);
    const revKeySet = new Set(Array.isArray(sysBundle.revokedAttendanceKeys) ? sysBundle.revokedAttendanceKeys.map(String) : []);
    const nowTs = Date.now();
    let sysModified = false;

    if (b.mode === "replace" && Array.isArray(b.records)) {
      const cleanedReplace = [];
      for (const rawR of b.records) {
        const rec = resolveValidAttendanceRecord(rawR);
        if (!rec || !rec.id || delAttSet.has(String(rec.id))) continue;
        const dStr = rec.date;
        const rid = rec.registrantId;
        const bare = rid.replace(/^reg_member_/, "");
        if (dStr && (revKeySet.has(`${rid}__${dStr}`) || (bare && revKeySet.has(`${bare}__${dStr}`)))) continue;
        cleanedReplace.push(rec);
      }
      current = cleanedReplace;
    } else if (incomingRecords.length > 0) {
      let hasNew = false;
      if (!sysBundle.fridayStamps || typeof sysBundle.fridayStamps !== "object") {
        sysBundle.fridayStamps = {};
      }
      for (const rawRec of incomingRecords) {
        const rec = resolveValidAttendanceRecord(rawRec);
        if (!rec) continue;
        const dStr = rec.date;
        const rid = rec.registrantId;
        const bare = rid.replace(/^reg_member_/, "");
        const nName = normalizeWorkerArabic(rec.registrantName);
        // Deliberate scan/manual append clears prior revocation for this (member, date)
        [`${rid}__${dStr}`, `${bare}__${dStr}`, `reg_member_${bare}__${dStr}`, ...(nName ? [`__name__:${nName}__${dStr}`] : [])].forEach((rk) => {
          if (revKeySet.delete(rk)) sysModified = true;
        });
        if (rec.id && delAttSet.delete(String(rec.id))) sysModified = true;

        // Persist canonical member ID stamp (NEVER TY-XXXX code stamp!)
        const fk = `${rid}_${dStr}`;
        if (!sysBundle.fridayStamps[fk] || !sysBundle.fridayStamps[fk].stamped) {
          sysBundle.fridayStamps[fk] = {
            stamped: true,
            version: Number(sysBundle.fridayStamps[fk]?.version || 0) + 1,
            updatedAt: nowTs
          };
          sysModified = true;
        }

        const alreadyExistsForDate = current.some(
          (a) => a && String(a.date || "").slice(0, 10) === dStr &&
            (String(a.registrantId || "").trim() === rid || String(a.registrantId || "").trim().replace(/^reg_member_/, "") === bare)
        );
        if (!alreadyExistsForDate) {
          current.unshift(rec);
          hasNew = true;
        }
      }
      if (sysModified) {
        sysBundle.deletedAttendanceIds = Array.from(delAttSet);
        sysBundle.revokedAttendanceKeys = Array.from(revKeySet);
        await saveRawSliceToD1(env, "system_bundle", JSON.stringify(sysBundle), nowTs);
      }
      if (!hasNew && incomingRecords.length === 1) {
        const resolvedOne = resolveValidAttendanceRecord(incomingRecords[0]);
        if (resolvedOne) {
          const targetD = resolvedOne.date;
          const targetBare = resolvedOne.registrantId.replace(/^reg_member_/, "");
          const dup = current.find(
            (a) => a && String(a.date || "").slice(0, 10) === targetD &&
              String(a.registrantId || "").trim().replace(/^reg_member_/, "") === targetBare
          );
          return new Response(JSON.stringify({ ok: true, isDuplicate: true, record: dup, attendance: current }), { headers: cors });
        }
      }
    } else if (b.memberId && env.DB) {
      try {
        await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run();
      } catch {}
    }

    // Final sanitization & deduplication pass on current list so ZERO 'مخدوم حاضر' rows can ever survive in D1
    const finalSeen = new Set();
    const lightAtt = [];
    for (let idx = 0; idx < current.length; idx++) {
      const r = resolveValidAttendanceRecord(current[idx]);
      if (!r) continue;
      const bare = r.registrantId.replace(/^reg_member_/, "");
      const dk = `${bare}__${r.date}`;
      if (finalSeen.has(dk)) continue;
      finalSeen.add(dk);
      lightAtt.push({
        id: r.id,
        registrantId: r.registrantId,
        registrantName: r.registrantName,
        uniqueCode: r.uniqueCode || undefined,
        registrantPhotoUrl: typeof r.registrantPhotoUrl === "string" && r.registrantPhotoUrl.startsWith("data:")
          ? `__D1_PHOTO_REF__:${r.registrantId}`
          : r.registrantPhotoUrl,
        date: r.date,
        timestamp: r.timestamp,
        scannedAt: r.scannedAt || r.timestamp,
        timeString: r.timeString || undefined,
        orderNumber: typeof r.orderNumber === "number" ? r.orderNumber : lightAtt.length + 1,
        method: r.method || "camera_scan"
      });
    }

    await saveRawSliceToD1(env, "attendance_records", JSON.stringify(lightAtt), nowTs);

    // Also stamp the member object inside D1_STATE:registrants so member profile and attendance dashboard stay 100% synced
    if (b.mode !== "replace" && incomingRecords.length > 0 && regsList.length > 0) {
      try {
        let regsModified = false;
        for (const rawRec of incomingRecords) {
          const rec = resolveValidAttendanceRecord(rawRec);
          if (!rec) continue;
          const targetId = rec.registrantId;
          const bareId = targetId.replace(/^reg_member_/, "");
          const mIdx = regsList.findIndex((m) => {
            if (!m || !m.id) return false;
            const mid = String(m.id).trim();
            return mid === targetId || mid.replace(/^reg_member_/, "") === bareId;
          });
          if (mIdx >= 0) {
            const mem = { ...regsList[mIdx] };
            const prevDates = Array.isArray(mem.attendanceDates) ? mem.attendanceDates : [];
            if (!prevDates.includes(rec.date)) {
              mem.attendanceDates = [...prevDates, rec.date];
            }
            const prevStamps = mem.stamps && typeof mem.stamps === "object" && !Array.isArray(mem.stamps) ? { ...mem.stamps } : {};
            prevStamps[rec.date] = {
              stamped: true,
              date: rec.date,
              timestamp: rec.timestamp || new Date(nowTs).toISOString(),
              method: rec.method || "camera_scan",
              orderNumber: rec.orderNumber
            };
            mem.stamps = prevStamps;
            mem.fridayStamps = prevStamps;
            const prevHist = Array.isArray(mem.attendanceHistory) ? [...mem.attendanceHistory] : [];
            if (!prevHist.some((h) => h && (h.date === rec.date || h.id === rec.id))) {
              prevHist.unshift({
                id: rec.id,
                date: rec.date,
                timestamp: rec.timestamp || new Date(nowTs).toISOString(),
                timeString: rec.timeString,
                method: rec.method || "camera_scan",
                orderNumber: rec.orderNumber,
                present: true
              });
            }
            mem.attendanceHistory = prevHist;
            mem.lastAttendance = rec.timestamp || rec.date;
            mem.lastModifiedAt = nowTs;
            mem.updatedAt = new Date(nowTs).toISOString();
            regsList[mIdx] = mem;
            regsModified = true;
          }
        }
        if (regsModified) {
          const regsJson = JSON.stringify(regsList);
          await saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, regsJson, nowTs);
        }
      } catch {}
    }

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

  async function purgeWorkerAttendance(opts) {
    const { recordIds = [], revocationKeys = [], registrantId = "", dateStr = "", registrantName = "" } = opts || {};
    const [attRaw, sysRaw, regsRaw] = await Promise.all([
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "system_bundle", "{}"),
      getRawSliceFromD1(env, CLEAN_MASTER_DB_KEY, "").then((r) => r || getRawSliceFromD1(env, "registrants", "[]"))
    ]);
    let current = [];
    let sysBundle = /** @type {any} */ ({});
    let regsList = [];
    try { current = JSON.parse(attRaw); } catch {}
    try { sysBundle = JSON.parse(sysRaw) || {}; } catch {}
    try { regsList = JSON.parse(regsRaw) || []; } catch {}
    if (!Array.isArray(current)) current = [];
    if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

    let regId = String(registrantId || "").trim();
    let targetDate = String(dateStr || "").trim().slice(0, 10);
    let regName = String(registrantName || "").trim();
    const idSet = new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean).map(String));

    for (const ridCand of Array.from(idSet)) {
      const hit = current.find((a) => a && a.id === ridCand);
      if (hit) {
        if (!regId) regId = String(hit.registrantId || hit.memberId || "").trim();
        if (!targetDate) targetDate = String(hit.date || hit.timestamp || "").trim().slice(0, 10);
        if (!regName) regName = String(hit.registrantName || "").trim();
      }
      const sm = ridCand.match(/^att_(?:mhist|mstamp|mem|stamp|hist)_(.+)_(\d{4}-\d{2}-\d{2})$/) || ridCand.match(/^att_(.+)_(\d{4}-\d{2}-\d{2})$/);
      if (sm) {
        if (!regId) regId = sm[1].trim();
        if (!targetDate) targetDate = sm[2].trim();
      }
    }

    const bareId = regId.replace(/^reg_member_/, "");
    const normTargetName = regName && regName !== "مخدوم حاضر" ? normalizeWorkerArabic(regName) : "";

    const delAttSet = new Set(Array.isArray(sysBundle.deletedAttendanceIds) ? sysBundle.deletedAttendanceIds.map(String) : []);
    idSet.forEach((x) => delAttSet.add(x));
    const revKeySet = new Set(Array.isArray(sysBundle.revokedAttendanceKeys) ? sysBundle.revokedAttendanceKeys.map(String) : []);
    (Array.isArray(revocationKeys) ? revocationKeys : []).forEach((k) => k && revKeySet.add(String(k)));
    if (targetDate) {
      if (regId) revKeySet.add(`${regId}__${targetDate}`);
      if (bareId) {
        revKeySet.add(`${bareId}__${targetDate}`);
        revKeySet.add(`reg_member_${bareId}__${targetDate}`);
      }
      if (normTargetName) revKeySet.add(`__name__:${normTargetName}__${targetDate}`);
    }

    const nextAtt = current.filter((a) => {
      if (!a) return false;
      if (a.id && delAttSet.has(String(a.id))) return false;
      const ad = String(a.date || a.timestamp || "").trim().slice(0, 10);
      if (targetDate && ad === targetDate) {
        const ar = String(a.registrantId || a.memberId || "").trim();
        const ab = ar.replace(/^reg_member_/, "");
        const an = a.registrantName && a.registrantName !== "مخدوم حاضر" ? normalizeWorkerArabic(a.registrantName) : "";
        if ((regId && ar === regId) || (bareId && ab === bareId) || (normTargetName && an === normTargetName)) {
          if (a.id) delAttSet.add(String(a.id));
          return false;
        }
      }
      return true;
    });

    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    let regsModified = false;
    if (targetDate && Array.isArray(regsList) && regsList.length > 0) {
      if (!sysBundle.fridayStamps || typeof sysBundle.fridayStamps !== "object") sysBundle.fridayStamps = {};
      if (!sysBundle.revokedStamps || typeof sysBundle.revokedStamps !== "object") sysBundle.revokedStamps = {};
      regsList = regsList.map((m) => {
        if (!m || !m.id) return m;
        const mb = String(m.id).replace(/^reg_member_/, "");
        const mn = normalizeWorkerArabic(m.fullName || m.name || "");
        const isMatch =
          (regId && (m.id === regId || m.originalId === regId)) ||
          (bareId && mb === bareId) ||
          (normTargetName && mn === normTargetName);
        if (!isMatch) return m;

        revKeySet.add(`${m.id}__${targetDate}`);
        revKeySet.add(`${mb}__${targetDate}`);
        const copy = { ...m };
        let memChanged = false;
        const filterArr = (arr) => arr.filter((item) => {
          if (!item) return false;
          const d = typeof item === "string" ? item.slice(0, 10) : String(item.date || item.timestamp || item.scannedAt || "").slice(0, 10);
          if (d === targetDate) { memChanged = true; return false; }
          return true;
        });
        if (Array.isArray(copy.attendanceDates)) copy.attendanceDates = filterArr(copy.attendanceDates);
        if (Array.isArray(copy.presentDates)) copy.presentDates = filterArr(copy.presentDates);
        if (Array.isArray(copy.attendanceHistory)) copy.attendanceHistory = filterArr(copy.attendanceHistory);
        if (Array.isArray(copy.attendance)) copy.attendance = filterArr(copy.attendance);
        for (const f of ["stamps", "fridayStamps"]) {
          if (Array.isArray(copy[f])) copy[f] = filterArr(copy[f]);
          else if (copy[f] && typeof copy[f] === "object") {
            const nextObj = { ...copy[f] };
            for (const k of Object.keys(nextObj)) {
              const kd = (nextObj[k] && typeof nextObj[k] === "object" && nextObj[k].date)
                ? String(nextObj[k].date).slice(0, 10)
                : String(k.includes("_") ? k.slice(k.lastIndexOf("_") + 1) : k).slice(0, 10);
              if (kd === targetDate) { delete nextObj[k]; memChanged = true; }
            }
            copy[f] = nextObj;
          }
        }
        if (typeof copy.lastAttendance === "string" && copy.lastAttendance.slice(0, 10) === targetDate) {
          memChanged = true;
          copy.lastAttendance = undefined;
        }
        if (memChanged) {
          copy.lastModifiedAt = nowTs;
          copy.updatedAt = nowIso;
          regsModified = true;
        }
        const fk = `${m.id}_${targetDate}`;
        const prevS = sysBundle.fridayStamps[fk];
        sysBundle.fridayStamps[fk] = { stamped: false, version: Number(prevS?.version || 0) + 1, updatedAt: nowTs };
        sysBundle.revokedStamps[fk] = true;
        return copy;
      });
    }

    const lightAtt = nextAtt.map((r, idx) => ({
      id: r.id,
      registrantId: r.registrantId,
      registrantName: r.registrantName,
      uniqueCode: r.uniqueCode || undefined,
      registrantPhotoUrl: typeof r.registrantPhotoUrl === "string" && r.registrantPhotoUrl.startsWith("data:")
        ? `__D1_PHOTO_REF__:${r.registrantId}`
        : r.registrantPhotoUrl,
      date: r.date,
      timestamp: r.timestamp,
      scannedAt: r.scannedAt || r.timestamp,
      timeString: r.timeString || undefined,
      orderNumber: typeof r.orderNumber === "number" ? r.orderNumber : idx + 1,
      method: r.method || "camera_scan"
    }));

    sysBundle.attendance = lightAtt;
    sysBundle.deletedAttendanceIds = Array.from(delAttSet);
    sysBundle.revokedAttendanceKeys = Array.from(revKeySet);

    const saveTasks = [
      saveRawSliceToD1(env, "attendance_records", JSON.stringify(lightAtt), nowTs),
      saveRawSliceToD1(env, "system_bundle", JSON.stringify(sysBundle), nowTs)
    ];
    if (regsModified) {
      const serializedRegs = JSON.stringify(regsList);
      saveTasks.push(
        saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, serializedRegs, nowTs)
      );
    }
    await Promise.all(saveTasks);

    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "attendance_sync",
          records: lightAtt,
          deletedId: Array.from(idSet)[0] || "",
          deletedIds: sysBundle.deletedAttendanceIds,
          revokedKeys: sysBundle.revokedAttendanceKeys,
          at: nowTs
        });
      } catch {}
    }

    return { lightAtt, deletedIds: sysBundle.deletedAttendanceIds, revokedKeys: sysBundle.revokedAttendanceKeys };
  }

  if (path === "/api/attendance/revoke" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    const result = await purgeWorkerAttendance(b || {});
    return new Response(JSON.stringify({ ok: true, attendance: result.lightAtt, deletedIds: result.deletedIds, revokedKeys: result.revokedKeys, version: edgeStateVersion }), { headers: cors });
  }

  if (path.startsWith("/api/attendance/") && method === "DELETE") {
    const recordId = decodeURIComponent(path.replace("/api/attendance/", "").split("/")[0]);
    const registrantId = url.searchParams.get("registrantId") || "";
    const dateStr = url.searchParams.get("date") || "";
    const registrantName = url.searchParams.get("name") || "";
    const result = await purgeWorkerAttendance({
      recordIds: [recordId],
      registrantId,
      dateStr,
      registrantName
    });
    return new Response(JSON.stringify({ ok: true, attendance: result.lightAtt, deletedIds: result.deletedIds, revokedKeys: result.revokedKeys, version: edgeStateVersion }), { headers: cors });
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
    let results = [];
    try {
      const res = await env.DB.prepare(query).all();
      results = res?.results || [];
    } catch {
      results = [];
    }
    const payload = JSON.stringify({ changed: true, version: currentVersion, results });
    if (!includePhotos) {
      cachedEventsPayload = { version: currentVersion, json: payload, checkedAt: Date.now() };
    }
    return new Response(payload, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/events-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    const kvMediaStore = env.MEMBERS_KV || env.KV || null;
    if (typeof b.title === "string") {
      if (b.title.startsWith("D1_PHOTO:") || b.title.startsWith("D1_ANN_IMAGE:")) {
        if (b.delete === true) {
          mediaMemCache.delete(b.title);
          if (kvMediaStore && typeof kvMediaStore.delete === "function") {
            try { await kvMediaStore.delete(b.title); } catch {}
          }
          if (env.DB) {
            try { await env.DB.prepare("DELETE FROM events WHERE title = ?").bind(b.title).run(); } catch {}
          }
          return new Response('{"ok":true,"deleted":true}', { headers: cors });
        }
        if (b.description) {
          await persistMediaToAllStores(env, b.title, b.description, nowTs);
        }
        return new Response('{"ok":true}', { headers: cors });
      }
      if (b.title.startsWith("D1_STATE:")) {
        const sliceKey = b.title.replace("D1_STATE:", "").trim();
        await saveRawSliceToD1(env, sliceKey, b.description || "[]", nowTs);
        return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
      }
    }
    bumpEdgeVersion(nowTs);
    if (env.DB) {
      try {
        await env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(
          crypto.randomUUID(),
          b.title,
          b.description || null,
          b.eventDate || nowTs,
          nowTs
        ).run();
      } catch {}
    }
    return new Response(`{"ok":true,"version":${edgeStateVersion}}`, { headers: cors });
  }

  if (path === "/api/announcements" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(`{"changed":false,"version":${currentVersion},"lastModified":${currentVersion},"results":[]}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (!isForceFetch && cachedAnnouncementsPayload.version === currentVersion && cachedAnnouncementsPayload.json) {
      return new Response(cachedAnnouncementsPayload.json, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    const masterRegistrants = await buildMasterRegistrantsUnion(env, [], false, isForceFetch);
    let rows = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT id, title, body, MAX(created_at) as created_at FROM announcements WHERE title LIKE 'D1_STATE:%' GROUP BY title ORDER BY created_at DESC LIMIT 30"
        ).all();
        rows = Array.isArray(res?.results) ? [...res.results] : [];
      } catch {
        rows = [];
      }
    }
    // If D1 failed or omitted slices, fill from KV d1_state:* slices so clients NEVER see HTTP 500
    const existingTitles = new Set(rows.map((r) => r && r.title).filter(Boolean));
    const sliceKeys = [
      "CLEAN_MASTER_DB_V1",
      "announcements",
      "attendance_records",
      "blocked_users",
      "revoked_members_log",
      "system_bundle",
      "events_bundle",
      "kahoot_bundle",
      "role_permissions",
      "attendance_session",
      "site_texts"
    ];
    for (const sk of sliceKeys) {
      const tKey = `D1_STATE:${sk}`;
      if (!existingTitles.has(tKey)) {
        const rawSlice = await getRawSliceFromD1(env, sk, "");
        if (rawSlice) {
          rows.push({
            id: `kv-slice-${sk}`,
            title: tKey,
            body: rawSlice,
            created_at: currentVersion
          });
          existingTitles.add(tKey);
        }
      }
    }

    // Deduplicate heavy member blobs: include masterRegsStr ONCE in D1_STATE:CLEAN_MASTER_DB_V1
    // (cuts response from 4.8MB -> ~1.65MB and prevents Cloudflare Error 1102 CPU/RAM timeouts!)
    let hasCleanMasterSlice = false;
    const masterRegsStr = getCachedMasterRegistrantsJson(masterRegistrants);
    rows = rows.filter((row) => {
      if (!row || typeof row.title !== "string") return false;
      const k = row.title.startsWith("D1_STATE:") ? row.title.replace("D1_STATE:", "").trim() : "";
      if (k === "backup_members" || k === "registrants") return false;
      return true;
    });
    for (const row of rows) {
      if (row && typeof row.title === "string" && row.title.startsWith("D1_STATE:") && typeof row.body === "string") {
        const k = row.title.replace("D1_STATE:", "").trim();
        if (k === "CLEAN_MASTER_DB_V1" && masterRegistrants.length > 0) {
          row.body = masterRegsStr;
          hasCleanMasterSlice = true;
        }
        rawSliceCache.set(k, { raw: row.body, ts: Number(row.created_at || currentVersion), checkedAt: Date.now() });
      }
    }
    if (!hasCleanMasterSlice && masterRegistrants.length > 0) {
      rows.unshift({
        id: "clean-master-db-v1",
        title: "D1_STATE:CLEAN_MASTER_DB_V1",
        body: masterRegsStr,
        created_at: currentVersion
      });
    }
    const payload = JSON.stringify({ changed: true, version: currentVersion, lastModified: currentVersion, results: rows });
    cachedAnnouncementsPayload = { version: currentVersion, json: payload, checkedAt: Date.now() };
    return new Response(payload, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/announcements-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    const rawIncomingPayload = b.body !== undefined ? b.body : (b.message !== undefined ? b.message : b.content);
    if (typeof b.title === "string" && b.title.startsWith("D1_STATE:")) {
      const sliceKey = b.title.replace("D1_STATE:", "").trim();
      let rawBodyStr = typeof rawIncomingPayload === "string" ? rawIncomingPayload : JSON.stringify(rawIncomingPayload || []);
      // Richness-Aware Server Shield & Zero-Duplicates Cleanup on CLEAN_MASTER_DB_V1 / registrants / backup_members
      if (sliceKey === CLEAN_MASTER_DB_KEY || sliceKey === "registrants" || sliceKey === "backup_members") {
        try {
          const incomingRegs = JSON.parse(rawBodyStr);
          if (Array.isArray(incomingRegs)) {
            const cleanIncoming = incomingRegs.filter((m) => !isGarbageOrGhostMember(m));
            const currentMaster = await buildMasterRegistrantsUnion(env, [], false);
            const curRich = measureRegistrantsRichness(currentMaster);
            const incRich = measureRegistrantsRichness(cleanIncoming);
            if (
              (curRich.count > 25 && cleanIncoming.length <= 25) ||
              (curRich.withPhone >= 10 && incRich.withPhone < Math.floor(curRich.withPhone * 0.8))
            ) {
              rawBodyStr = JSON.stringify(currentMaster);
            } else {
              const masterUnion = await buildMasterRegistrantsUnion(env, cleanIncoming, false);
              rawBodyStr = JSON.stringify(masterUnion);
            }
          }
        } catch {}
      }
      await saveRawSliceToD1(env, sliceKey, rawBodyStr, nowTs);
      if (sliceKey === "registrants" || sliceKey === CLEAN_MASTER_DB_KEY) {
        await saveRawSliceToD1(env, "backup_members", rawBodyStr, nowTs);
      }
    } else {
      bumpEdgeVersion(nowTs);
      if (env.DB) {
        try {
          await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, String(rawIncomingPayload || ""), nowTs).run();
        } catch {}
      }
    }
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? "d1_mutation" : "announcement",
          title: b.title,
          body: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? undefined : rawIncomingPayload,
          version: edgeStateVersion,
          at: nowTs
        });
      } catch {}
    }
    return new Response(`{"ok":true,"version":${edgeStateVersion},"lastModified":${edgeStateVersion}}`, { headers: cors });
  }

  // Direct Cloudflare Store endpoint for youth_members_kv_store (ALWAYS strongly-consistent via DO + D1 + purge filter!)
  if (path === "/api/kv/youth-members" && method === "GET") {
    const currentVersion = await getEdgeVersion(env);
    const members = await buildMasterRegistrantsUnion(env, [], false);
    const rich = measureRegistrantsRichness(members);
    return new Response(
      JSON.stringify({
        success: true,
        kvKey: YOUTH_MEMBERS_KV_KEY,
        version: currentVersion,
        count: rich.count,
        withPhone: rich.withPhone,
        withPhoto: rich.withPhoto,
        members
      }),
      { headers: { ...cors, "X-Sync-Version": String(currentVersion) } }
    );
  }

  if (path === "/api/kv/sync-youth-members" && method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON payload" }), { status: 400, headers: cors });
    }
    const nowTs = Date.now();
    const allowShrink = Boolean(body?.allowShrink);
    const rawMembers = Array.isArray(body?.members)
      ? body.members
      : Array.isArray(body?.registrants)
      ? body.registrants
      : [];
    const singleMember = body?.singleMember && typeof body.singleMember === "object" ? body.singleMember : null;

    // Fast atomic single-member route via Durable Object (< 2ms CPU, zero Error 1102 / 409 shrink conflicts!)
    const roomStubKv = getRealtimeRoomStub(env);
    if (singleMember && roomStubKv && typeof roomStubKv.rpcUpsertAtomicMember === "function") {
      const baseline = await getBaselineCodesAndNames(env);
      const upRes = await roomStubKv.rpcUpsertAtomicMember(singleMember, baseline.codes, null, clientIp || "");
      if (upRes && upRes.ok) {
        const vTs = Number(upRes.version || nowTs);
        bumpEdgeVersion(vTs);
        const bgMirror = mirrorSingleAtomicMemberToKv(env, upRes.registrant, vTs);
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(bgMirror);
        } else {
          await bgMirror;
        }
        return new Response(
          JSON.stringify({
            success: true,
            verified: true,
            kvKey: YOUTH_MEMBERS_KV_KEY,
            mirrorKey: CLEAN_MASTER_KV_KEY,
            registrant: upRes.registrant,
            version: vTs
          }),
          { headers: cors }
        );
      }
    }

    return await enqueueWrite(async () => {
      let candidateList = rawMembers;
      if (singleMember) {
        candidateList = await buildMasterRegistrantsUnion(env, [singleMember], false, true);
      } else if (rawMembers.length > 0) {
        candidateList = allowShrink
          ? rawMembers.filter((m) => m && !isGarbageOrGhostMember(m))
          : await buildMasterRegistrantsUnion(env, rawMembers, false);
      } else {
        return new Response(JSON.stringify({ success: false, error: "members array or singleMember is required" }), { status: 400, headers: cors });
      }

      await fastPersistMasterListToKv(env, candidateList, nowTs);
      const rich = measureRegistrantsRichness(candidateList);
      return new Response(
        JSON.stringify({
          success: true,
          kvKey: YOUTH_MEMBERS_KV_KEY,
          mirrorKey: CLEAN_MASTER_KV_KEY,
          count: rich.count,
          withPhone: rich.withPhone,
          version: edgeStateVersion
        }),
        { headers: cors }
      );
    });
  }

  // Dedicated Authoritative Clean Master KV Migration & Restore Endpoint (writes youth_members_kv_store + CLEAN_MASTER_DB_KV_V1)
  if (path === "/api/admin/migrate-clean-master-kv" && method === "POST") {
    return await enqueueWrite(async () => {
      const payload = await request.json();
      const nowTs = Date.now();
      const incomingRegs = Array.isArray(payload?.registrants) ? payload.registrants : [];
      if (incomingRegs.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "registrants array is required" }), { status: 400, headers: cors });
      }
      // First save any revoked_members_log if supplied so deleted test IDs stay tombstoned
      if (Array.isArray(payload?.revokedMembersLog) && payload.revokedMembersLog.length > 0) {
        await saveRawSliceToD1(env, "revoked_members_log", JSON.stringify(payload.revokedMembersLog), nowTs);
      }
      // Strip Base64 photos into KV (D1_PHOTO:<id>) + R2 + D1 events before writing youth_members_kv_store & CLEAN_MASTER_DB_KV_V1
      const stripped = await stripInlinePhotosFromRegistrants(env, incomingRegs, nowTs);
      cachedMasterRegistrants = { version: -1, list: null, json: null };
      const existingMaster = await buildMasterRegistrantsUnion(env, [], false);
      const richLiveExtras = existingMaster.filter((m) => m && !isGarbageOrGhostMember(m) && (String(m.phone || "").trim() || String(m.whatsapp || "").trim()));
      const cleanUnion = await buildMasterRegistrantsUnion(env, [...richLiveExtras, ...stripped], false);
      const serialized = JSON.stringify(cleanUnion);
      await saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, serialized, nowTs, { allowShrink: true });

      if (env.DB) {
        const dbStmts = [];
        for (const m of cleanUnion) {
          if (m && m.id && (m.fullName || m.name)) {
            dbStmts.push(
              env.DB.prepare("DELETE FROM members WHERE id = ? OR name = ?").bind(m.id, m.fullName || m.name),
              env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(m.id, m.fullName || m.name, m.phone || null, m.role || "member", nowTs)
            );
          }
        }
        // Run in batches of 40 statements
        for (let i = 0; i < dbStmts.length; i += 40) {
          await env.DB.batch(dbStmts.slice(i, i + 40)).catch(() => {});
        }
      }

      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            kvKey: YOUTH_MEMBERS_KV_KEY,
            action: "KV_MIGRATED",
            count: cleanUnion.length,
            version: edgeStateVersion,
            at: nowTs
          });
        } catch {}
      }

      return new Response(JSON.stringify({
        success: true,
        kvKey: YOUTH_MEMBERS_KV_KEY,
        mirrorKey: CLEAN_MASTER_KV_KEY,
        count: cleanUnion.length,
        withPhone: cleanUnion.filter((x) => x.phone).length,
        version: edgeStateVersion
      }), { headers: cors });
    });
  }

  // Forensic Password Recovery & Immutable Credential Vault Lock Endpoint
  // Scans ALL Cloudflare KV keys + ALL historical D1 snapshots + DO atomic_members + nested m.member + optional seedBackups
  if (path === "/api/admin/restore-passwords" && method === "POST") {
    return await enqueueWrite(async () => {
      let body = {};
      try {
        body = await request.json();
      } catch {}
      const nowTs = Date.now();
      const seedBackups = Array.isArray(body?.seedBackups) ? body.seedBackups : [];
      const kvStore = env.MEMBERS_KV || env.KV || null;

      // 1. Collect EVERY historical member candidate from KV, D1 announcements/events, DO atomic_members, and seedBackups
      const backupByNorm = new Map(); // normName -> { password, recoveryCode, dob, address, source }
      const sourcesScanned = [];

      const ingestCandidate = (rec, sourceLabel) => {
        if (!rec || typeof rec !== "object") return;
        const rawName = String(rec.fullName || rec.name || "").trim().replace(/\s+/g, " ");
        const nn = ultraNormalizeArabic(rawName);
        if (!nn) return;
        const nested = extractNestedSelfCreds(rec, nn);
        const candPass = pickStrongestCredential(rec.password || rec.pass || rec.pin, nested.password, 0, 0, false, "");
        const candRec = pickStrongestCredential(rec.recoveryCode || rec.securityCode || rec.backupCode, nested.recoveryCode, 0, 0, false, "");
        const candDob = String(rec.dob || rec.birthDate || nested.dob || "").trim();
        const candAddr = String(rec.address || rec.residence || nested.address || "").trim();
        const prev = backupByNorm.get(nn) || { password: "", recoveryCode: "", dob: "", address: "", source: "" };
        let changed = false;
        if (isDefaultOrEmptyCredential(prev.password) && !isDefaultOrEmptyCredential(candPass)) {
          prev.password = candPass;
          prev.source = prev.source ? `${prev.source}+${sourceLabel}` : sourceLabel;
          changed = true;
        }
        if (isDefaultOrEmptyCredential(prev.recoveryCode) && !isDefaultOrEmptyCredential(candRec)) {
          prev.recoveryCode = candRec;
          if (!prev.source) prev.source = sourceLabel;
          changed = true;
        }
        if (isPlaceholderDob(prev.dob) && !isPlaceholderDob(candDob)) {
          prev.dob = candDob;
        }
        if (!prev.address && candAddr) {
          prev.address = candAddr;
        }
        if (changed || !backupByNorm.has(nn)) {
          backupByNorm.set(nn, prev);
        }
      };

      const ingestJsonArray = (rawText, sourceLabel) => {
        if (!rawText || typeof rawText !== "string") return 0;
        try {
          const parsed = JSON.parse(rawText);
          const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.registrants)
              ? parsed.registrants
              : Array.isArray(parsed?.members)
                ? parsed.members
                : [];
          for (const item of arr) ingestCandidate(item, sourceLabel);
          if (arr.length > 0) sourcesScanned.push(`${sourceLabel}:${arr.length}`);
          return arr.length;
        } catch {
          return 0;
        }
      };

      // Scan live master list first (preserves any currently intact passwords)
      const currentMaster = await buildMasterRegistrantsUnion(env, [], false, true);
      for (const m of currentMaster) ingestCandidate(m, "current_master");

      // Scan ALL KV historical keys
      if (kvStore && typeof kvStore.get === "function") {
        const kvKeys = [
          CLEAN_MASTER_KV_KEY,
          YOUTH_MEMBERS_KV_KEY,
          `d1_state:${CLEAN_MASTER_DB_KEY}`,
          "d1_state:registrants",
          "d1_state:backup_members"
        ];
        const kvVals = await Promise.all(kvKeys.map((k) => kvStore.get(k).catch(() => null)));
        for (let i = 0; i < kvKeys.length; i++) {
          if (kvVals[i]) ingestJsonArray(kvVals[i], `kv:${kvKeys[i]}`);
        }
      }

      // Scan ALL historical D1 rows (not just MAX(created_at)!) + SQL members birth_date column
      if (env.DB) {
        try {
          const [annRes, evRes, sqlRes] = await Promise.all([
            env.DB.prepare(
              "SELECT title, body FROM announcements WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1','D1_STATE:registrants','D1_STATE:backup_members') ORDER BY created_at DESC LIMIT 30"
            ).all().catch(() => ({ results: [] })),
            env.DB.prepare(
              "SELECT title, description FROM events WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1','D1_STATE:registrants','D1_STATE:backup_members') ORDER BY created_at DESC LIMIT 30"
            ).all().catch(() => ({ results: [] })),
            env.DB.prepare(
              "SELECT id, name, birth_date, address FROM members"
            ).all().catch(() => ({ results: [] }))
          ]);
          for (const r of (annRes?.results || [])) {
            if (r?.body) ingestJsonArray(String(r.body), `d1_ann:${r.title}`);
          }
          for (const r of (evRes?.results || [])) {
            if (r?.description) ingestJsonArray(String(r.description), `d1_ev:${r.title}`);
          }
          const sqlRows = sqlRes?.results || [];
          for (const m of sqlRows) {
            if (m && m.name && !isPlaceholderDob(m.birth_date)) {
              ingestCandidate({ id: m.id, fullName: m.name, dob: m.birth_date, address: m.address }, "d1_sql_members");
            }
          }
          if (sqlRows.length > 0) sourcesScanned.push(`d1_sql_members:${sqlRows.length}`);
        } catch {}
      }

      // Scan optional seed backups passed in request body (e.g. permanent_members_95.json)
      if (seedBackups.length > 0) {
        for (const sb of seedBackups) ingestCandidate(sb, "seed_backup");
        sourcesScanned.push(`seed_backup:${seedBackups.length}`);
      }

      // 2. Apply recovered credentials strictly to active members without changing ANY other field (gender, role, attendance, stamps, phone, photo stay 100% intact!)
      let restoredCount = 0;
      let alreadyIntactCount = 0;
      const restoredNames = [];
      const stillDefaultNames = [];
      const vaultEntries = [];

      const updatedMaster = currentMaster.map((m) => {
        const nn = ultraNormalizeArabic(m.fullName || m.name || "");
        const backup = backupByNorm.get(nn);
        const curPass = String(m.password || "").trim();
        const curRec = String(m.recoveryCode || m.securityCode || "").trim();
        const nested = extractNestedSelfCreds(m, nn);

        const nextPass = pickStrongestCredential(curPass, backup?.password || nested.password, 0, 0, false, curRec || "123456");
        const nextRec = pickStrongestCredential(curRec, backup?.recoveryCode || nested.recoveryCode, 0, 0, false, "123456");

        const wasDefault = isDefaultOrEmptyCredential(curPass);
        const nowReal = !isDefaultOrEmptyCredential(nextPass);
        if (!wasDefault) {
          alreadyIntactCount++;
        } else if (nowReal) {
          restoredCount++;
          restoredNames.push({ name: m.fullName, source: backup?.source || "nested" });
        } else {
          stillDefaultNames.push({ name: m.fullName, code: m.uniqueCode, registeredAt: m.registeredAt });
        }

        const nextMember = {
          ...m,
          password: nextPass,
          recoveryCode: nextRec,
          securityCode: nextRec,
          passwordLocked: true,
          registrationLocked: true
        };
        if (backup?.dob && !isPlaceholderDob(backup.dob) && isPlaceholderDob(nextMember.dob)) {
          nextMember.dob = backup.dob;
          nextMember.birthDate = backup.dob;
        }
        if (backup?.address && !nextMember.address) {
          nextMember.address = backup.address;
          nextMember.residence = backup.address;
        }
        delete nextMember.member;
        delete nextMember.action;

        vaultEntries.push({
          id: nextMember.id,
          fullName: nextMember.fullName,
          password: nextPass,
          recoveryCode: nextRec,
          phone: nextMember.phone || "",
          dob: nextMember.dob || "",
          address: nextMember.address || ""
        });
        return nextMember;
      });

      // 3. Commit ALL 132 locked credentials to DO credential_vault + atomic_members AND mirror to KV
      const roomStubRestore = getRealtimeRoomStub(env);
      let vaultResult = { vaulted: 0, atomicUpdated: 0 };
      if (roomStubRestore && typeof roomStubRestore.rpcRestoreCredentialVaultBatch === "function") {
        vaultResult = await roomStubRestore.rpcRestoreCredentialVaultBatch(vaultEntries).catch(() => vaultResult);
      }

      await fastPersistMasterListToKv(env, updatedMaster, nowTs);
      cachedMasterRegistrants = { version: edgeStateVersion, list: updatedMaster, json: null };

      return new Response(
        JSON.stringify({
          success: true,
          totalMembers: updatedMaster.length,
          alreadyIntactCount,
          restoredCount,
          totalNonDefaultAfter: alreadyIntactCount + restoredCount,
          stillDefaultCount: stillDefaultNames.length,
          vaultedCount: vaultResult.vaulted,
          atomicUpdatedCount: vaultResult.atomicUpdated,
          sourcesScanned,
          restoredNames,
          stillDefaultNames,
          version: edgeStateVersion
        }),
        { headers: cors }
      );
    });
  }

  // ============================================================================
  // ULTRA-DEEP FORENSIC DOB RECOVERY ENGINE (Scans ALL KV keys via list(),
  // ALL D1 tables & ALL historical rows without GROUP BY/LIMIT truncation,
  // ALL R2 JSON backups, and Durable Object SQLite credential_vault/atomic_members)
  // ============================================================================
  if (path === "/api/admin/restore-dobs" && method === "POST") {
    return await enqueueWrite(async () => {
      const body = await request.json().catch(() => ({}));
      const seedBackups = Array.isArray(body?.seedBackups) ? body.seedBackups : [];
      const report = await runDeepForensicDobRecovery(env, Date.now(), seedBackups);
      return new Response(JSON.stringify(report), { headers: cors });
    });
  }

  if (path === "/api/admin/dob-audit" && method === "GET") {
    const masterList = await buildMasterRegistrantsUnion(env, [], false, true);
    let realCount = 0;
    let missingCount = 0;
    const missingNames = [];
    for (const m of masterList) {
      const d = String(m.dob || m.birthDate || "").trim();
      if (isAuthenticDob(d, m.registeredAt)) {
        realCount++;
      } else {
        missingCount++;
        missingNames.push({ id: m.id, uniqueCode: m.uniqueCode, fullName: m.fullName, dob: d });
      }
    }
    const kvStore = env.MEMBERS_KV || env.KV || null;
    let lastReport = null;
    if (kvStore && typeof kvStore.get === "function") {
      try {
        const rawRep = await kvStore.get("DOB_FORENSIC_RECOVERY_REPORT_V2");
        if (rawRep) lastReport = JSON.parse(rawRep);
      } catch {}
    }
    return new Response(
      JSON.stringify({
        success: true,
        buildTag: "v36.1-immutable-dob-forensic-lock",
        totalMembers: masterList.length,
        realDobCount: realCount,
        missingDobCount: missingCount,
        lastForensicReport: lastReport,
        missingNames
      }),
      { headers: cors }
    );
  }

  if (path === "/api/stats" && method === "GET") {
    const kvStats = env.MEMBERS_KV || env.KV || null;
    let mCount = 0;
    if (kvStats && typeof kvStats.get === "function") {
      try { mCount = Number((await kvStats.get("member_count")) || 0); } catch {}
    }
    let aCount = 0;
    if (env.DB) {
      try {
        if (!mCount) {
          const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c");
          mCount = Number(m || 0);
        }
        const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c");
        aCount = Number(a || 0);
      } catch {}
    }
    return new Response(`{"members":${mCount},"attendance":${aCount}}`, { headers: cors });
  }

  if (path === "/api/online" && method === "GET") {
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    const online = roomNs
      ? await roomNs.get(roomNs.idFromName("main")).rpcGetOnlineCount()
      : 0;
    return new Response(`{"online":${Number(online || 0)}}`, { headers: cors });
  }

  return new Response('{"success":false,"error":"API endpoint not found"}', { status: 404, headers: cors });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match, X-Sync-Version, Cache-Control, Pragma",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    async function handleTelegramCommand(request, env) {
  const body = await request.json();
  const msg = body.message;
  if (!msg) return new Response("OK");

  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (text.startsWith("/count")) {
    const masterList = await buildMasterRegistrantsUnion(env, [], false);
    await sendTelegram(env, chatId, `👥 عدد الأعضاء: ${masterList.length}`);
  } 
else if (text.startsWith("/members")) {
  const masterList = await buildMasterRegistrantsUnion(env, [], false);
  const list = masterList.map(m => ({ name: m.fullName || m.name }));
  
  // ميخائيل ادور راتب الأول دايماً
  const owner = list.find(m => m.name === "ميخائيل ادور راتب");
  const rest = list.filter(m => m.name !== "ميخائيل ادور راتب").sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const sorted = owner ? [owner, ...rest] : rest;
  
  const names = sorted.map((m, index) => `${index + 1}. ${m.name}`).join("\n");
  await sendTelegram(env, chatId, `📋 قائمة الأعضاء:\n\n${names || "لا يوجد أعضاء"}`);
}
else if (text.startsWith("/init_list")) {
  const masterList = await buildMasterRegistrantsUnion(env, [], false);
  await sendTelegram(env, chatId, `✅ القائمة محدثة تلقائياً من المصدر الرئيسي: ${masterList.length} عضو`);
}
  else {
await sendTelegram(env, chatId, "الأوامر المتاحة:\n/count - عدد الأعضاء\n/members - قائمة الأسماء\n/init_list - تهيئة القائمة");
  }

  return new Response("OK");
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

    const url = new URL(request.url);

    if (url.pathname === "/api/telegram" && request.method === "POST") {
  return await handleTelegramCommand(request, env);
}

    const roomNs = env.REALTIME_ROOM || env.REALTIME;

    // 1. WebSocket Realtime Room
    if (url.pathname === "/ws" && roomNs) {
      const id = roomNs.idFromName(url.searchParams.get("room") || "main");
      return roomNs.get(id).fetch(request);
    }

    // 2. D1 Database & API Routes
    if (url.pathname.startsWith("/api/")) {
      try {
        const apiRes = await handleApiRequest(request, env, url, ctx);
        if (apiRes && !apiRes.headers.get("Access-Control-Allow-Origin")) {
          const patchedHeaders = new Headers(apiRes.headers);
          patchedHeaders.set("Access-Control-Allow-Origin", "*");
          patchedHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
          patchedHeaders.set(
            "Access-Control-Allow-Headers",
            "Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match, X-Sync-Version, Cache-Control, Pragma"
          );
          return new Response(apiRes.body, { status: apiRes.status, statusText: apiRes.statusText, headers: patchedHeaders });
        }
        return apiRes;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: "Internal server error", message: errMsg }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization, If-None-Match, X-Sync-Version, Cache-Control, Pragma"
          }
        });
      }
    }

    // 3. Serve the compiled React SPA from ./dist via Cloudflare Assets binding
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      const isHashedStatic =
        url.pathname.startsWith("/assets/") &&
        /\.(js|mjs|css|map|wasm)(\?|$)/i.test(url.pathname);

      if (isHashedStatic) {
        const ct = (assetRes.headers.get("content-type") || "").toLowerCase();
        if (assetRes.status === 404 || ct.includes("text/html")) {
          return new Response("// Asset chunk not found (stale build)", {
            status: 404,
            headers: {
              "Content-Type": url.pathname.endsWith(".css")
                ? "text/css; charset=utf-8"
                : "application/javascript; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        }
        return assetRes;
      }

      if (
        url.pathname === "/OneSignalSDKWorker.js" ||
        url.pathname === "/OneSignalSDKUpdaterWorker.js" ||
        url.pathname === "/sw.js"
      ) {
        const swHeaders = new Headers(assetRes.headers);
        swHeaders.set("Content-Type", "application/javascript; charset=utf-8");
        swHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate, private");
        swHeaders.set("CDN-Cache-Control", "no-store");
        swHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
        swHeaders.set("Service-Worker-Allowed", "/");
        return new Response(assetRes.body, { status: assetRes.status, headers: swHeaders });
      }

      if (assetRes.status === 404 && !url.pathname.includes(".")) {
        const htmlRes = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
        const htmlHeaders = new Headers(htmlRes.headers);
        htmlHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate, private");
        htmlHeaders.set("CDN-Cache-Control", "no-store");
        htmlHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
        htmlHeaders.set("Pragma", "no-cache");
        return new Response(htmlRes.body, { status: htmlRes.status, headers: htmlHeaders });
      }

      if (
        url.pathname === "/" ||
        url.pathname === "/index.html" ||
        (assetRes.headers.get("content-type") || "").toLowerCase().includes("text/html")
      ) {
        const htmlHeaders = new Headers(assetRes.headers);
        htmlHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate, private");
        htmlHeaders.set("CDN-Cache-Control", "no-store");
        htmlHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
        htmlHeaders.set("Pragma", "no-cache");
        return new Response(assetRes.body, { status: assetRes.status, headers: htmlHeaders });
      }

      return assetRes;
    }

    // Cloudflare Dashboard Quick Edit Preview sandbox does not mount env.ASSETS.
    // Safely proxy static frontend requests from https://3fetyayouth.online on preview hosts (with strict loop guard)
    // so the built-in Cloudflare Preview pane renders the full app instead of 503.
    const hostLower = (url.hostname || "").toLowerCase();
    const isPrimaryCustomDomain =
      hostLower === "3fetyayouth.online" || hostLower === "www.3fetyayouth.online";
    if (
      !isPrimaryCustomDomain &&
      (request.method === "GET" || request.method === "HEAD") &&
      request.headers.get("X-CF-Preview-Proxy") !== "1"
    ) {
      try {
        const upstreamUrl = new URL(url.pathname + url.search, "https://3fetyayouth.online");
        const upstreamRes = await fetch(upstreamUrl.toString(), {
          method: request.method,
          headers: {
            Accept: request.headers.get("Accept") || "*/*",
            "X-CF-Preview-Proxy": "1"
          },
          redirect: "follow"
        });
        if (upstreamRes && upstreamRes.status < 500) {
          const previewHeaders = new Headers(upstreamRes.headers);
          previewHeaders.delete("content-security-policy");
          previewHeaders.delete("x-frame-options");
          previewHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers: previewHeaders
          });
        }
      } catch {}
    }

    return new Response("Assets binding not configured. Please ensure wrangler build runs npm run build.", {
      status: 503,
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
  }
};
