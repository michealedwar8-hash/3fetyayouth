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

  if (path === "/api/members" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM members ORDER BY name LIMIT 100").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/events" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM events ORDER BY event_date DESC LIMIT 50").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/events-add" && method === "POST") {
    const b = await request.json();
    await env.DB.prepare("INSERT INTO events VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), b.title, b.description || null, b.eventDate || Date.now(), Date.now()).run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (path === "/api/announcements" && method === "GET") {
    const res = await env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50").all();
    return new Response(JSON.stringify(res), { headers: cors });
  }

  if (path === "/api/announcements-add" && method === "POST") {
    const b = await request.json();
    await env.DB.prepare("INSERT INTO announcements VALUES (?,?,?,?)").bind(crypto.randomUUID(), b.title, b.body, Date.now()).run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (path === "/api/stats" && method === "GET") {
    const m = await env.DB.prepare("SELECT COUNT(*) as c FROM members").first("c");
    const a = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance").first("c");
    return new Response(JSON.stringify({ members: m, attendance: a }), { headers: cors });
  }

  return new Response(JSON.stringify({ success: true, ok: true }), { headers: cors });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    return env.ASSETS.fetch(request);
  }
};
