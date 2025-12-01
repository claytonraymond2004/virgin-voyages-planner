const CACHE_NAME = 'vv-planner-v1';
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
    './modules/utils.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
