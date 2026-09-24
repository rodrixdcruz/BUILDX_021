import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getThemeChoice,
  setThemeChoice,
  resolveTheme,
  applyTheme,
  subscribeTheme,
  resetThemeForTests,
  systemPrefersDark,
} from './themeService'

describe('themeService', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetThemeForTests()
  })

  it('defaults to system choice and a light resolution when the OS prefers light', () => {
    expect(getThemeChoice()).toBe('system')
    // jsdom's matchMedia is stubbed to matches:false in the test setup.
    expect(systemPrefersDark()).toBe(false)
    expect(resolveTheme()).toBe('light')
  })

  it('resolves dark when explicitly chosen regardless of the OS preference', () => {
    setThemeChoice('dark')
    expect(resolveTheme()).toBe('dark')
    expect(getThemeChoice()).toBe('dark')
  })

  it('persists a manual choice and clears it when returning to system', () => {
    setThemeChoice('dark')
    expect(window.localStorage.getItem('nhg.theme')).toBe('dark')
    setThemeChoice('system')
    expect(window.localStorage.getItem('nhg.theme')).toBeNull()
  })

  it('applies data-theme on <html> and notifies only on resolved changes', () => {
    const listener = vi.fn()
    const unsub = subscribeTheme(listener)
    expect(listener).toHaveBeenCalledWith('light')

    setThemeChoice('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(listener).toHaveBeenCalledWith('dark')

    // Setting the same resolved theme again must NOT re-notify.
    listener.mockClear()
    setThemeChoice('dark')
    expect(listener).not.toHaveBeenCalled()

    unsub()
  })

  it('stops notifying after unsubscribe (DOM still reflects the theme)', () => {
    const listener = vi.fn()
    const unsub = subscribeTheme(listener)
    listener.mockClear()
    unsub()
    setThemeChoice('dark')
    expect(listener).not.toHaveBeenCalled()
    // The document attribute still updates (visual state is global); only
    // this listener's notifications stop.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    setThemeChoice('system') // restore for other tests
  })

  it('applyTheme returns the resolved value for programmatic callers', () => {
    expect(applyTheme('dark')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(applyTheme('system')).toBe('light')
  })
})
