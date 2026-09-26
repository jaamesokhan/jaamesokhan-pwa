import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { mdiChevronLeft, mdiFolderOutline, mdiShuffleVariant } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { EmptyState, Icon, LoadMoreSentinel, PoetAvatar, Spinner } from '../components/ui';
import {
  getCategory,
  getPoemsInCategory,
  getPoet,
  getRandomPoemId,
  getSubcategoriesWithPoemCount,
} from '../data/content';
import type { PoemWithFirstVerse } from '../data/types';
import { toPersianNumber } from '../lib/format';
import { useDbQuery } from '../state/hooks';
import { S } from '../strings';

const PAGE_SIZE = 50;

export default function PoetDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const poetId = Number(params.poetId);
  const categoryIds = (params.categoryPath ?? '').split(',').map(Number).filter((n) => n > 0);
  const categoryId = categoryIds[categoryIds.length - 1];
  const isRoot = categoryIds.length <= 1;

  const header = useDbQuery(
    async () => ({
      poet: await getPoet(poetId),
      trail: await Promise.all(categoryIds.map((id) => getCategory(id))),
      subcategories: await getSubcategoriesWithPoemCount(poetId, categoryId),
    }),
    [poetId, params.categoryPath],
  );

  const [poems, setPoems] = useState<PoemWithFirstVerse[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPoems, setLoadingPoems] = useState(false);
  const activeCategory = useRef(categoryId);

  useEffect(() => {
    activeCategory.current = categoryId;
    setPoems([]);
    setHasMore(true);
    setLoadingPoems(false);
  }, [categoryId]);

  const loadMore = async () => {
    if (loadingPoems || !hasMore) return;
    const requested = categoryId;
    setLoadingPoems(true);
    const batch = await getPoemsInCategory(requested, PAGE_SIZE, poems.length);
    if (activeCategory.current !== requested) return;
    setPoems((prev) => [...prev, ...batch]);
    setHasMore(batch.length === PAGE_SIZE);
    setLoadingPoems(false);
  };

  const poet = header.data?.poet;
  const trail = header.data?.trail.filter((c) => c != null) ?? [];
  const current = trail[trail.length - 1];
  useTitle(isRoot ? poet?.name ?? '' : current?.text ?? '');

  if (header.loading && !header.data) return <Spinner />;
  if (!poet || !current) return <EmptyState title={S.notFound} />;

  const shuffle = async () => {
    const poemId = await getRandomPoemId(categoryId);
    if (poemId != null) navigate(`/poem/${poetId}/${poemId}`);
  };

  return (
    <div className="page">
      {isRoot ? (
        <section className="poet-info">
          <PoetAvatar name={poet.name} imageUrl={poet.imageUrl} size={96} />
          <h2>{poet.name}</h2>
          {poet.description && <p>{poet.description}</p>}
        </section>
      ) : (
        <nav className="breadcrumb" aria-label="مسیر">
          {trail.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <Icon path={mdiChevronLeft} size={16} />}
              {i < trail.length - 1 ? (
                <Link to={`/poet/${poetId}/${categoryIds.slice(0, i + 1).join(',')}`}>{c.text}</Link>
              ) : (
                <strong>{c.text}</strong>
              )}
            </span>
          ))}
        </nav>
      )}

      {header.data!.subcategories.length > 0 && (
        <ul className="list">
          {header.data!.subcategories.map((sub) => (
            <li key={sub.id}>
              <Link className="card list-row" to={`/poet/${poetId}/${[...categoryIds, sub.id].join(',')}`}>
                <Icon path={mdiFolderOutline} />
                <span className="list-row-text">
                  <strong>{sub.text}</strong>
                  <span>{S.poemsCount(toPersianNumber(sub.poemCount))}</span>
                </span>
                <Icon path={mdiChevronLeft} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="list">
        {poems.map(({ poem, firstVerse }) => (
          <li key={poem.id}>
            <Link className="card list-row poem-row" to={`/poem/${poetId}/${poem.id}`}>
              <span className="list-row-text">
                <strong>{poem.title}</strong>
                {firstVerse && <span className="first-verse">{firstVerse.text}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {loadingPoems && <Spinner />}
      {hasMore && <LoadMoreSentinel key={categoryId} trigger={poems.length} disabled={loadingPoems} onVisible={() => void loadMore()} />}

      {(poems.length > 0 || header.data!.subcategories.length > 0) && (
        <button type="button" className="fab" onClick={() => void shuffle()} aria-label={S.randomPoem} title={S.randomPoem}>
          <Icon path={mdiShuffleVariant} />
        </button>
      )}
    </div>
  );
}
