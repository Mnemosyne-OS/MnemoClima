/**
 * words.ts — the translator type the panels share, and the words of the three source states.
 * Out of the .tsx files: a component file that also exports values is reloaded whole by Fast
 * Refresh on every save.
 */
import type { Key } from '../i18n/strings';

export type T = (key: Key, vars?: Record<string, string | number>) => string;

export function sourceWords(t: T) {
  return {
    loading: t('src.loading'),
    failed: (why: string) => t('src.failed', { why }),
    triedAt: (iso: string) => t('src.triedAt', { time: new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
    retry: t('src.retry'),
    dropped: (n: number) => t('src.dropped', { n }),
  };
}
