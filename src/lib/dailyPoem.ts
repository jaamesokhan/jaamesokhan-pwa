// Daily random-poem notification (Android: ExactAlarmScheduler + NotificationService).
// The web has no exact alarms, so this uses Periodic Background Sync (Chromium, installed PWA):
// the browser wakes the service worker roughly daily, and it shows the next queued poem once
// the chosen time of day has passed. The service worker can't open the SQLite database (OPFS
// sync handles are worker-only), so the app pre-picks a queue of poems into IndexedDB.
import { get, set } from 'idb-keyval';
import { getFirstVerses, getPoemPath, getRandomPoemId } from '../data/content';
import {
  DAILY_POEM_CONFIG_KEY,
  DAILY_POEM_QUEUE_KEY,
  DAILY_POEM_TAG,
  type DailyPoemConfig,
  type QueuedPoem,
} from './dailyPoemShared';

const QUEUE_SIZE = 7;

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {
    register(tag: string, options: { minInterval: number }): Promise<void>;
    unregister(tag: string): Promise<void>;
  };
};

export async function isDailyPoemSupported(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
  const reg = (await navigator.serviceWorker.getRegistration()) as PeriodicSyncRegistration | undefined;
  return !!reg?.periodicSync;
}

async function buildQueue(): Promise<QueuedPoem[]> {
  const queue: QueuedPoem[] = [];
  for (let i = 0; i < QUEUE_SIZE; i++) {
    const poemId = await getRandomPoemId();
    if (poemId == null) break;
    const path = await getPoemPath(poemId);
    if (!path) continue;
    const verses = await getFirstVerses(poemId, 2);
    queue.push({
      title: `${path.poet.name} — ${path.poem.title}`,
      body: verses.map((v) => v.text).join('\n'),
      url: `/poem/${path.poet.id}/${poemId}`,
    });
  }
  return queue;
}

/** Tops the queue up; call on app start while the feature is enabled. */
export async function refillDailyPoemQueue(): Promise<void> {
  const config = await get<DailyPoemConfig>(DAILY_POEM_CONFIG_KEY);
  if (!config?.enabled) return;
  const queue = (await get<QueuedPoem[]>(DAILY_POEM_QUEUE_KEY)) ?? [];
  if (queue.length >= QUEUE_SIZE / 2) return;
  await set(DAILY_POEM_QUEUE_KEY, [...queue, ...(await buildQueue())].slice(0, QUEUE_SIZE));
}

/** Returns false if permission was denied or the browser can't schedule it. */
export async function setDailyPoem(enabled: boolean, time: string): Promise<boolean> {
  const reg = (await navigator.serviceWorker?.getRegistration()) as PeriodicSyncRegistration | undefined;
  if (!reg?.periodicSync) return false;
  const previous = await get<DailyPoemConfig>(DAILY_POEM_CONFIG_KEY);
  if (!enabled) {
    await set(DAILY_POEM_CONFIG_KEY, { ...previous, enabled: false, time });
    await reg.periodicSync.unregister(DAILY_POEM_TAG).catch(() => undefined);
    return true;
  }
  if ((await Notification.requestPermission()) !== 'granted') return false;
  try {
    await reg.periodicSync.register(DAILY_POEM_TAG, { minInterval: 6 * 60 * 60 * 1000 });
  } catch {
    // Chrome only allows it for installed apps with enough engagement.
    return false;
  }
  await set(DAILY_POEM_CONFIG_KEY, { ...previous, enabled: true, time });
  await set(DAILY_POEM_QUEUE_KEY, await buildQueue());
  return true;
}
