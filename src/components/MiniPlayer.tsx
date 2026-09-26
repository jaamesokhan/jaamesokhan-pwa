import { useState } from 'react';
import { Link } from 'react-router';
import { mdiClose, mdiFastForward10, mdiPause, mdiPlay, mdiRepeat, mdiRepeatOff, mdiRewind10 } from '@mdi/js';
import { PLAYBACK_SPEEDS, useAudio } from '../audio/AudioProvider';
import { formatDuration, toPersianNumber } from '../lib/format';
import { S } from '../strings';
import { IconButton, PoetAvatar } from './ui';

/** Persistent recitation controls (Android: AudioControlBar). */
export function MiniPlayer() {
  const audio = useAudio();
  const [scrub, setScrub] = useState<number | null>(null);
  if (!audio.nowPlaying) return null;
  const { nowPlaying, status, position, duration } = audio;
  const playing = status === 'playing' || status === 'loading';
  const nextSpeed = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(audio.speed) + 1) % PLAYBACK_SPEEDS.length];

  return (
    <section className="mini-player" aria-label={S.recite}>
      <div className="mini-player-row">
        <PoetAvatar name={nowPlaying.poetName} imageUrl={nowPlaying.imageUrl} size={40} />
        <Link className="mini-player-text" to={`/poem/${nowPlaying.poetId}/${nowPlaying.recitation.poemId}`}>
          <strong>{nowPlaying.poemTitle}</strong>
          <span>{nowPlaying.recitation.artistName}</span>
        </Link>
        <button
          type="button"
          className="speed-button"
          aria-label={S.playbackSpeed}
          title={S.playbackSpeed}
          onClick={() => audio.setSpeed(nextSpeed)}
        >
          {toPersianNumber(audio.speed)}×
        </button>
        <IconButton
          icon={audio.repeat ? mdiRepeat : mdiRepeatOff}
          label={S.repeat}
          active={audio.repeat}
          onClick={() => audio.setRepeat(!audio.repeat)}
        />
        <IconButton icon={mdiClose} label={S.stop} onClick={audio.stop} />
      </div>
      <div className="mini-player-row">
        <IconButton icon={mdiFastForward10} label={S.seekForward} onClick={() => audio.seekBy(10000)} />
        <IconButton
          icon={playing ? mdiPause : mdiPlay}
          label={playing ? S.pause : S.play}
          className="play-button"
          onClick={audio.toggle}
        />
        <IconButton icon={mdiRewind10} label={S.seekBackward} onClick={() => audio.seekBy(-10000)} />
        <span className="time">{formatDuration(scrub ?? position)}</span>
        <input
          type="range"
          className="seek"
          min={0}
          max={Math.max(duration, 1)}
          step={500}
          value={scrub ?? position}
          aria-label="موقعیت پخش"
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => {
            if (scrub != null) audio.seekTo(scrub);
            setScrub(null);
          }}
          onKeyUp={() => {
            if (scrub != null) audio.seekTo(scrub);
            setScrub(null);
          }}
        />
        <span className="time">{formatDuration(duration)}</span>
      </div>
    </section>
  );
}
