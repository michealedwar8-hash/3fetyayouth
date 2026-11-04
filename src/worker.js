async function supabaseRequest(env, method, table, query = "", body = null) {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    "apikey": env.VITE_SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleApiRequest(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/site-texts" && method === "GET") {
    return supabaseRequest(env, "GET", "site_texts");
  }
  if (path === "/api/events" && method === "GET") {
    return supabaseRequest(env, "GET", "events");
  }
  if (path === "/api/data" && method === "GET") {
    return supabaseRequest(env, "GET", "data");
  }

  const presenceMatch = path.match(/^\/api\/registrants\/([^/]+)\/presence$/);
  if (presenceMatch) {
    const registrantId = presenceMatch[1];
    if (method === "GET") {
      return supabaseRequest(env, "GET", "registrants", `?id=eq.${registrantId}&select=presence`);
    }
    if (method === "POST") {
      const body = await request.json();
      return supabaseRequest(env, "PATCH", "registrants", `?id=eq.${registrantId}`, {
        presence: body.presence || true,
        last_seen: new Date().toISOString()
      });
    }
  }

  if (path === "/api/registrants") {
    if (method === "GET") return supabaseRequest(env, "GET", "registrants");
    if (method === "POST") {
      const body = await request.json();
      return supabaseRequest(env, "POST", "registrants", "", body);
    }
  }

  const genericMatch = path.match(/^\/api\/([a-z_]+)$/);
  if (genericMatch) {
    const table = genericMatch[1].replace(/-/g, "_");
    if (method === "GET") return supabaseRequest(env, "GET", table);
    if (method === "POST") {
      const body = await request.json();
      return supabaseRequest(env, "POST", table, "", body);
    }
  }

  return new Response(JSON.stringify({ error: "API route not found", path }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApiRequest(request, env, url);
      } catch (error) {
        return new Response(JSON.stringify({ error: "Internal server error", message: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
