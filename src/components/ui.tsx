import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { mdiAccount } from '@mdi/js';
import { useToasts } from '../state/toast';
import { S } from '../strings';

export function Icon({ path, size = 24, className }: { path: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  active?: boolean;
  /** Flip horizontally, e.g. arrows in RTL. */
  mirrored?: boolean;
};

export function IconButton({ icon, label, active, mirrored, className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
    >
      <Icon path={icon} className={mirrored ? 'mirrored' : undefined} />
    </button>
  );
}

/** Modal bottom sheet (centred dialog on wide screens), built on <dialog>. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      onClick={(e) => {
        // Clicks on the backdrop land on the <dialog> element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-body">
          <div className="sheet-handle" aria-hidden="true" />
          {title && <h2 className="sheet-title">{title}</h2>}
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  message,
  confirmLabel = S.confirm,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="button-row">
        <button type="button" className="button text" onClick={onCancel}>
          {S.cancel}
        </button>
        <button type="button" className={`button ${danger ? 'danger' : 'filled'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      <Icon path={icon} />
      <span>{label}</span>
    </button>
  );
}

export function EmptyState({ icon, title, subtitle, children }: { icon?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <Icon path={icon} size={56} />}
      <p className="empty-title">{title}</p>
      {subtitle && <p className="empty-subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function PoetAvatar({ name, imageUrl, size = 56 }: { name: string; imageUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="poet-avatar" style={{ width: size, height: size }}>
      {imageUrl && !failed ? (
        <img src={imageUrl} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon path={mdiAccount} size={size * 0.6} />
      )}
    </div>
  );
}

export function Chip({
  selected,
  color,
  onClick,
  children,
}: {
  selected?: boolean;
  color?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      style={color ? ({ '--chip-color': color } as CSSProperties) : undefined}
    >
      {color && <span className="chip-dot" />}
      {children}
    </button>
  );
}

export function LabelPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="label-pill" style={{ '--chip-color': color } as CSSProperties}>
      {name}
    </span>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Calls `onVisible` when the sentinel is (or scrolls) into view (infinite lists). */
export function LoadMoreSentinel({ onVisible, disabled, trigger }: { onVisible: () => void; disabled?: boolean; trigger?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    if (disabled || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    }, { rootMargin: '400px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
    // Re-observing after each page (trigger) re-fires if the sentinel is still on screen.
  }, [disabled, trigger]);
  return <div ref={ref} className="sentinel" />;
}
