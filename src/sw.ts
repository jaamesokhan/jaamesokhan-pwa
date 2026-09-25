/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { get, set } from 'idb-keyval';
import {
  DAILY_POEM_CONFIG_KEY,
  DAILY_POEM_QUEUE_KEY,
  DAILY_POEM_TAG,
  isDue,
  localDate,
  type DailyPoemConfig,
  type QueuedPoem,
} from './lib/dailyPoemShared';

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

async function showDailyPoem(): Promise<void> {
  const config = await get<DailyPoemConfig>(DAILY_POEM_CONFIG_KEY);
  const now = new Date();
  if (!config || !isDue(config, now)) return;
  const queue = (await get<QueuedPoem[]>(DAILY_POEM_QUEUE_KEY)) ?? [];
  const poem = queue.shift();
  if (!poem) return;
  await self.registration.showNotification(poem.title, {
    body: poem.body,
    icon: '/pwa-192x192.png',
    badge: '/favicon-64x64.png',
    lang: 'fa',
    dir: 'rtl',
    tag: DAILY_POEM_TAG,
    data: { url: poem.url },
  });
  await set(DAILY_POEM_QUEUE_KEY, queue);
  await set(DAILY_POEM_CONFIG_KEY, { ...config, lastShown: localDate(now) });
}

self.addEventListener('periodicsync', (event) => {
  const e = event as ExtendableEvent & { tag: string };
  if (e.tag === DAILY_POEM_TAG) e.waitUntil(showDailyPoem());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows[0] as WindowClient | undefined;
      if (client) {
        await client.focus();
        await client.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
