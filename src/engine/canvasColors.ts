/**
 * canvasColors.ts — the colours the canvases draw that are MnemoClima's own (El Niño red, La Niña
 * blue, the chosen green, the alert levels). A canvas cannot read `var(--…)`, so the tokens
 * declared in styles.css are read here, with the same values as fallbacks for a test or a
 * frame drawn before the stylesheet.
 */
export interface ClimaColors {
  nino: string;
  nina: string;
  chosen: string;
  red: string;
  orange: string;
  green: string;
  /** The coastline over coloured continents: a dark line under a light one. */
  coastDark: string;
  coastLight: string;
}

const FALLBACK: ClimaColors = { nino: '#ef4444', nina: '#3b82f6', chosen: '#3fa66a', red: '#ef4444', orange: '#f59e0b', green: '#22c55e', coastDark: 'rgba(8, 10, 16, 0.75)', coastLight: 'rgba(255, 255, 255, 0.85)' };

export function readClimaColors(el: Element = document.documentElement): ClimaColors {
  const css = getComputedStyle(el);
  const v = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  return {
    nino: v('--nino', FALLBACK.nino),
    nina: v('--nina', FALLBACK.nina),
    chosen: v('--g-chosen', FALLBACK.chosen),
    red: v('--level-red', FALLBACK.red),
    orange: v('--level-orange', FALLBACK.orange),
    green: v('--level-green', FALLBACK.green),
    coastDark: v('--coast-dark', FALLBACK.coastDark),
    coastLight: v('--coast-light', FALLBACK.coastLight),
  };
}
