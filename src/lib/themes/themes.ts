// TYPES
import type { ThemeId, ThemeDefinition } from './themes.types'

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'hype-black', name: 'Nullspace', mode: 'dark', family: 'Hype' },
  { id: 'hype-dark', name: 'Nebula', mode: 'dark', family: 'Hype' },
  { id: 'hype-light', name: 'Oblivion', mode: 'light', family: 'Hype' },
  { id: 'breadline-light', name: 'Milque', mode: 'light', family: 'Breadline' },
  { id: 'breadline-dark', name: 'Rye', mode: 'dark', family: 'Breadline' },
]
export const THEME_COOKIE = 'hype-theme'

/**
 * Checks a persisted theme identifier against the supported catalog.
 * @param value - Untrusted cookie or storage value.
 * @returns Whether the value is a supported theme.
 */
export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(theme => theme.id === value)
}

/**
 * Resolves an explicit preference before the hub's default theme.
 * @param preference - Optional persisted user selection.
 * @param hostname - Current host or configured hub domain.
 * @returns Milque for Breadline, otherwise Nebula, unless explicitly selected.
 */
export function resolveTheme(preference: unknown, hostname = ''): ThemeId {
  if (isThemeId(preference)) return preference
  const host = hostname
    .toLowerCase()
    .split(':')[0]
    .replace(/^www\./, '')
  return host === 'breadline.hk' ? 'breadline-light' : 'hype-dark'
}
