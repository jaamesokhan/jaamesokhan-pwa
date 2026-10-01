import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  mdiBookmark,
  mdiBookmarkOutline,
  mdiCheckboxMarkedOutline,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiContentCopy,
  mdiDotsVertical,
  mdiEye,
  mdiEyeOff,
  mdiFormatListNumbered,
  mdiNoteEditOutline,
  mdiShareVariantOutline,
  mdiVolumeHigh,
} from '@mdi/js';
import { useAudio } from '../audio/AudioProvider';
import { useTitle } from '../components/Layout';
import { LabelPickerSheet } from '../components/labels';
import { MeaningSheet, NotesSheet, RecitationsSheet } from '../components/poem/PoemSheets';
import { HighlightToolbar, SelectionToolbar, type ToolbarAnchor } from '../components/poem/Toolbars';
import { touchSelectionSupported, useTouchSelection } from '../components/poem/TouchSelection';
import { EmptyState, IconButton, MenuItem, PoetAvatar, Sheet, Spinner } from '../components/ui';
import { getPoemNeighbors, getPoemPath, getPoemVersesWithHighlights } from '../data/content';
import { DEFAULT_HIGHLIGHT_COLOR, type Highlight, type VerseWithHighlights } from '../data/types';
import { addBookmark, addHighlights, isBookmarked, pathText, recordVisit, removeBookmark } from '../data/user';
import { highlightSegments } from '../lib/highlightSegments';
import { toPersianNumber } from '../lib/format';
import { copyText, shareText } from '../lib/share';
import { useDbQuery } from '../state/hooks';
import { poemFontStyle, updateSettings, useSettings } from '../state/settings';
import { showToast } from '../state/toast';
import { S } from '../strings';

type Selection = { spans: Map<number, { start: number; end: number }>; text: string; anchor: ToolbarAnchor };

/** Character offset of (node, offset) from the start of `root`'s text. */
function textOffset(root: Element, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function anchorOf(rect: DOMRect): ToolbarAnchor {
  return { top: rect.top, bottom: rect.bottom, centerX: rect.left + rect.width / 2 };
}

/** Maps the current DOM selection onto verse-local character spans. */
function readSelection(container: HTMLElement): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const spans = new Map<number, { start: number; end: number }>();
  const parts: string[] = [];
  container.querySelectorAll<HTMLElement>('[data-verse-id]').forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const length = el.textContent?.length ?? 0;
    const start = el.contains(range.startContainer) ? textOffset(el, range.startContainer, range.startOffset) : 0;
    const end = el.contains(range.endContainer) ? textOffset(el, range.endContainer, range.endOffset) : length;
    if (end > start) {
      spans.set(Number(el.dataset.verseId), { start, end });
      parts.push((el.textContent ?? '').slice(start, end));
    }
  });
  if (spans.size === 0) return null;
  return { spans, text: parts.join('\n').trim(), anchor: anchorOf(range.getBoundingClientRect()) };
}

export default function PoemPage() {
  const params = useParams();
  const poemId = Number(params.poemId);
  const [searchParams] = useSearchParams();
  const focusVerseId = Number(searchParams.get('verse')) || null;
  const navigate = useNavigate();
  const settings = useSettings();
  const audio = useAudio();

  const meta = useDbQuery(
    async () => ({ path: await getPoemPath(poemId), neighbors: await getPoemNeighbors(poemId), bookmarked: await isBookmarked(poemId) }),
    [poemId],
  );
  const versesQuery = useDbQuery(() => getPoemVersesWithHighlights(poemId), [poemId]);
  const verses = useMemo(() => versesQuery.data ?? [], [versesQuery.data]);
  const path = meta.data?.path;
  useTitle(path?.poem.title ?? '');

  const [showHighlights, setShowHighlights] = useState(true);
  const [showNumbers, setShowNumbers] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<'none' | 'recite' | 'more' | 'notes' | 'meaning'>('none');
  const [bookmarkLabelsFor, setBookmarkLabelsFor] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ highlights: Highlight[]; anchor: ToolbarAnchor } | null>(null);
  const [highlightLabelsFor, setHighlightLabelsFor] = useState<number[] | null>(null);
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  const versesRef = useRef<HTMLDivElement>(null);
  // Also kept as state: the verses only mount after loading, and the touch selection hook must see that happen.
  const [versesEl, setVersesEl] = useState<HTMLDivElement | null>(null);
  const attachVerses = useCallback((el: HTMLDivElement | null) => {
    versesRef.current = el;
    setVersesEl(el);
  }, []);

  // Text selection → highlight / copy / meaning toolbar. Touch screens use our own selection (see TouchSelection).
  const onTouchSelection = useCallback((next: Selection | null) => {
    setSelection(next);
    if (next) setActiveGroup(null);
  }, []);
  const touchSelection = useTouchSelection(versesEl, {
    enabled: touchSelectionSupported && !selectMode,
    onChange: onTouchSelection,
  });

  useEffect(() => {
    void recordVisit(poemId);
    setSelectMode(false);
    setSelectedVerses(new Set());
    setSelection(null);
    touchSelection.clear();
    setActiveGroup(null);
    window.scrollTo({ top: 0 });
  }, [poemId]);

  // Jump to a verse coming from search / highlights.
  useEffect(() => {
    if (!focusVerseId || verses.length === 0) return;
    const el = versesRef.current?.querySelector(`[data-verse-row="${focusVerseId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashVerse(focusVerseId);
    const t = setTimeout(() => setFlashVerse(null), 2000);
    return () => clearTimeout(t);
  }, [focusVerseId, verses.length]);

  // Follow the recitation.
  const recitingThisPoem = audio.nowPlaying?.recitation.poemId === poemId;
  const recitedIndex = recitingThisPoem ? audio.recitedVerseIndex : null;
  useEffect(() => {
    if (recitedIndex == null) return;
    versesRef.current
      ?.querySelector(`[data-verse-index="${recitedIndex}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [recitedIndex]);

  // Elsewhere (mouse / trackpad) the browser selection is used, read on selectionchange.
  useEffect(() => {
    if (touchSelectionSupported) return;
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!versesRef.current || selectMode) return;
        const next = readSelection(versesRef.current);
        setSelection(next);
        if (next) setActiveGroup(null);
      }, 200);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [selectMode]);

  const { clear: clearTouchSelection } = touchSelection;
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    clearTouchSelection();
    setSelection(null);
  }, [clearTouchSelection]);

  const allHighlights = useMemo(() => verses.flatMap((v) => v.highlights), [verses]);

  const onVersesClick = (e: MouseEvent) => {
    if (selectMode) return;
    const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-group]');
    if (!mark || selection || !window.getSelection()?.isCollapsed) return;
    const group = allHighlights.filter((h) => h.groupId === mark.dataset.group).sort((a, b) => a.verseId - b.verseId);
    setActiveGroup({ highlights: group, anchor: anchorOf(mark.getBoundingClientRect()) });
  };

  if ((meta.loading && !meta.data) || (versesQuery.loading && !versesQuery.data)) return <Spinner />;
  if (!path) return <EmptyState title={S.poemNotAvailable} />;

  const { neighbors, bookmarked } = meta.data!;
  const goTo = (id: number | null) => id != null && navigate(`/poem/${path.poet.id}/${id}`, { replace: true });
  const poemText = (list: VerseWithHighlights[]) => list.map((v) => v.verse.text).join('\n');

  const toggleBookmark = async () => {
    if (bookmarked) {
      await removeBookmark(poemId);
      showToast(S.unbookmarkSuccess, 'success');
    } else {
      setBookmarkLabelsFor(await addBookmark(poemId));
    }
  };

  const highlightSelection = async () => {
    if (!selection) return;
    const inserted = await addHighlights(selection.spans, DEFAULT_HIGHLIGHT_COLOR);
    const anchor = selection.anchor;
    clearSelection();
    setActiveGroup({ highlights: inserted, anchor });
  };

  const selectedList = verses.filter((v) => selectedVerses.has(v.verse.id));
  const categoryIds = path.categories.map((c) => c.id).join(',');

  return (
    <div className="page poem-page">
      <section className="poem-header">
        <PoetAvatar name={path.poet.name} imageUrl={path.poet.imageUrl} size={72} />
        <Link className="poem-path" to={`/poet/${path.poet.id}/${categoryIds}`}>
          {pathText(path, false)}
        </Link>
        <div className="poem-title-row">
          <IconButton icon={mdiChevronRight} label={S.previous} disabled={neighbors.prev == null} onClick={() => goTo(neighbors.prev)} />
          <h2>{path.poem.title}</h2>
          <IconButton icon={mdiChevronLeft} label={S.next} disabled={neighbors.next == null} onClick={() => goTo(neighbors.next)} />
        </div>
        <div className="poem-actions">
          <IconButton icon={mdiVolumeHigh} label={S.recite} active={recitingThisPoem} onClick={() => setSheet('recite')} />
          <IconButton
            icon={bookmarked ? mdiBookmark : mdiBookmarkOutline}
            label={bookmarked ? S.bookmarked : S.unbookmarked}
            active={bookmarked}
            onClick={() => void toggleBookmark()}
          />
          <IconButton icon={mdiNoteEditOutline} label={S.comment} onClick={() => setSheet('notes')} />
          <IconButton icon={mdiDotsVertical} label={S.options} onClick={() => setSheet('more')} />
        </div>
      </section>

      {settings.showHighlightHint && (
        <div className="hint-banner">
          <span>{S.highlightHint}</span>
          <IconButton icon={mdiClose} label={S.close} onClick={() => updateSettings({ showHighlightHint: false })} />
        </div>
      )}

      <div
        ref={attachVerses}
        className={`verses ${selectMode ? 'select-mode' : ''} ${showNumbers ? 'numbered' : ''} ${touchSelectionSupported ? 'touch-select' : ''}`}
        style={poemFontStyle(settings)}
        onClick={onVersesClick}
      >
        {verses.map((vw, index) => {
          const { verse } = vw;
          const selected = selectedVerses.has(verse.id);
          const classes = [
            'verse',
            `pos-${verse.position}`,
            flashVerse === verse.id ? 'flash' : '',
            recitedIndex === index ? 'recited' : '',
            selected ? 'selected' : '',
          ].join(' ');
          return (
            <div
              key={verse.id}
              className={classes}
              data-verse-row={verse.id}
              data-verse-index={index}
              onClick={
                selectMode
                  ? () =>
                      setSelectedVerses((prev) => {
                        const next = new Set(prev);
                        if (next.has(verse.id)) next.delete(verse.id);
                        else next.add(verse.id);
                        return next;
                      })
                  : undefined
              }
            >
              {selectMode && <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-label={verse.text} />}
              {showNumbers && (
                <span className="verse-number" aria-hidden="true">
                  {index % 2 === 0 ? toPersianNumber(index / 2 + 1) : ''}
                </span>
              )}
              <p className="verse-text" data-verse-id={verse.id}>
                {highlightSegments(verse.text, showHighlights ? vw.highlights : []).map((seg) =>
                  seg.highlight ? (
                    <mark key={seg.start} data-group={seg.highlight.groupId} style={{ background: seg.highlight.color }}>
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={seg.start}>{seg.text}</span>
                  ),
                )}
              </p>
            </div>
          );
        })}
        {touchSelection.layer}
      </div>

      {selection && !selectMode && (
        <SelectionToolbar
          anchor={selection.anchor}
          onHighlight={() => void highlightSelection()}
          onCopy={() => {
            void copyText(selection.text);
            clearSelection();
          }}
          onMeaning={() => setSheet('meaning')}
        />
      )}
      {activeGroup && !selection && (
        <HighlightToolbar
          anchor={activeGroup.anchor}
          highlights={activeGroup.highlights}
          onClose={() => setActiveGroup(null)}
          onColorChanged={(color) => setActiveGroup({ ...activeGroup, highlights: activeGroup.highlights.map((h) => ({ ...h, color })) })}
          onCategory={() => {
            setHighlightLabelsFor(activeGroup.highlights.map((h) => h.id));
            setActiveGroup(null);
          }}
        />
      )}

      {selectMode && (
        <div className="selection-bar">
          <span>{toPersianNumber(selectedVerses.size)} مصرع</span>
          <IconButton icon={mdiContentCopy} label={S.copy} disabled={selectedVerses.size === 0} onClick={() => void copyText(poemText(selectedList))} />
          <IconButton
            icon={mdiShareVariantOutline}
            label={S.share}
            disabled={selectedVerses.size === 0}
            onClick={() => void shareText(`${poemText(selectedList)}\n\n${pathText(path)}`)}
          />
          <IconButton
            icon={mdiClose}
            label={S.cancel}
            onClick={() => {
              setSelectMode(false);
              setSelectedVerses(new Set());
            }}
          />
        </div>
      )}

      <Sheet open={sheet === 'more'} onClose={() => setSheet('none')}>
        <nav className="menu">
          <MenuItem
            icon={showHighlights ? mdiEyeOff : mdiEye}
            label={showHighlights ? S.dontShowHighlight : S.showHighlight}
            onClick={() => {
              setShowHighlights(!showHighlights);
              setSheet('none');
            }}
          />
          <MenuItem
            icon={mdiFormatListNumbered}
            label={showNumbers ? S.removeVerseNumber : S.verseNumber}
            onClick={() => {
              setShowNumbers(!showNumbers);
              setSheet('none');
            }}
          />
          <MenuItem
            icon={mdiCheckboxMarkedOutline}
            label={S.selectVerses}
            onClick={() => {
              clearSelection();
              setSelectMode(true);
              setSheet('none');
            }}
          />
          <MenuItem
            icon={mdiShareVariantOutline}
            label={S.share}
            onClick={() => {
              setSheet('none');
              void shareText(`${poemText(verses)}\n\n${pathText(path)}`, path.poem.title);
            }}
          />
        </nav>
      </Sheet>

      <RecitationsSheet open={sheet === 'recite'} path={path} onClose={() => setSheet('none')} />
      <NotesSheet open={sheet === 'notes'} poemId={poemId} onClose={() => setSheet('none')} />
      <MeaningSheet
        open={sheet === 'meaning'}
        word={selection?.text ?? ''}
        onClose={() => {
          setSheet('none');
          clearSelection();
        }}
      />
      <LabelPickerSheet
        open={bookmarkLabelsFor != null}
        type="bookmark"
        mode="add"
        title={S.saveMomentTitle}
        targetIds={bookmarkLabelsFor != null ? [bookmarkLabelsFor] : []}
        onClose={() => setBookmarkLabelsFor(null)}
      />
      <LabelPickerSheet
        open={highlightLabelsFor != null}
        type="highlight"
        mode="add"
        title={S.saveMomentTitle}
        targetIds={highlightLabelsFor ?? []}
        onClose={() => setHighlightLabelsFor(null)}
      />
    </div>
  );
}
