/**
 * Setup for the LIVE smoke suite (vitest.smoke.config.ts, node environment).
 *
 * routingService uses `window.setTimeout`/`clearTimeout` and a
 * `localStorage` mirror. Under the node environment there is no `window`,
 * so we provide minimal shims over the Node globals. `globalThis.fetch`,
 * `AbortController` and `AbortSignal.timeout` are native Node here — and
 * crucially in the SAME realm, which is the whole reason the smoke suite
 * runs under node (jsdom mixes undici fetch with jsdom AbortController and
 * undici rejects foreign signals).
 */

type Store = Map<string, string>
const store: Store = new Map()

const storage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

const windowShim = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: unknown) => clearTimeout(id as number),
  localStorage: storage,
}

;(globalThis as unknown as { window: unknown }).window = windowShim
;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
