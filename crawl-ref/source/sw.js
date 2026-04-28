// DCSS-WASM service worker.
// VERSION is rewritten at image build time by deploy/Dockerfile (sed pass)
// so every deploy gets a unique cache key — without that, multiple deploys
// on the same day shared the same VERSION string and clients kept serving
// the older cached bundles. The placeholder below is what local/dev builds
// see when the Dockerfile sed step hasn't run.
const VERSION = '__DEPLOY_VERSION__';
const SHELL_CACHE = 'dcss-shell-' + VERSION;
const BUNDLE_CACHE = 'dcss-bundles-' + VERSION;
const ALL_CACHES = [SHELL_CACHE, BUNDLE_CACHE];

// Small "shell" assets the PWA needs to render its UI offline. These are
// precached atomically (addAll); if any single one fails the install fails,
// because without these the offline app is unusable.
const SHELL = [
    '/',
    '/index.html',
    '/ascii.html',
    '/tiles.html',
    '/index_tiles.html',
    '/vkb.js',
    '/vkb.css',
    '/manifest.webmanifest',
    '/icon.svg',
    '/icon-maskable.svg',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png',
    '/vendor/xterm.css',
    '/vendor/xterm.js',
    '/vendor/xterm-addon-fit.js',
];

// Heavy WASM/data bundles. Cached best-effort: a single failed fetch (or
// hitting iOS's cache quota) must not poison shell caching, so we add them
// individually with per-file catches.
const BUNDLES = [
    '/crawl.js',
    '/crawl.wasm',
    '/crawl.data',
    '/crawl_tiles.js',
    '/crawl_tiles.wasm',
    '/crawl_tiles.data',
];

// Strip Content-Encoding/Content-Length before storing in the Cache API.
// Safari (and historically other engines) has cached responses where the body
// was already decoded by the network stack but the headers still claimed
// `Content-Encoding: gzip`; on retrieval the engine tried to decode again,
// producing a "ZlibError"-style failure that breaks the offline page entirely.
// Rebuilding the Response without those headers avoids the double-decode.
async function cleanResponse(response) {
    if (!response || !response.ok) return response;
    const buf = await response.clone().arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
    return new Response(buf, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
    });
}

async function cachePut(cacheName, request, response) {
    try {
        const cleaned = await cleanResponse(response);
        const cache = await caches.open(cacheName);
        await cache.put(request, cleaned);
    } catch (e) {
        // Quota / storage errors are non-fatal — we still want to serve the
        // live response to the page.
    }
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil((async () => {
        // 1. Shell — atomic. If this fails, the SW won't activate, the
        //    browser keeps the previous SW (if any), and we'll retry later.
        const shellCache = await caches.open(SHELL_CACHE);
        await shellCache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));

        // 2. Bundles — best-effort. Done after shell so a quota hit on the
        //    50MB tiles blob doesn't take the shell down with it.
        const bundleCache = await caches.open(BUNDLE_CACHE);
        await Promise.all(BUNDLES.map(async (url) => {
            try {
                const res = await fetch(new Request(url, { cache: 'reload' }));
                if (res && res.ok) {
                    const cleaned = await cleanResponse(res);
                    await bundleCache.put(url, cleaned);
                }
            } catch (_) { /* offline / quota / etc */ }
        }));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((n) => (n.startsWith('dcss-shell-') || n.startsWith('dcss-bundles-') || n.startsWith('dcss-wasm-'))
                            && !ALL_CACHES.includes(n))
            .map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

// Network with a hard timeout. iOS in particular can sit on a fetch for many
// seconds when on a flaky/captive network before the OS gives up; the PWA
// boot screen looks frozen. Race the fetch against a timer and fall through
// to the cache if the network is too slow.
function fetchWithTimeout(req, ms) {
    return new Promise((resolve, reject) => {
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => {
            if (ctrl) ctrl.abort();
            reject(new Error('timeout'));
        }, ms);
        fetch(req, ctrl ? { signal: ctrl.signal } : undefined).then((res) => {
            clearTimeout(timer);
            resolve(res);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function matchAny(req) {
    // ignoreSearch: handles iOS launching the PWA with extra query params
    // (e.g. ?source=pwa, utm_*); the cached entry was stored without them.
    // ignoreVary: avoids the Vary: Accept-Encoding mismatch trap when a
    // request's encoding header differs from the precache fetch.
    const opts = { ignoreSearch: true, ignoreVary: true };
    const hit = await caches.match(req, opts);
    if (hit) return hit;
    return caches.match('/index.html', opts);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    const accept = req.headers.get('accept') || '';
    const isNav = req.mode === 'navigate' || accept.includes('text/html');

    if (isNav) {
        // Network-first with a tight timeout so an offline boot doesn't hang.
        event.respondWith((async () => {
            try {
                const res = await fetchWithTimeout(req, 2500);
                // Refresh the cached copy in the background; don't await.
                cachePut(SHELL_CACHE, req, res.clone());
                return res;
            } catch (_) {
                const cached = await matchAny(req);
                if (cached) return cached;
                throw new Error('offline and no cached page');
            }
        })());
        return;
    }

    // Cache-first for everything else (vendor assets and the WASM bundles).
    event.respondWith((async () => {
        const cached = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
            // Bundles go in the bundle cache so they're easy to wipe; everything
            // else lands in the shell cache.
            const isBundle = BUNDLES.some((b) => url.pathname === b);
            cachePut(isBundle ? BUNDLE_CACHE : SHELL_CACHE, req, res.clone());
        }
        return res;
    })());
});
