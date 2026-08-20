/*
 * MCN — The Vault · service worker
 *
 * Deliberately conservative. Gameplay is server-authoritative, so nothing that
 * changes a player's progression is ever served from a cache: API calls always
 * go to the network. Only the heavy, immutable things — rank artwork, icons,
 * fonts — are cached, which is what makes the app open instantly on a phone.
 */

const CACHE = "mcn-vault-v1";
const ASSET_PATTERN = /^\/(ranks|icons)\//;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache game state.
  if (url.pathname.startsWith("/api/")) return;

  if (ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
