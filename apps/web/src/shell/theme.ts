import { useSyncExternalStore } from 'react'

export type ResolvedTheme = 'light' | 'dark'

interface ThemeApi {
  resolved?: ResolvedTheme
  set?(pref: 'system' | 'light' | 'dark'): void
}

function api(): ThemeApi | undefined {
  return (window as unknown as { dashhq?: { theme?: ThemeApi } }).dashhq?.theme
}

export function currentTheme(): ResolvedTheme {
  const fromShell = api()?.resolved
  if (fromShell) return fromShell
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function subscribe(cb: () => void): () => void {
  document.addEventListener('dashhq-theme', cb)
  return () => document.removeEventListener('dashhq-theme', cb)
}

/** The resolved theme, following the family's `dh_theme` choice. Charts and maps read this. */
export function useTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}

export function setThemePreference(pref: 'system' | 'light' | 'dark'): void {
  api()?.set?.(pref)
}
