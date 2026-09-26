import type { Highlight } from '../data/types';

export interface Segment {
  text: string;
  start: number;
  end: number;
  /** Top-most (newest) highlight covering this piece, if any. */
  highlight: Highlight | null;
}

/**
 * Splits a verse into runs with a uniform highlight state, so overlapping highlights render
 * like the Android client's stacked AnnotatedString styles (the newest one on top).
 */
export function highlightSegments(text: string, highlights: Highlight[]): Segment[] {
  const clamp = (n: number) => Math.min(Math.max(n, 0), text.length);
  const valid = highlights
    .map((h) => ({ ...h, startIndex: clamp(h.startIndex), endIndex: clamp(h.endIndex) }))
    .filter((h) => h.endIndex > h.startIndex);
  const cuts = new Set<number>([0, text.length]);
  for (const h of valid) {
    cuts.add(h.startIndex);
    cuts.add(h.endIndex);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    let top: Highlight | null = null;
    for (const h of valid) {
      if (h.startIndex <= start && h.endIndex >= end && (!top || h.createdAt >= top.createdAt)) top = h;
    }
    const prev = segments[segments.length - 1];
    if (prev && prev.highlight?.id === top?.id) {
      prev.text += text.slice(start, end);
      prev.end = end;
    } else {
      segments.push({ text: text.slice(start, end), start, end, highlight: top });
    }
  }
  return segments.length > 0 ? segments : [{ text, start: 0, end: text.length, highlight: null }];
}
