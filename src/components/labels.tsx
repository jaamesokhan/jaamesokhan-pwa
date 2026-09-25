// Label ("category") sheets for bookmarks and highlights. Ports of SaveMomentBottomSheet,
// NewCategoryBottomSheet, CategoryPickerBottomSheet and ManageCategoriesBottomSheet.
import { useEffect, useState } from 'react';
import { mdiCheck, mdiDeleteOutline, mdiPencilOutline, mdiPlus } from '@mdi/js';
import {
  addItemLabels,
  createLabel,
  deleteLabel,
  listLabels,
  listLabelsWithCount,
  setItemLabels,
  updateLabel,
} from '../data/user';
import { CATEGORY_COLOR_PALETTE, type Label, type LabelType } from '../data/types';
import { toPersianNumber } from '../lib/format';
import { useDbQuery } from '../state/hooks';
import { showToast } from '../state/toast';
import { S } from '../strings';
import { Chip, ConfirmDialog, Icon, IconButton, Sheet } from './ui';

export function LabelEditorSheet({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing?: Label | null;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setColor(editing?.color ?? CATEGORY_COLOR_PALETTE[0]);
    }
  }, [open, editing]);

  return (
    <Sheet open={open} onClose={onClose} title={editing ? S.editCategory : S.newCategory}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), color);
        }}
      >
        <label className="text-field">
          <span>{S.categoryNameLabel}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={S.categoryNameHint} autoFocus maxLength={40} />
        </label>
        <fieldset className="color-palette">
          <legend>{S.colorLabel}</legend>
          {CATEGORY_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${c === color ? 'selected' : ''}`}
              style={{ background: c }}
              aria-label={c}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
            >
              {c === color && <Icon path={mdiCheck} size={18} />}
            </button>
          ))}
        </fieldset>
        <div className="button-row">
          <button type="button" className="button text" onClick={onClose}>
            {S.cancel}
          </button>
          <button type="submit" className="button filled" disabled={!name.trim()}>
            {S.save}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Chooses labels for items. `mode: 'add'` only adds (the prompt after saving a moment);
 * `mode: 'set'` makes the item's labels exactly the selection (edit from the collections).
 */
export function LabelPickerSheet({
  open,
  type,
  targetIds,
  initial = [],
  mode,
  title,
  onClose,
}: {
  open: boolean;
  type: LabelType;
  targetIds: number[];
  initial?: number[];
  mode: 'add' | 'set';
  title: string;
  onClose: () => void;
}) {
  const labels = useDbQuery(() => listLabels(type), [type]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    const ids = [...selected];
    if (mode === 'set') await setItemLabels(type, targetIds, ids);
    else if (ids.length > 0) await addItemLabels(type, targetIds, ids);
    if (ids.length > 0 || mode === 'set') showToast(S.savedToCategory, 'success');
    onClose();
  };

  return (
    <>
      <Sheet open={open && !creating} onClose={onClose} title={title}>
        <div className="chip-wrap">
          {labels.data?.map((l) => (
            <Chip key={l.id} color={l.color} selected={selected.has(l.id)} onClick={() => toggle(l.id)}>
              {l.name}
            </Chip>
          ))}
          <Chip onClick={() => setCreating(true)}>
            <Icon path={mdiPlus} size={18} />
            {S.newCategoryChip}
          </Chip>
        </div>
        <div className="button-row">
          <button type="button" className="button text" onClick={onClose}>
            {S.cancel}
          </button>
          <button type="button" className="button filled" onClick={() => void confirm()}>
            {S.confirm}
          </button>
        </div>
      </Sheet>
      <LabelEditorSheet
        open={open && creating}
        onClose={() => setCreating(false)}
        onSave={async (name, color) => {
          const label = await createLabel(name, color, type);
          setSelected((prev) => new Set(prev).add(label.id));
          setCreating(false);
          showToast(S.categoryCreated, 'success');
        }}
      />
    </>
  );
}

export function ManageLabelsSheet({ open, type, onClose }: { open: boolean; type: LabelType; onClose: () => void }) {
  const labels = useDbQuery(() => listLabelsWithCount(type), [type]);
  const [editing, setEditing] = useState<Label | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);

  return (
    <>
      <Sheet
        open={open && editing == null && deleting == null}
        onClose={onClose}
        title={type === 'bookmark' ? S.manageCategoriesSave : S.manageCategoriesHighlight}
      >
        <ul className="label-list">
          {labels.data?.map((l) => (
            <li key={l.id}>
              <span className="chip-dot" style={{ background: l.color }} />
              <span className="label-name">{l.name}</span>
              <span className="label-count">{toPersianNumber(l.itemCount)}</span>
              <IconButton icon={mdiPencilOutline} label={S.editCategory} onClick={() => setEditing(l)} />
              <IconButton icon={mdiDeleteOutline} label={S.delete} onClick={() => setDeleting(l)} />
            </li>
          ))}
        </ul>
        <button type="button" className="button tonal wide" onClick={() => setEditing('new')}>
          <Icon path={mdiPlus} size={18} />
          {S.newCategory}
        </button>
      </Sheet>
      <LabelEditorSheet
        open={open && editing != null}
        editing={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={async (name, color) => {
          if (editing && editing !== 'new') {
            await updateLabel(editing.id, name, color);
            showToast(S.categoryEdited, 'success');
          } else {
            await createLabel(name, color, type);
            showToast(S.categoryCreated, 'success');
          }
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={open && deleting != null}
        message={deleting ? S.deleteCategoryConfirm(deleting.name) : ''}
        confirmLabel={S.delete}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteLabel(deleting!.id);
          setDeleting(null);
          showToast(S.categoryDeleted, 'success');
        }}
      />
    </>
  );
}
