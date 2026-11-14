// TESTS
import { describe, expect, it } from 'vitest'
// ADDRESS
import { parseAddressContent } from '#lib/addresses/parseAddress.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import {
  localAddressDraft,
  prepareLocalLocationAddress,
} from '#lib/addresses/locationDraft.js'

describe('MTR station shop addresses', () => {
  it.each(['Shop NAC 19', 'Shop NAC19', 'NAC19', 'NAC 19', 'shop nac19'])(
    'extracts %s without retaining a duplicate number',
    reference => {
      const source = { en: `${reference}, MTR Nam Cheong Station` }
      const parsed = parseAddressContent(source)
      expect(parsed.content.unit).toMatchObject({ unitType: 'S', unitRef: '19' })
      expect(parsed.content.i18n.en.formattedAddress).toBe('MTR Nam Cheong Station')
      expect(parsed.source).toEqual(source)
      expect(getAddressDisplay(localAddressDraft(parsed.content), 'en')).toBe(
        'Shop 19, MTR Nam Cheong Station',
      )
    },
  )
  it('uses the existing station mapping and preserves alphanumeric shop numbers', () => {
    const parsed = parseAddressContent({ en: 'Shop ADM12A, MTR Admiralty Station' })
    expect(parsed.content.unit).toMatchObject({ unitType: 'S', unitRef: '12A' })
  })
  it.each(['Shop XYZ19, MTR Station', 'Shop NAC19, Shopping Centre'])(
    'does not strip unrelated prefixes in %s',
    text => {
      const parsed = parseAddressContent({ en: text })
      expect(parsed.content.unit?.unitRef).not.toBe('19')
      expect(parsed.source.en).toBe(text)
    },
  )
  it('keeps multilingual unit conflicts for review', () => {
    const parsed = parseAddressContent({
      en: 'Shop NAC19, MTR Nam Cheong Station',
      'zh-hant': '地下20舖',
    })
    expect(parsed.content.unit).toBeNull()
    expect(parsed.diagnostics.length).toBeGreaterThan(0)
  })
  it('fixes the retained-address editor preview without modifying its source', () => {
    const address = emptyFeatureAddress()
    address.source.fallbackDisplay = { en: 'Shop NAC 19, MTR Nam Cheong Station' }
    const preview = localAddressDraft(prepareLocalLocationAddress(address))
    expect(getAddressDisplay(preview, 'en')).toBe('Shop 19, MTR Nam Cheong Station')
    expect(address.source.fallbackDisplay.en).toBe(
      'Shop NAC 19, MTR Nam Cheong Station',
    )
  })
})
