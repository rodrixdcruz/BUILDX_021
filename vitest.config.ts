import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Live-API contract checks live in routingService.smoke.test.ts and run
    // separately via `npm run test:smoke` — never from this hermetic suite.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.smoke.test.ts',
    ],
  },
})
