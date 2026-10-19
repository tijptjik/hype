// TESTING
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// THEME
import { ThemeModel } from '#lib/themes/theme.svelte.js'
import { ThemePreferenceSync } from '#lib/themes/preferencesSync.js'
import {
  ThemePreferencesSchema,
  type ThemePreferences,
} from '#lib/themes/preferences.js'
import { UserSelfProfileAPI } from '#lib/db/zod/schema/user.js'

const saved: ThemePreferences = {
  uiTheme: 'breadline-dark',
  mapStyle: 'midnight',
  syncUiAndMap: false,
  useActiveMapStyle: false,
}
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

/** Advances coalesced notifications and asynchronous writes. @returns Nothing. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** Creates a transport with controllable read/write behavior. @returns Test doubles. */
function transport(read = async (): Promise<ThemePreferences | null> => saved) {
  return {
    read: vi.fn(read),
    write: vi.fn(async (_settings: ThemePreferences) => {}),
    publish: vi.fn(),
    onError: vi.fn(),
  }
}

describe('account appearance synchronization', () => {
  it('restores account choices over browser choices without writing them back', async () => {
    const model = new ThemeModel()
    model.select('hype-light')
    model.setMapSync(true)
    const api = transport()
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    await settle()
    expect(model.preferences).toEqual(saved)
    expect(storage.get('hype-theme')).toBe('breadline-dark')
    expect(storage.get('hype-map-style')).toBe('midnight')
    expect(storage.get('hype-sync-ui-map-styles')).toBe('false')
    expect(storage.get('hype-use-active-map-style')).toBe('false')
    expect(api.write).not.toHaveBeenCalled()
    sync.dispose()
  })

  it('migrates browser preferences only when the account has none', async () => {
    const model = new ThemeModel()
    model.select('hype-light')
    model.setMapSync(true)
    const api = transport(async () => null)
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    expect(api.write).toHaveBeenCalledExactlyOnceWith(model.preferences)
    sync.dispose()
  })

  it('preserves a deliberate change made while account preferences are loading', async () => {
    const read = Promise.withResolvers<ThemePreferences | null>()
    const model = new ThemeModel()
    const api = transport(() => read.promise)
    const sync = new ThemePreferenceSync(model, api)
    const loading = sync.restore()
    model.select('hype-light')
    await settle()
    read.resolve(saved)
    await loading
    expect(model.selected).toBe('hype-light')
    expect(api.write).toHaveBeenCalledExactlyOnceWith(model.preferences)
    sync.dispose()
  })

  it('coalesces manual map changes and serializes rapid writes', async () => {
    const model = new ThemeModel()
    const api = transport()
    const firstWrite = Promise.withResolvers<void>()
    api.write.mockImplementationOnce(() => firstWrite.promise)
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    model.selectMap('hyperLight')
    await settle()
    expect(api.write).toHaveBeenCalledTimes(1)
    expect(api.write.mock.calls[0][0]).toMatchObject({
      mapStyle: 'hyperLight',
      syncUiAndMap: false,
      useActiveMapStyle: false,
    })
    model.setMapSync(true)
    model.select('breadline-light')
    await settle()
    expect(api.write).toHaveBeenCalledTimes(1)
    firstWrite.resolve()
    await settle()
    expect(api.write).toHaveBeenCalledTimes(2)
    expect(api.write.mock.calls[1][0]).toEqual(model.preferences)
    sync.dispose()
  })

  it('does not persist effective layer/project map overrides', async () => {
    const model = new ThemeModel()
    const api = transport()
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    model.updateActiveMapContext('layer-a', 'hyperpop')
    await settle()
    expect(api.write).not.toHaveBeenCalled()
    expect(model.preferences.mapStyle).toBe('midnight')
    sync.dispose()
  })

  it('does not overwrite unknown server settings after a failed read', async () => {
    const model = new ThemeModel()
    const api = transport(async () => {
      throw new Error('offline')
    })
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    expect(api.write).not.toHaveBeenCalled()
    expect(api.onError).toHaveBeenCalledOnce()
    model.select('hype-light')
    await settle()
    expect(api.write).toHaveBeenCalledExactlyOnceWith(model.preferences)
    sync.dispose()
  })

  it('rejects late reads and queued writes after the account changes', async () => {
    const read = Promise.withResolvers<ThemePreferences | null>()
    const model = new ThemeModel()
    const api = transport(() => read.promise)
    const sync = new ThemePreferenceSync(model, api)
    const loading = sync.restore()
    model.select('hype-light')
    sync.dispose()
    read.resolve(saved)
    await loading
    await settle()
    expect(model.selected).toBe('hype-light')
    expect(api.publish).not.toHaveBeenCalled()
    expect(api.write).not.toHaveBeenCalled()
  })

  it('reports write failures and retains the browser selection', async () => {
    const model = new ThemeModel()
    const api = transport()
    const sync = new ThemePreferenceSync(model, api)
    await sync.restore()
    api.write.mockRejectedValueOnce(new Error('offline'))
    model.select('hype-light')
    await settle()
    expect(api.onError).toHaveBeenCalledOnce()
    expect(storage.get('hype-theme')).toBe('hype-light')
    sync.dispose()
  })
})

describe('appearance preference schema', () => {
  it('defaults missing switches to enabled while preserving explicit false choices', () => {
    expect(
      ThemePreferencesSchema.parse({
        uiTheme: saved.uiTheme,
        mapStyle: saved.mapStyle,
      }),
    ).toEqual({ ...saved, syncUiAndMap: true, useActiveMapStyle: true })
    expect(ThemePreferencesSchema.parse(saved)).toEqual(saved)
  })

  it('round-trips through the self-profile JSON schema alongside other preferences', () => {
    expect(
      UserSelfProfileAPI.shape.preferences.parse(
        JSON.stringify({
          theme: saved,
          fallbackLocales: ['en'],
          admin: { isPrimaryPanelCollapsed: true },
        }),
      ),
    ).toMatchObject({
      theme: saved,
      fallbackLocales: ['en'],
      admin: { isPrimaryPanelCollapsed: true },
    })
  })

  it('ignores invalid appearance settings without dropping language settings', () => {
    expect(
      UserSelfProfileAPI.shape.preferences.parse(
        JSON.stringify({
          theme: { ...saved, uiTheme: 'unknown' },
          fallbackLocales: ['zh-hant'],
        }),
      ),
    ).toMatchObject({ fallbackLocales: ['zh-hant'], theme: undefined })
    expect(
      ThemePreferencesSchema.safeParse({ ...saved, mapStyle: 'unknown' }).success,
    ).toBe(false)
  })
})
