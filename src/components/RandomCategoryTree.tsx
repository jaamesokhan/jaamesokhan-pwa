// Tri-state tree for choosing which categories feed random poems (Android: RandomPoemOptions).
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllCategories, setCategoriesRandomSelected } from '../data/content';
import type { Category } from '../data/types';
import { useDbQuery } from '../state/hooks';
import { showToast } from '../state/toast';
import { S } from '../strings';

type State = 'on' | 'off' | 'mixed';

function TriCheckbox({ state, onChange, label }: { state: State; onChange: (checked: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed';
  }, [state]);
  return (
    <label className="tree-label">
      <input ref={ref} type="checkbox" checked={state === 'on'} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function RandomCategoryTree() {
  const categories = useDbQuery(getAllCategories, []);
  const [flags, setFlags] = useState<Map<number, boolean>>(new Map());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (categories.data && !dirty) setFlags(new Map(categories.data.map((c) => [c.id, c.randomSelected])));
  }, [categories.data, dirty]);

  const children = useMemo(() => {
    const map = new Map<number, Category[]>();
    for (const c of categories.data ?? []) {
      const list = map.get(c.parentId) ?? [];
      list.push(c);
      map.set(c.parentId, list);
    }
    return map;
  }, [categories.data]);

  // Parents derive their state from their children, leaves from their own flag (as on Android).
  const stateOf = (id: number): State => {
    const kids = children.get(id);
    if (!kids?.length) return flags.get(id) === false ? 'off' : 'on';
    const states = kids.map((k) => stateOf(k.id));
    if (states.every((s) => s === 'on')) return 'on';
    if (states.every((s) => s === 'off')) return 'off';
    return 'mixed';
  };

  const setSubtree = (id: number, value: boolean, next: Map<number, boolean>) => {
    next.set(id, value);
    for (const k of children.get(id) ?? []) setSubtree(k.id, value, next);
  };

  const toggle = (id: number, value: boolean) => {
    const next = new Map(flags);
    setSubtree(id, value, next);
    setFlags(next);
    setDirty(true);
  };

  const save = async () => {
    await setCategoriesRandomSelected(
      (categories.data ?? []).map((c) => ({ id: c.id, selected: stateOf(c.id) !== 'off' })),
    );
    setDirty(false);
    showToast(S.savedToCategory, 'success');
  };

  const renderNode = (c: Category) => {
    const kids = children.get(c.id) ?? [];
    const checkbox = <TriCheckbox state={stateOf(c.id)} label={c.text} onChange={(v) => toggle(c.id, v)} />;
    return (
      <li key={c.id}>
        {kids.length > 0 ? (
          <details>
            <summary>{checkbox}</summary>
            <ul>{kids.map(renderNode)}</ul>
          </details>
        ) : (
          checkbox
        )}
      </li>
    );
  };

  const roots = children.get(0) ?? [];
  if (roots.length === 0) return <p className="muted">{S.noPoetDownloaded}</p>;
  return (
    <div className="category-tree">
      <ul>{roots.map(renderNode)}</ul>
      <button type="button" className="button filled" disabled={!dirty} onClick={() => void save()}>
        {S.save}
      </button>
    </div>
  );
}
