// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import { recorderFieldContent } from '#lib/db/services/recorderEditor.js'
// TYPES
import type { Property } from '#lib/db/zod/schema/property.types.js'

/** Build the relevant persisted field contract for codec coverage.
 * @param patch Field variation. @returns Test definition.
 */
function field(patch: Partial<Property> = {}): Property {
  return {
    id: 'test',
    key: 'test',
    type: 'specifier',
    dataType: 'text',
    component: 'InputField',
    cardinality: 'one',
    isTranslatable: false,
    values: [],
    ...patch,
  } as Property
}
describe('recorder field storage', () => {
  it('preserves false and zero while clearing null', () => {
    expect(
      recorderFieldContent(field({ dataType: 'boolean' }), false)?.selection.value,
    ).toBe('false')
    expect(
      recorderFieldContent(field({ dataType: 'number' }), 0)?.selection.value,
    ).toBe('0')
    expect(recorderFieldContent(field(), null)).toBeNull()
    expect(
      recorderFieldContent(
        field({ type: 'classifier', component: 'ToggleField', dataType: 'text' }),
        true,
      )?.selection.value,
    ).toBe('true')
  })
  it('validates selections and retains translations on edits', () => {
    const definition = field({
      type: 'classifier',
      cardinality: 'many',
      values: [{ id: 'a', value: 'A' }] as Property['values'],
    })
    expect(
      JSON.parse(recorderFieldContent(definition, ['a'])!.selection.valueJson!),
    ).toEqual({ version: 1, propertyValueIds: ['a'] })
    expect(() => recorderFieldContent(definition, ['missing'])).toThrow()
    const prior = {
      ...recorderFieldContent(field(), 'Old')!,
      translations: { zhHant: { value: '原文', generated: false } },
    }
    expect(
      recorderFieldContent(field({ isTranslatable: true }), 'New', prior)?.translations,
    ).toEqual({ ...prior.translations, en: { value: 'New', generated: false } })
  })
  it('rejects invalid dates, limits, links and ranges', () => {
    expect(() =>
      recorderFieldContent(field({ dataType: 'date' }), '2026-99-99'),
    ).toThrow()
    expect(() =>
      recorderFieldContent(field({ dataType: 'number', min: 0, max: 10 }), 11),
    ).toThrow()
    expect(() =>
      recorderFieldContent(
        field({ dataType: 'link' }),
        JSON.stringify({
          version: 1,
          items: [{ id: 'x', url: 'javascript:alert(1)', label: { en: 'Bad' } }],
        }),
      ),
    ).toThrow()
    expect(() =>
      recorderFieldContent(
        field({ dataType: 'timeRange', timeMaxHour: 36 }),
        JSON.stringify({ version: 1, start: 80, end: 50 }),
      ),
    ).toThrow()
  })
  it('encodes structured links, service-day ranges, dates and phone collections', () => {
    const links = JSON.stringify({
      version: 1,
      items: [{ id: 'x', url: 'https://example.com', label: { en: 'Reference' } }],
    })
    expect(
      recorderFieldContent(field({ dataType: 'link' }), links)?.selection.valueJson,
    ).toBe(links)
    const range = JSON.stringify({ version: 1, start: 1440, end: 1500 })
    expect(
      recorderFieldContent(field({ dataType: 'timeRange', timeMaxHour: 36 }), range)
        ?.selection.valueJson,
    ).toBe(range)
    expect(
      recorderFieldContent(field({ dataType: 'date' }), '2026-11-24')?.selection.value,
    ).toBe('2026-11-24')
    expect(
      recorderFieldContent(field({ component: 'PhoneField' }), '["+85212345678"]')
        ?.selection.value,
    ).toBe('["+85212345678"]')
  })
})
