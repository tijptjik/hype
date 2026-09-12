// SVELTE
import { getContext, setContext, onMount } from 'svelte'
// THEME
import { isThemeId, resolveTheme, THEME_COOKIE } from './themes'
// TYPES
import type { ThemeId } from './themes.types'

const key = Symbol('theme')

/** Instance-local theme state; preview components use their own controlled selection. */
export class ThemeModel {
  selected: ThemeId = $state('hype-dark')

  /**
   * Applies and persists an explicit selection on this host.
   * @param theme - Catalog identifier selected by the user.
   * @returns Nothing.
   */
  select = (theme: ThemeId): void => {
    if (!isThemeId(theme)) return
    this.selected = theme
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.colorScheme = theme.endsWith('-dark')
      ? 'dark'
      : 'light'
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme-canvas')
      .trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }
}

/**
 * Establishes theme state at the root layout, adopting the server-selected theme.
 * @returns The instance-local theme adapter.
 */
export function setThemeModel(): ThemeModel {
  const model = setContext(key, new ThemeModel())
  onMount(() => {
    model.selected = resolveTheme(
      document.documentElement.dataset.theme,
      location.hostname,
    )
  })
  return model
}

/** Returns the root layout's theme adapter for application wiring. */
export function getThemeModel(): ThemeModel {
  return getContext<ThemeModel>(key)
}
