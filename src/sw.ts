/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { delMany } from 'idb-keyval';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

// App shell: everything built by Vite, so the app starts offline.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Poet portraits (usually on other hosts).
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
);

// Poet catalogue: fresh when online, last copy when offline.
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname === '/api/v1/poet',
  new NetworkFirst({ cacheName: 'poet-catalogue', networkTimeoutSeconds: 5 }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// The daily random-poem notification was removed: stop the periodic sync it registered and drop its queue.
self.addEventListener('activate', (event) => {
  const registration = self.registration as ServiceWorkerRegistration & {
    periodicSync?: { unregister(tag: string): Promise<void> };
  };
  event.waitUntil(
    Promise.all([
      registration.periodicSync?.unregister('daily-poem').catch(() => undefined),
      delMany(['daily-poem-config', 'daily-poem-queue']).catch(() => undefined),
    ]),
  );
});
