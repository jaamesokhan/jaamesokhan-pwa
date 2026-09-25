import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { workerDb } from '../db/client';

const subscribeDb = (l: () => void) => workerDb.subscribe(l);
const getDbVersion = () => workerDb.changeVersion;

export interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an async (usually DB) loader, re-running it when `deps` change or after any database
 * write, so every screen stays in sync with edits made elsewhere.
 */
export function useDbQuery<T>(loader: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const dbVersion = useSyncExternalStore(subscribeDb, getDbVersion);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean }>({ error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    loaderRef.current().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        !cancelled && setState((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)), loading: false })),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dbVersion, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', l);
      return () => mql.removeEventListener('change', l);
    },
    () => window.matchMedia(query).matches,
  );
}
