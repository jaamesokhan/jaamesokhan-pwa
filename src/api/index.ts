// Network calls: the Jaame Sokhan server (poet catalogue, downloads, recitations, dictionary)
// and Ganjoor (recitation fallback). Ports of api/*.kt in the Android client.
import type { Poet } from '../data/types';

const env = import.meta.env;
/** Empty in dev: requests go through the Vite proxy (see vite.config.ts). */
export const API_BASE_URL: string = (env.VITE_API_BASE_URL ?? (env.DEV ? '' : 'https://jaamesokhan.ir')).replace(/\/$/, '');
export const GANJOOR_BASE_URL: string = (env.VITE_GANJOOR_BASE_URL ?? 'https://api.ganjoor.net').replace(/\/$/, '');

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json() as Promise<T>;
}

interface PoetDto {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export async function fetchPoets(page: number, size: number, name?: string, signal?: AbortSignal): Promise<{ poets: Poet[]; last: boolean }> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (name) params.set('name', name);
  const res = await getJson<{ content: PoetDto[]; last?: boolean }>(`${API_BASE_URL}/api/v1/poet?${params}`, { signal });
  return {
    poets: res.content.map((p) => ({ id: p.id, name: p.name, description: p.description ?? '', imageUrl: p.imageUrl })),
    last: res.last ?? res.content.length < size,
  };
}

/**
 * Downloads a poet archive. Prefers the JSON download-link endpoint (no cross-origin
 * redirect); falls back to the redirecting endpoint on servers that don't have it yet.
 */
export async function downloadPoetZip(poetId: number, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
  let url = `${API_BASE_URL}/api/v1/poet/download/${poetId}`;
  try {
    url = (await getJson<{ url: string }>(`${url}/url`)).url;
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new HttpError(res.status, url);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(received / total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

export interface Recitation {
  artistName: string;
  poemId: number;
  audioFileUrl: string;
  syncFileUrl: string | null;
}

async function fetchGanjoorRecitations(poemId: number): Promise<Recitation[]> {
  const url =
    `${GANJOOR_BASE_URL}/api/ganjoor/poem/${poemId}?catInfo=false&catPoems=false&rhymes=false&recitations=true` +
    '&images=false&songs=false&comments=false&verseDetails=false&navigation=false&relatedpoems=false';
  const res = await getJson<{ recitations?: { mp3Url?: string; audioArtist?: string; xmlText?: string }[] }>(url);
  return (res.recitations ?? [])
    .filter((r) => r.mp3Url)
    .map((r) => ({ artistName: r.audioArtist ?? '', poemId, audioFileUrl: r.mp3Url!, syncFileUrl: r.xmlText ?? null }));
}

/** Recitations from our server, falling back to Ganjoor (same as JaameSokhanApiClient). */
export async function fetchRecitations(poemId: number): Promise<Recitation[]> {
  try {
    return await getJson<Recitation[]>(`${API_BASE_URL}/api/v1/recitations/${poemId}`);
  } catch (e) {
    console.warn('recitations API failed, trying Ganjoor', e);
    return fetchGanjoorRecitations(poemId);
  }
}

export interface AudioSync {
  /** Milliseconds to add to the playback position (Ganjoor's OneSecondBugFix). */
  offsetMs: number;
  /** Sorted by time. verseOrder is the 0-based verse index (negative = none). */
  points: { verseOrder: number; ms: number }[];
}

/** Parses Ganjoor's DesktopGanjoorPoemAudioList sync XML. */
export function parseAudioSync(xmlText: string): AudioSync | null {
  const cleaned = xmlText.trim().replace(/^"|"$/g, '').replace(/\\r|\\n/g, '').replace(/\\"/g, '"');
  const doc = new DOMParser().parseFromString(cleaned, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const audio = doc.getElementsByTagName('PoemAudio')[0];
  if (!audio) return null;
  const offsetMs = Number(audio.getElementsByTagName('OneSecondBugFix')[0]?.textContent ?? 0) || 0;
  const points = [...audio.getElementsByTagName('SyncInfo')]
    .map((info) => ({
      verseOrder: Number(info.getElementsByTagName('VerseOrder')[0]?.textContent),
      ms: Number(info.getElementsByTagName('AudioMiliseconds')[0]?.textContent),
    }))
    .filter((p) => Number.isFinite(p.verseOrder) && Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  return { offsetMs, points };
}

export async function fetchAudioSync(url: string): Promise<AudioSync | null> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(res.status, url);
  return parseAudioSync(await res.text());
}

export async function fetchWordMeaning(word: string): Promise<string | null> {
  const res = await getJson<{ result?: { meaning?: string } }>(`${API_BASE_URL}/api/v1/dictionary/meaning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: word.trim() }),
  });
  return res.result?.meaning ?? null;
}
