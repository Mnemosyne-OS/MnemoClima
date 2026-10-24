/**
 * devRelays.ts — DEV ONLY. The sources without CORS, relayed by Vite's dev server so the
 * cartridge can run on real data in a plain browser. Inside Mnemosyne the host's `social.fetch`
 * reads them, and a build never uses these (host.ts checks `import.meta.env.DEV`).
 */
export const DEV_RELAYS: Record<string, string> = {
  '/relay-cpc': 'https://www.cpc.ncep.noaa.gov',
  '/relay-psl': 'https://psl.noaa.gov',
  '/relay-giss': 'https://data.giss.nasa.gov',
  '/relay-erddap': 'https://coastwatch.pfeg.noaa.gov',
  '/relay-fews': 'https://fdw.fews.net',
  '/relay-upwell': 'https://upwell.pfeg.noaa.gov',
};

/** The relayed URL of a source, or null when the URL is not one of them. */
export function relayed(url: string): string | null {
  for (const [prefix, target] of Object.entries(DEV_RELAYS)) {
    if (url.startsWith(target + '/')) return prefix + url.slice(target.length);
  }
  return null;
}
