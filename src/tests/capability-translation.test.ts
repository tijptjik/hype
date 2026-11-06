import { describe, expect, it, vi } from 'vitest'
import { translateCapabilityLabels } from '#lib/client/services/capabilityTranslation.js'

describe('capability label translation', () => {
  it('translates only populated sources with empty destinations without mutating the input', async () => {
    const definitions = {
      manageBakeries: { i18n: { en: 'Bakeries', zhHant: '' } },
      manageVolunteers: { i18n: { en: 'Volunteers', zhHant: 'Existing' } },
      manageDropOffs: { i18n: { en: ' ', zhHant: '' } },
    }
    const translate = vi.fn().mockResolvedValue(['麵包店'])
    expect(
      await translateCapabilityLabels(definitions, 'en', 'zhHant', translate),
    ).toEqual({ manageBakeries: '麵包店' })
    expect(translate).toHaveBeenCalledExactlyOnceWith('en', 'zhHant', ['Bakeries'])
    expect(definitions.manageBakeries.i18n.zhHant).toBe('')
  })
  it('does not request translation when there is nothing to fill', async () => {
    const translate = vi.fn()
    expect(await translateCapabilityLabels({}, 'en', 'zhHant', translate)).toEqual({})
    expect(
      await translateCapabilityLabels(
        { manageBakeries: { i18n: { en: 'Bakery' } } },
        'en',
        'en',
        translate,
      ),
    ).toEqual({})
    expect(translate).not.toHaveBeenCalled()
  })
  it('retains dynamic language identities when filling an added language', async () => {
    const translate = vi.fn().mockResolvedValue(['Doadores'])
    const definitions = {
      manageBakeries: { i18n: { ja: '寄付者', $locale_pt_BR: '', en: 'Existing' } },
    }
    expect(
      await translateCapabilityLabels(definitions, 'ja', '$locale_pt_BR', translate),
    ).toEqual({ manageBakeries: 'Doadores' })
    expect(translate).toHaveBeenCalledExactlyOnceWith('ja', '$locale_pt_BR', ['寄付者'])
    expect(definitions.manageBakeries.i18n.en).toBe('Existing')
  })
  it('propagates transport errors to the toolbar and ignores missing response values', async () => {
    const definitions = { manageBakeries: { i18n: { en: 'Bakeries' } } }
    expect(
      await translateCapabilityLabels(definitions, 'en', 'zhHant', async () => []),
    ).toEqual({})
    await expect(
      translateCapabilityLabels(definitions, 'en', 'zhHant', async () => {
        throw new Error('Offline')
      }),
    ).rejects.toThrow('Offline')
  })
})
