// Parts of the daily-poem feature shared with the service worker (no DB imports here).

export const DAILY_POEM_TAG = 'daily-poem';
export const DAILY_POEM_CONFIG_KEY = 'daily-poem-config';
export const DAILY_POEM_QUEUE_KEY = 'daily-poem-queue';
export interface DailyPoemConfig {
  enabled: boolean;
  /** "HH:MM" */
  time: string;
  /** YYYY-MM-DD of the last notification shown. */
  lastShown?: string;
}

export interface QueuedPoem {
  title: string;
  body: string;
  url: string;
}

/** Shared with the service worker: should a poem be shown now? */
export function isDue(config: DailyPoemConfig, now: Date): boolean {
  if (!config.enabled) return false;
  const today = localDate(now);
  if (config.lastShown === today) return false;
  const [h, m] = config.time.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
