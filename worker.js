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
    siteTextOverrides: {}
  };

  if (slices.registrants) {
    try {
      const regs = JSON.parse(slices.registrants.raw);
      if (Array.isArray(regs)) {
        data.registrants = regs.map((r) => {
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

  if (path === "/api/data" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }), { headers: cors });
  }

  if (path === "/api/registrants" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, registrants: data.registrants, count: data.registrants.length }), { headers: cors });
  }

  if (path === "/api/site-texts" && method === "GET") {
    const data = await assembleAppDataFromD1(env);
    return new Response(JSON.stringify({ success: true, siteTextOverrides: data.siteTextOverrides || {} }), { headers: cors });
  }

  if (path === "/api/site-texts" && method === "POST") {
    const b = await request.json();
    const overrides = b?.siteTextOverrides && typeof b.siteTextOverrides === "object" ? b.siteTextOverrides : {};
    const data = await assembleAppDataFromD1(env);
    const merged = { ...(data.siteTextOverrides || {}), ...overrides };
    const sysPayload = JSON.stringify({ siteTextOverrides: merged });
    await env.DB.prepare("DELETE FROM announcements WHERE title = ?").bind("D1_STATE:site_texts").run();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), "D1_STATE:site_texts", sysPayload, Date.now()).run();
    const roomNs = env.REALTIME_ROOM || env.REALTIME;
    if (roomNs) {
      try {
        roomNs.get(roomNs.idFromName("main")).rpcBroadcast({
          type: "site_text_overrides_sync",
          overrides: merged,
          at: Date.now()
        });
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, siteTextOverrides: merged }), { headers: cors });
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

  if (path === "/api/attendance" && method === "POST") {
    const b = await request.json();
    await env.DB.prepare("INSERT INTO attendance VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.memberId, "main", "present", Date.now()).run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
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
