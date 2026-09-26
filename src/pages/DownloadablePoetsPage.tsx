import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { mdiAlertCircleOutline, mdiCheckCircle, mdiChevronDown, mdiChevronUp, mdiDownload, mdiMagnify, mdiRefresh } from '@mdi/js';
import { fetchPoets } from '../api';
import { useTitle } from '../components/Layout';
import { EmptyState, Icon, IconButton, LoadMoreSentinel, PoetAvatar, Spinner } from '../components/ui';
import { getRootCategoryId, listDownloadedPoets } from '../data/content';
import type { Poet } from '../data/types';
import { downloadPoet, useDownloads, type DownloadState } from '../state/downloads';
import { useDbQuery, useDebounced } from '../state/hooks';
import { toPersianNumber } from '../lib/format';
import { S } from '../strings';

const PAGE_SIZE = 20;

function DownloadButton({ state, downloaded, onDownload, onOpen }: {
  state?: DownloadState;
  downloaded: boolean;
  onDownload: () => void;
  onOpen: () => void;
}) {
  if (downloaded) {
    return (
      <button type="button" className="button tonal" onClick={onOpen}>
        <Icon path={mdiCheckCircle} size={18} />
        {S.openDownloadedPoet}
      </button>
    );
  }
  if (state && state.stage !== 'failed') {
    const pct = state.progress != null ? toPersianNumber(Math.round(state.progress * 100)) + '٪' : '';
    return (
      <div className="download-progress" role="status">
        <div className="spinner small" />
        <span>{state.stage === 'downloading' ? S.downloading : S.importing} {pct}</span>
      </div>
    );
  }
  return (
    <button type="button" className="button filled" onClick={onDownload}>
      <Icon path={state?.stage === 'failed' ? mdiRefresh : mdiDownload} size={18} />
      {S.downloadPoet}
    </button>
  );
}

function PoetRow({ poet, downloaded, state }: { poet: Poet; downloaded: boolean; state?: DownloadState }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const open = async () => {
    const root = await getRootCategoryId(poet.id);
    if (root != null) navigate(`/poet/${poet.id}/${root}`);
  };
  return (
    <li className="card poet-row">
      <div className="poet-row-main">
        <PoetAvatar name={poet.name} imageUrl={poet.imageUrl} />
        <div className="poet-row-text">
          <strong>{poet.name}</strong>
          {poet.description && (
            <p className={expanded ? '' : 'clamp-2'}>{poet.description}</p>
          )}
        </div>
        {poet.description && (
          <IconButton
            icon={expanded ? mdiChevronUp : mdiChevronDown}
            label={expanded ? S.close : 'بیشتر'}
            onClick={() => setExpanded(!expanded)}
          />
        )}
      </div>
      <div className="poet-row-actions">
        <DownloadButton state={state} downloaded={downloaded} onDownload={() => void downloadPoet(poet)} onOpen={open} />
      </div>
    </li>
  );
}

export default function DownloadablePoetsPage() {
  useTitle(S.addNewPoetPageTitle);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 500);
  const [poets, setPoets] = useState<Poet[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<'loading' | 'idle' | 'error' | 'done'>('loading');
  const downloads = useDownloads();
  const downloaded = useDbQuery(listDownloadedPoets, []);
  const downloadedIds = new Set((downloaded.data ?? []).map((p) => p.id));
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (pageToLoad: number, name: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading');
    try {
      const { poets: batch, last } = await fetchPoets(pageToLoad, PAGE_SIZE, name || undefined, controller.signal);
      setPoets((prev) => (pageToLoad === 0 ? batch : [...prev, ...batch.filter((p) => !prev.some((q) => q.id === p.id))]));
      setPage(pageToLoad + 1);
      setStatus(last ? 'done' : 'idle');
    } catch (e) {
      if (!controller.signal.aborted) setStatus('error');
      if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(e);
    }
  }, []);

  useEffect(() => {
    setPoets([]);
    void load(0, debouncedSearch);
  }, [debouncedSearch, load]);

  return (
    <div className="page">
      <label className="search-field">
        <Icon path={mdiMagnify} />
        <input
          type="search"
          value={search}
          placeholder={S.poetSearchBarHint}
          onChange={(e) => setSearch(e.target.value)}
          enterKeyHint="search"
        />
      </label>

      <ul className="list">
        {poets.map((poet) => (
          <PoetRow key={poet.id} poet={poet} downloaded={downloadedIds.has(poet.id)} state={downloads[poet.id]} />
        ))}
      </ul>

      {status === 'loading' && <Spinner />}
      {status === 'idle' && <LoadMoreSentinel trigger={poets.length} onVisible={() => void load(page, debouncedSearch)} />}
      {status === 'error' && (
        <EmptyState icon={mdiAlertCircleOutline} title={navigator.onLine ? S.downloadFailed : S.networkError}>
          <button type="button" className="button filled" onClick={() => void load(page, debouncedSearch)}>
            <Icon path={mdiRefresh} size={18} />
            تلاش دوباره
          </button>
        </EmptyState>
      )}
      {status === 'done' && poets.length === 0 && <EmptyState title={S.noPoetFound} />}
    </div>
  );
}
