import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { mdiBookOpenVariant, mdiCheck, mdiContentCopy, mdiDeleteOutline, mdiMarker, mdiTagOutline } from '@mdi/js';
import { HIGHLIGHT_COLORS, type Highlight } from '../../data/types';
import { deleteHighlights, setHighlightsColor } from '../../data/user';
import { showToast } from '../../state/toast';
import { S } from '../../strings';
import { Icon } from '../ui';

/** Viewport coordinates of the thing a floating toolbar points at. */
export interface ToolbarAnchor {
  top: number;
  bottom: number;
  centerX: number;
}

/** Positions itself above the anchor (below if there's no room), clamped to the viewport. */
function FloatingToolbar({ anchor, children }: { anchor: ToolbarAnchor; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 12;
    const topBarHeight = 64;
    let top = anchor.top - height - gap;
    if (top < topBarHeight) top = anchor.bottom + gap;
    const left = Math.min(Math.max(anchor.centerX - width / 2, 8), window.innerWidth - width - 8);
    setPos({ top: Math.min(top, window.innerHeight - height - 8), left });
  }, [anchor]);

  return (
    <div
      ref={ref}
      className="floating-toolbar"
      role="toolbar"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      // Keep the text selection alive while pressing toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className="toolbar-button" onClick={onClick}>
      <Icon path={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

export function SelectionToolbar({
  anchor,
  onHighlight,
  onCopy,
  onMeaning,
}: {
  anchor: ToolbarAnchor;
  onHighlight: () => void;
  onCopy: () => void;
  onMeaning: () => void;
}) {
  return (
    <FloatingToolbar anchor={anchor}>
      <ToolbarButton icon={mdiMarker} label={S.highlight} onClick={onHighlight} />
      <ToolbarButton icon={mdiContentCopy} label={S.copy} onClick={onCopy} />
      <ToolbarButton icon={mdiBookOpenVariant} label={S.meaning} onClick={onMeaning} />
    </FloatingToolbar>
  );
}

/** Recolour / categorise / remove one (possibly multi-verse) highlight. */
export function HighlightToolbar({
  anchor,
  highlights,
  onClose,
  onColorChanged,
  onCategory,
}: {
  anchor: ToolbarAnchor;
  highlights: Highlight[];
  onClose: () => void;
  onColorChanged: (color: string) => void;
  onCategory: () => void;
}) {
  const ids = highlights.map((h) => h.id);
  const current = highlights[0]?.color;

  useLayoutEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.floating-toolbar, mark')) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <FloatingToolbar anchor={anchor}>
      <div className="swatches">
        {Object.entries(HIGHLIGHT_COLORS).map(([name, color]) => (
          <button
            key={name}
            type="button"
            className="color-swatch small"
            style={{ background: color }}
            aria-label={name}
            aria-pressed={color === current}
            onClick={async () => {
              await setHighlightsColor(ids, color);
              onColorChanged(color);
            }}
          >
            {color === current && <Icon path={mdiCheck} size={16} />}
          </button>
        ))}
      </div>
      <ToolbarButton icon={mdiTagOutline} label={S.category} onClick={onCategory} />
      <ToolbarButton
        icon={mdiDeleteOutline}
        label={S.delete}
        onClick={async () => {
          await deleteHighlights(ids);
          showToast(S.deleteHighlightSuccess, 'success');
          onClose();
        }}
      />
    </FloatingToolbar>
  );
}
