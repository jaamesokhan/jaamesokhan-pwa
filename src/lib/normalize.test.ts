import { describe, expect, it } from 'vitest';
import { buildFtsMatchQuery, normalizeForSearch } from './normalize';

describe('normalizeForSearch', () => {
  it('unifies Arabic letter variants and strips diacritics', () => {
    expect(normalizeForSearch('كِتابي')).toBe('کتابی');
    expect(normalizeForSearch('آسمان')).toBe('اسمان');
    expect(normalizeForSearch('خانۀ')).toBe('خانه');
  });

  it('removes punctuation, tatweel and hamza', () => {
    expect(normalizeForSearch('«سلام»، دوست!')).toBe('سلام دوست');
    expect(normalizeForSearch('بـــود')).toBe('بود');
    expect(normalizeForSearch('جزء')).toBe('جز');
  });

  it('turns ZWNJ into a space and collapses whitespace', () => {
    expect(normalizeForSearch('  می‌روم   به  خانه ')).toBe('می روم به خانه');
  });
});

describe('buildFtsMatchQuery', () => {
  it('turns every word into a quoted prefix token', () => {
    expect(buildFtsMatchQuery('بشنو  از نی')).toBe('"بشنو"* "از"* "نی"*');
  });

  it('returns an empty string for blank input', () => {
    expect(buildFtsMatchQuery(' ،، ')).toBe('');
  });

  it('never lets quotes break out of a token', () => {
    expect(buildFtsMatchQuery('a"b')).toBe('"ab"*');
  });
});
