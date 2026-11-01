const CACHE = "cymatics-v4";
const ASSETS = [
  "./",
  "index.html",
  "modes.html",
  "math.html",
  "cy.css",
  "js/cymatics.js",
  "js/app.js",
  "js/modes.js",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.json",
];

self.addEventListener("install", (e) => {
  // "reload" bypasses the HTTP cache, so an update never caches stale files
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// Stale-while-revalidate: answer from the cache at once, and refresh the
// cache from the network behind it. A new release reaches every visitor on
// their next visit without bumping CACHE; CACHE only needs to change when
// ASSETS does. Pages are cached by path, so every ?shape=&mode= link to the
// player is served by the same cached page, online or off.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const cacheable =
    url.origin === location.origin ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
  if (e.request.method !== "GET" || !cacheable) return;
  const page = e.request.mode === "navigate";
  const key = page ? url.origin + url.pathname : e.request;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(key).then((cached) => {
        const fresh = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => cached || (page ? cache.match("index.html") : Response.error()));
        if (!cached) return fresh;
        e.waitUntil(fresh.catch(() => {}));
        return cached;
      }),
    ),
  );
});
