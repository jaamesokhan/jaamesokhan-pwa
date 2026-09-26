/// <reference lib="webworker" />
// Owns the SQLite database. Runs in a dedicated worker because the OPFS SyncAccessHandle
// pool VFS (persistent storage without COOP/COEP headers) is only available in workers.
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { batch, extractPoetZip, importPoet, migrate, query, run } from './engine';
import type { StorageKind, WorkerMessage, WorkerRequest } from './types';

declare const self: DedicatedWorkerGlobalScope;

const DB_FILE = '/jaamesokhan.sqlite3';

let sqlite3: Sqlite3Static | null = null;
let db: Database | null = null;
let pool: SAHPoolUtil | null = null;
let storage: StorageKind = 'memory';
let ready: Promise<StorageKind> | null = null;

async function open(): Promise<StorageKind> {
  sqlite3 = await sqlite3InitModule();
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'jaamesokhan-pool' });
    db = new pool.OpfsSAHPoolDb(DB_FILE);
    storage = 'opfs';
  } catch (e) {
    // No OPFS (e.g. Firefox private mode, very old Safari): keep working in memory.
    console.warn('OPFS unavailable, using an in-memory database', e);
    db = new sqlite3.oo1.DB(':memory:', 'c');
    storage = 'memory';
  }
  migrate(db);
  return storage;
}

function requireDb(): Database {
  if (!db) throw new Error('database not initialised');
  return db;
}

async function handle(id: number, req: WorkerRequest): Promise<unknown> {
  ready ??= open();
  const kind = await ready;
  switch (req.type) {
    case 'init':
      return kind;
    case 'query':
      return query(requireDb(), req.sql, req.params);
    case 'run':
      return run(requireDb(), req.sql, req.params);
    case 'batch':
      return batch(requireDb(), req.statements);
    case 'importPoet': {
      const files = extractPoetZip(new Uint8Array(req.zip));
      return importPoet(requireDb(), req.poet, files, (progress) => {
        self.postMessage({ id, progress } satisfies WorkerMessage);
      });
    }
    case 'exportDb': {
      const bytes = pool ? await pool.exportFile(DB_FILE) : sqlite3!.capi.sqlite3_js_db_export(requireDb());
      return bytes.buffer;
    }
    case 'importDb': {
      if (!pool) throw new Error('restoring a backup needs persistent storage');
      const data = new Uint8Array(req.data);
      // "SQLite format 3\0"
      const header = new TextDecoder().decode(data.subarray(0, 15));
      if (header !== 'SQLite format 3') throw new Error('not a SQLite database file');
      requireDb().close();
      await pool.importDb(DB_FILE, data);
      db = new pool.OpfsSAHPoolDb(DB_FILE);
      migrate(db);
      return true;
    }
  }
}

self.onmessage = async (event: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = event.data;
  try {
    const result = await handle(id, req);
    const transfer = result instanceof ArrayBuffer ? [result] : [];
    self.postMessage({ id, ok: true, result } satisfies WorkerMessage, transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies WorkerMessage);
  }
};
