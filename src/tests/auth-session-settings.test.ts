import { describe, expect, it } from 'vitest'
import { parseSessionSettings } from '$lib/auth/session-settings'

describe('session settings validation', () => {
  it.each(['null', '[]', 'true', '42', '"text"', '{"admin":true}'])(
    'falls back safely for valid JSON with invalid preference shape: %s',
    raw => {
      const settings = parseSessionSettings(raw, raw)
      expect(settings.preferences).toMatchObject({ allowMachineTranslation: false })
      expect(settings.experimental).toBeTypeOf('object')
      expect(settings.experimental).not.toBeNull()
    },
  )

  it('preserves valid saved choices', () => {
    const preferences = {
      fallbackLocales: ['zhHant'],
      allowMachineTranslation: true,
      admin: { isPrimaryPanelCollapsed: true },
    }
    const experimental = { contributorMode: true, noLabelsMode: false }
    expect(
      parseSessionSettings(JSON.stringify(preferences), JSON.stringify(experimental)),
    ).toEqual({ preferences, experimental })
  })

  it('accepts already decoded settings without resetting them', () => {
    expect(
      parseSessionSettings({ isTranslateButtonVisible: false }, { noLabelsMode: true }),
    ).toEqual({
      preferences: { isTranslateButtonVisible: false },
      experimental: { noLabelsMode: true },
    })
  })

  it('keeps malformed JSON from breaking session creation', () => {
    expect(() => parseSessionSettings('{', '{')).not.toThrow()
  })
})
