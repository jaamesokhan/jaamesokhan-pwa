import { beforeEach, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { strToU8, zipSync } from 'fflate';
import { setDb } from '../db/client';
import { batch, extractPoetZip, importPoet, migrate, query, run } from '../db/engine';
import type { Db } from '../db/types';
import * as content from './content';
import * as user from './user';

const sqlite3 = await sqlite3InitModule();

const POET = { id: 2, name: 'حافظ', description: 'شاعر قرن هشتم', imageUrl: 'https://img.example/hafez.png' };

// Same shape as the server's poet_{id}.zip (see scripts/bash/zip_csvs.sh), including the
// extra columns the Postgres export carries.
const CATEGORIES = `id,text,parent_id,poet_id,url
24,حافظ,0,2,/hafez
25,غزلیات,24,2,/hafez/ghazal
26,قطعات,24,2,/hafez/ghete
27,رباعیات,26,2,/hafez/ghete/robaee
`;
const POEMS = `id,title,category_id,url
2130,غزل شمارهٔ ۱,25,/a
2131,غزل شمارهٔ ۲,25,/b
2132,غزل شمارهٔ ۳,25,/c
3000,قطعه ۱,26,/d
3100,رباعی ۱,27,/e
`;
const VERSES = `id,text,verse_order,position,poem_id
1,الا یا ایها الساقی ادر کاسا و ناولها,1,0,2130
2,که عشق آسان نمود اول ولی افتاد مشکل‌ها,2,1,2130
3,"صلاح کار کجا و من خراب کجا",1,0,2131
4,ببین تفاوت ره کز کجاست تا به کجا,2,1,2131
5,دل می‌رود ز دستم صاحب دلان خدا را,1,0,2132
6,قطعه اول,1,0,3000
7,رباعی اول,1,0,3100
`;

function makeZip(files: Record<string, string> = {}) {
  return zipSync({
    'category_2.csv': strToU8(files.categories ?? CATEGORIES),
    'poems_2.csv': strToU8(files.poems ?? POEMS),
    'verses_2.csv': strToU8(files.verses ?? VERSES),
  });
}

let raw: InstanceType<typeof sqlite3.oo1.DB>;

beforeEach(() => {
  raw = new sqlite3.oo1.DB(':memory:', 'c');
  migrate(raw);
  const db: Db = {
    query: async (sql, params) => query(raw, sql, params) as never,
    run: async (sql, params) => run(raw, sql, params),
    batch: async (statements) => batch(raw, statements),
  };
  setDb(db);
  importPoet(raw, POET, extractPoetZip(makeZip()));
});

describe('poet import', () => {
  it('imports poet, categories, poems and verses', async () => {
    expect(await content.listDownloadedPoets()).toEqual([POET]);
    expect(await content.getRootCategoryId(2)).toBe(24);
    const counts = query(raw, 'SELECT (SELECT COUNT(*) FROM poems) AS p, (SELECT COUNT(*) FROM verses) AS v')[0];
    expect(counts).toEqual({ p: 5, v: 7 });
  });

  it('rolls back everything when the archive is inconsistent', () => {
    const broken = makeZip({ poems: 'id,title,category_id\n9999,x,424242\n' });
    expect(() => importPoet(raw, { ...POET, id: 3 }, extractPoetZip(broken))).toThrow();
    expect(query(raw, 'SELECT id FROM poets')).toEqual([{ id: 2 }]);
  });

  it('rejects an archive with missing files', () => {
    const zip = zipSync({ 'category_2.csv': strToU8(CATEGORIES) });
    expect(() => extractPoetZip(zip)).toThrow(/poems_/);
  });
});

describe('content queries', () => {
  it('counts poems through the whole subtree', async () => {
    const subs = await content.getSubcategoriesWithPoemCount(2, 24);
    expect(subs.map((c) => [c.text, c.poemCount])).toEqual([
      ['غزلیات', 3],
      ['قطعات', 2],
    ]);
  });

  it('pages poems with their first verse', async () => {
    const page = await content.getPoemsInCategory(25, 2, 1);
    expect(page.map((p) => [p.poem.id, p.firstVerse?.text])).toEqual([
      [2131, 'صلاح کار کجا و من خراب کجا'],
      [2132, 'دل می‌رود ز دستم صاحب دلان خدا را'],
    ]);
  });

  it('builds the category path root first', async () => {
    const path = await content.getPoemPath(3100);
    expect(path?.poet.name).toBe('حافظ');
    expect(path?.categories.map((c) => c.id)).toEqual([24, 26, 27]);
  });

  it('finds neighbours within the category', async () => {
    expect(await content.getPoemNeighbors(2130)).toEqual({ prev: null, next: 2131 });
    expect(await content.getPoemNeighbors(2131)).toEqual({ prev: 2130, next: 2132 });
  });

  it('searches normalized text by word prefix', async () => {
    // Arabic yeh/kaf and a partial word must still match.
    const results = await content.searchVerses('صلاح كار', []);
    expect(results.map((r) => r.verse.id)).toEqual([3]);
    expect(results[0].categories.map((c) => c.id)).toEqual([24, 25]);
    expect(await content.searchVerses('مشک', [2])).toHaveLength(1);
    expect(await content.searchVerses('مشک', [99])).toHaveLength(0);
    expect(await content.searchVerses('  ', [])).toEqual([]);
  });

  it('picks random poems only from selected categories', async () => {
    await content.setCategoriesRandomSelected([
      { id: 24, selected: false },
      { id: 25, selected: false },
      { id: 26, selected: false },
    ]);
    for (let i = 0; i < 10; i++) expect(await content.getRandomPoemId()).toBe(3100);
    const inGhazals = await content.getRandomPoemId(25);
    expect([2130, 2131, 2132]).toContain(inGhazals);
  });
});

describe('user data', () => {
  it('bookmarks and labels', async () => {
    const id = await user.addBookmark(2131);
    expect(await user.addBookmark(2131)).toBe(id);
    expect(await user.isBookmarked(2131)).toBe(true);
    const label = await user.createLabel('شب', '#bad982', 'bookmark');
    await user.addItemLabels('bookmark', [id], [label.id]);
    const [item] = await user.listBookmarks();
    expect(item.context.firstVerse?.id).toBe(3);
    expect(item.labels.map((l) => l.name)).toEqual(['شب']);
    expect((await user.listLabelsWithCount('bookmark'))[0].itemCount).toBe(1);
    await user.setItemLabels('bookmark', [id], []);
    expect((await user.listBookmarks())[0].labels).toEqual([]);
    await user.removeBookmark(2131);
    expect(await user.isBookmarked(2131)).toBe(false);
  });

  it('groups multi-verse highlights and counts labels per group', async () => {
    const rows = await user.addHighlights(
      new Map([
        [2, { start: 0, end: 5 }],
        [1, { start: 3, end: 10 }],
      ]),
      '#8FBF6B',
    );
    expect(rows.map((r) => r.verseId)).toEqual([1, 2]);
    await user.addHighlights(new Map([[3, { start: 0, end: 4 }]]), '#E8D06A');
    const label = await user.createLabel('عشق', '#cc3d3d', 'highlight');
    await user.addItemLabels('highlight', rows.map((r) => r.id), [label.id]);

    const groups = await user.listHighlightGroups();
    expect(groups.map((g) => g.verses.map((v) => v.id))).toEqual([[1, 2], [3]]);
    expect(groups[0].labels.map((l) => l.name)).toEqual(['عشق']);
    expect((await user.listLabelsWithCount('highlight'))[0].itemCount).toBe(1);

    await user.setHighlightsColor(rows.map((r) => r.id), '#7FA8D9');
    const verses = await content.getPoemVersesWithHighlights(2130);
    expect(verses.flatMap((v) => v.highlights.map((h) => h.color))).toEqual(['#7FA8D9', '#7FA8D9']);
  });

  it('keeps history de-duplicated for consecutive visits', async () => {
    await user.recordVisit(2130);
    await user.recordVisit(2130);
    await user.recordVisit(2131);
    const history = await user.listHistory();
    expect(history.map((h) => h.context.poem.id)).toEqual([2131, 2130]);
    await user.clearHistory();
    expect(await user.listHistory()).toEqual([]);
  });

  it('stores search history uniquely', async () => {
    await user.saveSearchQuery('عشق');
    await user.saveSearchQuery('عشق');
    expect((await user.listSearchHistory()).map((r) => r.query)).toEqual(['عشق']);
  });

  it('deleting a poet removes its content and user data', async () => {
    await user.addBookmark(2130);
    await user.addComment(2130, 'یادداشت');
    await user.addHighlights(new Map([[1, { start: 0, end: 3 }]]), '#8FBF6B');
    await content.deletePoet(2);
    const left = query(
      raw,
      `SELECT (SELECT COUNT(*) FROM verses) + (SELECT COUNT(*) FROM bookmarks) + (SELECT COUNT(*) FROM comments)
       + (SELECT COUNT(*) FROM highlights) + (SELECT COUNT(*) FROM verses_fts WHERE verses_fts MATCH '"الا"*') AS n`,
    );
    expect(left).toEqual([{ n: 0 }]);
  });
});
