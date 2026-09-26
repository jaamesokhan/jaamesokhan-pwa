// Saved poems and highlights with label filters (Android: BookmarkCategoriesScreen).
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  mdiArrowLeft,
  mdiBookmarkOutline,
  mdiDeleteOutline,
  mdiDotsVertical,
  mdiMarker,
  mdiShareVariantOutline,
  mdiTagMultipleOutline,
  mdiTagOutline,
} from '@mdi/js';
import { useTitle } from '../components/Layout';
import { LabelPickerSheet, ManageLabelsSheet } from '../components/labels';
import { Chip, EmptyState, IconButton, LabelPill, MenuItem, PoetAvatar, Sheet, Spinner } from '../components/ui';
import { getPoemVerses } from '../data/content';
import type { LabelType } from '../data/types';
import {
  deleteHighlights,
  listBookmarks,
  listHighlightGroups,
  listLabelsWithCount,
  pathText,
  removeBookmark,
  type BookmarkItem,
  type HighlightGroupItem,
} from '../data/user';
import { shareText } from '../lib/share';
import { toPersianNumber } from '../lib/format';
import { useDbQuery } from '../state/hooks';
import { showToast } from '../state/toast';
import { S } from '../strings';

type Item = { kind: 'bookmark'; data: BookmarkItem } | { kind: 'highlight'; data: HighlightGroupItem };

function HighlightPreview({ item }: { item: HighlightGroupItem }) {
  return (
    <div className="highlight-preview">
      {item.verses.map((v, i) => {
        const h = item.highlights[i];
        return (
          <p key={v.id}>
            {v.text.slice(0, h.startIndex)}
            <mark style={{ background: h.color }}>{v.text.slice(h.startIndex, h.endIndex)}</mark>
            {v.text.slice(h.endIndex)}
          </p>
        );
      })}
    </div>
  );
}

export default function CollectionsPage() {
  const { tab = 'save' } = useParams();
  const type: LabelType = tab === 'hi' ? 'highlight' : 'bookmark';
  useTitle(type === 'bookmark' ? S.bookmarkTitle : S.highlightTitle);
  const navigate = useNavigate();

  const items = useDbQuery<Item[]>(
    async () =>
      type === 'bookmark'
        ? (await listBookmarks()).reverse().map((data) => ({ kind: 'bookmark' as const, data }))
        : (await listHighlightGroups()).reverse().map((data) => ({ kind: 'highlight' as const, data })),
    [type],
  );
  const labels = useDbQuery(() => listLabelsWithCount(type), [type]);
  const [filter, setFilter] = useState<number | null>(null);
  const [active, setActive] = useState<Item | null>(null);
  const [picking, setPicking] = useState<Item | null>(null);
  const [managing, setManaging] = useState(false);

  const visible = (items.data ?? []).filter((i) => filter == null || i.data.labels.some((l) => l.id === filter));
  const targetIds = (item: Item) => (item.kind === 'bookmark' ? [item.data.id] : item.data.highlights.map((h) => h.id));
  const poemUrl = (item: Item) =>
    item.kind === 'bookmark'
      ? `/poem/${item.data.context.poet.id}/${item.data.context.poem.id}`
      : `/poem/${item.data.context.poet.id}/${item.data.context.poem.id}?verse=${item.data.verses[0].id}`;

  const share = async (item: Item) => {
    const { context } = item.data;
    const text =
      item.kind === 'bookmark'
        ? (await getPoemVerses(context.poem.id)).map((v) => v.text).join('\n')
        : item.data.verses.map((v) => v.text).join('\n');
    await shareText(`${text}\n\n${context.poet.name}`);
  };

  const remove = async (item: Item) => {
    if (item.kind === 'bookmark') await removeBookmark(item.data.context.poem.id);
    else await deleteHighlights(item.data.highlights.map((h) => h.id));
    showToast(item.kind === 'bookmark' ? S.unbookmarkSuccess : S.deleteHighlightSuccess, 'success');
  };

  return (
    <div className="page">
      <div className="chip-wrap scroll-x">
        <Chip selected={filter == null} onClick={() => setFilter(null)}>
          {S.allCategoriesChip}
        </Chip>
        {labels.data?.map((l) => (
          <Chip key={l.id} color={l.color} selected={filter === l.id} onClick={() => setFilter(filter === l.id ? null : l.id)}>
            {l.name} ({toPersianNumber(l.itemCount)})
          </Chip>
        ))}
        <IconButton icon={mdiTagMultipleOutline} label={S.categories} onClick={() => setManaging(true)} />
      </div>

      {items.loading && !items.data && <Spinner />}
      {items.data && visible.length === 0 &&
        (filter != null ? (
          <EmptyState icon={mdiTagOutline} title={S.emptyCategoryTitle} subtitle={S.emptyCategorySubtitle} />
        ) : (
          <EmptyState icon={type === 'bookmark' ? mdiBookmarkOutline : mdiMarker} title={type === 'bookmark' ? S.noBookmark : S.noHighlights} />
        ))}

      <ul className="list">
        {visible.map((item) => {
          const { context, labels: itemLabels } = item.data;
          return (
            <li key={`${item.kind}-${item.data.id}`} className="card collection-item">
              <div className="collection-item-header">
                <PoetAvatar name={context.poet.name} imageUrl={context.poet.imageUrl} size={40} />
                <Link to={poemUrl(item)} className="path">
                  {pathText(context)}
                </Link>
                <IconButton icon={mdiDotsVertical} label={S.options} onClick={() => setActive(item)} />
              </div>
              <Link to={poemUrl(item)} className="collection-item-body">
                {item.kind === 'bookmark' ? (
                  <p className="verse-preview">{context.firstVerse?.text}</p>
                ) : (
                  <HighlightPreview item={item.data} />
                )}
              </Link>
              <div className="chip-wrap">
                {itemLabels.map((l) => (
                  <LabelPill key={l.id} name={l.name} color={l.color} />
                ))}
                <button type="button" className="add-label" onClick={() => setPicking(item)}>
                  + {S.addToCategoryPill}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={active != null} onClose={() => setActive(null)}>
        {active && (
          <nav className="menu">
            <MenuItem icon={mdiArrowLeft} label={S.goToPoem} onClick={() => navigate(poemUrl(active))} />
            <MenuItem
              icon={mdiTagOutline}
              label={S.addToCategory}
              onClick={() => {
                setPicking(active);
                setActive(null);
              }}
            />
            <MenuItem
              icon={mdiShareVariantOutline}
              label={S.share}
              onClick={() => {
                void share(active);
                setActive(null);
              }}
            />
            <MenuItem
              icon={mdiDeleteOutline}
              label={S.delete}
              danger
              onClick={() => {
                void remove(active);
                setActive(null);
              }}
            />
          </nav>
        )}
      </Sheet>

      <LabelPickerSheet
        open={picking != null}
        type={type}
        mode="set"
        title={S.addToCategory}
        targetIds={picking ? targetIds(picking) : []}
        initial={picking?.data.labels.map((l) => l.id) ?? []}
        onClose={() => setPicking(null)}
      />
      <ManageLabelsSheet open={managing} type={type} onClose={() => setManaging(false)} />
    </div>
  );
}
