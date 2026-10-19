// SVELTE
import { getContext, setContext, onMount } from 'svelte'
// THEME
import {
  isThemeId,
  resolveTheme,
  THEME_COOKIE,
  THEME_MAP_STYLES,
  THEMES,
} from './themes'
import type { ThemePreferences } from './preferences'
import { isMapStyleKey, type MapStyleKey } from '#lib/map/styles/registry.js'
// TYPES
import type { ThemeId } from './themes.types'

const key = Symbol('theme')
const MAP_STYLE_STORAGE_KEY = 'hype-map-style'
const MAP_SYNC_STORAGE_KEY = 'hype-sync-ui-map-styles'
const MAP_ACTIVE_STORAGE_KEY = 'hype-use-active-map-style'

/** Instance-local theme state; preview components use their own controlled selection. */
export class ThemeModel {
  selected: ThemeId = $state('hype-black')
  mapSelected: MapStyleKey | null = $state(null)
  mapSyncEnabled: boolean = $state(false)
  useActiveMapStyle: boolean = $state(true)
  private activeMapStyle: string | null = $state(null)
  private activeMapIdentity = ''
  private mapSource: 'preference' | 'active' = $state('active')

  /** Account persistence subscribes only to explicit choices, never automatic resource changes. */
  onPreferencesChange: ((preferences: ThemePreferences) => void) | null = null
  private queuedListener: ((preferences: ThemePreferences) => void) | null = null
  private restoring = false

  /** Returns user choices, excluding transient resource overrides. @returns Account appearance settings. */
  get preferences(): ThemePreferences {
    return {
      uiTheme: this.selected,
      mapStyle: this.mapSelected,
      syncUiAndMap: this.mapSyncEnabled,
      useActiveMapStyle: this.useActiveMapStyle,
    }
  }

  /** Coalesces one UI action's related changes. @returns Nothing. */
  private notifyPreferencesChanged(): void {
    const listener = this.onPreferencesChange
    if (this.restoring || !listener || this.queuedListener === listener) return
    this.queuedListener = listener
    queueMicrotask(() => {
      if (this.queuedListener !== listener) return
      this.queuedListener = null
      if (this.onPreferencesChange === listener) listener(this.preferences)
    })
  }

  /**
   * Restores account choices without treating hydration as a user edit.
   * @param preferences - Validated saved appearance settings.
   * @returns Nothing.
   * @remarks Account state replaces browser caches, while active resource styles remain transient.
   */
  applyPreferences = (preferences: ThemePreferences): void => {
    this.restoring = true
    try {
      this.mapSyncEnabled = false
      this.select(preferences.uiTheme)
      this.applyMapSelection(preferences.mapStyle)
      this.setUseActiveMap(preferences.useActiveMapStyle)
      this.mapSyncEnabled = preferences.syncUiAndMap
      try {
        localStorage.setItem(MAP_SYNC_STORAGE_KEY, String(preferences.syncUiAndMap))
      } catch {
        // Account preferences still apply when local storage is unavailable.
      }
    } finally {
      this.restoring = false
    }
  }

  /** Current effective map style; a layer's User Preference falls back to the user's choice. */
  get resolvedMapStyle(): string {
    return this.useActiveMapStyle && this.mapSource === 'active' && this.activeMapStyle
      ? this.activeMapStyle
      : (this.mapSelected ?? THEME_MAP_STYLES[this.selected])
  }

  /**
   * Applies a resource style after the active layer/project selection changes.
   * @param identity - Stable resource-selection identity.
   * @param style - Resource style, or null to use the user's preference.
   * @returns Nothing.
   * @remarks A later UI selection wins until the resource context changes again.
   */
  updateActiveMapContext = (identity: string, style: string | null): void => {
    if (identity === this.activeMapIdentity && style === this.activeMapStyle) return
    const changedSelection = identity !== this.activeMapIdentity
    this.activeMapIdentity = identity
    this.activeMapStyle = style
    if (this.useActiveMapStyle && changedSelection) this.mapSource = 'active'
  }

  /**
   * Selects a basemap independently of the UI palette and saves it on this host.
   * @param style - Registered map preference, or null to enable resource map styles.
   * @returns Nothing.
   */
  selectMap = (style: MapStyleKey | null): void => {
    if (style === null) {
      this.setUseActiveMap(true)
      return
    }
    if (!isMapStyleKey(style)) return
    this.setMapSync(false)
    this.setUseActiveMap(false)
    this.applyMapSelection(style)
    this.mapSource = 'preference'
    this.notifyPreferencesChanged()
  }

  /**
   * Applies a basemap without changing the current synchronization mode.
   * @param style - Registered style, or null to follow the active map.
   * @returns Nothing.
   */
  private applyMapSelection = (style: MapStyleKey | null): void => {
    this.mapSelected = style
    try {
      if (style) localStorage.setItem(MAP_STYLE_STORAGE_KEY, style)
      else localStorage.removeItem(MAP_STYLE_STORAGE_KEY)
    } catch {
      // Keep the current selection usable when browser storage is unavailable.
    }
  }

  /**
   * Enables or disables UI-driven map selection and saves the choice on this host.
   * @param enabled - Whether map styles should follow UI palette changes.
   * @returns Nothing.
   * @remarks Disabling sync retains the current map as an independent selection.
   */
  setMapSync = (enabled: boolean): void => {
    this.mapSyncEnabled = enabled
    if (enabled) {
      this.applyMapSelection(THEME_MAP_STYLES[this.selected])
      this.mapSource = 'preference'
    }
    try {
      localStorage.setItem(MAP_SYNC_STORAGE_KEY, String(enabled))
      localStorage.setItem(MAP_ACTIVE_STORAGE_KEY, String(this.useActiveMapStyle))
    } catch {
      // Keep synchronization usable when browser storage is unavailable.
    }
    this.notifyPreferencesChanged()
  }

  /**
   * Enables or disables resource map styles independently of UI synchronization.
   * @param enabled - Whether layer/project changes may override the user's map preference.
   * @returns Nothing.
   * @remarks Disabling resource styles immediately returns to the user's preferred map.
   */
  setUseActiveMap = (enabled: boolean): void => {
    this.useActiveMapStyle = enabled
    this.mapSource = enabled ? 'active' : 'preference'
    try {
      localStorage.setItem(MAP_ACTIVE_STORAGE_KEY, String(enabled))
    } catch {
      // The current selection remains usable when browser storage is unavailable.
    }
    this.notifyPreferencesChanged()
  }

  /**
   * Restores host-local map preferences after the UI palette has been resolved.
   * @returns Nothing.
   * @remarks Existing installations retain independent map selection until sync is enabled.
   */
  restoreMapPreferences = (): void => {
    try {
      const stored = localStorage.getItem(MAP_STYLE_STORAGE_KEY)
      if (stored && isMapStyleKey(stored)) {
        this.mapSelected = stored
      }
      const activePreference = localStorage.getItem(MAP_ACTIVE_STORAGE_KEY)
      this.useActiveMapStyle =
        activePreference === null ? !stored : activePreference === 'true'
      if (localStorage.getItem(MAP_SYNC_STORAGE_KEY) === 'true') {
        this.setMapSync(true)
      }
      this.mapSource = this.useActiveMapStyle ? 'active' : 'preference'
    } catch {
      // Storage restrictions should not prevent the default map from rendering.
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
    if (this.mapSyncEnabled) {
      this.applyMapSelection(THEME_MAP_STYLES[theme])
      this.mapSource = 'preference'
    }
    try {
      localStorage.setItem(THEME_COOKIE, theme)
    } catch {
      // The cookie and account preference remain usable without local storage.
    }
    this.notifyPreferencesChanged()
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.colorScheme =
      THEMES.find(entry => entry.id === theme)?.mode ?? 'dark'
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
    let preference: unknown = document.documentElement.dataset.theme
    try {
      const cached = localStorage.getItem(THEME_COOKIE)
      if (isThemeId(cached)) preference = cached
    } catch {
      // Server-selected cookie/default remains available without browser storage.
    }
    model.select(resolveTheme(preference, location.hostname))
    model.restoreMapPreferences()
  })
  return model
}

/** Returns the root layout's theme adapter for application wiring. */
export function getThemeModel(): ThemeModel {
  return getContext<ThemeModel>(key)
}
