import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ToolbarAnchor } from './Toolbars';

/**
 * Text selection for touch screens, drawn by the app instead of the browser.
 *
 * Native selection on mobile brings its own action menu (Copy / Translate / …) that covers our toolbar, and on
 * Android Chrome a "Touch to Search" bar at the bottom. Neither can be turned off from a page, so on touch devices
 * the verses are made unselectable and this hook implements long-press-to-select with draggable handles, painting
 * the selection through the CSS Custom Highlight API.
 */

export type TouchSelection = { spans: Map<number, { start: number; end: number }>; text: string; anchor: ToolbarAnchor };

/** A character boundary: `offset` within the text of the `verse`-th verse element. */
interface TextPoint {
  verse: number;
  offset: number;
}

const HIGHLIGHT_NAME = 'poem-selection';
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const EDGE_SCROLL_ZONE = 72;

export const touchSelectionSupported =
  typeof window !== 'undefined' &&
  typeof Highlight !== 'undefined' &&
  'highlights' in CSS &&
  window.matchMedia('(pointer: coarse)').matches;

function verseElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-verse-id]'));
}

function isRtl(el: Element): boolean {
  return getComputedStyle(el).direction === 'rtl';
}

/** Range over characters [start, end) of `el`'s text, which may span several text nodes. */
function rangeOf(el: HTMLElement, start: number, end: number): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startSet = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!startSet && start <= pos + length) {
      range.setStart(node, start - pos);
      startSet = true;
    }
    if (startSet && end <= pos + length) {
      range.setEnd(node, end - pos);
      break;
    }
    pos += length;
  }
  return range;
}

/** Rendered box of one character, or null for zero-width ones (e.g. diacritics). */
function charRect(el: HTMLElement, index: number): DOMRect | null {
  const rects = rangeOf(el, index, index + 1).getClientRects();
  for (const rect of rects) if (rect.width > 0 && rect.height > 0) return rect;
  return null;
}

/** Index of the character in `el` closest to (x, y), preferring characters on the line under y. */
function charAt(el: HTMLElement, x: number, y: number): { index: number; rect: DOMRect } | null {
  const length = el.textContent?.length ?? 0;
  let best: { index: number; rect: DOMRect; score: number } | null = null;
  for (let i = 0; i < length; i++) {
    const rect = charRect(el, i);
    if (!rect) continue;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    // Vertical distance dominates so we never jump to another line just because it's horizontally closer.
    const score = dy * 10_000 + dx;
    if (!best || score < best.score) best = { index: i, rect, score };
  }
  return best;
}

/** The verse element nearest to y. */
function verseAt(container: HTMLElement, y: number): { verse: number; el: HTMLElement } | null {
  let best: { verse: number; el: HTMLElement; distance: number } | null = null;
  verseElements(container).forEach((el, verse) => {
    const rect = el.getBoundingClientRect();
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (!best || distance < best.distance) best = { verse, el, distance };
  });
  return best;
}

/** Character boundary nearest to (x, y) — used while dragging a handle. */
function boundaryAt(container: HTMLElement, x: number, y: number): TextPoint | null {
  const hit = verseAt(container, y);
  if (!hit) return null;
  const char = charAt(hit.el, x, y);
  if (!char) return null;
  const mid = char.rect.left + char.rect.width / 2;
  const before = isRtl(hit.el) ? x > mid : x < mid;
  return { verse: hit.verse, offset: before ? char.index : char.index + 1 };
}

/** The word under (x, y), as a pair of boundaries. */
function wordAt(el: HTMLElement, verse: number, x: number, y: number): [TextPoint, TextPoint] | null {
  const char = charAt(el, x, y);
  if (!char) return null;
  const text = el.textContent ?? '';
  const isSpace = (i: number) => /\s/.test(text[i]);
  let start = char.index;
  if (isSpace(start)) {
    if (start > 0 && !isSpace(start - 1)) start--;
    else return null;
  }
  let end = start + 1;
  while (start > 0 && !isSpace(start - 1)) start--;
  while (end < text.length && !isSpace(end)) end++;
  return [
    { verse, offset: start },
    { verse, offset: end },
  ];
}

function compare(a: TextPoint, b: TextPoint): number {
  return a.verse - b.verse || a.offset - b.offset;
}

/** Per-verse ranges covered by [start, end), in document order. */
function versesBetween(container: HTMLElement, start: TextPoint, end: TextPoint) {
  const els = verseElements(container);
  const parts: { el: HTMLElement; start: number; end: number }[] = [];
  for (let v = start.verse; v <= end.verse && v < els.length; v++) {
    const el = els[v];
    const from = v === start.verse ? start.offset : 0;
    const to = v === end.verse ? end.offset : (el.textContent?.length ?? 0);
    if (to > from) parts.push({ el, start: from, end: to });
  }
  return parts;
}

interface HandleLayout {
  x: number;
  y: number;
  side: 'left' | 'right';
}

interface Layout {
  handles: [HandleLayout, HandleLayout] | null;
  selection: TouchSelection | null;
}

function layoutOf(container: HTMLElement, a: TextPoint, b: TextPoint): Layout {
  const [start, end] = compare(a, b) <= 0 ? [a, b] : [b, a];
  const parts = versesBetween(container, start, end);
  if (parts.length === 0) return { handles: null, selection: null };

  const ranges = parts.map((p) => rangeOf(p.el, p.start, p.end));
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));

  const spans = new Map<number, { start: number; end: number }>();
  const texts: string[] = [];
  for (const p of parts) {
    spans.set(Number(p.el.dataset.verseId), { start: p.start, end: p.end });
    texts.push((p.el.textContent ?? '').slice(p.start, p.end));
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstRect = charRect(first.el, first.start) ?? first.el.getBoundingClientRect();
  const lastRect = charRect(last.el, last.end - 1) ?? last.el.getBoundingClientRect();
  const origin = container.getBoundingClientRect();
  const rtl = isRtl(first.el);
  // The selection's leading edge is on the right in RTL text; each handle hangs outward from its edge.
  const startHandle: HandleLayout = {
    x: (rtl ? firstRect.right : firstRect.left) - origin.left,
    y: firstRect.bottom - origin.top,
    side: rtl ? 'right' : 'left',
  };
  const endHandle: HandleLayout = {
    x: (rtl ? lastRect.left : lastRect.right) - origin.left,
    y: lastRect.bottom - origin.top,
    side: rtl ? 'left' : 'right',
  };
  const startIsA = compare(a, b) <= 0;

  const left = Math.min(firstRect.left, lastRect.left, ...ranges.map((r) => r.getBoundingClientRect().left));
  const right = Math.max(firstRect.right, lastRect.right, ...ranges.map((r) => r.getBoundingClientRect().right));
  return {
    handles: startIsA ? [startHandle, endHandle] : [endHandle, startHandle],
    selection: {
      spans,
      text: texts.join('\n').trim(),
      anchor: { top: firstRect.top, bottom: lastRect.bottom, centerX: (left + right) / 2 },
    },
  };
}

/**
 * Long-press a word to select it, then drag the handles to adjust. `onChange` receives the selection (or null),
 * and is called again whenever it moves on screen so the toolbar can follow.
 */
export function useTouchSelection(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, onChange }: { enabled: boolean; onChange: (selection: TouchSelection | null) => void },
): { clear: () => void; layer: ReactNode } {
  const [points, setPoints] = useState<{ a: TextPoint; b: TextPoint } | null>(null);
  const [handles, setHandles] = useState<Layout['handles']>(null);
  const [dragging, setDragging] = useState(false);
  const [relayout, setRelayout] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clear = useCallback(() => setPoints(null), []);

  // Paint the selection and report it whenever it, the layout or the verse text changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !points) {
      CSS.highlights?.delete(HIGHLIGHT_NAME);
      setHandles(null);
      onChangeRef.current(null);
      return;
    }
    const layout = layoutOf(container, points.a, points.b);
    setHandles(layout.handles);
    onChangeRef.current(dragging ? null : layout.selection);
  }, [containerRef, points, dragging, relayout]);

  useEffect(() => () => void CSS.highlights?.delete(HIGHLIGHT_NAME), []);

  // Keep things in place when the page scrolls, resizes or re-renders the verses (e.g. highlights toggled).
  useEffect(() => {
    const container = containerRef.current;
    if (!points || !container) return;
    const bump = () => setRelayout((n) => n + 1);
    window.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('resize', bump);
    const observer = new MutationObserver(bump);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      window.removeEventListener('scroll', bump);
      window.removeEventListener('resize', bump);
      observer.disconnect();
    };
  }, [containerRef, points]);

  const handlesRef = useRef(handles);
  handlesRef.current = handles;

  // Long press on a verse selects the word under the finger, any other touch clears the selection, and the handles
  // can be dragged. Touch events are used rather than pointer events because Android Chrome cancels the pointer
  // (pointercancel) when its own long-press gesture kicks in; that gesture also fires `contextmenu`, which we treat
  // as the long press itself. The timer covers browsers that don't (iOS Safari).
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let press: { x: number; y: number; el: HTMLElement } | null = null;
    let grab: { key: 'a' | 'b'; dx: number; dy: number } | null = null;
    let suppressClick = false;
    const cancelPress = () => {
      clearTimeout(timer);
      press = null;
    };

    const selectWordAt = (el: HTMLElement, x: number, y: number) => {
      cancelPress();
      const word = wordAt(el, verseElements(container).indexOf(el), x, y);
      if (!word) return;
      suppressClick = true;
      navigator.vibrate?.(10);
      setPoints({ a: word[0], b: word[1] });
    };

    const onTouchStart = (e: TouchEvent) => {
      suppressClick = false;
      cancelPress();
      const target = e.target as HTMLElement;
      const touch = e.touches[0];

      const handle = target.closest<HTMLElement>('.sel-handle');
      const layout = handlesRef.current;
      if (handle && layout && e.touches.length === 1) {
        e.preventDefault();
        const key = handle.dataset.key as 'a' | 'b';
        const h = layout[key === 'a' ? 0 : 1];
        const origin = container.getBoundingClientRect();
        // Aim at the middle of the line above the handle rather than at its bottom edge, and keep the finger's
        // offset from it so the selection doesn't jump on touch.
        const fontSize = parseFloat(getComputedStyle(container).fontSize) || 16;
        grab = { key, dx: touch.clientX - (origin.left + h.x), dy: touch.clientY - (origin.top + h.y - fontSize / 2) };
        setDragging(true);
        return;
      }

      if (target.closest('.floating-toolbar, dialog')) return;
      setPoints(null);
      if (e.touches.length !== 1) return;
      const el = target.closest<HTMLElement>('[data-verse-id]');
      if (!el || !container.contains(el)) return;
      press = { x: touch.clientX, y: touch.clientY, el };
      timer = setTimeout(() => press && selectWordAt(press.el, press.x, press.y), LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (press && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
      if (!grab) return;
      e.preventDefault();
      if (touch.clientY < EDGE_SCROLL_ZONE) window.scrollBy(0, -12);
      else if (touch.clientY > window.innerHeight - EDGE_SCROLL_ZONE) window.scrollBy(0, 12);
      const point = boundaryAt(container, touch.clientX - grab.dx, touch.clientY - grab.dy);
      if (!point) return;
      const key = grab.key;
      setPoints((prev) => {
        if (!prev) return prev;
        const other = key === 'a' ? prev.b : prev.a;
        const current = key === 'a' ? prev.a : prev.b;
        // Never collapse to an empty selection; also skip no-op updates.
        if (compare(point, other) === 0 || compare(point, current) === 0) return prev;
        return key === 'a' ? { a: point, b: prev.b } : { a: prev.a, b: point };
      });
    };

    const onTouchEnd = () => {
      cancelPress();
      if (grab) {
        grab = null;
        setDragging(false);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.sel-handle')) {
        e.preventDefault();
        return;
      }
      if (!container.contains(target)) return;
      e.preventDefault();
      const el = target.closest<HTMLElement>('[data-verse-id]');
      if (el) selectWordAt(el, press?.x ?? e.clientX, press?.y ?? e.clientY);
    };

    // A long press must not also count as a tap (which would open a highlight's toolbar).
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('scroll', cancelPress, { passive: true });
    document.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('click', onClick, true);
    return () => {
      cancelPress();
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('scroll', cancelPress);
      document.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('click', onClick, true);
    };
  }, [containerRef, enabled]);

  const layer = handles ? (
    <>
      {(['a', 'b'] as const).map((key, i) => {
        const h = handles[i];
        return (
          <div
            key={key}
            className={`sel-handle ${h.side}`}
            data-key={key}
            style={{ left: h.x, top: h.y }}
            aria-hidden="true"
          />
        );
      })}
    </>
  ) : null;

  return { clear, layer };
}
