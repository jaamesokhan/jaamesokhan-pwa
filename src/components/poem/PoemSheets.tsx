import { useEffect, useState } from 'react';
import { mdiDeleteOutline, mdiMicrophoneOutline, mdiPlayCircleOutline, mdiSend, mdiShareVariantOutline, mdiVolumeHigh } from '@mdi/js';
import { fetchRecitations, fetchWordMeaning, type Recitation } from '../../api';
import { useAudio } from '../../audio/AudioProvider';
import type { PoemPath } from '../../data/types';
import { addComment, deleteComment, listPoemComments } from '../../data/user';
import { formatDateTime } from '../../lib/format';
import { shareText } from '../../lib/share';
import { useDbQuery } from '../../state/hooks';
import { S } from '../../strings';
import { EmptyState, Icon, IconButton, Sheet, Spinner } from '../ui';

export function RecitationsSheet({ open, path, onClose }: { open: boolean; path: PoemPath; onClose: () => void }) {
  const audio = useAudio();
  const [state, setState] = useState<{ poemId: number; status: 'loading' | 'ok' | 'error'; items: Recitation[] } | null>(null);
  const poemId = path.poem.id;

  useEffect(() => {
    if (!open || state?.poemId === poemId) return;
    setState({ poemId, status: 'loading', items: [] });
    fetchRecitations(poemId).then(
      (items) => setState({ poemId, status: 'ok', items }),
      () => setState({ poemId, status: 'error', items: [] }),
    );
  }, [open, poemId, state?.poemId]);

  return (
    <Sheet open={open} onClose={onClose} title={S.recite}>
      {state?.status === 'loading' && <Spinner />}
      {state?.status === 'error' && <EmptyState title={navigator.onLine ? S.recitationFetchFailed : S.networkError} />}
      {state?.status === 'ok' && state.items.length === 0 && <EmptyState icon={mdiMicrophoneOutline} title={S.recitationNotFound} />}
      <ul className="menu">
        {state?.items.map((r) => {
          const isCurrent = audio.nowPlaying?.recitation.audioFileUrl === r.audioFileUrl;
          return (
            <li key={r.audioFileUrl}>
              <button
                type="button"
                className={`menu-item ${isCurrent ? 'current' : ''}`}
                onClick={() => {
                  audio.play({
                    recitation: r,
                    poemTitle: path.poem.title,
                    poetName: path.poet.name,
                    poetId: path.poet.id,
                    imageUrl: path.poet.imageUrl,
                  });
                  onClose();
                }}
              >
                <Icon path={isCurrent ? mdiVolumeHigh : mdiPlayCircleOutline} />
                <span>{r.artistName || S.recite}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function NotesSheet({ open, poemId, onClose }: { open: boolean; poemId: number; onClose: () => void }) {
  const comments = useDbQuery(() => listPoemComments(poemId), [poemId]);
  const [text, setText] = useState('');

  return (
    <Sheet open={open} onClose={onClose} title={S.noteTitle}>
      <ul className="notes-list">
        {comments.data?.map((c) => (
          <li key={c.id} className="card note">
            <p>{c.text}</p>
            <div className="note-footer">
              <time>{formatDateTime(c.createdAt)}</time>
              <IconButton icon={mdiShareVariantOutline} label={S.share} onClick={() => void shareText(c.text)} />
              <IconButton icon={mdiDeleteOutline} label={S.delete} onClick={() => void deleteComment(c.id)} />
            </div>
          </li>
        ))}
      </ul>
      <form
        className="note-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await addComment(poemId, text.trim());
          setText('');
        }}
      >
        <textarea value={text} rows={3} placeholder={S.notePlaceholder} onChange={(e) => setText(e.target.value)} />
        <IconButton icon={mdiSend} label={S.submit} type="submit" disabled={!text.trim()} />
      </form>
    </Sheet>
  );
}

export function MeaningSheet({ open, word, onClose }: { open: boolean; word: string; onClose: () => void }) {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; meaning: string | null }>({ status: 'loading', meaning: null });

  useEffect(() => {
    if (!open || !word) return;
    setState({ status: 'loading', meaning: null });
    fetchWordMeaning(word).then(
      (meaning) => setState({ status: 'ok', meaning }),
      () => setState({ status: 'error', meaning: null }),
    );
  }, [open, word]);

  return (
    <Sheet open={open} onClose={onClose} title={word}>
      {state.status === 'loading' && <Spinner />}
      {state.status === 'error' && <EmptyState title={navigator.onLine ? S.meaningNotFound : S.networkError} />}
      {state.status === 'ok' && <p className="meaning">{state.meaning || S.meaningNotFound}</p>}
    </Sheet>
  );
}

