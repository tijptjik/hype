// @vitest-environment node
import { expect, it } from 'vitest'
import { emptyFeatureAddress, getAddressLocale } from '#lib/addresses/featureAddress.js'
import {
  phaseEditorValue,
  setPhaseEditorValue,
  validPhaseReference,
} from '#lib/addresses/phaseEditor.js'

it('stores ordinal and named phases in the existing schema', () => {
  let address = setPhaseEditorValue(emptyFeatureAddress(), 'en', 'stage', 'IIIB')
  expect(getAddressLocale(address, 'en')).toMatchObject({
    phaseName: 'Stage',
    phaseRef: 'IIIB',
    phaseExpression: 'Stage IIIB',
  })
  expect(phaseEditorValue(address, 'en')).toEqual({ type: 'stage', value: 'IIIB' })
  address = setPhaseEditorValue(address, 'en', 'named', 'Ocean Vista')
  expect(getAddressLocale(address, 'en')).toMatchObject({
    phaseName: 'Ocean Vista',
    phaseRef: null,
    phaseExpression: 'Ocean Vista',
  })
  expect(phaseEditorValue(address, 'en')).toEqual({
    type: 'named',
    value: 'Ocean Vista',
  })
})
it('accepts ALS ordinal formats and preserves compound names', () => {
  for (const value of ['3', 'II', 'A', 'B', 'C', 'IIIB', '2A', '二'])
    expect(validPhaseReference(value)).toBe(true)
  for (const value of ['7 & 8', 'Ocean Vista', '2-3'])
    expect(validPhaseReference(value)).toBe(false)
  const address = setPhaseEditorValue(emptyFeatureAddress(), 'en', 'named', 'PH 7 & 8')
  expect(phaseEditorValue(address, 'en')).toEqual({ type: 'named', value: 'PH 7 & 8' })
})

it('preserves unrestricted typing and does not expand phase abbreviations', () => {
  for (const value of ['ph', 'Phonica', 'Stagecraft', 'Ocean Vista']) {
    const address = setPhaseEditorValue(emptyFeatureAddress(), 'en', 'stage', value)
    expect(phaseEditorValue(address, 'en')).toEqual({ type: 'named', value })
    expect(getAddressLocale(address, 'en').phaseRef).toBeNull()
  }
})

it('shares ordinal references between Chinese scripts but leaves named phases separate', () => {
  let address = setPhaseEditorValue(emptyFeatureAddress(), 'zhHant', 'phase', 'II')
  expect(phaseEditorValue(address, 'zhHans')).toEqual({ type: 'phase', value: 'II' })
  address = setPhaseEditorValue(address, 'zhHans', 'phase', '3')
  expect(phaseEditorValue(address, 'zhHant')).toEqual({ type: 'phase', value: '3' })
  address = setPhaseEditorValue(address, 'zhHant', 'named', '海洋')
  expect(phaseEditorValue(address, 'zhHans')).toEqual({ type: 'phase', value: '3' })
  address = setPhaseEditorValue(address, 'zhHans', 'phase', '4')
  expect(phaseEditorValue(address, 'zhHant')).toEqual({ type: 'named', value: '海洋' })
})
