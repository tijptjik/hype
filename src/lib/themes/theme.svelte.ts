// SVELTE
import { getContext, setContext, onMount } from 'svelte'
// THEME
import { isThemeId, resolveTheme, THEME_COOKIE } from './themes'
import { isMapStyleKey, type MapStyleKey } from '#lib/map/styles/registry.js'
// TYPES
import type { ThemeId } from './themes.types'

const key = Symbol('theme')
const MAP_STYLE_STORAGE_KEY = 'hype-map-style'

/** Instance-local theme state; preview components use their own controlled selection. */
export class ThemeModel {
  selected: ThemeId = $state('hype-black')
  mapSelected: MapStyleKey | null = $state(null)

  /**
   * Selects a basemap independently of the UI palette and saves it on this host.
   * @param style - Registered map style, or null to follow the active project's style.
   * @returns Nothing.
   */
  selectMap = (style: MapStyleKey | null): void => {
    if (style !== null && !isMapStyleKey(style)) return
    this.mapSelected = style
    try {
      if (style) localStorage.setItem(MAP_STYLE_STORAGE_KEY, style)
      else localStorage.removeItem(MAP_STYLE_STORAGE_KEY)
    } catch {
      // Keep the current selection usable when browser storage is unavailable.
    }
  }

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
    // biome-ignore lint/suspicious/noDocumentCookie: Theme selection must persist across server-rendered page loads.
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
    try {
      const stored = localStorage.getItem(MAP_STYLE_STORAGE_KEY)
      if (stored && isMapStyleKey(stored)) model.mapSelected = stored
    } catch {
      // Storage restrictions should not prevent the default map from rendering.
    }
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
