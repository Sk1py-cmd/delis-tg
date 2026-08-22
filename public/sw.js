/* DELIS service worker — offline shell + cache (GitHub Pages compatible) */
const CACHE = "delis-v7";
// Base-aware: works both at / and /delis-tg/
const BASE_PATH = (() => {
  try {
    const url = new URL(self.location.href);
    // If served from /delis-tg/sw.js → base is /delis-tg/
    const path = url.pathname;
    if (path.includes("/delis-tg/")) return "/delis-tg/";
    // fallback: directory of sw.js
    return path.substring(0, path.lastIndexOf("/") + 1);
  } catch {
    return "/";
  }
})();
const SHELL = [BASE_PATH, BASE_PATH + "index.html", BASE_PATH + "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.includes("/v1/") || url.pathname.includes("/webhook")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(BASE_PATH + "index.html", copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(BASE_PATH + "index.html").then((r) => r || caches.match(BASE_PATH))),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request)
          .then((res) => {
            if (res.ok && (url.pathname.includes("/images/") || url.pathname.includes("/icons/") || url.pathname.includes("/brand/") || url.pathname.includes("/assets/"))) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => null);
            }
            return res;
          })
          .catch(() => cached),
    ),
  );
});
