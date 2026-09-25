// Main-thread handle to the DB worker, plus a change counter that lets views re-query after
// any write (see useDbQuery).
import type { BindingSpec } from '@sqlite.org/sqlite-wasm';
import type { Db, ImportProgress, PoetInput, RunResult, Statement, StorageKind, WorkerMessage, WorkerRequest } from './types';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (p: ImportProgress) => void;
};

class WorkerDb implements Db {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<() => void>();
  private version = 0;

  private post<T>(req: WorkerRequest, transfer: Transferable[] = [], onProgress?: Pending['onProgress']): Promise<T> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        if ('progress' in msg) {
          entry.onProgress?.(msg.progress);
          return;
        }
        this.pending.delete(msg.id);
        if (msg.ok) entry.resolve(msg.result);
        else entry.reject(new Error(msg.error));
      };
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker!.postMessage({ id, req }, transfer);
    });
  }

  init(): Promise<StorageKind> {
    return this.post<StorageKind>({ type: 'init' });
  }

  query<T>(sql: string, params?: BindingSpec): Promise<T[]> {
    return this.post<T[]>({ type: 'query', sql, params });
  }

  async run(sql: string, params?: BindingSpec): Promise<RunResult> {
    const result = await this.post<RunResult>({ type: 'run', sql, params });
    this.notify();
    return result;
  }

  async batch(statements: Statement[]): Promise<RunResult[]> {
    const result = await this.post<RunResult[]>({ type: 'batch', statements });
    this.notify();
    return result;
  }

  async importPoet(poet: PoetInput, zip: ArrayBuffer, onProgress?: (p: ImportProgress) => void) {
    const result = await this.post<{ categories: number; poems: number; verses: number }>(
      { type: 'importPoet', poet, zip },
      [zip],
      onProgress,
    );
    this.notify();
    return result;
  }

  async exportDb(): Promise<ArrayBuffer> {
    return this.post<ArrayBuffer>({ type: 'exportDb' });
  }

  async importDb(data: ArrayBuffer): Promise<void> {
    await this.post({ type: 'importDb', data }, [data]);
    this.notify();
  }

  get changeVersion() {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

export const workerDb = new WorkerDb();

let current: Db = workerDb;

/** The database used by the data layer. Tests swap in a Node-backed implementation. */
export function getDb(): Db {
  return current;
}

export function setDb(db: Db): void {
  current = db;
}
