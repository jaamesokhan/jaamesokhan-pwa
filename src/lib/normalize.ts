// Port of the Android client's String.normalizedForSearch() (utility/StringUtils.kt).
// Used both when indexing verses and when building search queries, so the two always agree.

const arabicDiacritics = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const punctuation = /[!«»",،.(){}[\]\-_*%؛؟٬٫:“”‘’/|\\…]/g;
const invisibleMarks = /[‎‏﻿‪-‮]/g;

const charMap: Record<string, string> = {
  'ي': 'ی',
  'ى': 'ی',
  'ئ': 'ی',
  'ك': 'ک',
  'ة': 'ه',
  'ۀ': 'ه',
  'ؤ': 'و',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'آ': 'ا',
  'ء': '', // hamza
  'ـ': '', // tatweel
};
const charMapRegex = new RegExp(`[${Object.keys(charMap).join('')}]`, 'g');

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(arabicDiacritics, '')
    .replace(charMapRegex, (c) => charMap[c])
    .replace(punctuation, '')
    .replace(invisibleMarks, '')
    .replace(/‌/g, ' ') // ZWNJ
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds an FTS5 MATCH expression: every word becomes a quoted prefix token, ANDed together
 * (same semantics as the Android client's VerseRepository.buildFtsMatchQuery).
 */
export function buildFtsMatchQuery(query: string): string {
  return normalizeForSearch(query)
    .split(' ')
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '')}"*`)
    .join(' ');
}
