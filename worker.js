import { DurableObject } from "cloudflare:workers";

// ============================================================================
// IN-MEMORY EDGE CACHE & VERSIONING (Sub-1ms CPU Time + Multi-Isolate Sync)
// ============================================================================
let edgeStateVersion = 0;
let lastVersionCheckTs = 0;
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
    isVisitedGeneral: Boolean(raw.isVisitedGeneral)
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
  if (edgeStateVersion > 0 && now - lastVersionCheckTs < 1200) {
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

// Reads a single D1_STATE:<key> slice as a raw string with 1.2s multi-isolate freshness check
async function getRawSliceFromD1(env, sliceKey, fallbackRaw = "[]") {
  const now = Date.now();
  const cached = rawSliceCache.get(sliceKey);
  if (cached && cached.raw && now - (cached.checkedAt || 0) < 1200) {
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
    const [regsRaw, annsRaw, attRaw, blkRaw, textsRaw, revokedRaw] = await Promise.all([
      getRawSliceFromD1(env, "registrants", "[]"),
      getRawSliceFromD1(env, "announcements", "[]"),
      getRawSliceFromD1(env, "attendance_records", "[]"),
      getRawSliceFromD1(env, "blocked_users", "[]"),
      getRawSliceFromD1(env, "site_texts", "{}"),
      getRawSliceFromD1(env, "revoked_members_log", "[]")
    ]);
    const rawBody = `{"success":true,"changed":true,"version":${currentVersion},"clientIp":${JSON.stringify(clientIp)},"data":{"registrants":${regsRaw},"announcements":${annsRaw},"attendance":${attRaw},"blockedUsers":${blkRaw},"siteTextsRaw":${textsRaw},"revokedMembersLog":${revokedRaw}}}`;
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
    const rawName = String(newMember?.fullName || newMember?.name || "").trim();
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

    let list = [];
    try { list = JSON.parse(regsRaw); } catch {}
    if (!Array.isArray(list)) list = [];

    const usedCodes = new Set(["TY-0001"]);
    for (const r of list) {
      if (r && r.uniqueCode && r.id !== newMember.id) {
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

    const lightMember = normalizeWorkerMember({ ...newMember, fullName: rawName }, getNextCode());
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

    // Match ONLY by id or exact normalized 3-part Arabic name (never overwrite a different member whose uniqueCode collided!)
    const targetNormName = normArabicName(rawName);
    const idx = list.findIndex((r) => r && (r.id === lightMember.id || (targetNormName && normArabicName(r.fullName) === targetNormName)));
    if (idx >= 0) {
      const prevPhoto = list[idx].photoUrl;
      list[idx] = {
        ...list[idx],
        ...lightMember,
        id: list[idx].id || lightMember.id,
        uniqueCode: list[idx].uniqueCode || lightMember.uniqueCode,
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

      // تحديث عداد وقائمة الأعضاء في KV
      try {
        const listJson = await env.MEMBERS_KV.get("member_list") || "[]";
        const list = JSON.parse(listJson);
        list.push({ name: rawName, created_at: nowTs });
        await env.MEMBERS_KV.put("member_list", JSON.stringify(list));
        
        const currentCount = await env.MEMBERS_KV.get("member_count");
        await env.MEMBERS_KV.put("member_count", String((Number(currentCount) || 0) + 1));
      } catch(e) {
        console.error("KV list update error:", e);
      }

 // إشعار Telegram - بره الـ batch
try {
  const token = env.TELEGRAM_BOT_TOKEN;
  console.log("Telegram token exists:", !!token);
  
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: "6604944293",
      text: `🔔 عضو جديد!\n\n👤 الاسم: ${rawName}\n📱 التليفون: ${lightMember.phone || "غير متوفر"}\n🎭 الدور: ${lightMember.role || "member"}\n🕐 الوقت: ${new Date().toLocaleString("ar-EG")}`
    })
  });
  
  const result = await response.json();
  console.log("Telegram response:", result);
} catch(e) {
  console.error("Telegram error:", e);
}

} // دي بتقفل if (env.DB)

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
    const rawBody = await request.json();
    const updates = rawBody && rawBody.member && typeof rawBody.member === "object" ? rawBody.member : rawBody;
    const regsRaw = await getRawSliceFromD1(env, "registrants", "[]");
    let list = [];
    try { list = JSON.parse(regsRaw); } catch {}
    if (!Array.isArray(list)) list = [];

    const cleanTargetId = String(updates?.id || id || "").trim();
    const bareTargetId = cleanTargetId.replace(/^reg_member_/, "");
    const idx = list.findIndex((r) => {
      if (!r || !r.id) return false;
      const rid = String(r.id).trim();
      const bareRid = rid.replace(/^reg_member_/, "");
      return (
        rid === id ||
        rid === cleanTargetId ||
        bareRid === bareTargetId
      );
    });

    const existing = idx >= 0 ? list[idx] : {};
    const prevName = String(existing.fullName || existing.name || "").trim();
    const incomingName = String(updates?.fullName || updates?.name || "").trim();
    const safeName = incomingName && incomingName !== "عضو"
      ? incomingName
      : (prevName || "عضو");

    const lightUpdates = { ...updates };
    delete lightUpdates.avatar;
    delete lightUpdates.image;
    const targetId = String(existing.id || cleanTargetId || id).trim();

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

    const mergedRecord = {
      ...existing,
      ...lightUpdates,
      id: targetId,
      uniqueCode: existing.uniqueCode || lightUpdates.uniqueCode || "TY-0002",
      qrData: existing.qrData || existing.uniqueCode || lightUpdates.uniqueCode || "TY-0002",
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
      if (prevName) {
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
    return new Response(JSON.stringify({ success: true, registrant: mergedRecord, version: edgeStateVersion }), { headers: cors });
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
    const res = await env.DB.prepare("SELECT * FROM members ORDER BY name LIMIT 200").all();
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
      let rawBodyStr = typeof b.body === "string" ? b.body : JSON.stringify(b.body || []);
      // Enforce Tombstone Log + Union Merge on D1_STATE:registrants so no client can ever drop active members or resurrect a deleted member ID
      if (sliceKey === "registrants") {
        try {
          const [existingRegsRaw, revokedRaw] = await Promise.all([
            getRawSliceFromD1(env, "registrants", "[]"),
            getRawSliceFromD1(env, "revoked_members_log", "[]")
          ]);
          const existingRegs = JSON.parse(existingRegsRaw || "[]");
          const revokedList = JSON.parse(revokedRaw || "[]");
          const tombstoneIds = new Set(
            Array.isArray(revokedList) ? revokedList.map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean) : []
          );
          const incomingRegs = JSON.parse(rawBodyStr);
          if (Array.isArray(incomingRegs)) {
            const mergedById = new Map();
            const mergedByName = new Map();
            const usedCodes = new Set(["TY-0001"]);

            // 1. Seed with existing D1 registrants (excluding revoked IDs)
            if (Array.isArray(existingRegs)) {
              for (const er of existingRegs) {
                if (!er || !er.id || tombstoneIds.has(er.id) || er.status === "cancelled") continue;
                const copy = { ...er };
                delete copy.avatar;
                delete copy.image;
                mergedById.set(copy.id, copy);
                if (copy.fullName) mergedByName.set(normArabicName(copy.fullName), copy.id);
                if (copy.uniqueCode) usedCodes.add(String(copy.uniqueCode).trim().toUpperCase());
              }
            }

            const getNextCode = () => {
              let n = 2;
              while (usedCodes.has("TY-" + String(n).padStart(4, "0"))) n++;
              const c = "TY-" + String(n).padStart(4, "0");
              usedCodes.add(c);
              return c;
            };

            // 2. Merge incoming registrants without losing existing members or Base64 photos
            for (const ir of incomingRegs) {
              if (!ir || !ir.id || tombstoneIds.has(ir.id) || ir.status === "cancelled") continue;
              const nName = normArabicName(ir.fullName || ir.name || "");
              if (!nName || nName === "عضو") continue;
              const matchId = mergedById.has(ir.id) ? ir.id : (mergedByName.get(nName) || ir.id);
              const existing = mergedById.get(matchId);
              const incomingPhoto = String(ir.photoUrl || ir.avatar || ir.image || "").trim();
              const existingPhoto = existing ? String(existing.photoUrl || existing.avatar || "").trim() : "";
              const bestPhoto = (incomingPhoto && !incomingPhoto.startsWith("__D1_PHOTO_REF__:"))
                ? incomingPhoto
                : ((existingPhoto && !existingPhoto.startsWith("__D1_PHOTO_REF__:")) ? existingPhoto : (incomingPhoto || existingPhoto));
              const mergedRec = normalizeWorkerMember(
                { ...(existing || {}), ...ir, id: matchId, photoUrl: bestPhoto },
                existing?.uniqueCode || ir.uniqueCode || getNextCode()
              );
              if (mergedRec) {
                mergedById.set(matchId, mergedRec);
                mergedByName.set(nName, matchId);
              }
            }

            rawBodyStr = JSON.stringify(Array.from(mergedById.values()));
          }
        } catch {}
      }
      await saveRawSliceToD1(env, sliceKey, rawBodyStr, nowTs);
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
