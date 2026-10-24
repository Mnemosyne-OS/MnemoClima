/**
 * Source — the three states of anything read from the web (rule 11), in one place: reading,
 * could not read (why, and a retry), read (and its content).
 */
import type { ReactNode } from 'react';
import type { Loadable } from './useClimate';

export function Source<T>(p: {
  of: Loadable<T>;
  retry?: () => void;
  words: { loading: string; failed: (why: string) => string; retry: string; dropped: (n: number) => string; triedAt?: (iso: string) => string };
  children: (data: T) => ReactNode;
}) {
  if (p.of.status === 'loading') return <div className="muted small" role="status">{p.words.loading}</div>;
  if (p.of.status === 'error') {
    return (
      <div className="error-line" role="alert">
        <span>{p.words.failed(p.of.error)}{p.of.at && p.words.triedAt ? ` · ${p.words.triedAt(p.of.at)}` : ''}</span>
        {p.retry && <button type="button" className="small-btn" onClick={p.retry}>{p.words.retry}</button>}
      </div>
    );
  }
  return (
    <>
      {p.children(p.of.data)}
      {p.of.dropped > 0 && <div className="muted small">{p.words.dropped(p.of.dropped)}</div>}
    </>
  );
}
