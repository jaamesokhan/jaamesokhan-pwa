// Poet downloads, kept outside any screen so they finish (and report) even if the user
// navigates away (the Android client's PoetViewModel had a FIXME for exactly that).
import { useSyncExternalStore } from 'react';
import { downloadPoetZip } from '../api';
import { workerDb } from '../db/client';
import type { Poet } from '../data/types';
import { S } from '../strings';
import { showToast } from './toast';

export type DownloadState =
  | { stage: 'downloading'; progress: number | null }
  | { stage: 'importing'; progress: number | null }
  | { stage: 'failed' };

let downloads: Record<number, DownloadState> = {};
const listeners = new Set<() => void>();

function set(poetId: number, state: DownloadState | null) {
  const next = { ...downloads };
  if (state) next[poetId] = state;
  else delete next[poetId];
  downloads = next;
  listeners.forEach((l) => l());
}

export function useDownloads(): Record<number, DownloadState> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => downloads,
  );
}

/** Asks the browser not to evict our data (the whole library lives in OPFS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function downloadPoet(poet: Poet): Promise<boolean> {
  const current = downloads[poet.id];
  if (current && current.stage !== 'failed') return false;
  set(poet.id, { stage: 'downloading', progress: null });
  try {
    void requestPersistentStorage();
    const zip = await downloadPoetZip(poet.id, (p) => set(poet.id, { stage: 'downloading', progress: p }));
    set(poet.id, { stage: 'importing', progress: null });
    await workerDb.importPoet(poet, zip, (p) => {
      // Verses dominate the import time, so report progress on them only.
      if (p.stage === 'verses') set(poet.id, { stage: 'importing', progress: p.done / p.total });
    });
    set(poet.id, null);
    showToast(`${poet.name}: ${S.downloadSuccessful}`, 'success');
    return true;
  } catch (e) {
    console.error('poet download failed', e);
    set(poet.id, { stage: 'failed' });
    showToast(`${poet.name}: ${navigator.onLine ? S.downloadFailed : S.networkError}`, 'error');
    return false;
  }
}
