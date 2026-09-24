import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Smoke config — LIVE-API contract tests only (routingService.smoke.test.ts).
 * Run with `npm run test:smoke`. These hit the real OSRM / Nominatim servers
 * once each; keep them out of hermetic CI jobs.
 *
 * Environment is `node`, not jsdom: in jsdom workers vitest mixes Node's
 * undici fetch with jsdom's AbortController, and undici rejects foreign
 * AbortSignals ("Expected signal to be an instance of AbortSignal"). The
 * node environment keeps fetch + AbortSignal in one realm. routingService
 * only touches `window`/`localStorage` for caching, so two tiny shims below
 * are enough.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    css: false,
    include: ['src/**/*.smoke.test.ts'],
    // Real network involved — fail fast instead of hanging the run.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./src/test/smoke-setup.ts'],
  },
})
