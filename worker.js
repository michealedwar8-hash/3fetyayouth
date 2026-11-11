import { DurableObject } from "cloudflare:workers";

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

async function initDb(env) {
  if (!env.DB || env._dbInitialized) return;
  env._dbInitialized = true;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT, phone TEXT, role TEXT DEFAULT 'member', created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, member_id TEXT, event_id TEXT, status TEXT, recorded_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, description TEXT, event_date INTEGER, created_at INTEGER)"),
  ]);
}

async function assembleAppDataFromD1(env) {
  await initDb(env);
  if (!env.DB) {
    return {
      registrants: [],
      attendance: [],
      announcements: [],
      communityEvents: [],
      eventGroups: [],
      eventRegistrations: [],
      eventPayments: [],
      eventBuses: [],
      kahootQuizzes: [],
      kahootQuestionBank: [],
      kahootSoloScores: [],
      siteTextOverrides: {}
    };
  }

  const [evRes, annRes] = await Promise.all([
    env.DB.prepare("SELECT * FROM events ORDER BY event_date DESC LIMIT 50").all(),
    env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50").all()
  ]);

  const photos = {};
  const slices = {};

  for (const row of (evRes.results || [])) {
    if (!row || typeof row.title !== "string") continue;
    const ts = Number(row.created_at || row.event_date || 0);
    if (row.title.startsWith("D1_PHOTO:")) {
      const id = row.title.replace("D1_PHOTO:", "").trim();
      if (id && row.description && !photos[id]) photos[id] = row.description;
    } else if (row.title.startsWith("D1_STATE:")) {
      const key = row.title.replace("D1_STATE:", "").trim();
      if (key && row.description && (!slices[key] || ts > slices[key].ts)) {
        slices[key] = { ts, raw: row.description };
      }
    }
  }

  for (const row of (annRes.results || [])) {
    if (!row || typeof row.title !== "string") continue;
    const ts = Number(row.created_at || 0);
    if (row.title.startsWith("D1_STATE:")) {
      const key = row.title.replace("D1_STATE:", "").trim();
      if (key && row.body && (!slices[key] || ts >= slices[key].ts)) {
        slices[key] = { ts, raw: row.body };
      }
    }
  }

  const data = {
    registrants: [],
    attendance: [],
    announcements: [],
    communityEvents: [],
    eventGroups: [],
    eventRegistrations: [],
    eventPayments: [],
    eventBuses: [],
    kahootQuizzes: [],
    kahootQuestionBank: [],
    kahootSoloScores: [],
    blockedUsers: [],
    siteTextOverrides: {}
  };

  if (slices.registrants) {
    try {
      const regs = JSON.parse(slices.registrants.raw);
      if (Array.isArray(regs)) {
        data.registrants = regs
          .filter((r) => r && r.id && !(r.role !== "community_owner" && String(r.fullName || "").trim() === "عضو"))
          .map((r) => {
            if (r && typeof r.photoUrl === "string" && r.photoUrl.startsWith("__D1_PHOTO_REF__:")) {
              const refId = r.photoUrl.replace("__D1_PHOTO_REF__:", "").trim();
              r.photoUrl = photos[refId] || (refId === "reg_owner_main" ? "/owner_portrait.jpg" : null);
            } else if (r && !r.photoUrl && photos[r.id]) {
              r.photoUrl = photos[r.id];
            }
            return r;
          });
      }
    } catch {}
  }

  if (slices.announcements) {
    try { data.announcements = JSON.parse(slices.announcements.raw); } catch {}
  }
  if (slices.events_bundle) {
    try { Object.assign(data, JSON.parse(slices.events_bundle.raw)); } catch {}
  }
  if (slices.kahoot_bundle) {
    try { Object.assign(data, JSON.parse(slices.kahoot_bundle.raw)); } catch {}
  }
  if (slices.system_bundle) {
    try { Object.assign(data, JSON.parse(slices.system_bundle.raw)); } catch {}
  }
  if (slices.blocked_users) {
    try {
      const parsedBlk = JSON.parse(slices.blocked_users.raw);
      if (Array.isArray(parsedBlk)) {
        data.blockedUsers = parsedBlk;
      }
    } catch {}
  }
  if (slices.attendance_records) {
    try {
      const parsedAtt = JSON.parse(slices.attendance_records.raw);
      if (Array.isArray(parsedAtt)) {
        data.attendance = parsedAtt.map((a) => {
          if (a && typeof a.registrantPhotoUrl === "string" && a.registrantPhotoUrl.startsWith("__D1_PHOTO_REF__:")) {
            const refId = a.registrantPhotoUrl.replace("__D1_PHOTO_REF__:", "").trim();
            a.registrantPhotoUrl = photos[refId] || null;
          }
          return a;
        });
      }
    } catch {}
  }
  if (slices.site_texts) {
    try {
      const parsed = JSON.parse(slices.site_texts.raw);
      if (parsed && parsed.siteTextOverrides) {
        data.siteTextOverrides = { ...(data.siteTextOverrides || {}), ...parsed.siteTextOverrides };
      }
    } catch {}
  }

  return data;
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  await initDb(env);
  const path = url.pathname;
  const method = request.method;
  const clientIp = getClientIpFromRequest(request);

  if (path === "/api/client-ip" && method === "GET") {
    return new Response(JSON.stringify({ success: true, ip: clientIp }), { headers: cors });
  }

  if (path === "/api/data" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, data, clientIp, timestamp: new Date().toISOString() }), { headers: cors });
  }

  if (path === "/api/registrants" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, registrants: data.registrants, count: data.registrants.length }), { headers: cors });
  }

  if (path === "/api/registrants" && method === "POST") {
    const newMember = await request.json();
    const rawName = String(newMember?.fullName || "").trim();
    if (!rawName || rawName === "عضو") {
      return new Response(JSON.stringify({ success: false, error: "يرجى إدخال الاسم الثلاثي الحقيقي (لا يقبل اسم عضو)." }), { status: 400, headers: cors });
    }
    const data = await assembleAppDataFromD1(env);
    const effectiveIp = newMember.ipAddress || clientIp || undefined;
    if (effectiveIp) newMember.ipAddress = effectiveIp;

    const cleanDigits = (s) => String(s || "").replace(/\D/g, "");
    const reqDigits = cleanDigits(newMember.phone);
    const reqName = rawName.toLowerCase();

    const isBanned = (data.blockedUsers || []).some((b) => {
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

    const list = Array.isArray(data.registrants) ? [...data.registrants] : [];
    const idx = list.findIndex((r) => r && (r.id === newMember.id || (r.uniqueCode && newMember.uniqueCode && r.uniqueCode === newMember.uniqueCode)));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...newMember, fullName: rawName };
    } else {
      list.unshift(newMember);
    }
    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:registrants").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:registrants", JSON.stringify(list), Date.now()).run();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "d1_mutation",
          table: "registrants",
          action: "UPSERT",
          record: newMember,
          at: Date.now()
        });
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, registrant: newMember, count: list.length }), { headers: cors });
  }

  if (path.startsWith("/api/registrants/") && method === "PUT") {
    const id = decodeURIComponent(path.replace("/api/registrants/", "").split("/")[0]);
    const updates = await request.json();
    const data = await assembleAppDataFromD1(env);
    const list = Array.isArray(data.registrants) ? [...data.registrants] : [];
    const idx = list.findIndex((r) => r && (r.id === id || r.id === updates?.id));
    if (idx >= 0) {
      const existing = list[idx];
      const safeName = updates.fullName && String(updates.fullName).trim() !== "عضو"
        ? String(updates.fullName).trim()
        : existing.fullName;
      list[idx] = {
        ...existing,
        ...updates,
        fullName: safeName,
        ipAddress: updates.ipAddress || existing.ipAddress || clientIp || undefined,
        // Strictly preserve existing lastUpdatedAt unless updates explicitly provides lastUpdatedAt (from تحديث بياناتي)
        lastUpdatedAt: updates.lastUpdatedAt !== undefined ? updates.lastUpdatedAt : existing.lastUpdatedAt
      };
      await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:registrants").run();
      await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:registrants", JSON.stringify(list), Date.now()).run();
      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "d1_mutation",
            table: "registrants",
            action: "UPSERT",
            record: list[idx],
            at: Date.now()
          });
        } catch {}
      }
      return new Response(JSON.stringify({ success: true, registrant: list[idx] }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: true, registrant: updates }), { headers: cors });
  }

  if (path === "/api/registrants/block" && method === "POST") {
    const b = await request.json();
    const { memberId, reason, ipAddress } = b || {};
    const data = await assembleAppDataFromD1(env);
    const list = Array.isArray(data.registrants) ? [...data.registrants] : [];
    const member = list.find((r) => r && r.id === memberId);
    const blockedList = Array.isArray(data.blockedUsers) ? [...data.blockedUsers] : [];
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
      const nextBlocked = [blockedEntry, ...blockedList.filter((x) => x && x.phone !== member.phone && x.fullName !== member.fullName)];
      const nextRegs = list.filter((r) => r && r.id !== memberId);
      await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:blocked_users").run();
      await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:blocked_users", JSON.stringify(nextBlocked), Date.now()).run();
      await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:registrants").run();
      await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:registrants", JSON.stringify(nextRegs), Date.now()).run();
      const roomNs = env.REALTIME_ROOM || env.REALTIME;
      if (roomNs) {
        try {
          roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
            type: "blocked_users_sync",
            blockedUsers: nextBlocked,
            at: Date.now()
          });
        } catch {}
      }
      return new Response(JSON.stringify({ success: true, blockedEntry }), { headers: cors });
    }
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  if (path === "/api/blocked-users" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, blockedUsers: data.blockedUsers || [] }), { headers: cors });
  }

  if (path.startsWith("/api/blocked-users/") && method === "DELETE") {
    const id = decodeURIComponent(path.replace("/api/blocked-users/", ""));
    const data = await assembleAppDataFromD1(env);
    const nextBlocked = (data.blockedUsers || []).filter((b) => b && b.id !== id);
    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:blocked_users").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:blocked_users", JSON.stringify(nextBlocked), Date.now()).run();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "blocked_users_sync",
          blockedUsers: nextBlocked,
          at: Date.now()
        });
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, blockedUsers: nextBlocked }), { headers: cors });
  }

  if (path === "/api/site-texts" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, siteTextOverrides: data.siteTextOverrides || {} }), { headers: cors });
  }

  if (path === "/api/site-texts" && method === "POST") {
    const b = await request.json();
    const data = await assembleAppDataFromD1(env);
    let merged = { ...(data.siteTextOverrides || {}) };
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
    const sysPayload = JSON.stringify({ siteTextOverrides: merged, updatedAt: nowTs });
    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:site_texts").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:site_texts", sysPayload, nowTs).run();
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
    return new Response(JSON.stringify({ success: true, siteTextOverrides: merged, updatedAt: nowTs }), { headers: cors });
  }

  if (path === "/api/members" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM members ORDER BY name LIMIT 100").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/members-add" && method === "POST") {
    const b = await request.json();
    await env.DB.prepare("INSERT INTO members VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.name, b.phone || null, b.role || "member", Date.now()).run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (path === "/api/attendance" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, attendance: data.attendance || [] }), { headers: cors });
  }

  if (path === "/api/attendance" && method === "POST") {
    const b = await request.json();
    const data = await assembleAppDataFromD1(env);
    let current = Array.isArray(data.attendance) ? [...data.attendance] : [];
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
    } else if (b.memberId) {
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

    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:attendance_records").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:attendance_records", JSON.stringify(lightAtt), Date.now()).run();

    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "attendance_sync",
          records: lightAtt,
          at: Date.now()
        });
      } catch {}
    }

    return new Response(JSON.stringify({ ok: true, isDuplicate: false, attendance: current }), { headers: cors });
  }

  if (path.startsWith("/api/attendance/") && method === "DELETE") {
    const recordId = decodeURIComponent(path.replace("/api/attendance/", "").split("/")[0]);
    const data = await assembleAppDataFromD1(env);
    const nextAtt = (data.attendance || []).filter((a) => a && a.id !== recordId);
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
    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:attendance_records").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:attendance_records", JSON.stringify(lightAtt), Date.now()).run();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "attendance_sync",
          records: lightAtt,
          deletedId: recordId,
          at: Date.now()
        });
      } catch {}
    }
    return new Response(JSON.stringify({ ok: true, attendance: nextAtt }), { headers: cors });
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
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  if (path === "/api/events" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM events ORDER BY event_date DESC LIMIT 200").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/events-add" && method === "POST") {
    const b = await request.json();
    if (typeof b.title === "string" && (b.title.startsWith("D1_PHOTO:") || b.title.startsWith("D1_STATE:"))) {
      await env.DB.prepare("DELETE FROM events WHERE title = ?").bind(b.title).run();
    }
    await env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.title, b.description || null, b.eventDate || Date.now(), Date.now()).run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (path === "/api/announcements" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/announcements-add" && method === "POST") {
    const b = await request.json();
    if (typeof b.title === "string" && b.title.startsWith("D1_STATE:")) {
      await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind(b.title).run();
    }
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, b.body, Date.now()).run();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? "d1_mutation" : "announcement",
          title: b.title,
          body: typeof b.title === "string" && b.title.startsWith("D1_STATE:") ? undefined : b.body,
          at: Date.now()
        });
      } catch {}
    }
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (path === "/api/stats" && method === "GET") {
    const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c");
    const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c");
    return new Response(JSON.stringify({ members: m, attendance: a }), { headers: cors });
  }

  if (path === "/api/online" && method === "GET") {
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    const online = roomNs
      ? await roomNs.get(roomNs.idFromName("main")).rpcGetOnlineCount()
      : 0;
    return new Response(JSON.stringify({ online }), { headers: cors });
  }

  return new Response(JSON.stringify({ success: true, ok: true }), { headers: cors });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
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
