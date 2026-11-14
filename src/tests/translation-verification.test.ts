// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  isGeneratedTranslation,
  setGeneratedTranslation,
} from '#lib/i18n/verification.js'
import { getGenAiState, toggleGenAiField } from '#lib/client/services/form.js'

const acceptance = {
  origin: 'legacy-ai',
  value: 'Machine text',
  acceptedValue: 'Machine text',
  humanVerified: false,
  acceptedBy: 'reviewer',
  acceptedAt: '2026-11-01T00:00:00.000Z',
}

describe('explicit translation verification', () => {
  for (const field of [
    'name',
    'nameShort',
    'description',
    'privacyPolicy',
    'termsOfService',
    'subscriptionBenefits',
    'title',
    'label',
    'placeholder',
    'value',
  ]) {
    it(`toggles accepted ${field} both ways without changing text, publication or receipts`, () => {
      const original = {
        [field]: 'Machine text',
        [`${field}Gen`]: false,
        translationProvenance: { [field]: JSON.stringify(acceptance) },
        other: 'untouched',
      }
      const human = setGeneratedTranslation(original, field, false, true)
      expect(isGeneratedTranslation(human, field)).toBe(false)
      expect(human[field]).toBe(original[field])
      expect(human[`${field}Gen`]).toBe(false)
      expect(JSON.parse(human.translationProvenance[field])).toEqual({
        ...acceptance,
        humanVerified: true,
      })
      const machine = setGeneratedTranslation(human, field, true, true)
      expect(isGeneratedTranslation(machine, field)).toBe(true)
      expect(machine[field]).toBe(original[field])
      expect(machine[`${field}Gen`]).toBe(false)
      expect(JSON.parse(machine.translationProvenance[field])).toEqual(acceptance)
      expect(original.translationProvenance[field]).toBe(JSON.stringify(acceptance))
    })
  }
  it('does not treat the string false as generated', () => {
    expect(isGeneratedTranslation({ nameGen: 'false' }, 'name')).toBe(false)
    expect(isGeneratedTranslation({ nameGen: 'true' }, 'name')).toBe(true)
  })
  it('records explicit human verification of legacy generated text', () => {
    const human = setGeneratedTranslation(
      { name: 'Legacy', nameGen: true },
      'name',
      false,
    )
    expect(human).toMatchObject({
      name: 'Legacy',
      nameGen: false,
      translationProvenance: {
        name: {
          origin: 'legacy-ai',
          value: 'Legacy',
          acceptedValue: 'Legacy',
          humanVerified: true,
          acceptedBy: 'pending',
        },
      },
    })
  })
  it('uses canonical locale keys and retains the other locale', () => {
    let state = {
      data: {
        i18n: {
          zhHant: {
            name: 'Machine text',
            nameGen: false,
            translationProvenance: { name: JSON.stringify(acceptance) },
          },
          en: { name: 'English', nameGen: false },
        },
      },
    }
    const form = {
      fields: {
        value: () => state,
        set: (next: Partial<typeof state>) => {
          if (next.data) state = { data: next.data }
        },
      },
    }
    toggleGenAiField(form, 'zh-Hant', 'name')
    expect(getGenAiState(form, 'zh-Hant', 'name')).toBe(false)
    expect(state.data.i18n.en).toEqual({ name: 'English', nameGen: false })
    toggleGenAiField(form, 'zhHant', 'name')
    expect(getGenAiState(form, 'zh-Hant', 'name')).toBe(true)
  })
})
