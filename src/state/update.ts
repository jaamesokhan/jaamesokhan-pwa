// App updates: the service worker registration, the "new version ready" flag, and a manual check for Settings.
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

const AUTO_CHECK_INTERVAL = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;
let needRefresh = false;
let offlineReady = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh = true;
    emit();
  },
  onOfflineReady() {
    offlineReady = true;
    emit();
  },
  onRegisteredSW(_url, reg) {
    registration = reg;
    // Long-lived sessions (an installed app left open) would otherwise only see updates on a cold start.
    if (reg) setInterval(() => void reg.update().catch(() => undefined), AUTO_CHECK_INTERVAL);
  },
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUpdateState(): { needRefresh: boolean; offlineReady: boolean } {
  const refresh = useSyncExternalStore(subscribe, () => needRefresh);
  const ready = useSyncExternalStore(subscribe, () => offlineReady);
  return { needRefresh: refresh, offlineReady: ready };
}

export function dismissUpdate(): void {
  needRefresh = false;
  emit();
}

export function clearOfflineReady(): void {
  offlineReady = false;
  emit();
}

/** Activates the waiting service worker and reloads into the new version. */
export function applyUpdate(): Promise<void> {
  return updateSW(true);
}

export type UpdateCheckResult = 'available' | 'latest' | 'failed' | 'unsupported';

/** Asks the server for a newer version; resolves once any new version has finished downloading. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration());
  if (!reg) return 'unsupported';
  if (!reg.waiting) {
    try {
      await reg.update();
    } catch {
      return 'failed';
    }
    const installing = reg.installing;
    if (installing) {
      await new Promise<void>((resolve) => {
        const settle = () => {
          if (installing.state === 'installed' || installing.state === 'activated' || installing.state === 'redundant') {
            installing.removeEventListener('statechange', settle);
            resolve();
          }
        };
        installing.addEventListener('statechange', settle);
        settle();
      });
    }
  }
  if (!reg.waiting) return 'latest';
  needRefresh = true;
  emit();
  return 'available';
}
