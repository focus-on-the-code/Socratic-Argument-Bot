export default {
  async fetch(request, env) {
    const ALLOWED_ORIGINS = [
      "https://focus-on-the-code.github.io",
      "https://focus-on-the-code.github.io/Socratic-Argument-Bot"
    ];

    const origin = request.headers.get("Origin") || "";
    const originAllowed = ALLOWED_ORIGINS.includes(origin);

    const corsHeaders = {
      "Access-Control-Allow-Origin": originAllowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };

    const jsonResponse = (payload, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...extraHeaders
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!originAllowed) {
      return jsonResponse({ error: "forbidden_origin" }, 403);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, {
        Allow: "POST, OPTIONS"
      });
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: "server_not_configured" }, 500);
    }

    // Optional second gate for non-browser abuse: set APP_TOKEN in Worker secrets.
    if (env.APP_TOKEN) {
      const appToken = request.headers.get("X-App-Token");
      if (appToken !== env.APP_TOKEN) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 50_000) {
      return jsonResponse({ error: "payload_too_large" }, 413);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const hasValidContents =
      body &&
      Array.isArray(body.contents) &&
      body.contents.length > 0 &&
      Array.isArray(body.contents[0].parts) &&
      body.contents[0].parts.length > 0;

    if (!hasValidContents) {
      return jsonResponse({ error: "invalid_payload_shape" }, 400);
    }

    const GOOGLE_API_URL =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeoutMs = 25_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(GOOGLE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const upstreamText = await upstream.text();

      let upstreamJson;
      try {
        upstreamJson = JSON.parse(upstreamText);
      } catch {
        return jsonResponse({ error: "upstream_invalid_json" }, 502);
      }

      if (!upstream.ok) {
        return jsonResponse(
          {
            error: "upstream_error",
            status: upstream.status,
            details: upstreamJson?.error?.message || "Unknown upstream error"
          },
          upstream.status
        );
      }

      return jsonResponse(upstreamJson, upstream.status);
    } catch (err) {
      clearTimeout(timeout);

      if (err && err.name === "AbortError") {
        return jsonResponse({ error: "upstream_timeout" }, 504);
      }

      return jsonResponse({ error: "upstream_unavailable" }, 502);
    }
  }
};
