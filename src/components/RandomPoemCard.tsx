import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { mdiCogOutline, mdiRefresh } from '@mdi/js';
import { getFirstVerses, getPoemPath, getRandomPoemId } from '../data/content';
import type { PoemPath, Verse } from '../data/types';
import { pathText } from '../data/user';
import { poemFontStyle, useSettings, type RandomPoemLayout } from '../state/settings';
import { S } from '../strings';
import { IconButton, PoetAvatar } from './ui';

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

/** Home-screen random poem, in one of the layouts from the Android client. */
export function RandomPoemCard({ layout, preview: forcedPreview }: { layout: RandomPoemLayout; preview?: RandomPoemPreview }) {
  const settings = useSettings();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<RandomPoemPreview | null>(forcedPreview ?? null);

  const refresh = useCallback(() => {
    void loadRandomPoemPreview().then(setPreview);
  }, []);

  useEffect(() => {
    if (!forcedPreview) refresh();
  }, [forcedPreview, refresh]);

  if (layout === 'HIDDEN' || !preview) return null;
  const { path, verses } = preview;
  const href = `/poem/${path.poet.id}/${path.poem.id}`;

  return (
    <section className={`random-card layout-${layout.toLowerCase()}`} aria-label={S.dailyRandomPoemTitle}>
      <header className="random-card-header">
        {layout !== 'JADVAL_LEAF' && <PoetAvatar name={path.poet.name} imageUrl={path.poet.imageUrl} size={40} />}
        <div className="random-card-title">
          <strong>{path.poet.name}</strong>
          <span>{pathText(path)}</span>
        </div>
        {!forcedPreview && (
          <>
            <IconButton icon={mdiRefresh} label={S.randomPoemAnother} onClick={refresh} />
            <IconButton icon={mdiCogOutline} label={S.randomPoemOptions} onClick={() => navigate('/settings#random')} />
          </>
        )}
      </header>
      <Link to={href} className="random-card-verses" style={poemFontStyle(settings)}>
        {verses.map((v) => (
          <p key={v.id} className={`verse-line pos-${v.position}`}>
            {v.text}
          </p>
        ))}
      </Link>
    </section>
  );
}
