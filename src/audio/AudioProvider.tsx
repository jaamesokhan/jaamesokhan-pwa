// App-wide recitation player (Android: AppNavHostViewModel's MediaPlayer + AudioSessionManager).
// One <audio> element lives here so playback continues while navigating; the Media Session
// API provides lock-screen / notification controls.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchAudioSync, type AudioSync, type Recitation } from '../api';
import { showToast } from '../state/toast';
import { S } from '../strings';

export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'finished';

export interface NowPlaying {
  recitation: Recitation;
  poemTitle: string;
  poetName: string;
  poetId: number;
  imageUrl: string | null;
}

interface AudioState {
  nowPlaying: NowPlaying | null;
  status: PlayStatus;
  position: number;
  duration: number;
  repeat: boolean;
  speed: number;
  sync: AudioSync | null;
  play: (item: NowPlaying) => void;
  toggle: () => void;
  stop: () => void;
  seekTo: (ms: number) => void;
  seekBy: (ms: number) => void;
  setRepeat: (repeat: boolean) => void;
  setSpeed: (speed: number) => void;
  /** 0-based index of the verse being recited, or null. */
  recitedVerseIndex: number | null;
}

const AudioContext = createContext<AudioState | null>(null);

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [status, setStatus] = useState<PlayStatus>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeatState] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [sync, setSync] = useState<AudioSync | null>(null);

  const play = useCallback((item: NowPlaying) => {
    const audio = audioRef.current;
    if (!audio) return;
    setNowPlaying(item);
    setSync(null);
    setPosition(0);
    setDuration(0);
    setStatus('loading');
    audio.src = item.recitation.audioFileUrl;
    audio.playbackRate = speed;
    audio.play().catch(() => {
      setStatus('idle');
      showToast(S.recitationFetchFailed, 'error');
    });
    if (item.recitation.syncFileUrl) {
      fetchAudioSync(item.recitation.syncFileUrl)
        .then(setSync)
        .catch(() => setSync(null));
    }
  }, [speed]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, [nowPlaying]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setNowPlaying(null);
    setStatus('idle');
    setSync(null);
    setPosition(0);
    setDuration(0);
  }, []);

  const seekTo = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(ms / 1000, 0), audio.duration);
    setPosition(audio.currentTime * 1000);
  }, []);

  const seekBy = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (audio) seekTo(audio.currentTime * 1000 + ms);
  }, [seekTo]);

  const setRepeat = useCallback((value: boolean) => {
    setRepeatState(value);
    if (audioRef.current) audioRef.current.loop = value;
  }, []);

  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  // Media Session: metadata + lock-screen controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!nowPlaying) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: nowPlaying.poemTitle,
      artist: nowPlaying.recitation.artistName,
      album: nowPlaying.poetName,
      artwork: nowPlaying.imageUrl ? [{ src: nowPlaying.imageUrl }] : [{ src: '/pwa-512x512.png', sizes: '512x512' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void audioRef.current?.play()],
      ['pause', () => audioRef.current?.pause()],
      ['stop', stop],
      ['seekbackward', () => seekBy(-10000)],
      ['seekforward', () => seekBy(10000)],
      ['seekto', (d) => d.seekTime != null && seekTo(d.seekTime * 1000)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
  }, [nowPlaying, stop, seekBy, seekTo]);

  const recitedVerseIndex = useMemo(() => {
    if (!sync || (status !== 'playing' && status !== 'paused')) return null;
    const t = position + sync.offsetMs;
    let current: number | null = null;
    for (const p of sync.points) {
      if (p.ms > t) break;
      current = p.verseOrder >= 0 ? p.verseOrder : null;
    }
    return current;
  }, [sync, position, status]);

  const value = useMemo<AudioState>(
    () => ({
      nowPlaying, status, position, duration, repeat, speed, sync,
      play, toggle, stop, seekTo, seekBy, setRepeat, setSpeed, recitedVerseIndex,
    }),
    [nowPlaying, status, position, duration, repeat, speed, sync, play, toggle, stop, seekTo, seekBy, setRepeat, setSpeed, recitedVerseIndex],
  );

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onPlaying={() => setStatus('playing')}
        onPause={(e) => !e.currentTarget.ended && e.currentTarget.src && setStatus('paused')}
        onWaiting={() => setStatus('loading')}
        onEnded={() => setStatus('finished')}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration * 1000)}
        onError={(e) => {
          if (!e.currentTarget.getAttribute('src')) return;
          setStatus('idle');
          showToast(S.recitationFetchFailed, 'error');
        }}
      />
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioState {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio outside AudioProvider');
  return ctx;
}
