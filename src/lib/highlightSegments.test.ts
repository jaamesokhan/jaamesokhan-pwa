import { describe, expect, it } from 'vitest';
import type { Highlight } from '../data/types';
import { highlightSegments } from './highlightSegments';

const h = (id: number, startIndex: number, endIndex: number, createdAt = id): Highlight => ({
  id, verseId: 1, startIndex, endIndex, createdAt, color: '#fff', groupId: String(id),
});

describe('highlightSegments', () => {
  it('returns the whole text when nothing is highlighted', () => {
    expect(highlightSegments('abcdef', [])).toEqual([{ text: 'abcdef', start: 0, end: 6, highlight: null }]);
  });

  it('splits around a highlight', () => {
    const segs = highlightSegments('abcdef', [h(1, 2, 4)]);
    expect(segs.map((s) => [s.text, s.highlight?.id ?? null])).toEqual([['ab', null], ['cd', 1], ['ef', null]]);
  });

  it('puts the newest highlight on top where they overlap', () => {
    const segs = highlightSegments('abcdef', [h(2, 2, 6), h(1, 0, 4)]);
    expect(segs.map((s) => [s.text, s.highlight?.id])).toEqual([['ab', 1], ['cdef', 2]]);
  });

  it('clamps out-of-range and drops empty highlights', () => {
    const segs = highlightSegments('abc', [h(1, -3, 99), h(2, 2, 2)]);
    expect(segs.map((s) => [s.text, s.highlight?.id])).toEqual([['abc', 1]]);
  });
});
