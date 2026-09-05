const PRODUCTION_API_ORIGIN = "https://delis-tg-admin.onrender.com";

/**
 * Route only the Arena branch hostname to its isolated Render service. Keeping
 * the production origin as the fallback makes this safe to merge later: the
 * production Worker hostname will never inherit preview data or configuration.
 */
const PREVIEW_API_ORIGINS = new Map([
  ["arena-019ffb0a-delis-tg-delis-tg-admin.mirzaaxmedov2001.workers.dev", "https://delis-tg-arena-preview.onrender.com"],
  ["arena-01a0191c-delis-tg-delis-tg-admin.mirzaaxmedov2001.workers.dev", "https://delis-tg-arena-preview.onrender.com"],
]);

/**
 * Cloudflare serves the Vite assets and keeps API calls same-origin for branch
 * previews and Telegram. Fastify remains authoritative; this worker only
 * forwards the request method, signed initData headers, query and raw body.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname.startsWith("/v1/")) {
      const apiOrigin = PREVIEW_API_ORIGINS.get(url.hostname) || PRODUCTION_API_ORIGIN;
      const target = new URL(url.pathname + url.search, apiOrigin);
      const proxyRequest = new Request(target, request);
      proxyRequest.headers.set("X-Forwarded-Host", url.host);
      proxyRequest.headers.set("X-Forwarded-Proto", "https");
      /* SECURITY: never forward the client's own X-Forwarded-For — it is
         attacker-controlled, and the API (Fastify trustProxy) takes the
         leftmost entry as the client IP, so a spoofed value would rotate
         unlimited rate-limit buckets. Pin it to Cloudflare's view of the
         real client IP (CF adds CF-Connecting-IP on every edge request). */
      const clientIp = request.headers.get("CF-Connecting-IP");
      if (clientIp) proxyRequest.headers.set("X-Forwarded-For", clientIp);
      return fetch(proxyRequest);
    }
    return env.ASSETS.fetch(request);
  },
};
