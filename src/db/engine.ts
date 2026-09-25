// Database operations that run next to SQLite (inside the DB worker, or in Node for tests).
// Nothing here touches the DOM or worker globals.
import type { BindingSpec, Database } from '@sqlite.org/sqlite-wasm';
import { unzipSync, strFromU8 } from 'fflate';
import Papa from 'papaparse';
import { normalizeForSearch } from '../lib/normalize';
import { MIGRATIONS } from './schema';

export type Row = Record<string, unknown>;

export interface Statement {
  sql: string;
  params?: BindingSpec;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface PoetInput {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface PoetCsvFiles {
  categories: string;
  poems: string;
  verses: string;
}

export type ImportProgress = { stage: 'categories' | 'poems' | 'verses'; done: number; total: number };

export function migrate(db: Database): void {
  db.exec('PRAGMA foreign_keys = ON;');
  const version = Number(db.selectValue('PRAGMA user_version') ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1};`);
    });
  }
}

export function query(db: Database, sql: string, params?: BindingSpec): Row[] {
  return db.selectObjects(sql, params) as Row[];
}

export function run(db: Database, sql: string, params?: BindingSpec): RunResult {
  db.exec({ sql, bind: params });
  return {
    changes: db.changes(),
    lastInsertRowid: Number(db.selectValue('SELECT last_insert_rowid()')),
  };
}

/** Runs statements in one transaction; returns one result per statement. */
export function batch(db: Database, statements: Statement[]): RunResult[] {
  return db.transaction(() => statements.map((s) => run(db, s.sql, s.params)));
}

/**
 * Pulls the three CSVs out of a poet zip from the server (`poet_{id}.zip`, built by the
 * server's scripts/bash/zip_csvs.sh: category_{id}.csv, poems_{id}.csv, verses_{id}.csv).
 */
export function extractPoetZip(zip: Uint8Array): PoetCsvFiles {
  const entries = unzipSync(zip);
  const find = (prefix: string) => {
    const name = Object.keys(entries).find((n) => {
      const base = n.split('/').pop() ?? '';
      return base.startsWith(prefix) && base.endsWith('.csv');
    });
    if (!name) throw new Error(`missing ${prefix}*.csv in poet archive`);
    return strFromU8(entries[name]);
  };
  return { categories: find('category_'), poems: find('poems_'), verses: find('verses_') };
}

function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`invalid CSV: ${result.errors[0].message}`);
  }
  return result.data;
}

const toInt = (value: string | undefined, column: string): number => {
  const n = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(n)) throw new Error(`invalid ${column}: ${value}`);
  return n;
};

/**
 * Inserts a downloaded poet (row + categories + poems + verses) in one transaction, so a
 * failed import leaves nothing behind (the Android client deletes the poet on failure; the
 * rollback does the same here).
 */
export function importPoet(
  db: Database,
  poet: PoetInput,
  files: PoetCsvFiles,
  onProgress?: (progress: ImportProgress) => void,
): { categories: number; poems: number; verses: number } {
  const categories = parseCsv(files.categories);
  const poems = parseCsv(files.poems);
  const verses = parseCsv(files.verses);

  db.transaction(() => {
    db.exec({
      // Upsert, not REPLACE: REPLACE deletes the old row first, which would cascade.
      sql: `INSERT INTO poets (id, name, description, image_url, download_status)
            VALUES (?, ?, ?, ?, 'Downloaded')
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
              image_url = excluded.image_url, download_status = 'Downloaded'`,
      bind: [poet.id, poet.name, poet.description ?? '', poet.imageUrl],
    });

    const insertMany = <T>(
      sql: string,
      rows: T[],
      bind: (row: T) => BindingSpec,
      stage: ImportProgress['stage'],
    ) => {
      const stmt = db.prepare(sql);
      try {
        rows.forEach((row, i) => {
          stmt.bind(bind(row)).stepReset();
          stmt.clearBindings();
          if (onProgress && (i % 2000 === 0 || i === rows.length - 1)) {
            onProgress({ stage, done: i + 1, total: rows.length });
          }
        });
      } finally {
        stmt.finalize();
      }
    };

    insertMany(
      'INSERT OR IGNORE INTO categories (id, text, parent_id, poet_id) VALUES (?, ?, ?, ?)',
      categories,
      (r) => [toInt(r.id, 'category id'), r.text ?? '', toInt(r.parent_id, 'parent_id'), toInt(r.poet_id, 'poet_id')],
      'categories',
    );
    insertMany(
      'INSERT OR IGNORE INTO poems (id, title, category_id) VALUES (?, ?, ?)',
      poems,
      (r) => [toInt(r.id, 'poem id'), r.title ?? '', toInt(r.category_id, 'category_id')],
      'poems',
    );
    insertMany(
      `INSERT OR IGNORE INTO verses (id, text, verse_order, position, poem_id, normalized_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
      verses,
      (r) => [
        toInt(r.id, 'verse id'),
        r.text ?? '',
        toInt(r.verse_order, 'verse_order'),
        toInt(r.position, 'position'),
        toInt(r.poem_id, 'poem_id'),
        normalizeForSearch(r.text ?? ''),
      ],
      'verses',
    );

    const violations = query(db, 'PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`poet archive has ${violations.length} dangling references`);
    }
  });

  return { categories: categories.length, poems: poems.length, verses: verses.length };
}
