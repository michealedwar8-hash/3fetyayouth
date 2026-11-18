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
let cachedMasterRegistrants = { version: -1, list: null };

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

const CLEAN_MASTER_DB_KEY = "CLEAN_MASTER_DB_V1";

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
  { num: 96, name: "مارتينا انطونيوس بقطر", gender: "female" }
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

function isWhitelistedWorkerMember(idOrCode, name) {
  const idClean = String(idOrCode || "").trim();
  const bare = getBaseMemberId(idClean).replace(/^reg_member_/, "");
  const norm = ultraNormalizeArabic(name || "");
  if (idClean === "reg_owner_main" || bare === "reg_owner_main" || idClean === "TY-0001") return true;
  if (bare === "reg_1794593070300_az5o" || bare === "reg_1794593070300_martina" || bare === "reg_1794592057854_hcqz" || bare === "reg_1794605308722_yuhs") return true;
  if (matchWorkerTargetThreeRule(idClean) || matchWorkerTargetThreeRule(name)) return true;
  for (const item of VERIFIED_95_MANIFEST) {
    if (norm && ultraNormalizeArabic(item.name) === norm) return true;
  }
  if (
    norm &&
    (norm.startsWith(ultraNormalizeArabic("مكرم مدحت")) ||
      norm.startsWith(ultraNormalizeArabic("مريم جابر")) ||
      norm.startsWith(ultraNormalizeArabic("اسطفانوس ايمن")))
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

function isGarbageOrGhostMember(m) {
  if (!m || typeof m !== "object") return true;
  if (m.status === "cancelled" || m.status === "deleted" || m.isDeleted === true || m.deleted === true) return true;
  const name = String(m.fullName || m.name || "").trim();
  if (!name || name.length < 2) return true;
  if (name === "عضو" || name === "undefined" || name === "null") return true;
  if (name.includes("عضو مسجل")) return true;
  if (/^عضو\s*#?\s*\d+$/i.test(name)) return true;
  return false;
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
  const dob = String(raw.dob || raw.birthDate || "2002-01-01").trim();
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

async function getEdgeVersion(env) {
  const now = Date.now();
  if (edgeStateVersion > 0 && now - lastVersionCheckTs < 250) {
    return edgeStateVersion;
  }
  const kvStore = env.MEMBERS_KV || env.KV || null;
  let dbMax = 0;
  if (env.DB) {
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
  if (kvStore && typeof kvStore.get === "function") {
    try {
      const kvVer = await kvStore.get("d1_edge_version");
      if (kvVer) dbMax = Math.max(dbMax, Number(kvVer) || 0);
    } catch {}
  }
  if (!dbMax) dbMax = edgeStateVersion || now;
  if (dbMax !== edgeStateVersion) {
    rawSliceCache.clear();
    cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
    cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
    cachedMasterRegistrants = { version: -1, list: null };
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
  cachedMasterRegistrants = { version: -1, list: null };
  return edgeStateVersion;
}

// Reads a single D1_STATE:<key> slice from D1 with automatic Cloudflare KV fallback
async function getRawSliceFromD1(env, sliceKey, fallbackRaw = "[]") {
  const now = Date.now();
  const cached = rawSliceCache.get(sliceKey);
  if (cached && cached.raw && now - (cached.checkedAt || 0) < 250) {
    return cached.raw;
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
  const kvStore = env.MEMBERS_KV || env.KV || null;
  if (kvStore && typeof kvStore.get === "function") {
    try {
      const kvVal = await kvStore.get(`d1_state:${sliceKey}`);
      if (typeof kvVal === "string" && kvVal.length > 0) {
        rawSliceCache.set(sliceKey, { raw: kvVal, ts: now, checkedAt: now });
        return kvVal;
      }
    } catch {}
  }
  return fallbackRaw;
}

async function saveRawSliceToD1(env, sliceKey, rawString, nowTs = Date.now()) {
  rawSliceCache.set(sliceKey, { raw: rawString, ts: nowTs, checkedAt: Date.now() });
  const nextVer = bumpEdgeVersion(nowTs);
  const kvStore = env.MEMBERS_KV || env.KV || null;
  if (kvStore && typeof kvStore.put === "function") {
    try {
      await kvStore.put(`d1_state:${sliceKey}`, rawString);
      await kvStore.put("d1_edge_version", String(nextVer));
      if (sliceKey === "registrants") {
        try {
          const parsed = JSON.parse(rawString);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const lightNames = parsed
              .filter((m) => m && !isGarbageOrGhostMember(m))
              .map((m) => ({
                id: m.id,
                name: m.fullName || m.name,
                created_at: m.created_at || nowTs
              }));
            await kvStore.put("member_list", JSON.stringify(lightNames));
            await kvStore.put("member_count", String(lightNames.length));
          }
        } catch {}
      }
    } catch {}
  }
  if (!env.DB) return;
  try {
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
  } catch {}
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
  'ناهد', 'نجلاء', 'نجوى', 'نهى', 'نهي', 'نهال', 'هايدي', 'هدير', 'هدى', 'هدي', 'هبه', 'هبة', 'هنا', 'هناء', 'هنادي', 'وفاء', 'ولاء', 'يوأنا', 'يوانا'
]);

const MALE_ENDING_WITH_TA = new Set([
  'اسامه', 'أسامة', 'حمزه', 'حمزة', 'طلحه', 'طلحة', 'عبيده', 'عبيدة',
  'معاويه', 'معاوية', 'شحاته', 'شحاتة', 'عطيه', 'عطية', 'سلامه', 'سلامة'
]);

function detectAndRepairGender(member) {
  if (!member || typeof member !== "object") return "male";
  const explicitManual = String(
    member.manualGender ||
    member.genderCode ||
    (member.genderLocked ? (member.gender || member.sex || "") : "")
  ).trim().toLowerCase();
  if (explicitManual === "female" || explicitManual === "f" || explicitManual === "انثى" || explicitManual === "أنثى" || explicitManual === "شابة") return "female";
  if (explicitManual === "male" || explicitManual === "m" || explicitManual === "ذكر" || explicitManual === "شاب") return "male";

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

  const fullName = String(member.name || member.fullName || "").trim();
  const originalFirstName = fullName.split(/\s+/)[0] || "";
  const firstName = originalFirstName
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

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
async function buildMasterRegistrantsUnion(env, incomingList = [], persistIfExpanded = true) {
  const hasIncoming = Array.isArray(incomingList) && incomingList.length > 0;

  // O(1) Edge RAM Fast Path (< 0.1ms): if no incoming mutation and cachedMasterRegistrants is fresh
  if (
    !hasIncoming &&
    cachedMasterRegistrants.version === edgeStateVersion &&
    Array.isArray(cachedMasterRegistrants.list) &&
    cachedMasterRegistrants.list.length >= 96
  ) {
    return cachedMasterRegistrants.list;
  }

  // Note: When cachedMasterRegistrants is cold or invalidated by a mutation (edgeStateVersion incremented),
  // we always union CLEAN_MASTER_DB_V1 + D1_STATE:registrants + SQL members below and cache in cachedMasterRegistrants.

  const sources = [];
  const tombstoneIds = new Set();
  const tombstoneNames = new Set();

  if (env.DB) {
    try {
      const [sliceRowsRes, sqlMembersRes, revRes] = await Promise.all([
        env.DB.prepare(
          "SELECT title, body, created_at FROM announcements WHERE title IN ('D1_STATE:CLEAN_MASTER_DB_V1', 'D1_STATE:registrants', 'D1_STATE:backup_members', 'D1_STATE:members', 'D1_STATE:app_state', 'D1_STATE:all_members_v1') ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all(),
        env.DB.prepare(
          "SELECT body FROM announcements WHERE title = 'D1_STATE:revoked_members_log' ORDER BY created_at DESC LIMIT 1"
        ).first()
      ]);

      if (revRes && typeof revRes.body === "string") {
        try {
          const parsedRev = JSON.parse(revRes.body);
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
                const nName = normalizeWorkerArabic(entry.normalizedName || entry.fullName || entry.name || "");
                if (nName) tombstoneNames.add(nName);
              }
            }
          }
        } catch {}
      }

      const sliceRows = (sliceRowsRes && sliceRowsRes.results) || [];
      for (const row of sliceRows) {
        if (!row || typeof row.body !== "string") continue;
        try {
          const parsed = JSON.parse(row.body);
          if (Array.isArray(parsed)) {
            sources.push(parsed);
          } else if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.registrants)) sources.push(parsed.registrants);
            if (Array.isArray(parsed.members)) sources.push(parsed.members);
          }
        } catch {}
      }

      const sqlMembers = (sqlMembersRes && sqlMembersRes.results) || [];
      if (sqlMembers.length > 0) {
        const mappedSql = sqlMembers.map((m) => ({
          id: m.id ? (String(m.id).startsWith("reg_") ? String(m.id) : `reg_member_${m.id}`) : undefined,
          originalId: m.id,
          uniqueCode: m.qr_code || "",
          fullName: m.name || "",
          gender: m.gender === "female" ? "female" : "male",
          phone: m.phone || "",
          whatsapp: m.whatsapp || m.phone || "",
          dob: m.birth_date || "2000-01-01",
          address: m.address || "",
          photoUrl: m.photo_url || "",
          registeredAt: m.created_at ? new Date(Number(m.created_at)).toISOString() : new Date().toISOString(),
          qrData: m.qr_code || "",
          role: m.role || "member",
          status: "active"
        }));
        sources.push(mappedSql);
      }
    } catch {}
  }

  const kvStore = env.MEMBERS_KV || env.KV || null;
  if (kvStore && typeof kvStore.get === "function") {
    try {
      // Load KV tombstone log if D1 failed
      if (tombstoneIds.size === 0) {
        const kvRevRaw = await kvStore.get("d1_state:revoked_members_log");
        if (kvRevRaw) {
          try {
            const parsedRev = JSON.parse(kvRevRaw);
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
                  const nName = normalizeWorkerArabic(entry.normalizedName || entry.fullName || entry.name || "");
                  if (nName) tombstoneNames.add(nName);
                }
              }
            }
          } catch {}
        }
      }
      // Load rich KV state slices BEFORE bare member_list (Read-Only Legacy Harvest - DO NOT DELETE OLD KEYS)
      const kvKeys = [
        "d1_state:CLEAN_MASTER_DB_V1",
        "CLEAN_MASTER_DB_V1",
        "d1_state:registrants",
        "d1_state:backup_members",
        "registrants",
        "members",
        "all_members_v1",
        "app_state",
        "backup_members",
        "member_list"
      ];
      for (const k of kvKeys) {
        const raw = await kvStore.get(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) sources.push(parsed);
          else if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.registrants)) sources.push(parsed.registrants);
            if (Array.isArray(parsed.members)) sources.push(parsed.members);
          }
        } catch {}
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
        byNormName.set(normName, {
          ...m,
          id: cleanId,
          originalId: isOwner ? "reg_owner_main" : (baseId || cleanId),
          fullName,
          name: fullName,
          uniqueCode: targetRule ? (m.uniqueCode && !/^CF/i.test(m.uniqueCode) ? m.uniqueCode : targetRule.code) : m.uniqueCode,
          phone: m.phone || targetRule?.phone || "",
          whatsapp: m.whatsapp || m.phone || targetRule?.phone || "",
          dob: m.dob || m.birthDate || targetRule?.dob || "",
          address: m.address ?? targetRule?.address ?? "",
          password: m.password || targetRule?.password || m.recoveryCode || targetRule?.recoveryCode || "123456",
          recoveryCode: m.recoveryCode || m.securityCode || targetRule?.recoveryCode || "123456",
          securityCode: m.securityCode || m.recoveryCode || targetRule?.recoveryCode || "123456",
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
        });
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

      const primaryPermTs = Number(primary.permissions?.__permissionsUpdatedAt || 0);
      const secondaryPermTs = Number(secondary.permissions?.__permissionsUpdatedAt || 0);
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

      const pPhoto = String(primary.photoUrl || primary.avatar || primary.image || "").trim();
      const sPhoto = String(secondary.photoUrl || secondary.avatar || secondary.image || "").trim();
      const validPhoto = (p) => p && !p.startsWith("__D1_PHOTO_REF__:") && !p.startsWith("blob:");
      const mergedPhoto = validPhoto(pPhoto) ? pPhoto : (validPhoto(sPhoto) ? sPhoto : (pPhoto || sPhoto || ""));

      const mergedRecCode = String(
        primary.recoveryCode || secondary.recoveryCode || primary.securityCode || secondary.securityCode || primary.backupCode || secondary.backupCode || "123456"
      ).trim();
      const mergedPass = String(
        primary.password || secondary.password || primary.pass || secondary.pass || primary.pin || secondary.pin || mergedRecCode || "123456"
      ).trim();

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
        role: mergedRole,
        isOwner: isOwner ? true : undefined,
        permissions: mergedPermissions,
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
        address: primary.address !== undefined ? primary.address : (secondary.address ?? ""),
        residence: primary.address !== undefined ? primary.address : (secondary.address ?? ""),
        notes: primary.notes !== undefined ? primary.notes : (secondary.notes ?? ""),
        talents: primary.notes !== undefined ? primary.notes : (secondary.notes ?? ""),
        skills: primary.notes !== undefined ? primary.notes : (secondary.notes ?? ""),
        uniqueCode: isOwner ? "TY-0001" : (primary.uniqueCode || secondary.uniqueCode || primary.qr_code || secondary.qr_code || ""),
        qrCode: isOwner ? "TY-0001" : (primary.qrCode || secondary.qrCode || primary.uniqueCode || secondary.uniqueCode || canonicalId),
        qrData: isOwner ? "TY-0001" : (primary.qrData || secondary.qrData || primary.uniqueCode || secondary.uniqueCode || canonicalId),
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
            : (m.gender === "female" ? "female" : "male");
      const recCode = String(m.recoveryCode || m.securityCode || "123456").trim();
      const pass = String(m.password || m.pass || recCode || "123456").trim();

      uniqueWorkerMembers.push({
        ...m,
        id: finalId,
        originalId: isOwnerMember ? "reg_owner_main" : (getBaseMemberId(m.originalId || finalId) || finalId),
        role: isOwnerMember ? "community_owner" : (m.role || "member"),
        isOwner: isOwnerMember ? true : undefined,
        gender: finalGender,
        sex: finalGender,
        genderCode: finalGender,
        manualGender: finalGender,
        genderLabel: finalGender === "female" ? "أنثى" : "ذكر",
        type: finalGender === "female" ? "شابة" : "شاب",
        category: finalGender === "female" ? "شابات" : "شباب",
        genderLocked: true,
        password: pass,
        recoveryCode: recCode,
        securityCode: recCode
      });
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

    const rawCodeCandidate = String(pickBestField(["uniqueCode", "qrCode", "code"], "")).trim();
    const canonicalCode = isOwner
      ? "TY-0001"
      : targetRule
        ? String((rawCodeCandidate && !/^CF/i.test(rawCodeCandidate) ? rawCodeCandidate : "") || targetRule.code).trim().toUpperCase()
        : String(
            (rawCodeCandidate && !/^CF/i.test(rawCodeCandidate) ? rawCodeCandidate : "") ||
            `TY-${String(manifestEntry.num + 1).padStart(4, "0")}`
          ).trim().toUpperCase();

    const bestRecoveryCode = String(
      pickBestField(["recoveryCode", "securityCode", "secretCode", "backupCode", "resetCode"], targetRule?.recoveryCode || "123456")
    ).trim();

    const bestPassword = String(
      pickBestField(
        ["password", "pass", "pin", "userPassword", "secret"],
        isOwner ? "admin123456789" : (targetRule?.password || bestRecoveryCode || "123456")
      )
    ).trim();

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
    const bestDob = String(
      pickBestField(["dob", "birthDate"], targetRule?.dob || "2002-01-01")
    ).trim();
    let roleCandidate = null;
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
        : pickBestField(["permissions"], {});

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
      qrCode: canonicalCode,
      qrData: String(pickBestField(["qrData"], canonicalCode)).trim() || canonicalCode,
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

  if (persistIfExpanded && (env.DB || kvStore) && finalUnionList.length > 0) {
    try {
      const nowTs = Date.now();
      const jsonStr = JSON.stringify(finalUnionList);
      const currentRegsRaw = await getRawSliceFromD1(env, "registrants", "[]");
      let currentRawCount = 0;
      let currentDedupedCount = 0;
      let hadDuplicatesOrRows = false;
      try {
        const p = JSON.parse(currentRegsRaw);
        if (Array.isArray(p)) {
          const cleanSlice = p.filter((x) => !isGarbageOrGhostMember(x));
          currentRawCount = cleanSlice.length;
          const dedupSlice = deduplicateWorkerMembers(cleanSlice);
          currentDedupedCount = dedupSlice.length;
          hadDuplicatesOrRows =
            currentRawCount > finalUnionList.length ||
            p.some((x) => x && /-ROW-\d+$/i.test(String(x.id || "")));
        }
      } catch {}

      // Smart Never-Shrink Server Shield: reject saving a tiny <=25 corrupted slice if D1 already has >30 unique real members
      if (!(currentDedupedCount > 30 && finalUnionList.length <= 25)) {
        if (
          isAudit100PercentVerified ||
          hadDuplicatesOrRows ||
          finalUnionList.length !== currentRawCount ||
          (Array.isArray(incomingList) && incomingList.length > 0)
        ) {
          await saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, jsonStr, nowTs);
          await saveRawSliceToD1(env, "registrants", jsonStr, nowTs);
          await saveRawSliceToD1(env, "backup_members", jsonStr, nowTs);

          // Task 2: Safe Legacy Keys Purge in Cloudflare ONLY AFTER 100% Audit Verification
          if (isAudit100PercentVerified) {
            const legacyKeysToPurge = ["app_state", "members", "threefetya_state", "all_members_v1"];
            if (kvStore && typeof kvStore.delete === "function") {
              const alreadyPurged = await kvStore.get("LEGACY_KEYS_PURGED_V1");
              if (alreadyPurged !== "true") {
                await kvStore.put("CLEAN_MASTER_DB_V1", jsonStr);
                for (const oldKey of legacyKeysToPurge) {
                  try { await kvStore.delete(oldKey); } catch {}
                  try { await kvStore.delete(`d1_state:${oldKey}`); } catch {}
                }
                try { await kvStore.put("LEGACY_KEYS_PURGED_V1", "true"); } catch {}
              }
            }
            if (env.DB) {
              try {
                await env.DB.batch(
                  legacyKeysToPurge.map((oldKey) =>
                    env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind(`D1_STATE:${oldKey}`)
                  )
                );
              } catch {}
            }
          }
        }
      }
    } catch {}
  }

  cachedMasterRegistrants = { version: edgeStateVersion, list: finalUnionList };
  return finalUnionList;
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
      `{"success":true,"version":${currentVersion},"lastModified":${currentVersion},"etag":"${hash}","changed":${!isUnchangedRequest}}`,
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

    // 2. Fetch single row from D1 or KV fallback
    if (env.DB) {
      try {
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
      } catch {}
    }
    const kvMedia = env.MEMBERS_KV || env.KV || null;
    if (kvMedia && typeof kvMedia.get === "function") {
      try {
        const kvVal = await kvMedia.get(titleKey);
        if (kvVal && kvVal.length > 0) {
          setMediaCache(titleKey, kvVal);
          return new Response(kvVal, {
            headers: {
              ...cors,
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=86400"
            }
          });
        }
      } catch {}
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
    const [masterRegistrants, annsRaw, attRaw, blkRaw, textsRaw, revokedRaw] = await Promise.all([
      buildMasterRegistrantsUnion(env, [], true),
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
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const masterRegistrants = await buildMasterRegistrantsUnion(env, [], true);
    const regsRaw = JSON.stringify(masterRegistrants);
    return new Response(`{"success":true,"version":${currentVersion},"registrants":${regsRaw},"CLEAN_MASTER_DB_V1":${regsRaw}}`, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
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

      // Task 2: Block Duplicate Registration when called from Registration Portal
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
      const usedIds = new Map();
      for (const r of list) {
        if (r && r.id) {
          usedIds.set(String(r.id).trim(), normArabicName(r.fullName || r.name || ""));
        }
        if (r && r.uniqueCode && normArabicName(r.fullName || r.name || "") !== targetNormName) {
          usedCodes.add(String(r.uniqueCode).trim().toUpperCase());
        }
      }
      const getNextCode = () => {
        let n = 2;
        while (usedCodes.has("TY-" + String(n).padStart(4, "0"))) n++;
        const c = "TY-" + String(n).padStart(4, "0");
        usedCodes.add(c);
        return c;
      };

      let candidateId = String(newMember.id || "").trim();
      if (!candidateId || (usedIds.has(candidateId) && usedIds.get(candidateId) !== targetNormName)) {
        candidateId = `3FY-${crypto.randomUUID()}`;
      }

      const lightMember = normalizeWorkerMember({
        ...newMember,
        id: candidateId,
        fullName: rawName,
        registeredInCleanMasterV1: true
      }, getNextCode());
      if (lightMember.id !== "reg_owner_main" && usedCodes.has(lightMember.uniqueCode)) {
        lightMember.uniqueCode = getNextCode();
        lightMember.qrCode = lightMember.uniqueCode;
        lightMember.qrData = lightMember.uniqueCode;
      }

      const rawNewPhoto = String(newMember.photoUrl || newMember.avatar || newMember.image || "").trim();
      const kvStoreMedia = env.MEMBERS_KV || env.KV || null;
      if (rawNewPhoto.includes("data:image/") && lightMember.id) {
        const cleanDataUrl = rawNewPhoto.startsWith("data:image/")
          ? rawNewPhoto
          : rawNewPhoto.slice(rawNewPhoto.indexOf("data:image/"));
        const photoKey = `D1_PHOTO:${lightMember.id}`;
        setMediaCache(photoKey, cleanDataUrl);
        if (kvStoreMedia && typeof kvStoreMedia.put === "function") {
          try { await kvStoreMedia.put(photoKey, cleanDataUrl); } catch {}
        }
        if (env.DB) {
          try {
            await env.DB.batch([
              env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
              env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), photoKey, cleanDataUrl, Date.now(), Date.now())
            ]);
          } catch {}
        }
        lightMember.photoUrl = `__D1_PHOTO_REF__:${lightMember.id}`;
      }

      // Match ONLY by exact normalized 3-part Arabic name or non-colliding ID
      const idx = list.findIndex((r) => r && (
        (targetNormName && normArabicName(r.fullName) === targetNormName) ||
        (r.id === lightMember.id && normArabicName(r.fullName) === targetNormName)
      ));
      if (idx >= 0) {
        const prevPhoto = list[idx].photoUrl;
        list[idx] = {
          ...list[idx],
          ...lightMember,
          id: list[idx].id || lightMember.id,
          uniqueCode: lightMember.uniqueCode || list[idx].uniqueCode,
          qrCode: lightMember.qrCode || lightMember.uniqueCode || list[idx].qrCode,
          qrData: lightMember.qrData || lightMember.uniqueCode || list[idx].qrData,
          fullName: rawName,
          password: lightMember.password || list[idx].password,
          recoveryCode: lightMember.recoveryCode || list[idx].recoveryCode,
          securityCode: lightMember.securityCode || lightMember.recoveryCode || list[idx].securityCode || list[idx].recoveryCode,
          photoUrl: (lightMember.photoUrl && !lightMember.photoUrl.startsWith("__D1_PHOTO_REF__:")) ? lightMember.photoUrl : (prevPhoto || lightMember.photoUrl)
        };
        delete list[idx].avatar;
        delete list[idx].image;
      } else {
        list.unshift(lightMember);
      }

      const nowTs = Date.now();
      if (env.DB) {
        try {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM members WHERE id = ? OR name = ?").bind(lightMember.id, rawName),
            env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(
              lightMember.id,
              rawName,
              lightMember.phone || null,
              lightMember.role || "member",
              nowTs
            )
          ]);
        } catch {}
      }

      if (kvStoreMedia && typeof kvStoreMedia.get === "function") {
        try {
          const listJson = (await kvStoreMedia.get("member_list")) || "[]";
          const kvList = JSON.parse(listJson);
          if (Array.isArray(kvList)) {
            const existsKv = kvList.some((x) => x && normArabicName(x.name || x.fullName || "") === targetNormName);
            if (!existsKv) {
              kvList.push({ id: lightMember.id, name: rawName, created_at: nowTs });
              await kvStoreMedia.put("member_list", JSON.stringify(kvList));
              await kvStoreMedia.put("member_count", String(kvList.length));
            }
          }
        } catch(e) {
          console.error("KV list update error:", e);
        }
      }

      try {
        const token = env.TELEGRAM_BOT_TOKEN;
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: "6604944293",
              text: `🔔 عضو جديد!\n\n👤 الاسم: ${rawName}\n📱 التليفون: ${lightMember.phone || "غير متوفر"}\n🎭 الدور: ${lightMember.role || "member"}\n🕐 الوقت: ${new Date().toLocaleString("ar-EG")}`
            })
          });
        }
      } catch(e) {
        console.error("Telegram error:", e);
      }

      const cleanList = await buildMasterRegistrantsUnion(env, list, false);
      const cleanSerialized = JSON.stringify(cleanList);
      await Promise.all([
        saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, cleanSerialized, nowTs),
        saveRawSliceToD1(env, "registrants", cleanSerialized, nowTs),
        saveRawSliceToD1(env, "backup_members", cleanSerialized, nowTs)
      ]);

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
      return new Response(JSON.stringify({ success: true, registrant: lightMember, count: cleanList.length, version: edgeStateVersion }), { headers: cors });
    });
  }

  if (path.startsWith("/api/registrants/") && method === "PUT") {
    const id = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
    const rawBody = await request.json();
    const updates = rawBody && rawBody.member && typeof rawBody.member === "object" ? rawBody.member : rawBody;

    return await enqueueWrite(async () => {
      // Load unified master list (deduplicated across all D1/KV slices) so updates apply to the exact canonical member record and clean any duplicates
      const list = await buildMasterRegistrantsUnion(env, [], false);

      const cleanTargetId = getBaseMemberId(updates?.id || id || "");
      const bareTargetId = cleanTargetId.replace(/^reg_member_/, "");
      const incomingName = String(updates?.fullName || updates?.name || "").trim().replace(/\s+/g, " ");
      const normIncName = ultraNormalizeArabic(incomingName);

      let idx = list.findIndex((r) => {
        if (!r || !r.id) return false;
        const rid = getBaseMemberId(r.id);
        const origRid = getBaseMemberId(r.originalId || "");
        const bareRid = rid.replace(/^reg_member_/, "");
        const idMatches =
          rid === getBaseMemberId(id) ||
          rid === cleanTargetId ||
          origRid === cleanTargetId ||
          (bareTargetId && bareRid === bareTargetId);
        if (!idMatches) return false;
        const rName = ultraNormalizeArabic(r.fullName || r.name || "");
        if (normIncName && rName && normIncName !== rName && updates?.isCollisionRepair) {
          return false;
        }
        return true;
      });

      if (idx === -1 && normIncName) {
        idx = list.findIndex((r) => r && ultraNormalizeArabic(r.fullName || r.name || "") === normIncName);
      }

      const existing = idx >= 0 ? list[idx] : {};
      const prevName = String(existing.fullName || existing.name || "").trim();
      const safeName = incomingName && incomingName !== "عضو"
        ? incomingName
        : (prevName || "عضو");

      const lightUpdates = { ...updates };
      delete lightUpdates.avatar;
      delete lightUpdates.image;
      delete lightUpdates.isCollisionRepair;
      const targetId = getBaseMemberId(existing.id || cleanTargetId || id);

      const rawUpdPhoto = String(updates?.photoUrl || updates?.avatar || updates?.image || "").trim();
      const kvStorePutMedia = env.MEMBERS_KV || env.KV || null;
      if (rawUpdPhoto.includes("data:image/")) {
        const cleanDataUrl = rawUpdPhoto.startsWith("data:image/")
          ? rawUpdPhoto
          : rawUpdPhoto.slice(rawUpdPhoto.indexOf("data:image/"));
        const photoKey = `D1_PHOTO:${targetId}`;
        setMediaCache(photoKey, cleanDataUrl);
        if (kvStorePutMedia && typeof kvStorePutMedia.put === "function") {
          try { await kvStorePutMedia.put(photoKey, cleanDataUrl); } catch {}
        }
        if (env.DB) {
          try {
            await env.DB.batch([
              env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
              env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), photoKey, cleanDataUrl, Date.now(), Date.now())
            ]);
          } catch {}
        }
        lightUpdates.photoUrl = `__D1_PHOTO_REF__:${targetId}`;
      }

      const nowTs = Date.now();
      const explicitGenderSent = Boolean(
        updates?.genderLocked ||
        updates?.manualGender ||
        updates?.genderCode ||
        (updates?.gender && updates.gender !== existing.gender) ||
        (updates?.sex && updates.sex !== existing.sex)
      );
      const genderLocked = Boolean(
        updates?.genderLocked ??
        (explicitGenderSent ? true : undefined) ??
        existing.genderLocked
      );
      const finalGender = detectAndRepairGender({
        ...existing,
        ...updates,
        fullName: safeName,
        genderLocked
      });
      const finalPhone = String(updates?.phone ?? existing.phone ?? "").trim();
      const finalWhatsapp = String(updates?.whatsapp ?? updates?.phone ?? existing.whatsapp ?? finalPhone).trim();
      const finalDob = String(updates?.dob ?? updates?.birthDate ?? existing.dob ?? existing.birthDate ?? "").trim();
      const finalAddress = String(updates?.address ?? updates?.residence ?? existing.address ?? existing.residence ?? "").trim();
      const finalNotes = String(updates?.notes ?? updates?.talents ?? updates?.skills ?? existing.notes ?? existing.talents ?? existing.skills ?? "").trim();
      const finalLastModifiedAt = Math.max(Number(updates?.lastModifiedAt || updates?.updatedAt || nowTs), nowTs);
      const finalUpdatedAt = Math.max(Number(updates?.updatedAt || finalLastModifiedAt), finalLastModifiedAt);
      const finalLastUpdatedAt = updates?.lastUpdatedAt || new Date(finalUpdatedAt).toISOString();

      const usedCodes = new Set(["TY-0001"]);
      for (let i = 0; i < list.length; i++) {
        if (i === idx) continue;
        const c = String(list[i]?.uniqueCode || "").trim().toUpperCase();
        if (c) usedCodes.add(c);
      }
      let finalUniqueCode = String(lightUpdates.uniqueCode || existing.uniqueCode || "").trim().toUpperCase();
      if (!finalUniqueCode || (idx === -1 && usedCodes.has(finalUniqueCode))) {
        let codeNum = 2;
        while (usedCodes.has("TY-" + String(codeNum).padStart(4, "0"))) {
          codeNum++;
        }
        finalUniqueCode = "TY-" + String(codeNum).padStart(4, "0");
      }
      const finalQrData =
        idx === -1 && finalUniqueCode !== String(lightUpdates.uniqueCode || "").trim().toUpperCase()
          ? finalUniqueCode
          : String(lightUpdates.qrData || lightUpdates.uniqueCode || existing.qrData || finalUniqueCode).trim();

      const mergedRecord = {
        ...existing,
        ...lightUpdates,
        id: targetId,
        originalId: getBaseMemberId(existing.originalId || targetId),
        uniqueCode: finalUniqueCode,
        qrData: finalQrData,
        fullName: safeName,
        name: safeName,
        gender: finalGender,
        sex: finalGender,
        genderCode: finalGender,
        manualGender: explicitGenderSent ? finalGender : (lightUpdates.manualGender || (genderLocked ? finalGender : existing.manualGender)),
        genderLabel: finalGender === "female" ? "أنثى" : "ذكر",
        type: finalGender === "female" ? "شابة" : "شاب",
        category: finalGender === "female" ? "شابات" : "شباب",
        genderLocked,
        phone: finalPhone,
        whatsapp: finalWhatsapp,
        dob: finalDob,
        birthDate: finalDob,
        address: finalAddress,
        residence: finalAddress,
        notes: finalNotes,
        talents: finalNotes,
        skills: finalNotes,
        role: lightUpdates.role || existing.role || "member",
        status: lightUpdates.status || existing.status || "active",
        ipAddress: updates?.ipAddress || existing.ipAddress || clientIp || undefined,
        lastModifiedAt: finalLastModifiedAt,
        updatedAt: finalUpdatedAt,
        lastUpdatedAt: finalLastUpdatedAt
      };
      delete mergedRecord.avatar;
      delete mergedRecord.image;

      const updatedRawList = idx >= 0
        ? list.map((item, i) => (i === idx ? mergedRecord : item))
        : [mergedRecord, ...list];

      // Run full union deduplication so any duplicate records of this member across slices are folded cleanly into mergedRecord
      const cleanUnifiedList = await buildMasterRegistrantsUnion(env, updatedRawList, false);

      if (env.DB && safeName && safeName !== "عضو") {
        const dbBatch = [
          env.DB.prepare("DELETE FROM members WHERE id = ? OR id = ?").bind(targetId, bareTargetId)
        ];
        if (prevName && prevName === safeName) {
          dbBatch.push(env.DB.prepare("DELETE FROM members WHERE name = ?").bind(prevName));
        }
        dbBatch.push(
          env.DB.prepare("DELETE FROM members WHERE name = ?").bind(safeName),
          env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(
            targetId,
            safeName,
            finalPhone || null,
            mergedRecord.role || "member",
            nowTs
          )
        );
        await env.DB.batch(dbBatch).catch(() => {});
      }

      const serializedClean = JSON.stringify(cleanUnifiedList);
      await Promise.all([
        saveRawSliceToD1(env, CLEAN_MASTER_DB_KEY, serializedClean, nowTs),
        saveRawSliceToD1(env, "registrants", serializedClean, nowTs),
        saveRawSliceToD1(env, "backup_members", serializedClean, nowTs)
      ]);

      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            action: "UPSERT",
            record: mergedRecord,
            at: nowTs
          });
        } catch {}
      }
      return new Response(
        JSON.stringify({
          success: true,
          registrant: mergedRecord,
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
      const [regsRaw, backupRaw, revokedRaw, sysRaw] = await Promise.all([
        getRawSliceFromD1(env, "registrants", "[]"),
        getRawSliceFromD1(env, "backup_members", "[]"),
        getRawSliceFromD1(env, "revoked_members_log", "[]"),
        getRawSliceFromD1(env, "system_bundle", "{}")
      ]);

      let list = [];
      let backupList = [];
      let revokedLog = [];
      let sysBundle = {};
      try { list = JSON.parse(regsRaw); } catch {}
      try { backupList = JSON.parse(backupRaw); } catch {}
      try { revokedLog = JSON.parse(revokedRaw); } catch {}
      try { sysBundle = JSON.parse(sysRaw); } catch {}
      if (!Array.isArray(list)) list = [];
      if (!Array.isArray(backupList)) backupList = [];
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
        if (targetNormName && normalizeWorkerArabic(r.fullName || r.name || "") === targetNormName) return false;
        return true;
      };

      // 1. Permanently wipe member from registrants & backup_members in Cloudflare D1
      const nextRegs = list.filter(shouldKeepMember);
      const nextBackup = backupList.filter(shouldKeepMember);

      // 2. Append member ID & normalized Arabic name to permanent revoked_members_log (Tombstone Log)
      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const nextRevokedLog = [
        {
          id: targetId,
          originalId: bareTargetId,
          fullName: targetFullName,
          normalizedName: targetNormName,
          phone: targetPhone,
          uniqueCode: targetCode,
          revokedAt: nowIso
        },
        ...revokedLog.filter((item) => item && item.id !== targetId)
      ];

      // 3. Also record in system_bundle.deletedRegistrantIds
      const existingDelIds = Array.isArray(sysBundle.deletedRegistrantIds) ? sysBundle.deletedRegistrantIds : [];
      const nextDelSet = new Set([...existingDelIds, targetId, bareTargetId, `reg_member_${bareTargetId}`]);
      sysBundle.deletedRegistrantIds = Array.from(nextDelSet);
      sysBundle.revokedMembersLog = nextRevokedLog;

      // 4. Delete photo and SQL member row from Cloudflare D1 + KV
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
      const kvStoreDel = env.MEMBERS_KV || env.KV || null;
      if (kvStoreDel && typeof kvStoreDel.get === "function") {
        try {
          const kvRaw = await kvStoreDel.get("member_list");
          if (kvRaw) {
            const parsedKv = JSON.parse(kvRaw);
            if (Array.isArray(parsedKv)) {
              const filteredKv = parsedKv.filter((x) => {
                if (!x) return false;
                const xNorm = normalizeWorkerArabic(x.fullName || x.name || "");
                return !(targetNormName && xNorm === targetNormName) && String(x.id || "") !== targetId;
              });
              await kvStoreDel.put("member_list", JSON.stringify(filteredKv));
              await kvStoreDel.put("member_count", String(filteredKv.length));
            }
          }
        } catch {}
      }

      const serializedNextRegs = JSON.stringify(nextRegs);
      await Promise.all([
        saveRawSliceToD1(env, "registrants", serializedNextRegs, nowTs),
        saveRawSliceToD1(env, "backup_members", JSON.stringify(nextBackup), nowTs),
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
      const [regsRaw, backupRaw, revokedRaw, sysRaw] = await Promise.all([
        getRawSliceFromD1(env, "registrants", "[]"),
        getRawSliceFromD1(env, "backup_members", "[]"),
        getRawSliceFromD1(env, "revoked_members_log", "[]"),
        getRawSliceFromD1(env, "system_bundle", "{}")
      ]);

      let list = [];
      let backupList = [];
      let revokedLog = [];
      let sysBundle = {};
      try { list = JSON.parse(regsRaw); } catch {}
      try { backupList = JSON.parse(backupRaw); } catch {}
      try { revokedLog = JSON.parse(revokedRaw); } catch {}
      try { sysBundle = JSON.parse(sysRaw); } catch {}
      if (!Array.isArray(list)) list = [];
      if (!Array.isArray(backupList)) backupList = [];
      if (!Array.isArray(revokedLog)) revokedLog = [];
      if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

      const delIdSet = new Set();
      const delNameSet = new Set();
      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const newRevokedEntries = [];

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
        if (normName && !normName.includes("ميخاييل ادور")) {
          delNameSet.add(normName);
        }
        newRevokedEntries.push({
          id: tid,
          originalId: origTid || bareTid,
          fullName,
          normalizedName: normName,
          phone: matchedInList?.phone || item.phone || "",
          uniqueCode: matchedInList?.uniqueCode || item.uniqueCode || "",
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
      const nextBackup = backupList.filter(shouldKeepMember);
      const nextRevokedLog = [
        ...newRevokedEntries,
        ...revokedLog.filter((item) => item && !delIdSet.has(String(item.id || "")))
      ];

      const existingDelIds = Array.isArray(sysBundle.deletedRegistrantIds) ? sysBundle.deletedRegistrantIds : [];
      sysBundle.deletedRegistrantIds = Array.from(new Set([...existingDelIds, ...Array.from(delIdSet)]));
      sysBundle.revokedMembersLog = nextRevokedLog;

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
      const kvStoreBatch = env.MEMBERS_KV || env.KV || null;
      if (kvStoreBatch && typeof kvStoreBatch.get === "function") {
        try {
          const kvRaw = await kvStoreBatch.get("member_list");
          if (kvRaw) {
            const parsedKv = JSON.parse(kvRaw);
            if (Array.isArray(parsedKv)) {
              const filteredKv = parsedKv.filter((x) => {
                if (!x) return false;
                const xNorm = normalizeWorkerArabic(x.fullName || x.name || "");
                return !delNameSet.has(xNorm) && !delIdSet.has(String(x.id || ""));
              });
              await kvStoreBatch.put("member_list", JSON.stringify(filteredKv));
              await kvStoreBatch.put("member_count", String(filteredKv.length));
            }
          }
        } catch {}
      }

      const serializedNextRegs = JSON.stringify(nextRegs);
      await Promise.all([
        saveRawSliceToD1(env, "registrants", serializedNextRegs, nowTs),
        saveRawSliceToD1(env, "backup_members", JSON.stringify(nextBackup), nowTs),
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
    try {
      if (env.DB) {
        const res = await env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all();
        return new Response(JSON.stringify(res), { headers: cors });
      }
    } catch {}
    const masterList = await buildMasterRegistrantsUnion(env, [], false);
    return new Response(JSON.stringify({ results: masterList, fallback: "kv" }), { headers: cors });
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
      try {
        await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run();
      } catch {}
    }

    const lightAtt = current.map((r, idx) => ({
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

    const nowTs = Date.now();
    await saveRawSliceToD1(env, "attendance_records", JSON.stringify(lightAtt), nowTs);

    // Also stamp the member object inside D1_STATE:registrants so member profile and attendance dashboard stay 100% synced
    if (incomingRecords.length > 0) {
      try {
        const regsRaw = await getRawSliceFromD1(env, "registrants", "[]");
        const regsList = JSON.parse(regsRaw || "[]");
        if (Array.isArray(regsList) && regsList.length > 0) {
          let regsModified = false;
          for (const rec of incomingRecords) {
            if (!rec || !rec.registrantId || !rec.date) continue;
            const targetId = String(rec.registrantId).trim();
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
              regsList[mIdx] = mem;
              regsModified = true;
            }
          }
          if (regsModified) {
            await saveRawSliceToD1(env, "registrants", JSON.stringify(regsList), nowTs);
          }
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

  if (path.startsWith("/api/attendance/") && method === "DELETE") {
    const recordId = decodeURIComponent(path.replace("/api/attendance/", "").split("/")[0]);
    const attRaw = await getRawSliceFromD1(env, "attendance_records", "[]");
    let current = [];
    try { current = JSON.parse(attRaw); } catch {}
    const nextAtt = (Array.isArray(current) ? current : []).filter((a) => a && a.id !== recordId);
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
    let results = [];
    try {
      const res = await env.DB.prepare(query).all();
      results = res?.results || [];
    } catch {
      results = [];
    }
    const payload = JSON.stringify({ changed: true, version: currentVersion, results });
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
          setMediaCache(b.title, b.description);
          if (kvMediaStore && typeof kvMediaStore.put === "function") {
            try { await kvMediaStore.put(b.title, b.description); } catch {}
          }
        }
        if (env.DB) {
          try {
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
          } catch {}
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
    const masterRegistrants = await buildMasterRegistrantsUnion(env, [], true);
    let rows = [];
    if (env.DB) {
      try {
        const res = await env.DB.prepare(
          "SELECT id, title, body, MAX(created_at) as created_at FROM announcements GROUP BY title ORDER BY created_at DESC LIMIT 30"
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
      "site_texts",
      "backup_members"
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

    let hasRegistrantsSlice = false;
    let hasCleanMasterSlice = false;
    const masterRegsStr = JSON.stringify(masterRegistrants);
    for (const row of rows) {
      if (row && typeof row.title === "string" && row.title.startsWith("D1_STATE:") && typeof row.body === "string") {
        const k = row.title.replace("D1_STATE:", "").trim();
        if (k === "registrants" && masterRegistrants.length > 0) {
          row.body = masterRegsStr;
          hasRegistrantsSlice = true;
        } else if (k === "CLEAN_MASTER_DB_V1" && masterRegistrants.length > 0) {
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
    if (!hasRegistrantsSlice && masterRegistrants.length > 0) {
      rows.unshift({
        id: "master-registrants-union",
        title: "D1_STATE:registrants",
        body: masterRegsStr,
        created_at: currentVersion
      });
    }
    const payload = JSON.stringify({ changed: true, version: currentVersion, lastModified: currentVersion, results: rows });
    cachedAnnouncementsPayload = { version: currentVersion, json: payload };
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
      // Smart Never-Shrink Server Shield & Zero-Duplicates Cleanup on D1_STATE:registrants / backup_members
      if (sliceKey === "registrants" || sliceKey === "backup_members") {
        try {
          const incomingRegs = JSON.parse(rawBodyStr);
          if (Array.isArray(incomingRegs)) {
            const cleanIncoming = incomingRegs.filter((m) => !isGarbageOrGhostMember(m));
            const currentMaster = await buildMasterRegistrantsUnion(env, [], false);
            if (currentMaster.length > 30 && cleanIncoming.length <= 25) {
              rawBodyStr = JSON.stringify(currentMaster);
            } else {
              const masterUnion = await buildMasterRegistrantsUnion(env, cleanIncoming, false);
              rawBodyStr = JSON.stringify(masterUnion);
            }
          }
        } catch {}
      }
      await saveRawSliceToD1(env, sliceKey, rawBodyStr, nowTs);
      if (sliceKey === "registrants") {
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

  if (path === "/api/stats" && method === "GET") {
    try {
      if (env.DB) {
        const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c");
        const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c");
        return new Response(`{"members":${Number(m || 0)},"attendance":${Number(a || 0)}}`, { headers: cors });
      }
    } catch {}
    const kvStats = env.MEMBERS_KV || env.KV || null;
    let mCount = 0;
    if (kvStats && typeof kvStats.get === "function") {
      try { mCount = Number((await kvStats.get("member_count")) || 0); } catch {}
    }
    return new Response(`{"members":${mCount},"attendance":0}`, { headers: cors });
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
    const count = await env.MEMBERS_KV.get("member_count") || "0";
    await sendTelegram(env, chatId, `👥 عدد الأعضاء: ${count}`);
  } 
else if (text.startsWith("/members")) {
  const listJson = await env.MEMBERS_KV.get("member_list") || "[]";
  const list = JSON.parse(listJson);
  
  // ميخائيل ادور راتب الأول دايماً
  const owner = list.find(m => m.name === "ميخائيل ادور راتب");
  const rest = list.filter(m => m.name !== "ميخائيل ادور راتب").sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const sorted = owner ? [owner, ...rest] : rest;
  
  const names = sorted.map((m, index) => `${index + 1}. ${m.name}`).join("\n");
  await sendTelegram(env, chatId, `📋 قائمة الأعضاء:\n\n${names || "لا يوجد أعضاء"}`);
}
else if (text.startsWith("/init_list")) {
  // اقرأ من المصدر الرئيسي (نفس اللي بيقرأ منه الموقع)
  const masterList = await buildMasterRegistrantsUnion(env, [], false);
  let list = masterList.map(m => ({ 
    name: m.fullName || m.name, 
    created_at: m.registeredAt ? new Date(m.registeredAt).getTime() : (m.created_at || Date.now()) 
  }));
  
  // ترتيب: ميخائيل الأول، الباقي أبجدي
  const owner = list.find(m => m.name === "ميخائيل ادور راتب");
  const rest = list.filter(m => m.name !== "ميخائيل ادور راتب").sort((a, b) => a.name.localeCompare(b.name, "ar"));
  list = owner ? [owner, ...rest] : rest;
  
  await env.MEMBERS_KV.put("member_list", JSON.stringify(list));
  await env.MEMBERS_KV.put("member_count", String(list.length));
  await sendTelegram(env, chatId, `✅ تم تهيئة القائمة: ${list.length} عضو`);
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
        return await handleApiRequest(request, env, url);
      } catch (error) {
        return new Response(JSON.stringify({ error: "Internal server error", message: error.message }), {
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
