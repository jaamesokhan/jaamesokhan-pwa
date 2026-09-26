// Read-mostly queries over downloaded poets. Ports of the Android DAOs
// (PoetDao, CategoryDao, PoemDao, VerseDao).
import { getDb } from '../db/client';
import { buildFtsMatchQuery } from '../lib/normalize';
import type {
  Category,
  CategoryWithPoemCount,
  Highlight,
  Poem,
  PoemPath,
  PoemWithFirstVerse,
  Poet,
  Verse,
  VerseWithHighlights,
} from './types';

const POET_COLUMNS = 'pt.id AS id, pt.name AS name, pt.description AS description, pt.image_url AS imageUrl';
const CATEGORY_COLUMNS =
  'c.id AS id, c.text AS text, c.parent_id AS parentId, c.poet_id AS poetId, c.random_selected AS randomSelected';
const VERSE_COLUMNS =
  'v.id AS id, v.text AS text, v.verse_order AS verseOrder, v.position AS position, v.poem_id AS poemId';

type CategoryRow = Omit<Category, 'randomSelected'> & { randomSelected: number };
const toCategory = (r: CategoryRow): Category => ({ ...r, randomSelected: r.randomSelected !== 0 });

export async function listDownloadedPoets(): Promise<Poet[]> {
  return getDb().query<Poet>(`SELECT ${POET_COLUMNS} FROM poets pt ORDER BY pt.rowid`);
}

export async function getPoet(poetId: number): Promise<Poet | null> {
  const rows = await getDb().query<Poet>(`SELECT ${POET_COLUMNS} FROM poets pt WHERE pt.id = ?`, [poetId]);
  return rows[0] ?? null;
}

export async function countDownloadedPoets(): Promise<number> {
  const rows = await getDb().query<{ n: number }>('SELECT COUNT(*) AS n FROM poets');
  return rows[0]?.n ?? 0;
}

export async function deletePoet(poetId: number): Promise<void> {
  // Cascades to categories, poems, verses and every bookmark/highlight/note on them,
  // same as the Android client.
  await getDb().run('DELETE FROM poets WHERE id = ?', [poetId]);
}

export async function getRootCategoryId(poetId: number): Promise<number | null> {
  const rows = await getDb().query<{ id: number }>(
    'SELECT id FROM categories WHERE poet_id = ? AND parent_id = 0 ORDER BY id LIMIT 1',
    [poetId],
  );
  return rows[0]?.id ?? null;
}

export async function getCategory(categoryId: number): Promise<Category | null> {
  const rows = await getDb().query<CategoryRow>(`SELECT ${CATEGORY_COLUMNS} FROM categories c WHERE c.id = ?`, [
    categoryId,
  ]);
  return rows[0] ? toCategory(rows[0]) : null;
}

export async function getSubcategoriesWithPoemCount(poetId: number, parentId: number): Promise<CategoryWithPoemCount[]> {
  const rows = await getDb().query<CategoryRow & { poemCount: number }>(
    `SELECT ${CATEGORY_COLUMNS},
       (SELECT COUNT(*) FROM poems p WHERE p.category_id IN (
          WITH RECURSIVE sub_tree(id) AS (
            SELECT c.id
            UNION ALL
            SELECT sc.id FROM categories sc JOIN sub_tree st ON sc.parent_id = st.id
          ) SELECT id FROM sub_tree)
       ) AS poemCount
     FROM categories c
     WHERE c.poet_id = ? AND c.parent_id = ?
     ORDER BY c.id`,
    [poetId, parentId],
  );
  return rows.map((r) => ({ ...toCategory(r), poemCount: r.poemCount }));
}

export async function getPoemsInCategory(categoryId: number, limit: number, offset: number): Promise<PoemWithFirstVerse[]> {
  const rows = await getDb().query<{
    id: number;
    title: string;
    categoryId: number;
    verseId: number | null;
    verseText: string | null;
    verseOrder: number | null;
    position: number | null;
  }>(
    `SELECT p.id AS id, p.title AS title, p.category_id AS categoryId,
            v.id AS verseId, v.text AS verseText, v.verse_order AS verseOrder, v.position AS position
     FROM poems p
     LEFT JOIN verses v ON v.poem_id = p.id AND v.verse_order = 1
     WHERE p.category_id = ?
     ORDER BY p.id
     LIMIT ? OFFSET ?`,
    [categoryId, limit, offset],
  );
  return rows.map((r) => ({
    poem: { id: r.id, title: r.title, categoryId: r.categoryId },
    firstVerse:
      r.verseId == null
        ? null
        : { id: r.verseId, text: r.verseText ?? '', verseOrder: r.verseOrder ?? 1, position: r.position ?? 0, poemId: r.id },
  }));
}

/** The category and all its ancestors, root first. */
export async function getCategoryPath(categoryId: number): Promise<Category[]> {
  const rows = await getDb().query<CategoryRow & { depth: number }>(
    `WITH RECURSIVE category_tree(id, depth) AS (
       SELECT id, 0 FROM categories WHERE id = ?
       UNION ALL
       SELECT c.parent_id, ct.depth + 1 FROM categories c JOIN category_tree ct ON c.id = ct.id WHERE c.parent_id != 0
     )
     SELECT ${CATEGORY_COLUMNS}, ct.depth AS depth
     FROM category_tree ct JOIN categories c ON c.id = ct.id
     ORDER BY ct.depth DESC`,
    [categoryId],
  );
  return rows.map(({ depth: _depth, ...r }) => toCategory(r));
}

export async function getPoem(poemId: number): Promise<Poem | null> {
  const rows = await getDb().query<Poem>(
    'SELECT id, title, category_id AS categoryId FROM poems WHERE id = ?',
    [poemId],
  );
  return rows[0] ?? null;
}

export async function getPoemPath(poemId: number): Promise<PoemPath | null> {
  const rows = await getDb().query<Poem & Poet & { poemId: number; poetId: number; poetName: string }>(
    `SELECT p.id AS poemId, p.title AS title, p.category_id AS categoryId,
            pt.id AS poetId, pt.name AS poetName, pt.description AS description, pt.image_url AS imageUrl
     FROM poems p
     JOIN categories c ON c.id = p.category_id
     JOIN poets pt ON pt.id = c.poet_id
     WHERE p.id = ?`,
    [poemId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    poem: { id: r.poemId, title: r.title, categoryId: r.categoryId },
    poet: { id: r.poetId, name: r.poetName, description: r.description, imageUrl: r.imageUrl },
    categories: await getCategoryPath(r.categoryId),
  };
}

/** Previous/next poem ids within the same category (null at either end). */
export async function getPoemNeighbors(poemId: number): Promise<{ prev: number | null; next: number | null }> {
  const rows = await getDb().query<{ prev: number | null; next: number | null }>(
    `SELECT
       (SELECT MAX(id) FROM poems WHERE category_id = p.category_id AND id < p.id) AS prev,
       (SELECT MIN(id) FROM poems WHERE category_id = p.category_id AND id > p.id) AS next
     FROM poems p WHERE p.id = ?`,
    [poemId],
  );
  return rows[0] ?? { prev: null, next: null };
}

export async function getPoemVerses(poemId: number): Promise<Verse[]> {
  return getDb().query<Verse>(
    `SELECT ${VERSE_COLUMNS} FROM verses v WHERE v.poem_id = ? ORDER BY v.verse_order`,
    [poemId],
  );
}

export async function getPoemVersesWithHighlights(poemId: number): Promise<VerseWithHighlights[]> {
  const [verses, highlights] = await Promise.all([
    getPoemVerses(poemId),
    getDb().query<Highlight>(
      `SELECT h.id AS id, h.verse_id AS verseId, h.start_index AS startIndex, h.end_index AS endIndex,
              h.created_at AS createdAt, h.color AS color, h.group_id AS groupId
       FROM highlights h JOIN verses v ON v.id = h.verse_id
       WHERE v.poem_id = ?
       ORDER BY h.created_at`,
      [poemId],
    ),
  ]);
  const byVerse = new Map<number, Highlight[]>();
  for (const h of highlights) {
    const list = byVerse.get(h.verseId) ?? [];
    list.push(h);
    byVerse.set(h.verseId, list);
  }
  return verses.map((verse) => ({ verse, highlights: byVerse.get(verse.id) ?? [] }));
}

export async function getFirstVerses(poemId: number, count: number): Promise<Verse[]> {
  return getDb().query<Verse>(
    `SELECT ${VERSE_COLUMNS} FROM verses v WHERE v.poem_id = ? ORDER BY v.verse_order LIMIT ?`,
    [poemId, count],
  );
}

/** Resolves category paths for many categories at once, memoising shared ancestors. */
export async function getCategoryPaths(categoryIds: number[]): Promise<Map<number, Category[]>> {
  const result = new Map<number, Category[]>();
  for (const id of new Set(categoryIds)) {
    result.set(id, await getCategoryPath(id));
  }
  return result;
}

export const SEARCH_LIMIT = 300;

export interface SearchResult {
  verse: Verse;
  poem: Poem;
  poet: Poet;
  categories: Category[];
}

/** Full-text search over verses (FTS5 prefix match on every word), optionally by poet. */
export async function searchVerses(text: string, poetIds: number[]): Promise<SearchResult[]> {
  const match = buildFtsMatchQuery(text);
  if (!match) return [];
  const poetFilter = poetIds.length > 0 ? `AND c.poet_id IN (${poetIds.map(() => '?').join(',')})` : '';
  const rows = await getDb().query<{
    verseId: number;
    verseText: string;
    verseOrder: number;
    position: number;
    poemId: number;
    poemTitle: string;
    categoryId: number;
    poetId: number;
    poetName: string;
    poetDescription: string;
    poetImageUrl: string | null;
  }>(
    `SELECT v.id AS verseId, v.text AS verseText, v.verse_order AS verseOrder, v.position AS position,
            p.id AS poemId, p.title AS poemTitle, p.category_id AS categoryId,
            pt.id AS poetId, pt.name AS poetName, pt.description AS poetDescription, pt.image_url AS poetImageUrl
     FROM verses_fts f
     JOIN verses v ON v.id = f.rowid
     JOIN poems p ON p.id = v.poem_id
     JOIN categories c ON c.id = p.category_id
     JOIN poets pt ON pt.id = c.poet_id
     WHERE verses_fts MATCH ? ${poetFilter}
     ORDER BY p.id, v.verse_order
     LIMIT ${SEARCH_LIMIT}`,
    [match, ...poetIds],
  );
  const paths = await getCategoryPaths(rows.map((r) => r.categoryId));
  return rows.map((r) => ({
    verse: { id: r.verseId, text: r.verseText, verseOrder: r.verseOrder, position: r.position, poemId: r.poemId },
    poem: { id: r.poemId, title: r.poemTitle, categoryId: r.categoryId },
    poet: { id: r.poetId, name: r.poetName, description: r.poetDescription, imageUrl: r.poetImageUrl },
    categories: paths.get(r.categoryId) ?? [],
  }));
}

const RANDOM_SCOPE = `
  WITH RECURSIVE category_tree(id) AS (
    SELECT id FROM categories WHERE id = :categoryId
    UNION ALL
    SELECT c.id FROM categories c JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT %COLUMNS%
  FROM poems pm
  JOIN categories c ON c.id = pm.category_id
  WHERE (:categoryId IS NULL AND c.random_selected = 1) OR c.id IN category_tree`;

/**
 * Picks a random poem, either anywhere among categories selected for random poems, or
 * within a category subtree. Uses COUNT + OFFSET instead of ORDER BY RANDOM() (see PoemDao).
 */
export async function getRandomPoemId(categoryId: number | null = null): Promise<number | null> {
  const db = getDb();
  const bind = { ':categoryId': categoryId };
  const [{ n }] = await db.query<{ n: number }>(RANDOM_SCOPE.replace('%COLUMNS%', 'COUNT(*) AS n'), bind);
  if (!n) return null;
  const offset = Math.floor(Math.random() * n);
  const rows = await db.query<{ id: number }>(
    `${RANDOM_SCOPE.replace('%COLUMNS%', 'pm.id AS id')} ORDER BY pm.id LIMIT 1 OFFSET :offset`,
    { ...bind, ':offset': offset },
  );
  return rows[0]?.id ?? null;
}

export async function getAllCategories(): Promise<Category[]> {
  const rows = await getDb().query<CategoryRow>(`SELECT ${CATEGORY_COLUMNS} FROM categories c ORDER BY c.poet_id, c.id`);
  return rows.map(toCategory);
}

export async function setCategoriesRandomSelected(changes: { id: number; selected: boolean }[]): Promise<void> {
  if (changes.length === 0) return;
  await getDb().batch(
    changes.map((c) => ({
      sql: 'UPDATE categories SET random_selected = ? WHERE id = ?',
      params: [c.selected ? 1 : 0, c.id],
    })),
  );
}
