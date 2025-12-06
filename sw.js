const CACHE_NAME = 'vv-planner-v4';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app_logo.svg',
    './app_icon.svg',
    './icon-192.png',
    './icon-512.png',
    './manifest.json',
    './virgin_api.js',
    './modules/main.js',
    './modules/constants.js',
    './modules/customEvents.js',
    './modules/interactions.js',
    './modules/print.js',
    './modules/render.js',
    './modules/search.js',
    './modules/state.js',
    './modules/tooltips.js',
    './modules/ui.js',
    './modules/utils.js',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/html5-qrcode'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

// List of allowed external image domains to cache
const ALLOWED_IMAGE_DOMAINS = [
    'virginvoyages.imgix.net'
];

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle same-origin requests (app assets) OR allowed external images
    // This allows us to cache the agenda images for offline use
    if (url.origin === location.origin || ALLOWED_IMAGE_DOMAINS.includes(url.hostname)) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    // Fetch from network to update cache (Stale-While-Revalidate/Cache-First hybrid)
                    // For external immutable images, cache is king, but we try to update if possible or fill if missing
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        // Check if we received a valid response
                        // Allow 'basic' (same-origin) and 'cors' (external with CORS which we use for images)
                        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Network failed, just return undefined (will fall back to cache if available)
                    });

                    // Return cached response immediately if available, otherwise wait for fetch
                    return cachedResponse || fetchPromise;
                })
        );
    }
    // For other cross-origin requests (like API calls), fall back to browser default (Network Only)
});
