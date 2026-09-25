// User data: bookmarks, highlights, notes, history, search history and labels.
// Ports of the Android BookmarkDao, HighlightDao, CommentDao, HistoryItemDao,
// SearchHistoryDao, LabelDao and the label cross-ref DAOs.
import { getDb } from '../db/client';
import { getCategoryPaths } from './content';
import type {
  Category,
  Comment,
  Highlight,
  Label,
  LabelType,
  LabelWithCount,
  Poem,
  Poet,
  SearchHistoryRecord,
  Verse,
} from './types';

const HIGHLIGHT_COLUMNS =
  'h.id AS id, h.verse_id AS verseId, h.start_index AS startIndex, h.end_index AS endIndex, h.created_at AS createdAt, h.color AS color, h.group_id AS groupId';

/** Poem + poet + first verse columns, joined from an alias `p` (poems). */
const POEM_CONTEXT_COLUMNS = `p.id AS poemId, p.title AS poemTitle, p.category_id AS categoryId,
  pt.id AS poetId, pt.name AS poetName, pt.description AS poetDescription, pt.image_url AS poetImageUrl,
  fv.id AS firstVerseId, fv.text AS firstVerseText, fv.verse_order AS firstVerseOrder, fv.position AS firstVersePosition`;
const POEM_CONTEXT_JOINS = `JOIN categories c ON c.id = p.category_id
  JOIN poets pt ON pt.id = c.poet_id
  LEFT JOIN verses fv ON fv.poem_id = p.id AND fv.verse_order = 1`;

interface PoemContextRow {
  poemId: number;
  poemTitle: string;
  categoryId: number;
  poetId: number;
  poetName: string;
  poetDescription: string;
  poetImageUrl: string | null;
  firstVerseId: number | null;
  firstVerseText: string | null;
  firstVerseOrder: number | null;
  firstVersePosition: number | null;
}

export interface PoemContext {
  poem: Poem;
  poet: Poet;
  categories: Category[];
  firstVerse: Verse | null;
}

async function toPoemContexts<T extends PoemContextRow>(rows: T[]): Promise<(T & { context: PoemContext })[]> {
  const paths = await getCategoryPaths(rows.map((r) => r.categoryId));
  return rows.map((r) => ({
    ...r,
    context: {
      poem: { id: r.poemId, title: r.poemTitle, categoryId: r.categoryId },
      poet: { id: r.poetId, name: r.poetName, description: r.poetDescription, imageUrl: r.poetImageUrl },
      categories: paths.get(r.categoryId) ?? [],
      firstVerse:
        r.firstVerseId == null
          ? null
          : {
              id: r.firstVerseId,
              text: r.firstVerseText ?? '',
              verseOrder: r.firstVerseOrder ?? 1,
              position: r.firstVersePosition ?? 0,
              poemId: r.poemId,
            },
    },
  }));
}

export function pathText(context: Pick<PoemContext, 'categories' | 'poem'>, includePoemTitle = true): string {
  const categories = context.categories.map((c) => c.text).join(' > ');
  return includePoemTitle ? `${categories} > ${context.poem.title}` : categories;
}

// ---------------------------------------------------------------- bookmarks

export async function isBookmarked(poemId: number): Promise<boolean> {
  const rows = await getDb().query<{ n: number }>('SELECT COUNT(*) AS n FROM bookmarks WHERE poem_id = ?', [poemId]);
  return (rows[0]?.n ?? 0) > 0;
}

/** Returns the new bookmark id. */
export async function addBookmark(poemId: number): Promise<number> {
  await getDb().run('INSERT OR IGNORE INTO bookmarks (poem_id, created_at) VALUES (?, ?)', [poemId, Date.now()]);
  const rows = await getDb().query<{ id: number }>('SELECT id FROM bookmarks WHERE poem_id = ?', [poemId]);
  return rows[0].id;
}

export async function removeBookmark(poemId: number): Promise<void> {
  await getDb().run('DELETE FROM bookmarks WHERE poem_id = ?', [poemId]);
}

export interface BookmarkItem {
  id: number;
  createdAt: number;
  context: PoemContext;
  labels: Label[];
}

export async function listBookmarks(): Promise<BookmarkItem[]> {
  const rows = await getDb().query<PoemContextRow & { id: number; createdAt: number }>(
    `SELECT b.id AS id, b.created_at AS createdAt, ${POEM_CONTEXT_COLUMNS}
     FROM bookmarks b JOIN poems p ON p.id = b.poem_id ${POEM_CONTEXT_JOINS}
     ORDER BY b.created_at`,
  );
  const labels = await labelsByItem('bookmark');
  return (await toPoemContexts(rows)).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    context: r.context,
    labels: labels.get(r.id) ?? [],
  }));
}

// ---------------------------------------------------------------- highlights

/** Inserts one row per verse of a (possibly multi-verse) selection, all sharing a group id. */
export async function addHighlights(
  selection: Map<number, { start: number; end: number }>,
  color: string,
): Promise<Highlight[]> {
  const groupId = crypto.randomUUID();
  const createdAt = Date.now();
  const entries = [...selection.entries()].sort(([a], [b]) => a - b);
  const results = await getDb().batch(
    entries.map(([verseId, span]) => ({
      sql: 'INSERT INTO highlights (verse_id, start_index, end_index, created_at, color, group_id) VALUES (?, ?, ?, ?, ?, ?)',
      params: [verseId, span.start, span.end, createdAt, color, groupId],
    })),
  );
  return entries.map(([verseId, span], i) => ({
    id: results[i].lastInsertRowid,
    verseId,
    startIndex: span.start,
    endIndex: span.end,
    createdAt,
    color,
    groupId,
  }));
}

export async function setHighlightsColor(ids: number[], color: string): Promise<void> {
  await getDb().batch(ids.map((id) => ({ sql: 'UPDATE highlights SET color = ? WHERE id = ?', params: [color, id] })));
}

export async function deleteHighlights(ids: number[]): Promise<void> {
  await getDb().batch(ids.map((id) => ({ sql: 'DELETE FROM highlights WHERE id = ?', params: [id] })));
}

export interface HighlightGroupItem {
  /** Id of the group's first highlight row (used as the item id, like the Android client). */
  id: number;
  highlights: Highlight[];
  verses: Verse[];
  context: PoemContext;
  labels: Label[];
}

/** All highlights, merged by group (one item per multi-verse highlight), oldest first. */
export async function listHighlightGroups(): Promise<HighlightGroupItem[]> {
  const rows = await getDb().query<
    PoemContextRow & Highlight & { verseText: string; verseOrder: number; position: number }
  >(
    `SELECT ${HIGHLIGHT_COLUMNS}, v.text AS verseText, v.verse_order AS verseOrder, v.position AS position,
            ${POEM_CONTEXT_COLUMNS}
     FROM highlights h
     JOIN verses v ON v.id = h.verse_id
     JOIN poems p ON p.id = v.poem_id ${POEM_CONTEXT_JOINS}
     ORDER BY h.created_at, v.verse_order`,
  );
  const labels = await labelsByItem('highlight');
  const groups = new Map<string, HighlightGroupItem>();
  for (const r of await toPoemContexts(rows)) {
    const highlight: Highlight = {
      id: r.id,
      verseId: r.verseId,
      startIndex: r.startIndex,
      endIndex: r.endIndex,
      createdAt: r.createdAt,
      color: r.color,
      groupId: r.groupId,
    };
    const verse: Verse = { id: r.verseId, text: r.verseText, verseOrder: r.verseOrder, position: r.position, poemId: r.poemId };
    const group = groups.get(r.groupId);
    if (group) {
      group.highlights.push(highlight);
      group.verses.push(verse);
      for (const l of labels.get(r.id) ?? []) if (!group.labels.some((g) => g.id === l.id)) group.labels.push(l);
    } else {
      groups.set(r.groupId, {
        id: r.id,
        highlights: [highlight],
        verses: [verse],
        context: r.context,
        labels: [...(labels.get(r.id) ?? [])],
      });
    }
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- notes (comments)

export async function listPoemComments(poemId: number): Promise<Comment[]> {
  return getDb().query<Comment>(
    'SELECT id, poem_id AS poemId, text, created_at AS createdAt FROM comments WHERE poem_id = ? ORDER BY created_at',
    [poemId],
  );
}

export async function addComment(poemId: number, text: string): Promise<void> {
  await getDb().run('INSERT INTO comments (poem_id, text, created_at) VALUES (?, ?, ?)', [poemId, text, Date.now()]);
}

export async function deleteComment(id: number): Promise<void> {
  await getDb().run('DELETE FROM comments WHERE id = ?', [id]);
}

export interface NoteItem {
  comment: Comment;
  context: PoemContext;
}

export async function listAllComments(): Promise<NoteItem[]> {
  const rows = await getDb().query<PoemContextRow & { id: number; text: string; createdAt: number }>(
    `SELECT cm.id AS id, cm.text AS text, cm.created_at AS createdAt, ${POEM_CONTEXT_COLUMNS}
     FROM comments cm JOIN poems p ON p.id = cm.poem_id ${POEM_CONTEXT_JOINS}
     ORDER BY cm.created_at DESC`,
  );
  return (await toPoemContexts(rows)).map((r) => ({
    comment: { id: r.id, poemId: r.poemId, text: r.text, createdAt: r.createdAt },
    context: r.context,
  }));
}

// ---------------------------------------------------------------- history

/** Records a poem visit; re-visiting the latest poem just refreshes its timestamp. */
export async function recordVisit(poemId: number): Promise<void> {
  const db = getDb();
  const latest = await db.query<{ id: number; poemId: number }>(
    'SELECT id, poem_id AS poemId FROM history ORDER BY timestamp DESC, id DESC LIMIT 1',
  );
  if (latest[0]?.poemId === poemId) {
    await db.run('UPDATE history SET timestamp = ? WHERE id = ?', [Date.now(), latest[0].id]);
  } else {
    await db.run('INSERT INTO history (poem_id, timestamp) VALUES (?, ?)', [poemId, Date.now()]);
  }
}

export interface HistoryItem {
  id: number;
  timestamp: number;
  context: PoemContext;
}

export async function listHistory(): Promise<HistoryItem[]> {
  const rows = await getDb().query<PoemContextRow & { id: number; timestamp: number }>(
    `SELECT h.id AS id, h.timestamp AS timestamp, ${POEM_CONTEXT_COLUMNS}
     FROM history h JOIN poems p ON p.id = h.poem_id ${POEM_CONTEXT_JOINS}
     ORDER BY h.timestamp DESC, h.id DESC
     LIMIT 500`,
  );
  return (await toPoemContexts(rows)).map((r) => ({ id: r.id, timestamp: r.timestamp, context: r.context }));
}

export async function deleteHistoryItem(id: number): Promise<void> {
  await getDb().run('DELETE FROM history WHERE id = ?', [id]);
}

export async function clearHistory(): Promise<void> {
  await getDb().run('DELETE FROM history');
}

// ---------------------------------------------------------------- search history

export async function listSearchHistory(): Promise<SearchHistoryRecord[]> {
  return getDb().query<SearchHistoryRecord>('SELECT id, query, timestamp FROM search_history ORDER BY timestamp DESC LIMIT 50');
}

export async function saveSearchQuery(query: string): Promise<void> {
  await getDb().run(
    `INSERT INTO search_history (query, timestamp) VALUES (?, ?)
     ON CONFLICT(query) DO UPDATE SET timestamp = excluded.timestamp`,
    [query, Date.now()],
  );
}

export async function deleteSearchQuery(id: number): Promise<void> {
  await getDb().run('DELETE FROM search_history WHERE id = ?', [id]);
}

// ---------------------------------------------------------------- labels

const LABEL_COLUMNS = 'l.id AS id, l.name AS name, l.color AS color, l.type AS type, l.created_at AS createdAt';

export async function listLabels(type: LabelType): Promise<Label[]> {
  return getDb().query<Label>(`SELECT ${LABEL_COLUMNS} FROM labels l WHERE l.type = ? ORDER BY l.created_at`, [type]);
}

export async function listLabelsWithCount(type: LabelType): Promise<LabelWithCount[]> {
  // Highlights count once per group, matching how they are listed.
  const count =
    type === 'bookmark'
      ? '(SELECT COUNT(*) FROM bookmark_label_cross_refs x WHERE x.label_id = l.id)'
      : `(SELECT COUNT(DISTINCT h.group_id) FROM highlight_label_cross_refs x
          JOIN highlights h ON h.id = x.highlight_id WHERE x.label_id = l.id)`;
  return getDb().query<LabelWithCount>(
    `SELECT ${LABEL_COLUMNS}, ${count} AS itemCount FROM labels l WHERE l.type = ? ORDER BY l.created_at`,
    [type],
  );
}

export async function createLabel(name: string, color: string, type: LabelType): Promise<Label> {
  const createdAt = Date.now();
  const { lastInsertRowid } = await getDb().run(
    'INSERT INTO labels (name, color, type, created_at) VALUES (?, ?, ?, ?)',
    [name, color, type, createdAt],
  );
  return { id: lastInsertRowid, name, color, type, createdAt };
}

export async function updateLabel(id: number, name: string, color: string): Promise<void> {
  await getDb().run('UPDATE labels SET name = ?, color = ? WHERE id = ?', [name, color, id]);
}

export async function deleteLabel(id: number): Promise<void> {
  await getDb().run('DELETE FROM labels WHERE id = ?', [id]);
}

const crossRef = (type: LabelType) =>
  type === 'bookmark'
    ? { table: 'bookmark_label_cross_refs', column: 'bookmark_id' }
    : { table: 'highlight_label_cross_refs', column: 'highlight_id' };

/**
 * Sets exactly `labelIds` on every target (a bookmark id, or all row ids of one highlight
 * group so a multi-verse highlight stays consistently labelled).
 */
export async function setItemLabels(type: LabelType, targetIds: number[], labelIds: number[]): Promise<void> {
  const { table, column } = crossRef(type);
  await getDb().batch([
    ...targetIds.map((id) => ({ sql: `DELETE FROM ${table} WHERE ${column} = ?`, params: [id] })),
    ...targetIds.flatMap((id) =>
      labelIds.map((labelId) => ({
        sql: `INSERT OR IGNORE INTO ${table} (${column}, label_id) VALUES (?, ?)`,
        params: [id, labelId],
      })),
    ),
  ]);
}

/** Adds labels without touching existing ones (the "save moment" prompt). */
export async function addItemLabels(type: LabelType, targetIds: number[], labelIds: number[]): Promise<void> {
  const { table, column } = crossRef(type);
  await getDb().batch(
    targetIds.flatMap((id) =>
      labelIds.map((labelId) => ({
        sql: `INSERT OR IGNORE INTO ${table} (${column}, label_id) VALUES (?, ?)`,
        params: [id, labelId],
      })),
    ),
  );
}

async function labelsByItem(type: LabelType): Promise<Map<number, Label[]>> {
  const { table, column } = crossRef(type);
  const rows = await getDb().query<Label & { itemId: number }>(
    `SELECT x.${column} AS itemId, ${LABEL_COLUMNS}
     FROM ${table} x JOIN labels l ON l.id = x.label_id
     ORDER BY l.created_at`,
  );
  const map = new Map<number, Label[]>();
  for (const { itemId, ...label } of rows) {
    const list = map.get(itemId) ?? [];
    list.push(label);
    map.set(itemId, list);
  }
  return map;
}
