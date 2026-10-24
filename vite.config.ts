import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_RELAYS } from './src/ui/devRelays';

// Standard configuration for Mnemosyne OS Cartridges
export default defineConfig({
  plugins: [react()],
  base: './', // Vital for custom protocols (mnemo-plugin://)
  server: {
    host: '127.0.0.1', // Forces IPv4 loopback binding for Electron compatibility
    port: 5238,        // Unique static port (range 5180+)
    strictPort: true,  // Fails fast if port is already in use
    cors: true,
    // DEV ONLY: in a plain browser the sources without CORS cannot be read (inside Mnemosyne the
    // host's social.fetch reads them). These relays let the cartridge run on real data in dev;
    // host.ts uses them only when it is outside the shell AND in dev. Never in a build.
    proxy: Object.fromEntries(Object.entries(DEV_RELAYS).map(([prefix, target]) => [
      prefix, { target, changeOrigin: true, rewrite: (p: string) => p.slice(prefix.length) },
    ])),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  // Vitest reads this block straight from the Vite config, which keeps the
  // cartridge free of a `vitest/config` import it cannot resolve on its own.
  // jsdom because a cartridge IS a browser surface: the tests worth writing
  // are the ones that render a panel with nothing on the other side of the
  // bridge, which is what a user sees when a permission is refused.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // {ts,tsx}, never `.test.ts` alone: a rendering test written in a .tsx
    // would be collected by NOBODY, and the suite would stay green while
    // never running it. Keep both extensions here and in tsconfig's exclude.
    include: ['src/**/*.test.{ts,tsx}']
  }
} as UserConfig & { test: Record<string, unknown> });
