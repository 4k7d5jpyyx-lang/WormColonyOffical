export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Basic CORS (adjust origin as needed)
    const origin = request.headers.get("Origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,If-None-Match",
      "Access-Control-Expose-Headers": "ETag",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route to Durable Object by world name
    const worldName = (url.searchParams.get("world") || "global").toString();
    const id = env.WORLD.idFromName(worldName);
    const stub = env.WORLD.get(id);

    // Proxy paths
    if (url.pathname === "/api/state") {
      const r = await stub.fetch(new Request("https://do/state", {
        method: "GET",
        headers: {
          "If-None-Match": request.headers.get("If-None-Match") || "",
        },
      }));
      const out = new Response(r.body, r);
      for (const [k, v] of Object.entries(corsHeaders)) out.headers.set(k, v);
      return out;
    }

    if (url.pathname === "/api/save") {
      const r = await stub.fetch(new Request("https://do/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      }));
      const out = new Response(r.body, r);
      for (const [k, v] of Object.entries(corsHeaders)) out.headers.set(k, v);
      return out;
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  },
};

export class WorldDO {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      const etag = await this.storage.get("etag");
      const ifNone = request.headers.get("If-None-Match") || "";
      if (etag && ifNone && etag === ifNone) {
        return new Response(null, { status: 304, headers: { "ETag": etag } });
      }

      const world = await this.storage.get("world");
      const revision = (await this.storage.get("revision")) || 0;

      return new Response(JSON.stringify({ state: world || null, revision }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "ETag": etag || "",
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/save") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const incomingState = body && body.state;
      if (!incomingState || !Array.isArray(incomingState.colonies)) {
        return new Response(JSON.stringify({ error: "Missing/invalid state" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Increment revision; last-write-wins (simple, reliable)
      const revision = ((await this.storage.get("revision")) || 0) + 1;

      // New etag per revision
      const etag = `W/${revision.toString(16)}`;

      await this.storage.put("world", incomingState);
      await this.storage.put("revision", revision);
      await this.storage.put("etag", etag);

      return new Response(JSON.stringify({ ok: true, revision, etag }), {
        status: 200,
        headers: { "Content-Type": "application/json", "ETag": etag, "Cache-Control": "no-store" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
