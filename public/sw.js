/*
 * Offline support for Quiz Simulator.
 *
 * The app is entirely client-side and stores everything in IndexedDB, so once
 * the shell is cached there is nothing else it needs the network for. The job
 * here is just to keep the shell available.
 *
 * Strategies:
 *  - /_next/static/*  cache-first. These filenames are content-hashed, so a
 *                     cached copy can never be stale.
 *  - navigations      network-first, falling back to the cached page, then to
 *                     the offline page. Network-first means a new deploy is
 *                     picked up straight away instead of being pinned.
 *  - RSC payloads     same as navigations. Next prefetches these for links on
 *                     screen, which is what makes routes work offline after a
 *                     single online visit to the dashboard.
 */

const VERSION = "v3";
const SHELL = `quizsim-shell-${VERSION}`;
const RUNTIME = `quizsim-runtime-${VERSION}`;

/*
 * Every route is a static page — the quiz id travels as a query param — so all
 * of them precache once and then work offline for any quiz, including ones
 * created while offline.
 */
const PAGES = ["/", "/play", "/host", "/edit", "/offline"];
const EXTRAS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/**
 * The build's asset filenames are hashed and change every deploy, so they
 * can't be hard-coded here. Instead the shell's HTML is fetched at install and
 * its own asset URLs are read back out of it — self-maintaining, and no build
 * step to keep in sync. Without this the offline page renders unstyled.
 */
const ASSET_PATTERN = /\/_next\/static\/[A-Za-z0-9._/-]+?\.(?:js|css|woff2?)/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const assets = new Set();

      for (const page of PAGES) {
        try {
          const response = await fetch(page, { cache: "reload" });
          if (!response.ok) continue;
          await cache.put(page, response.clone());
          for (const match of (await response.text()).matchAll(ASSET_PATTERN)) assets.add(match[0]);
        } catch {
          // A page that can't be reached now simply isn't available offline.
        }
      }

      // One bad URL shouldn't fail the whole install.
      await Promise.allSettled(
        [...EXTRAS, ...assets].map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL && key !== RUNTIME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Lets the page trigger an immediate update instead of waiting for a reload. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname);

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, { navigation = false } = {}) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (navigation) {
      // Cache lookups include the query string, but every route here is a
      // static page whose query is only read client-side — so the precached
      // document for the same path is the right response. This is what makes
      // /play?quiz=<anything> work offline, not just quizzes visited before.
      const byPath = await caches.match(new URL(request.url).pathname);
      if (byPath) return byPath;

      const offline = await caches.match("/offline");
      if (offline) return offline;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are cacheable, and only our own origin is ours to cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" || url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request, { navigation: request.mode === "navigate" }));
  }
});
