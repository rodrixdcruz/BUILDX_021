/**
 * Theme service — light/dark/system theme state for HealthGrid.
 *
 * - The resolved theme is applied as `data-theme="light|dark"` on
 *   <html>; styles.css keys dark overrides off that attribute.
 * - `system` (the default) follows `prefers-color-scheme` live via a
 *   media-query listener — no reload needed when the OS flips.
 * - A manual choice (light/dark) is persisted in localStorage and wins
 *   over the OS until the user returns to "system".
 * - `subscribeTheme()` lets non-CSS consumers (the Leaflet tile layer,
 *   which cannot switch via CSS alone) re-render when the RESOLVED theme
 *   changes — whether by toggle, OS flip, or another tab.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'nhg.theme'

let currentChoice: ThemeChoice | null = null
const listeners = new Set<(resolved: ResolvedTheme) => void>()
const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

/** True when the OS currently prefers dark (regardless of the user choice). */
export function systemPrefersDark(): boolean {
  return media?.matches ?? false
}

/** The stored manual choice; 'system' when unset/invalid. */
export function getThemeChoice(): ThemeChoice {
  if (currentChoice) return currentChoice
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    currentChoice = raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    currentChoice = 'system'
  }
  return currentChoice
}

/** Resolve the effective theme from the choice + OS preference. */
export function resolveTheme(choice: ThemeChoice = getThemeChoice()): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return choice
}

/** Applies `data-theme` to <html> and returns the resolved theme. */
export function applyTheme(choice: ThemeChoice = getThemeChoice()): ResolvedTheme {
  const resolved = resolveTheme(choice)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved)
  }
  return resolved
}

/**
 * Sets the theme choice, persists it (except 'system', which is the
 * absence of a choice), applies it to the DOM and notifies subscribers
 * when the RESOLVED theme actually changed.
 */
export function setThemeChoice(choice: ThemeChoice): ResolvedTheme {
  currentChoice = choice
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    /* private mode etc. — in-memory choice still applies */
  }
  const before = document.documentElement.getAttribute('data-theme')
  const resolved = applyTheme(choice)
  if (before !== resolved) notifyListeners(resolved)
  return resolved
}

function notifyListeners(resolved: ResolvedTheme): void {
  for (const l of [...listeners]) {
    try {
      l(resolved)
    } catch {
      listeners.delete(l) // broken consumer never breaks the fanout
    }
  }
}

/**
 * Subscribe to RESOLVED-theme changes (toggle, OS flip in system mode, or
 * a change from another tab). Fires once with the current value on
 * subscribe — ideal for React effects. Returns an unsubscribe function.
 */
export function subscribeTheme(listener: (resolved: ResolvedTheme) => void): () => void {
  listeners.add(listener)
  // OS-level flips (only relevant in 'system' mode, but cheap to always track).
  media?.addEventListener?.('change', onSystemChange)
  listener(resolveTheme())
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) media?.removeEventListener?.('change', onSystemChange)
  }
}

function onSystemChange(): void {
  if (getThemeChoice() !== 'system') return
  const resolved = applyTheme('system')
  notifyListeners(resolved)
}

/** Cross-tab sync: another tab's choice applies here too. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    currentChoice = null // force re-read from storage
    const resolved = applyTheme()
    notifyListeners(resolved)
  })
  // Initial paint: resolve before React mounts (main.tsx imports this
  // module transitively via components, so first render is already themed).
  applyTheme()
}

/** Test seam: reset in-memory state. */
export function resetThemeForTests(): void {
  currentChoice = null
  listeners.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-theme')
  }
}
