// @vitest-environment node
import { expect, it } from 'vitest'
import {
  emptyFeatureAddress,
  getAddressPresentationLocale,
} from '#lib/addresses/featureAddress.js'
import { setAddressExpression } from '#lib/addresses/addressExpressions.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'

it.each(['buildingName', 'streetName', 'premisesName'] as const)(
  'keeps %s translations independent in editable fields',
  field => {
    const english = setAddressExpression(emptyFeatureAddress(), 'en', field, 'Name')
    const traditional = setAddressExpression(english, 'zhHant', field, '華坤樓')
    expect(addressComponentValue(traditional, 'zhHant', field)).toBe('華坤樓')
    expect(addressComponentValue(traditional, 'zhHans', field)).toBe('')
    expect(traditional.overrides['zh-hans']?.[field]).toBeUndefined()
    // Read-only address presentation can still derive its script fallback.
    expect(getAddressPresentationLocale(traditional, 'zhHans')[field]).toBe('华坤楼')

    const simplified = setAddressExpression(english, 'zhHans', field, '华坤楼')
    expect(addressComponentValue(simplified, 'zhHant', field)).toBe('')
    expect(addressComponentValue(simplified, 'zhHans', field)).toBe('华坤楼')

    const both = setAddressExpression(traditional, 'zhHans', field, '独立名称')
    expect(addressComponentValue(both, 'zhHant', field)).toBe('華坤樓')
    expect(addressComponentValue(both, 'zhHans', field)).toBe('独立名称')
    expect(addressComponentValue(both, 'en', field)).toBe('Name')
  },
)
