import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { mdiAutorenew } from '@mdi/js';
import randomPoemArt from '../assets/random-poem.png';
import { getFirstVerses, getPoemPath, getRandomPoemId } from '../data/content';
import type { PoemPath, Verse } from '../data/types';
import { pathText } from '../data/user';
import type { RandomPoemLayout } from '../state/settings';
import { S } from '../strings';
import { Icon, PoetAvatar } from './ui';

export interface RandomPoemPreview {
  path: PoemPath;
  verses: Verse[];
}

export async function loadRandomPoemPreview(): Promise<RandomPoemPreview | null> {
  const poemId = await getRandomPoemId();
  if (poemId == null) return null;
  const path = await getPoemPath(poemId);
  if (!path) return null;
  return { path, verses: await getFirstVerses(poemId, 4) };
}

/** Android's paper-leaf and jadval-leaf cards show a single beyt (two hemistiches). */
const BEYT_LINES = 2;

function Avatar({ path }: { path: PoemPath }) {
  const { name, imageUrl } = path.poet;
  if (imageUrl) return <PoetAvatar name={name} imageUrl={imageUrl} size={30} />;
  return (
    <span className="random-card-initial" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

function Verses({ verses, lines }: { verses: Verse[]; lines?: number }) {
  return (
    <div className="random-card-verses">
      {verses.slice(0, lines).map((v) => (
        <p key={v.id}>{v.text}</p>
      ))}
    </div>
  );
}

/** Home-screen random poem, in one of the layouts from the Android client. */
export function RandomPoemCard({ layout, preview: forcedPreview }: { layout: RandomPoemLayout; preview?: RandomPoemPreview }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<RandomPoemPreview | null>(forcedPreview ?? null);

  const refresh = useCallback(() => {
    if (forcedPreview) return;
    void loadRandomPoemPreview().then((next) => next && setPreview(next));
  }, [forcedPreview]);

  useEffect(() => {
    if (forcedPreview) setPreview(forcedPreview);
    else refresh();
  }, [forcedPreview, refresh]);

  if (layout === 'HIDDEN' || !preview) return null;
  const { path, verses } = preview;
  const open = () => {
    if (!forcedPreview) navigate(`/poem/${path.poet.id}/${path.poem.id}`);
  };
  // The card itself opens the poem; the refresh control must not bubble up to it.
  const onRefresh = (e: MouseEvent) => {
    e.stopPropagation();
    refresh();
  };
  const cardProps = {
    role: 'link',
    tabIndex: 0,
    'aria-label': `${S.randomPoem}: ${pathText(path)}`,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open();
      }
    },
  };

  if (layout === 'CLASSIC') {
    return (
      <section className="random-card layout-classic" {...cardProps}>
        <div className="random-card-main">
          <Verses verses={verses} />
          <div className="random-card-footer">
            <button type="button" className="random-card-refresh" aria-label={S.randomPoem} onClick={onRefresh}>
              <Icon path={mdiAutorenew} size={24} />
            </button>
            <span className="random-card-path">{pathText(path)}</span>
          </div>
        </div>
        <img className="random-card-art" src={randomPoemArt} alt="" />
      </section>
    );
  }

  if (layout === 'PAPER_LEAF') {
    return (
      <section className="random-card layout-paper_leaf" {...cardProps}>
        <div className="random-card-body">
          <header className="random-card-header">
            <Avatar path={path} />
            <div className="random-card-title">
              <strong>{path.poet.name}</strong>
              <span>{path.categories.map((c) => c.text).join(' · ')}</span>
            </div>
            <span className="random-card-badge">{S.randomPoem}</span>
          </header>
          <Verses verses={verses} lines={BEYT_LINES} />
          <hr />
        </div>
        <button type="button" className="random-card-another" onClick={onRefresh}>
          <Icon path={mdiAutorenew} size={18} />
          {S.randomPoemAnother}
        </button>
      </section>
    );
  }

  const source = [path.poet.name, path.categories.at(-1)?.text].filter(Boolean).join(' · ');
  return (
    <section className="random-card layout-jadval_leaf" {...cardProps}>
      <div className="random-card-frame">
        <Verses verses={verses} lines={BEYT_LINES} />
        <div className="random-card-cartouche">
          <span>{source}</span>
        </div>
        <button type="button" className="random-card-refresh-icon" aria-label={S.randomPoem} onClick={onRefresh}>
          <Icon path={mdiAutorenew} size={18} />
        </button>
      </div>
    </section>
  );
}
