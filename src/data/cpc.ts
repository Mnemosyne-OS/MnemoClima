/**
 * cpc.ts — the CPC's monthly ENSO Diagnostic Discussion: its alert status, its date, its
 * synopsis. This is the forecast the cartridge shows; it never makes one of its own (doc 147 §2).
 *
 * The page is HTML written by people. Three fields are read by their labels; a field not found
 * is null and the screen says it could not be read, it never says "no alert".
 */
export const CPC_DISCUSSION_URL = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml';

export type AlertKind = 'elninoAdvisory' | 'elninoWatch' | 'laninaAdvisory' | 'laninaWatch' | 'finalElnino' | 'finalLanina' | 'notActive' | 'other';

export interface Discussion {
  /** ISO date of issue, e.g. 2026-10-08. */
  issued: string | null;
  /** The status exactly as the CPC wrote it ("El Niño Advisory"). */
  status: string | null;
  kind: AlertKind | null;
  /** The synopsis' first sentence(s), in the CPC's words. */
  synopsis: string | null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** The HTML as lines of plain text, entities decoded. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|td|tr|h\d|li|span|b|strong)>/gi, '\n')
    .replace(/<[^>]*>/g, '\n');
  return decodeEntities(text).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", deg: '°', ntilde: 'ñ', Ntilde: 'Ñ' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return named[code] ?? named[code.toLowerCase()] ?? all;
  });
}

export function classify(status: string): AlertKind {
  const s = status.toLowerCase().replace(/ñ/g, 'n');
  if (s.includes('not active')) return 'notActive';
  const nino = s.includes('el nino'), nina = s.includes('la nina');
  if (s.includes('final') && nino) return 'finalElnino';
  if (s.includes('final') && nina) return 'finalLanina';
  if (nino && s.includes('advisory')) return 'elninoAdvisory';
  if (nino && s.includes('watch')) return 'elninoWatch';
  if (nina && s.includes('advisory')) return 'laninaAdvisory';
  if (nina && s.includes('watch')) return 'laninaWatch';
  return 'other';
}

/** `8 October 2026` → `2026-10-08`. */
export function parseIssued(line: string): string | null {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(line.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The discussion's date, status and synopsis; each one not found is null, never a guess. */
export function parseDiscussion(html: string): Discussion {
  const lines = htmlToLines(html);
  let issued: string | null = null;
  let status: string | null = null;
  let synopsis: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!issued && /^issued by$/i.test(l)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4) && !issued; j++) issued = parseIssued(lines[j]!);
    }
    if (!status && /^ENSO Alert System Status:?/i.test(l)) {
      const rest = l.replace(/^ENSO Alert System Status:?\s*/i, '');
      status = rest || (lines[i + 1] ?? null);
    }
    if (!synopsis && /^Synopsis:?/i.test(l)) {
      const rest = l.replace(/^Synopsis:?\s*/i, '');
      synopsis = rest || (lines[i + 1] ?? null);
    }
  }
  return { issued, status, kind: status ? classify(status) : null, synopsis };
}
