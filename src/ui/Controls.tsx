/**
 * Controls — the few pieces every MnemoClima screen is built from (Tony, 11/10: « real nice
 * buttons, a panel easy to understand to turn things on and off »).
 *
 *  - `Switch`: an on/off a person reads at a glance. Glass track, green when on (skill
 *    style-cartouche §2), the name and one line of state next to it, the whole row clickable.
 *  - `Popover`: a glass panel under its button; a click anywhere else or Escape closes it.
 *    The outside click is heard on `pointerdown` in capture, because a canvas that pans calls
 *    preventDefault and no `mousedown` ever arrives (doc 59 §6.7).
 */
import { useEffect, useRef, type ReactNode } from 'react';

export function Switch(p: { on: boolean; onChange: (on: boolean) => void; label: string; icon?: string; detail?: ReactNode; disabled?: boolean; tone?: 'error' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.on}
      disabled={p.disabled}
      className={`switch-row${p.on ? ' on' : ''}`}
      onClick={() => p.onChange(!p.on)}
    >
      {p.icon && <span className="switch-icon" aria-hidden>{p.icon}</span>}
      <span className="switch-text">
        <span className="switch-label">{p.label}</span>
        {p.detail != null && <span className={`switch-detail${p.tone === 'error' ? ' error' : ''}`}>{p.detail}</span>}
      </span>
      <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
    </button>
  );
}

export function Popover(p: { open: boolean; onClose: () => void; children: ReactNode; className?: string; anchor: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || p.anchor.current?.contains(t)) return;
      p.onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [p.open, p.onClose, p.anchor]);
  if (!p.open) return null;
  return <div ref={ref} className={`popover glass ${p.className ?? ''}`} role="dialog">{p.children}</div>;
}

/** A glass button with an icon and a word, the house's main action shape. */
export function Pill(p: { icon: string; label: string; onClick: () => void; active?: boolean; primary?: boolean; title?: string; disabled?: boolean; refEl?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={p.refEl}
      type="button"
      className={`pill-btn${p.active ? ' active' : ''}${p.primary ? ' primary' : ''}`}
      aria-pressed={p.active}
      title={p.title ?? p.label}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      <span aria-hidden>{p.icon}</span>
      <span className="pill-label">{p.label}</span>
    </button>
  );
}
