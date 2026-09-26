import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { mdiClose, mdiHistory, mdiMagnify } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { Chip, EmptyState, Icon, IconButton, Spinner } from '../components/ui';
import { listDownloadedPoets, SEARCH_LIMIT, searchVerses, type SearchResult } from '../data/content';
import { deleteSearchQuery, listSearchHistory, pathText, saveSearchQuery } from '../data/user';
import { normalizeForSearch } from '../lib/normalize';
import { toPersianNumber } from '../lib/format';
import { useDbQuery } from '../state/hooks';
import { S } from '../strings';

export default function SearchPage() {
  useTitle(S.searchTitle);
  // The submitted query and poet filter live in the URL so back navigation restores results.
  const [params, setParams] = useSearchParams();
  const submitted = params.get('q') ?? '';
  const poetFilter = useMemo(() => (params.get('poets') ?? '').split(',').map(Number).filter(Boolean), [params]);
  const [input, setInput] = useState(submitted);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const poets = useDbQuery(listDownloadedPoets, []);
  const history = useDbQuery(listSearchHistory, []);

  useEffect(() => setInput(submitted), [submitted]);

  useEffect(() => {
    if (!submitted.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchVerses(submitted, poetFilter).then((r) => {
      if (cancelled) return;
      setResults(r);
      setSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [submitted, poetFilter]);

  const submit = (query: string) => {
    const q = query.trim();
    if (!q) return;
    void saveSearchQuery(q);
    const next = new URLSearchParams(params);
    next.set('q', q);
    setParams(next);
  };

  const togglePoet = (id: number) => {
    const set = new Set(poetFilter);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = new URLSearchParams(params);
    if (set.size) next.set('poets', [...set].join(','));
    else next.delete('poets');
    setParams(next, { replace: true });
  };

  const normalizedInput = normalizeForSearch(input);
  const suggestions = (history.data ?? []).filter((h) => normalizeForSearch(h.query).includes(normalizedInput));
  const showHistory = !submitted || input !== submitted;

  return (
    <div className="page">
      <form
        className="search-field"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Icon path={mdiMagnify} />
        <input
          type="search"
          value={input}
          placeholder={S.searchBarHint}
          onChange={(e) => setInput(e.target.value)}
          enterKeyHint="search"
          autoFocus={!submitted}
        />
        {input && <IconButton icon={mdiClose} label={S.close} onClick={() => {
              setInput('');
              setParams({});
            }} />}
      </form>

      {(poets.data?.length ?? 0) > 1 && (
        <div className="chip-wrap scroll-x">
          <Chip selected={poetFilter.length === 0} onClick={() => setParams(submitted ? { q: submitted } : {}, { replace: true })}>
            {S.searchAllPoets}
          </Chip>
          {poets.data!.map((p) => (
            <Chip key={p.id} selected={poetFilter.includes(p.id)} onClick={() => togglePoet(p.id)}>
              {p.name}
            </Chip>
          ))}
        </div>
      )}

      {showHistory && suggestions.length > 0 && (
        <section>
          <h3 className="section-title">{S.recentSearches}</h3>
          <ul className="menu">
            {suggestions.slice(0, 10).map((h) => (
              <li key={h.id} className="history-row">
                <button type="button" className="menu-item" onClick={() => submit(h.query)}>
                  <Icon path={mdiHistory} />
                  <span>{h.query}</span>
                </button>
                <IconButton icon={mdiClose} label={S.delete} onClick={() => void deleteSearchQuery(h.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {searching && <Spinner />}
      {!searching && results && !showHistory && (
        <>
          {results.length === 0 ? (
            <EmptyState icon={mdiMagnify} title={S.notFound} />
          ) : (
            <p className="result-count">
              {toPersianNumber(results.length)} نتیجه
              {results.length >= SEARCH_LIMIT && <span> — {S.searchLimitReached}</span>}
            </p>
          )}
          <ul className="list">
            {results.map((r) => (
              <li key={r.verse.id}>
                <Link className="card search-result" to={`/poem/${r.poet.id}/${r.poem.id}?verse=${r.verse.id}`}>
                  <p className="verse-preview">{r.verse.text}</p>
                  <span className="path">{pathText(r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
