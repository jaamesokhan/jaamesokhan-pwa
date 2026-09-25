import type { BindingSpec } from '@sqlite.org/sqlite-wasm';
import type { ImportProgress, PoetInput, Row, RunResult, Statement } from './engine';

export type { ImportProgress, PoetInput, Row, RunResult, Statement };

/** The async database surface the app talks to (backed by the DB worker, or Node in tests). */
export interface Db {
  query<T = Row>(sql: string, params?: BindingSpec): Promise<T[]>;
  run(sql: string, params?: BindingSpec): Promise<RunResult>;
  batch(statements: Statement[]): Promise<RunResult[]>;
}

export type StorageKind = 'opfs' | 'memory';

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'query'; sql: string; params?: BindingSpec }
  | { type: 'run'; sql: string; params?: BindingSpec }
  | { type: 'batch'; statements: Statement[] }
  | { type: 'importPoet'; poet: PoetInput; zip: ArrayBuffer }
  | { type: 'exportDb' }
  | { type: 'importDb'; data: ArrayBuffer };

export type WorkerMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: ImportProgress };
