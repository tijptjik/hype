import { describe, expect, it } from 'vitest'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import {
  localAddressContent,
  localAddressDisplayOverrides,
} from '#lib/addresses/locationDraft.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'

describe('Location complete display labels', () => {
  it('retains an explicit label across materialization without losing structured fields', () => {
    const draft = emptyFeatureAddress()
    draft.coordinates = [114, 22]
    draft.overrides.en = {
      streetName: 'Test Street',
      formattedAddress: 'Use the side entrance',
    }
    const identity = localIdentityFromAddress(
      'establishment',
      { en: 'Test shop' },
      draft,
    )
    const restored = {
      ...emptyFeatureAddress(),
      source: identity.facts.location.address,
    }
    expect(getAddressDisplay(restored, 'en')).toBe('Use the side entrance')
    expect(localAddressContent(draft).i18n.en.streetName).toBe('Test Street')
  })
  it('preserves explicit clears and removes retained labels after a component edit', () => {
    const draft = emptyFeatureAddress()
    draft.source.displayOverrides = { en: 'Old complete label', 'zh-hant': '保留' }
    draft.overrides.en = { streetName: 'New Street' }
    expect(localAddressDisplayOverrides(draft)).toEqual({ 'zh-hant': '保留' })
    draft.overrides.en.formattedAddress = ''
    expect(localAddressDisplayOverrides(draft)).toEqual({ en: '', 'zh-hant': '保留' })
  })
})
