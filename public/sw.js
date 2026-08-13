/* =========================================================
   SERVICE WORKER — VoucherHub
   Phase 3: Offline Core
   =========================================================
   HARD RULES (do not violate when editing this file):

   1. Only GET requests are ever cached. POST/PUT/PATCH/DELETE always go
      straight to the network, untouched (event.respondWith is never
      called for them) — this app queues NO offline writes (see Phase 3
      spec: "READ OFFLINE, WRITE ONLINE").

   2. API caching uses an EXPLICIT ALLOWLIST (API_ALLOWLIST below), built
      from a manual audit of every controller in /controllers. There is
      NO generic "/api/* -> cache" rule anywhere in this file. Anything
      under /api/ that isn't matched by API_ALLOWLIST is passed straight
      to the network, never cached. See PHASE3_REPORT.md for the full
      endpoint-by-endpoint classification and reasoning.

   3. This file NEVER touches Firebase Admin, service account keys, or
      any /api/auth/* endpoint. Session cookies are httpOnly and never
      visible to this script anyway. Login/logout always hit the network
      live (logout gets one small side effect — see handleLogout below —
      but the request/response itself is never cached or modified).

   4. Cross-origin requests (Tailwind CDN, Chart.js CDN, Lucide CDN,
      Firebase/gstatic/googleapis) are never intercepted. They're left to
      the browser's native HTTP cache. No new third-party dependency is
      introduced by this file.

   5. self.skipWaiting() is NEVER called automatically on install. A new
      SW sits in "waiting" until the page explicitly posts
      {type: 'SKIP_WAITING'} (triggered by the user clicking "Refresh" on
      the update snackbar in js/pwa-register.js).
   ========================================================= */

/* APP_VERSION must always match the "version" field in /version.json —
   that file is the single source of truth a human bumps before every
   deploy that changes any cached file. Bumping it changes every cache
   name below, which is what makes the browser treat this as a new SW
   and lets activate() clean up the old caches (Phase 3 spec Step 6).

   Do not edit this line by hand after bumping version.json — instead
   run `npm run sync-version` (scripts/sync-version.js), which copies
   version.json's value in here with a plain string replace. It's a
   build-time convenience only; it does not run at request time and is
   not part of the Service Worker's runtime behavior. */
const APP_VERSION = '1.0.0';

const CACHE_STATIC = `voucherhub-static-${APP_VERSION}`; // app shell: html/css/js/icons/manifest
const CACHE_RUNTIME = `voucherhub-runtime-${APP_VERSION}`; // same-origin images (none in-app yet, see below)
const CACHE_API = `voucherhub-api-${APP_VERSION}`; // allowlisted GET /api/* responses only

const ALL_CACHE_NAMES = [CACHE_STATIC, CACHE_RUNTIME, CACHE_API];

/* ── Precache list — app shell only ──────────────────────────────────
   Deliberately small. Only the two genuinely public/unauthenticated
   pages (index.html, login.html) are precached, plus the shared shell
   assets they need to render fully (even though login itself always
   needs a live network round-trip to Firebase Auth — see Step 9).

   The 10 authenticated admin pages (dashboard.html, voucher.html,
   penjualan.html, stok.html, presensi.html, generate-absensi.html,
   keuangan.html, laporan.html, pengguna.html, pengaturan.html,
   log-sistem.html) are intentionally NOT precached here. Reasoning
   (same trade-off PMR made in Phase 1/2, re-applied to VoucherHub):
     - cache.addAll() is atomic — one failed fetch fails install for
       the whole app, including the public pages every visitor needs.
     - They provide no offline value until an authenticated admin has
       actually opened them at least once online.
   They still become available offline automatically, the very first
   time each is opened online — see networkFirstNavigation() below,
   which caches every successful HTML navigation as it happens. */
const PRECACHE_URLS = [
  '/index.html',
  '/login.html',
  '/offline.html',
  '/css/style.css',
  '/js/landing.js',
  '/js/login.js',
  '/js/pwa-register.js',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

/* ── STEP 1 AUDIT RESULT — explicit GET /api/* allowlist ─────────────
   Every entry below was verified against its controller/service source
   (not assumed from the route name). See PHASE3_REPORT.md for the full
   per-endpoint writeup. Summary of what's excluded and why:

     - /api/auth/*                    session/identity — never cache
     - /api/config/firebase-client    technically non-secret, but the
                                       Phase 3 spec explicitly lists
                                       "Firebase configuration endpoints"
                                       under NEVER CACHE, and it has zero
                                       offline value (you cannot complete
                                       login without network regardless)
                                       — excluded out of caution
     - /api/attendance/*              contains student names (nama) —
                                       minor PII, never cache
     - /api/attendance-generator/preview,
       /export/pdf, /export/excel     contains/derives student rosters
     - /api/reports/presensi          same report engine, "presensi"
                                       key returns per-student rows
     - /api/reports/keuangan          reportService.keuanganReport() maps
                                       each row's `label: e.label` — the
                                       exact same admin-entered free-text
                                       field already excluded below via
                                       /api/finance/income|expense|recent.
                                       Same reasoning applies here: this
                                       is a *different endpoint* surfacing
                                       the *same* free-text field, so it
                                       needs its own explicit exclusion —
                                       excluding /api/finance/income does
                                       not implicitly cover this route.
     - /api/reports/:key/export/*     binary file downloads — excluded
                                       for simplicity, no offline value
     - /api/finance/recent,
       /api/finance/income,
       /api/finance/expense           surface free-text fields
                                       (label/deskripsi) entered by an
                                       admin with no fixed vocabulary —
                                       "arbitrary user-specific data"
                                       per Phase 3 Step 3 — excluded
     - /api/users/*                   admin-only, staff PII (email)
     - /api/settings/*                admin-only config; also a
                                       data-integrity risk if an admin
                                       edits a form pre-filled from stale
                                       cached settings
     - /api/logs/*                    admin-only, contains IP addresses
                                       and login-failure details
     - every POST/PUT/PATCH/DELETE    excluded by the method check in
                                       the fetch handler, before this
                                       allowlist is ever consulted

   Everything matched below returns ONLY aggregate counts/sums, or
   operational records whose only "identity" field is the acting staff
   member's own name (dibuatOleh/operator) — the same tier of
   information already visible to any authenticated user of this
   single-tenant admin tool during normal same-page use. */
const API_ALLOWLIST = [
  // dashboardController.getSummary — stats + revenue chart + recent
  // transactions + notifications (aggregate counts only)
  /^\/api\/dashboard\/summary$/,

  // voucherController — stats, list (paginated/filtered), single detail
  /^\/api\/vouchers\/stats$/,
  /^\/api\/vouchers\/?$/,
  /^\/api\/vouchers\/[^/]+$/,

  // salesController — stats, 7-day chart, list, single detail
  /^\/api\/sales\/stats$/,
  /^\/api\/sales\/chart$/,
  /^\/api\/sales\/?$/,
  /^\/api\/sales\/[^/]+$/,

  // inventoryController — stock overview, movement log (actor name only)
  /^\/api\/inventory\/stock$/,
  /^\/api\/inventory\/movements$/,

  // financeController — pure numeric aggregates only (no free text)
  /^\/api\/finance\/stats$/,
  /^\/api\/finance\/cashflow$/,
  /^\/api\/finance\/monthly-summary$/,

  // attendanceGeneratorController — week picker options (computed, no
  // DB read) and last-generation metadata (counts + staff name, no
  // student roster)
  /^\/api\/attendance-generator\/weeks$/,
  /^\/api\/attendance-generator\/last$/,

  // reportController — 3 of the 5 report keys only.
  //   - "presensi" excluded: per-student rows (see above)
  //   - "keuangan" excluded: rows include the free-text `label` field
  //     (see above) — same reasoning as /api/finance/income|expense
  // The alternation below cannot match either of those, nor the
  // /export/pdf|excel sub-routes for any key.
  /^\/api\/reports\/(penjualan|voucher|stok)$/,
];

function isAllowlistedApi(pathname) {
  return API_ALLOWLIST.some((pattern) => pattern.test(pathname));
}

/* ── INSTALL: precache the app shell ─────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS)),
    // Deliberately no self.skipWaiting() — see HARD RULES #5 above.
  );
});

/* ── ACTIVATE: drop any cache not matching the current version ──────
   This is what stops a user being stuck on stale assets forever —
   every cache name is versioned, so a version bump here always results
   in the old ones being deleted on activate. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !ALL_CACHE_NAMES.includes(k)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* ── Update flow: page asks the waiting SW to activate now ──────────
   Triggered by the "Refresh" button in the update snackbar
   (js/pwa-register.js). Never called automatically. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Helpers ──────────────────────────────────────────────────────── */
function isCacheableResponse(response) {
  return !!response && response.ok; // 2xx only — never cache 4xx/5xx
}

function isNavigationRequest(request) {
  return request.mode === 'navigate'
    || (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html'));
}

function isSameOriginStaticAsset(url) {
  return url.origin === self.location.origin && (
    /\.(css|js)$/.test(url.pathname)
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/favicon.svg'
    || url.pathname === '/manifest.json'
  );
}

// No dynamic image content exists in VoucherHub today (no gallery/upload
// feature) — this bucket is here to satisfy the Phase 3 spec's "Images:
// Stale While Revalidate" requirement in a forward-compatible way, and is
// scoped to same-origin only. It never touches CDN-hosted images.
function isSameOriginImage(url) {
  return url.origin === self.location.origin && /\.(png|jpe?g|gif|webp)$/.test(url.pathname)
    && !url.pathname.startsWith('/icons/');
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

/* ── Strategy: Network First ─────────────────────────────────────────
   Used for navigations and for allowlisted API GETs. Administrative
   data should always prefer the freshest network response when online
   (Phase 3 spec: "fresh data should be preferred whenever online").
   A cached fallback is only ever used on a genuine network failure —
   never when the network responds with an error status. A 401 (expired
   session) is a real response, not a failure, and is always returned
   live and unmodified so the app's own login-redirect logic still
   works and the user is never shown stale data while appearing to
   still be authenticated. */
async function networkFirst(request, cacheName, { notifyOnCacheFallback = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      if (notifyOnCacheFallback) {
        notifyClients({ type: 'VH_API_FROM_CACHE', url: request.url });
      }
      return cached;
    }
    throw err;
  }
}

/* ── Strategy: Network First for navigations, with offline.html as the
   final fallback if nothing was ever cached for this exact page. ──── */
async function navigationHandler(request) {
  try {
    return await networkFirst(request, CACHE_STATIC);
  } catch (err) {
    const cache = await caches.open(CACHE_STATIC);
    const offlinePage = await cache.match('/offline.html');
    if (offlinePage) return offlinePage;
    throw err;
  }
}

/* ── Strategy: Cache First (CSS/JS/icons/manifest/favicon) ──────────── */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) cache.put(request, response.clone());
  return response;
}

/* ── Strategy: Stale While Revalidate (same-origin images, currently
   unused — see isSameOriginImage above) ──────────────────────────── */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (isCacheableResponse(response)) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

/* ── Logout side effect (see HARD RULE #3) ───────────────────────────
   Transparent pass-through: makes exactly the one request the page
   already made, returns exactly that response, unmodified. The ONLY
   addition is purging the allowlisted API cache once logout actually
   succeeds, so administrative data already fetched by this session
   doesn't linger in Cache Storage for the next person to use this
   browser/device. Static app-shell assets (HTML/CSS/JS/icons) are left
   alone — they never contain any per-user or business data in this
   architecture (all data is fetched client-side after render), so
   there's nothing sensitive in CACHE_STATIC to clear. */
async function handleLogout(request) {
  const response = await fetch(request);
  if (response.ok) {
    await caches.delete(CACHE_API);
  }
  return response;
}

/* ── FETCH: route each request to the right strategy ─────────────── */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Logout: special-cased pass-through + cache purge (see above).
  if (
    request.method === 'POST'
    && url.origin === self.location.origin
    && url.pathname === '/api/auth/logout'
  ) {
    event.respondWith(handleLogout(request));
    return;
  }

  // Every other mutation (POST/PUT/PATCH/DELETE) — always straight to
  // the network, completely untouched by this service worker.
  if (request.method !== 'GET') return;

  // Cross-origin requests (Tailwind/Chart.js/Lucide CDNs, Firebase/
  // gstatic/googleapis, etc.) are never intercepted — see HARD RULE #4.
  if (url.origin !== self.location.origin) return;

  // sw.js and version.json must always be fetched fresh so the
  // browser's own update-detection and our version check keep working.
  if (url.pathname === '/sw.js' || url.pathname === '/version.json') return;

  if (isNavigationRequest(request)) {
    event.respondWith(navigationHandler(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (isAllowlistedApi(url.pathname)) {
      event.respondWith(networkFirst(request, CACHE_API, { notifyOnCacheFallback: true }));
    }
    // Not allowlisted: intentionally do nothing. The request proceeds
    // straight to the network, exactly as if this SW didn't exist.
    return;
  }

  if (isSameOriginStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  if (isSameOriginImage(url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
    return;
  }

  // Anything else same-origin and unclassified: leave untouched.
});
