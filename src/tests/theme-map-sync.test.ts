// TESTING
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// THEME
import { ThemeModel } from '#lib/themes/theme.svelte.js'
import type { ThemeId } from '#lib/themes/themes.types.js'

let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('UI and map style synchronization', () => {
  it('does not persist project-only styles as global preferences', () => {
    const model = new ThemeModel()
    model.selectMap('noclit26')
    expect(model.mapSelected).toBeNull()
    storage.set('hype-map-style', 'noclit26')
    storage.set('hype-sync-ui-map-styles', 'false')
    model.restoreMapPreferences()
    expect(model.mapSelected).toBeNull()
    model.updateActiveMapContext('eln', 'noclit26')
    expect(model.resolvedMapStyle).toBe('noclit26')
    model.updateActiveMapContext('other', null)
    expect(model.resolvedMapStyle).not.toBe('noclit26')
  })

  it.each<[ThemeId, string]>([
    ['hype-black', 'hyper'],
    ['hype-dark', 'hyper'],
    ['hype-light', 'hyperLight'],
    ['breadline-light', 'breadline-light'],
    ['breadline-dark', 'breadline-dark'],
  ])('pairs %s immediately and when switching UI palettes', (theme, style) => {
    const model = new ThemeModel()
    model.select(theme)
    model.setMapSync(true)
    expect(model.mapSelected).toBe(style)
    model.select('hype-black')
    model.select(theme)
    expect(model.mapSelected).toBe(style)
    expect(model.mapSyncEnabled).toBe(true)
    expect(storage.get('hype-map-style')).toBe(style)
  })

  it('retains the current map when sync is disabled', () => {
    const model = new ThemeModel()
    model.setMapSync(true)
    model.setMapSync(false)
    model.select('breadline-light')
    expect(model.mapSelected).toBe('hyper')
  })

  it('lets UI sync and active resource styles coexist, with the most recent change taking priority', () => {
    const model = new ThemeModel()
    model.setUseActiveMap(true)
    model.updateActiveMapContext('layer-a', 'neorange')
    model.setMapSync(true)
    expect(model.mapSyncEnabled).toBe(true)
    expect(model.useActiveMapStyle).toBe(true)
    expect(model.resolvedMapStyle).toBe('hyper')
    model.updateActiveMapContext('layer-b', 'ghostery')
    expect(model.resolvedMapStyle).toBe('ghostery')
    model.select('hype-light')
    expect(model.resolvedMapStyle).toBe('hyperLight')
    // An unrelated reactive rerun must not undo the user's later UI selection.
    model.updateActiveMapContext('layer-b', 'ghostery')
    expect(model.resolvedMapStyle).toBe('hyperLight')
    model.updateActiveMapContext('layer-b', 'neorange')
    expect(model.resolvedMapStyle).toBe('hyperLight')
    model.updateActiveMapContext('layer-user-preference', null)
    expect(model.resolvedMapStyle).toBe('hyperLight')
    model.updateActiveMapContext('layer-c', 'neorange')
    expect(model.resolvedMapStyle).toBe('neorange')
    model.setUseActiveMap(false)
    expect(model.resolvedMapStyle).toBe('hyperLight')
    expect(model.mapSyncEnabled).toBe(true)
  })

  it('keeps manual map cards independent and can re-enable both switches', () => {
    const model = new ThemeModel()
    model.setMapSync(true)
    model.selectMap('midnight')
    expect(model.mapSyncEnabled).toBe(false)
    expect(model.useActiveMapStyle).toBe(false)
    expect(model.resolvedMapStyle).toBe('midnight')
    model.setUseActiveMap(true)
    model.setMapSync(true)
    expect(model.useActiveMapStyle).toBe(true)
    expect(model.mapSyncEnabled).toBe(true)
    const reloaded = new ThemeModel()
    reloaded.restoreMapPreferences()
    expect(reloaded.useActiveMapStyle).toBe(true)
    expect(reloaded.mapSyncEnabled).toBe(true)
  })

  it('persists the default active-map switch when sync is enabled for the first time', () => {
    const model = new ThemeModel()
    model.setMapSync(true)
    const reloaded = new ThemeModel()
    reloaded.restoreMapPreferences()
    expect(reloaded.useActiveMapStyle).toBe(true)
    expect(reloaded.mapSyncEnabled).toBe(true)
  })

  it('defaults both switches to enabled even with a legacy manual map preference', () => {
    storage.set('hype-map-style', 'midnight')
    const legacy = new ThemeModel()
    legacy.restoreMapPreferences()
    expect(legacy.mapSelected).toBe('hyper')
    expect(legacy.mapSyncEnabled).toBe(true)
    expect(legacy.useActiveMapStyle).toBe(true)
    legacy.setMapSync(true)
    const reloaded = new ThemeModel()
    reloaded.select('breadline-dark')
    reloaded.restoreMapPreferences()
    expect(reloaded.mapSyncEnabled).toBe(true)
    expect(reloaded.mapSelected).toBe('breadline-dark')
  })

  it('preserves explicitly disabled switches and the independent map on reload', () => {
    storage.set('hype-map-style', 'midnight')
    storage.set('hype-sync-ui-map-styles', 'false')
    storage.set('hype-use-active-map-style', 'false')
    const model = new ThemeModel()
    model.restoreMapPreferences()
    expect(model.mapSelected).toBe('midnight')
    expect(model.mapSyncEnabled).toBe(false)
    expect(model.useActiveMapStyle).toBe(false)
  })

  it('ignores invalid saved styles and works when storage is unavailable', () => {
    storage.set('hype-map-style', 'invalid-style')
    const model = new ThemeModel()
    model.restoreMapPreferences()
    expect(model.mapSelected).toBe('hyper')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Unavailable')
      },
      setItem: () => {
        throw new Error('Unavailable')
      },
      removeItem: () => {
        throw new Error('Unavailable')
      },
    })
    expect(() => model.restoreMapPreferences()).not.toThrow()
    model.setMapSync(true)
    model.select('hype-light')
    expect(model.mapSelected).toBe('hyperLight')
  })
})
