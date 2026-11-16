import { DurableObject } from "cloudflare:workers";

// ============================================================================
// IN-MEMORY EDGE CACHE & VERSIONING (Sub-1ms CPU Time + Multi-Isolate Sync)
// ============================================================================
let edgeStateVersion = 0;
let lastVersionCheckTs = 0;
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}
const rawSliceCache = new Map(); // key -> { raw: string, ts: number, checkedAt: number }
const mediaMemCache = new Map(); // title -> string (LRU-capped to 60 items)
let cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
let cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };

function setMediaCache(key, val) {
  if (!key || !val) return;
  if (mediaMemCache.size >= 60) {
    const firstKey = mediaMemCache.keys().next().value;
    if (firstKey) mediaMemCache.delete(firstKey);
  }
  mediaMemCache.set(key, val);
}

function normArabicName(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

function normPhoneDigits(s) {
  return String(s || "").replace(/\D/g, "").slice(-9);
}

function normalizeWorkerMember(raw, fallbackCode = "TY-0002") {
  if (!raw || typeof raw !== "object") return null;
  const fullName = String(raw.fullName || raw.name || "").trim();
  if (!fullName || fullName === "عضو") return null;
  const isOwner =
    raw.id === "reg_owner_main" ||
    raw.role === "community_owner" ||
    normArabicName(fullName) === normArabicName("ميخائيل ادور راتب");
  const id = isOwner
    ? "reg_owner_main"
    : String(raw.id || `reg_${raw.created_at || Date.now()}_${Math.random().toString(36).slice(2, 6)}`).trim();
  const phone = String(raw.phone || raw.whatsapp || (isOwner ? "+20 1288651567" : "")).trim();
  const whatsapp = String(raw.whatsapp || phone).trim();
  const role = isOwner ? "community_owner" : (raw.role || "member");
  const status = isOwner ? "active" : (raw.status === "cancelled" ? "cancelled" : "active");
  const rawGender = String(raw.gender || raw.sex || "").trim().toLowerCase();
  const gender = isOwner
    ? "male"
    : rawGender === "female" || rawGender === "انثى" || rawGender === "أنثى"
      ? "female"
      : rawGender === "male" || rawGender === "ذكر"
        ? "male"
        : /(مارينا|مارولا|بارثينا|سوسنه|نونسيا|مريم|سارة|مادونا|فيلومينا|ميرنا|كرستينا|دميانة|كاترين|تريزا|برسيس|هايدي|الكساندرا|كيلارا|مهرائيل)/.test(fullName)
          ? "female"
          : "male";
  const photo = String(raw.photoUrl || raw.avatar || raw.image || (isOwner ? "/owner_portrait.jpg" : "")).trim();
  const uniqueCode = isOwner ? "TY-0001" : String(raw.uniqueCode || fallbackCode).trim().toUpperCase();
  const dob = String(raw.dob || raw.birthDate || "2002-01-01").trim();
  const address = String(raw.address ?? raw.residence ?? "").trim();
  const notes = String(raw.notes ?? raw.talents ?? raw.skills ?? "").trim();
  const updatedAt = Number(raw.updatedAt || (raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt).getTime() : 0) || Date.now());
  const lastUpdatedAt = raw.lastUpdatedAt || new Date(updatedAt).toISOString();
  const copy = {
    ...raw,
    id,
    uniqueCode,
    fullName,
    name: fullName,
    gender,
    sex: gender,
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
    status,
    recoveryCode: raw.recoveryCode || "123456",
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
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT, phone TEXT, role TEXT DEFAULT 'member', created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, member_id TEXT, event_id TEXT, status TEXT, recorded_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, event_date INTEGER, created_at INTEGER)")
  ]);
}

async function getEdgeVersion(env) {
  const now = Date.now();
  if (edgeStateVersion > 0 && now - lastVersionCheckTs < 250) {
    return edgeStateVersion;
  }
  if (!env.DB) {
    edgeStateVersion = now;
    lastVersionCheckTs = now;
    return edgeStateVersion;
  }
  try {
    const [annMax, evMax, memMax] = await Promise.all([
      env.DB.prepare("SELECT MAX(created_at) as m FROM announcements").first("m"),
      env.DB.prepare("SELECT MAX(created_at) as m FROM events").first("m"),
      env.DB.prepare("SELECT MAX(created_at) as m FROM members").first("m")
    ]);
    const dbMax = Math.max(Number(annMax || 0), Number(evMax || 0), Number(memMax || 0), 1);
    if (dbMax !== edgeStateVersion) {
      rawSliceCache.clear();
      cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
      cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
    }
    edgeStateVersion = dbMax;
    lastVersionCheckTs = now;
  } catch {
    if (!edgeStateVersion) edgeStateVersion = now;
  }
  return edgeStateVersion;
}

function bumpEdgeVersion(newTs = Date.now()) {
  edgeStateVersion = Math.max(edgeStateVersion + 1, newTs);
  lastVersionCheckTs = Date.now();
  cachedAnnouncementsPayload = { version: -1, json: "", checkedAt: 0 };
  cachedEventsPayload = { version: -1, json: "", checkedAt: 0 };
  return edgeStateVersion;
}

// Reads a single D1_STATE:<key> slice as a raw string with 250ms multi-isolate freshness check
async function getRawSliceFromD1(env, sliceKey, fallbackRaw = "[]") {
  const now = Date.now();
  const cached = rawSliceCache.get(sliceKey);
  if (cached && cached.raw && now - (cached.checkedAt || 0) < 250) {
    return cached.raw;
  }
  if (!env.DB) return fallbackRaw;
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
  return fallbackRaw;
}

async function saveRawSliceToD1(env, sliceKey, rawString, nowTs = Date.now()) {
  rawSliceCache.set(sliceKey, { raw: rawString, ts: nowTs, checkedAt: Date.now() });
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

/**
 * Multi-Key & Multi-Table Union Extraction + Anti-Downgrade Server Shield
 * Unifies members from:
 * 1) D1 announcements slices: D1_STATE:registrants, D1_STATE:backup_members, D1_STATE:members, D1_STATE:app_state
 * 2) D1 SQL table: SELECT * FROM members
 * 3) Cloudflare KV (env.MEMBERS_KV / env.KV) if bound
 * 4) Incoming client payload (never allowing a 65-member or 1-member snapshot to shrink the 94+ Master Union)
 */
async function buildMasterRegistrantsUnion(env, incomingList = [], persistIfExpanded = true) {
  const sources = [];

  if (env.DB) {
    try {
      const [sliceRowsRes, sqlMembersRes] = await Promise.all([
        env.DB.prepare(
          "SELECT title, body, created_at FROM announcements WHERE title IN ('D1_STATE:registrants', 'D1_STATE:backup_members', 'D1_STATE:members', 'D1_STATE:app_state', 'D1_STATE:all_members_v1') ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all()
      ]);

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
      const kvKeys = ["registrants", "members", "all_members_v1", "app_state", "member_list", "backup_members"];
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

  const unionById = new Map();
  const idByNormName = new Map();

  const mergeMemberRecords = (existing, incoming) => {
    const exTs = Number(existing.updatedAt || existing.lastUpdatedAt || 0);
    const inTs = Number(incoming.updatedAt || incoming.lastUpdatedAt || 0);
    const primary = inTs >= exTs ? incoming : existing;
    const secondary = inTs >= exTs ? existing : incoming;
    return {
      ...secondary,
      ...primary,
      id: existing.id || incoming.id,
      fullName: primary.fullName || secondary.fullName || incoming.name || existing.name || "",
      gender: primary.gender || secondary.gender || "male",
      phone: primary.phone || secondary.phone || "",
      whatsapp: primary.whatsapp || secondary.whatsapp || primary.phone || secondary.phone || "",
      uniqueCode: primary.uniqueCode || secondary.uniqueCode || primary.qr_code || secondary.qr_code || "",
      photoUrl:
        primary.photoUrl && !String(primary.photoUrl).startsWith("__D1_PHOTO_REF__:")
          ? primary.photoUrl
          : secondary.photoUrl || primary.photoUrl || "",
      stamps: { ...(secondary.stamps || {}), ...(primary.stamps || {}) },
      fridayStamps: { ...(secondary.fridayStamps || {}), ...(primary.fridayStamps || {}) },
      attendanceDates: Array.from(
        new Set([
          ...(Array.isArray(secondary.attendanceDates) ? secondary.attendanceDates : []),
          ...(Array.isArray(primary.attendanceDates) ? primary.attendanceDates : [])
        ])
      ),
      permissions: primary.permissions || secondary.permissions,
      status: "active"
    };
  };

  let rowCounter = 0;
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (let idx = 0; idx < list.length; idx++) {
      const m = list[idx];
      if (!m || typeof m !== "object") continue;
      if (m.status === "cancelled") continue;
      const fullName = String(m.fullName || m.name || "").trim();
      if (!fullName || fullName === "عضو") continue;
      rowCounter++;

      const normName = normalizeWorkerArabic(fullName);
      let rawId = String(m.id || m.uniqueCode || m.qr_code || m.phone || `CF_${rowCounter}`).trim();

      // If this exact normalized Arabic name already exists in the union, merge with its canonical ID
      if (normName && idByNormName.has(normName)) {
        const canonicalId = idByNormName.get(normName);
        const existing = unionById.get(canonicalId);
        unionById.set(canonicalId, mergeMemberRecords(existing, { ...m, id: canonicalId, fullName }));
        continue;
      }

      // If ID collides with a DIFFERENT Arabic name, disambiguate so no member is ever overwritten
      if (unionById.has(rawId)) {
        const existing = unionById.get(rawId);
        const exNormName = normalizeWorkerArabic(existing.fullName || existing.name || "");
        if (exNormName && normName && exNormName !== normName) {
          rawId = `${rawId}-ROW-${rowCounter}`;
        } else {
          unionById.set(rawId, mergeMemberRecords(existing, { ...m, id: rawId, fullName }));
          if (normName) idByNormName.set(normName, rawId);
          continue;
        }
      }

      const normalizedItem = {
        ...m,
        id: rawId,
        fullName,
        status: "active"
      };
      unionById.set(rawId, normalizedItem);
      if (normName) idByNormName.set(normName, rawId);
    }
  }

  const finalUnionList = Array.from(unionById.values());

  // Purge false tombstones in D1_STATE:revoked_members_log that hid valid members
  if (persistIfExpanded && env.DB && finalUnionList.length > 0) {
    try {
      const nowTs = Date.now();
      const jsonStr = JSON.stringify(finalUnionList);
      const currentRegsRaw = await getRawSliceFromD1(env, "registrants", "[]");
      let currentCount = 0;
      try {
        const p = JSON.parse(currentRegsRaw);
        if (Array.isArray(p)) currentCount = p.length;
      } catch {}

      if (finalUnionList.length !== currentCount || (Array.isArray(incomingList) && incomingList.length > 0)) {
        await saveRawSliceToD1(env, "registrants", jsonStr, nowTs);
        await saveRawSliceToD1(env, "backup_members", jsonStr, nowTs);
      }
      // Clear stale tombstones for active members in finalUnionList
      const activeIdSet = new Set(finalUnionList.map((r) => String(r.id)));
      const revRaw = await getRawSliceFromD1(env, "revoked_members_log", "[]");
      let revList = [];
      try {
        revList = JSON.parse(revRaw);
      } catch {}
      if (Array.isArray(revList) && revList.length > 0) {
        const cleanedRev = revList.filter((entry) => {
          const id = typeof entry === "string" ? entry : entry?.id;
          return id && !activeIdSet.has(String(id));
        });
        if (cleanedRev.length !== revList.length) {
          await saveRawSliceToD1(env, "revoked_members_log", JSON.stringify(cleanedRev), nowTs);
        }
      }
    } catch {}
  }

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

  if (path === "/api/registrants" && method === "GET") {
    if (isUnchangedRequest) {
      return new Response(null, { status: 304, headers: { ...cors, ETag: etag } });
    }
    const masterRegistrants = await buildMasterRegistrantsUnion(env, [], true);
    const regsRaw = JSON.stringify(masterRegistrants);
    return new Response(`{"success":true,"version":${currentVersion},"registrants":${regsRaw}}`, {
      headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
    });
  }

  if (path === "/api/registrants" && method === "POST") {
    const newMember = await request.json();
    const rawName = String(newMember?.fullName || newMember?.name || "").trim();
    if (!rawName || rawName === "عضو") {
      return new Response(JSON.stringify({ success: false, error: "يرجى إدخال الاسم الثلاثي الحقيقي (لا يقبل اسم عضو)." }), { status: 400, headers: cors });
    }
    const effectiveIp = newMember.ipAddress || clientIp || undefined;
    if (effectiveIp) newMember.ipAddress = effectiveIp;

    return await enqueueWrite(async () => {
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

      let list = [];
      try { list = JSON.parse(regsRaw); } catch {}
      if (!Array.isArray(list)) list = [];

      const targetNormName = normArabicName(rawName);
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

      const lightMember = normalizeWorkerMember({ ...newMember, id: candidateId, fullName: rawName }, getNextCode());
      if (lightMember.id !== "reg_owner_main" && usedCodes.has(lightMember.uniqueCode)) {
        lightMember.uniqueCode = getNextCode();
        lightMember.qrData = lightMember.uniqueCode;
      }

      const rawNewPhoto = String(newMember.photoUrl || newMember.avatar || newMember.image || "").trim();
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
        } else {
          lightMember.photoUrl = `__D1_PHOTO_REF__:${lightMember.id}`;
        }
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
          qrData: lightMember.qrData || lightMember.uniqueCode || list[idx].qrData,
          fullName: rawName,
          photoUrl: (lightMember.photoUrl && !lightMember.photoUrl.startsWith("__D1_PHOTO_REF__:")) ? lightMember.photoUrl : (prevPhoto || lightMember.photoUrl)
        };
        delete list[idx].avatar;
        delete list[idx].image;
      } else {
        list.unshift(lightMember);
      }

      const nowTs = Date.now();
      if (env.DB) {
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

        try {
          const listJson = await env.MEMBERS_KV.get("member_list") || "[]";
          const kvList = JSON.parse(listJson);
          kvList.push({ name: rawName, created_at: nowTs });
          await env.MEMBERS_KV.put("member_list", JSON.stringify(kvList));
          
          const currentCount = await env.MEMBERS_KV.get("member_count");
          await env.MEMBERS_KV.put("member_count", String((Number(currentCount) || 0) + 1));
        } catch(e) {
          console.error("KV list update error:", e);
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
      }

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
    });
  }

  if (path.startsWith("/api/registrants/") && method === "PUT") {
    const id = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
    const rawBody = await request.json();
    const updates = rawBody && rawBody.member && typeof rawBody.member === "object" ? rawBody.member : rawBody;

    return await enqueueWrite(async () => {
      const regsRaw = await getRawSliceFromD1(env, "registrants", "[]");
      let list = [];
      try { list = JSON.parse(regsRaw); } catch {}
      if (!Array.isArray(list)) list = [];

      const cleanTargetId = String(updates?.id || id || "").trim();
      const bareTargetId = cleanTargetId.replace(/^reg_member_/, "");
      const incomingName = String(updates?.fullName || updates?.name || "").trim();
      const normIncName = normArabicName(incomingName);

      const idx = list.findIndex((r) => {
        if (!r || !r.id) return false;
        const rid = String(r.id).trim();
        const bareRid = rid.replace(/^reg_member_/, "");
        const idMatches = rid === id || rid === cleanTargetId || bareRid === bareTargetId;
        if (!idMatches) return false;
        // If incoming has a valid name and existing record has a DIFFERENT person's name (collision), do NOT overwrite the other person!
        const rName = normArabicName(r.fullName || r.name || "");
        if (normIncName && rName && normIncName !== rName && updates?.isCollisionRepair) {
          return false;
        }
        return true;
      });

      const existing = idx >= 0 ? list[idx] : {};
      const prevName = String(existing.fullName || existing.name || "").trim();
      const safeName = incomingName && incomingName !== "عضو"
        ? incomingName
        : (prevName || "عضو");

      const lightUpdates = { ...updates };
      delete lightUpdates.avatar;
      delete lightUpdates.image;
      delete lightUpdates.isCollisionRepair;
      const targetId = String(cleanTargetId || existing.id || id).trim();

      const rawUpdPhoto = String(updates?.photoUrl || updates?.avatar || updates?.image || "").trim();
      if (rawUpdPhoto.includes("data:image/")) {
        const cleanDataUrl = rawUpdPhoto.startsWith("data:image/")
          ? rawUpdPhoto
          : rawUpdPhoto.slice(rawUpdPhoto.indexOf("data:image/"));
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
        } else {
          lightUpdates.photoUrl = `__D1_PHOTO_REF__:${targetId}`;
        }
      }

      const nowTs = Date.now();
      const finalGender =
        (updates?.gender || updates?.sex || existing.gender || existing.sex) === "female"
          ? "female"
          : "male";
      const finalPhone = String(updates?.phone ?? existing.phone ?? "").trim();
      const finalWhatsapp = String(updates?.whatsapp ?? updates?.phone ?? existing.whatsapp ?? finalPhone).trim();
      const finalDob = String(updates?.dob ?? updates?.birthDate ?? existing.dob ?? existing.birthDate ?? "").trim();
      const finalAddress = String(updates?.address ?? updates?.residence ?? existing.address ?? existing.residence ?? "").trim();
      const finalNotes = String(updates?.notes ?? updates?.talents ?? updates?.skills ?? existing.notes ?? existing.talents ?? existing.skills ?? "").trim();
      const finalUpdatedAt = Number(updates?.updatedAt || nowTs);
      const finalLastUpdatedAt = updates?.lastUpdatedAt || new Date(finalUpdatedAt).toISOString();

      // Prioritize lightUpdates.uniqueCode and lightUpdates.qrData, while guaranteeing zero collision when inserting a new member
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
        uniqueCode: finalUniqueCode,
        qrData: finalQrData,
        fullName: safeName,
        name: safeName,
        gender: finalGender,
        sex: finalGender,
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
        updatedAt: finalUpdatedAt,
        lastUpdatedAt: finalLastUpdatedAt
      };
      delete mergedRecord.avatar;
      delete mergedRecord.image;

      if (idx >= 0) {
        list[idx] = mergedRecord;
      } else {
        list.unshift(mergedRecord);
      }

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

      await saveRawSliceToD1(env, "registrants", JSON.stringify(list), nowTs);

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

  if ((path.startsWith("/api/registrants/") && method === "DELETE") || (path === "/api/registrants/revoke" && method === "POST")) {
    let targetId = "";
    let bodyPayload = {};
    if (method === "DELETE") {
      targetId = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
      try { bodyPayload = await request.json(); } catch {}
    } else {
      try { bodyPayload = await request.json(); } catch {}
      targetId = String(bodyPayload?.id || bodyPayload?.memberId || "").trim();
    }

    if (!targetId || targetId === "reg_owner_main") {
      return new Response(JSON.stringify({ success: false, error: "Invalid member ID" }), { status: 400, headers: cors });
    }

    const [regsRaw, revokedRaw, sysRaw] = await Promise.all([
      getRawSliceFromD1(env, "registrants", "[]"),
      getRawSliceFromD1(env, "revoked_members_log", "[]"),
      getRawSliceFromD1(env, "system_bundle", "{}")
    ]);

    let list = [];
    let revokedLog = [];
    let sysBundle = {};
    try { list = JSON.parse(regsRaw); } catch {}
    try { revokedLog = JSON.parse(revokedRaw); } catch {}
    try { sysBundle = JSON.parse(sysRaw); } catch {}
    if (!Array.isArray(list)) list = [];
    if (!Array.isArray(revokedLog)) revokedLog = [];
    if (!sysBundle || typeof sysBundle !== "object") sysBundle = {};

    const targetMember = list.find((r) => r && r.id === targetId);
    const targetFullName = targetMember?.fullName || bodyPayload?.fullName || "";
    const targetPhone = targetMember?.phone || bodyPayload?.phone || "";
    const targetCode = targetMember?.uniqueCode || bodyPayload?.uniqueCode || "";

    // 1. Permanently wipe member from active registrants list in Cloudflare D1
    const nextRegs = list.filter((r) => {
      if (!r || !r.id) return false;
      if (r.id === targetId) return false;
      return true;
    });

    // 2. Append member ID to permanent revoked_members_log (Tombstone Log)
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();
    const nextRevokedLog = [
      {
        id: targetId,
        fullName: targetFullName,
        phone: targetPhone,
        uniqueCode: targetCode,
        revokedAt: nowIso
      },
      ...revokedLog.filter((item) => item && item.id !== targetId)
    ];

    // 3. Also record in system_bundle.deletedRegistrantIds
    const existingDelIds = Array.isArray(sysBundle.deletedRegistrantIds) ? sysBundle.deletedRegistrantIds : [];
    const nextDelSet = new Set([...existingDelIds, targetId]);
    sysBundle.deletedRegistrantIds = Array.from(nextDelSet);
    sysBundle.revokedMembersLog = nextRevokedLog;

    // 4. Delete photo and SQL member row from Cloudflare D1
    const photoKey = `D1_PHOTO:${targetId}`;
    mediaMemCache.delete(photoKey);
    if (env.DB) {
      const dbStmts = [
        env.DB.prepare("DELETE FROM events WHERE title = ?").bind(photoKey),
        env.DB.prepare("DELETE FROM members WHERE id = ?").bind(targetId)
      ];
      if (targetFullName) {
        dbStmts.push(env.DB.prepare("DELETE FROM members WHERE name = ?").bind(targetFullName));
      }
      await env.DB.batch(dbStmts).catch(() => {});
    }

    await Promise.all([
      saveRawSliceToD1(env, "registrants", JSON.stringify(nextRegs), nowTs),
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
        revokedMembersLog: nextRevokedLog,
        count: nextRegs.length,
        version: edgeStateVersion
      }),
      { headers: cors }
    );
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
    const res = await env.DB.prepare("SELECT * FROM members ORDER BY created_at ASC").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/members-add" && method === "POST") {
    const b = await request.json();
    const nowTs = Date.now();
    const rawName = String(b?.name || b?.fullName || "").trim();
    if (rawName && rawName !== "عضو") {
      const memId = b.id || `reg_${nowTs}_${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.batch([
        env.DB.prepare("DELETE FROM members WHERE id = ? OR name = ?").bind(memId, rawName),
        env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(memId, rawName, b.phone || null, b.role || "member", nowTs)
      ]).catch(() => {});
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
      await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run();
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
      return new Response(`{"changed":false,"version":${currentVersion},"lastModified":${currentVersion},"results":[]}`, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (!isForceFetch && cachedAnnouncementsPayload.version === currentVersion && cachedAnnouncementsPayload.json) {
      return new Response(cachedAnnouncementsPayload.json, {
        headers: { ...cors, ETag: etag, "X-Sync-Version": String(currentVersion) }
      });
    }
    if (!env.DB) {
      return new Response(`{"changed":true,"version":${currentVersion},"lastModified":${currentVersion},"results":[]}`, { headers: cors });
    }
    // Deduplicate slices in SQL so only 1 latest row per D1_STATE:<key> is returned, and ensure D1_STATE:registrants is the full Master Union
    const [res, masterRegistrants] = await Promise.all([
      env.DB.prepare(
        "SELECT id, title, body, MAX(created_at) as created_at FROM announcements GROUP BY title ORDER BY created_at DESC LIMIT 30"
      ).all(),
      buildMasterRegistrantsUnion(env, [], true)
    ]);
    const rows = res.results || [];
    let hasRegistrantsSlice = false;
    const masterRegsStr = JSON.stringify(masterRegistrants);
    for (const row of rows) {
      if (row && typeof row.title === "string" && row.title.startsWith("D1_STATE:") && typeof row.body === "string") {
        const k = row.title.replace("D1_STATE:", "").trim();
        if (k === "registrants" && masterRegistrants.length > 0) {
          row.body = masterRegsStr;
          hasRegistrantsSlice = true;
        }
        rawSliceCache.set(k, { raw: row.body, ts: Number(row.created_at || currentVersion), checkedAt: Date.now() });
      }
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
      // Anti-Downgrade Server Shield: Enforce Master Union Merge on D1_STATE:registrants so no client (65 or 1 member) can ever drop active members
      if (sliceKey === "registrants") {
        try {
          const incomingRegs = JSON.parse(rawBodyStr);
          if (Array.isArray(incomingRegs)) {
            const masterUnion = await buildMasterRegistrantsUnion(env, incomingRegs, true);
            rawBodyStr = JSON.stringify(masterUnion);
          }
        } catch {}
      }
      await saveRawSliceToD1(env, sliceKey, rawBodyStr, nowTs);
    } else {
      bumpEdgeVersion(nowTs);
      await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, String(rawIncomingPayload || ""), nowTs).run();
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
  const names = list.map((m, index) => `${index + 1}. ${m.name}`).join("\n");
  await sendTelegram(env, chatId, `📋 قائمة الأعضاء:\n\n${names || "لا يوجد أعضاء"}`);
}
else if (text.startsWith("/init_list")) {
  const members = await env.DB.prepare("SELECT name, created_at FROM members ORDER BY created_at ASC").all();
  const list = members.results.map(m => ({ name: m.name, created_at: m.created_at }));
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
