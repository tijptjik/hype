import { describe, expect, it } from 'vitest'
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
  templateCasesTag,
  templatePairTag,
  templatePropertyTag,
} from '../lib/templates/displayTemplate'

const establishment =
  '{{ pair(format.name ?? brand.name, branch, " - ") ?? source.name }}'
describe('localized display language', () => {
  it('prefers the full format, pairs only complete identities, and preserves source fallback', () => {
    const values = {
      'format.name': 'AROME Bakery',
      'brand.name': 'AROME',
      branch: 'Central',
      'source.name': 'Original',
    }
    expect(renderDisplayTemplate(establishment, values)).toBe('AROME Bakery - Central')
    expect(
      renderDisplayTemplate(establishment, { ...values, 'format.name': null }),
    ).toBe('AROME - Central')
    expect(renderDisplayTemplate(establishment, { ...values, branch: '  ' })).toBe(
      'Original',
    )
    expect(
      renderDisplayTemplate(establishment, {
        ...values,
        'brand.name': null,
        'format.name': null,
      }),
    ).toBe('Original')
  })
  it('separates missing, false, zero and present text', () => {
    const source = '{{ cases(field.open, "Yes", "No", "Unknown") }}'
    expect(renderDisplayTemplate(source, {})).toBe('Unknown')
    expect(renderDisplayTemplate(source, { 'field.open': false })).toBe('No')
    expect(renderDisplayTemplate(source, { 'field.open': 0 })).toBe('Yes')
    expect(
      renderDisplayTemplate('{{ field.open ?? "missing" }}', { 'field.open': false }),
    ).toBe('false')
  })
  it('supports localized text and optional punctuation', () => {
    expect(
      renderDisplayTemplate('{{ optional(branch, "（", "）") }}', { branch: '中環' }),
    ).toBe('（中環）')
    expect(renderDisplayTemplate('{{ optional(branch, "（", "）") }}', {})).toBe('')
  })
  it('tracks all potential dependencies including inactive cases', () => {
    expect(
      parseDisplayTemplate('{{ cases(flag, first, second, third) ?? other }}')
        .dependencies,
    ).toEqual(['first', 'flag', 'other', 'second', 'third'])
  })
  it('quotes editor text and keeps braces inside strings', () => {
    const source = templateCasesTag('flag', 'Hi "there" }} {{', 'No', '')
    expect(renderDisplayTemplate(source, { flag: true })).toBe('Hi "there" }} {{')
    expect(renderDisplayTemplate(templatePairTag('a', 'b'), { a: 'A', b: 'B' })).toBe(
      'A - B',
    )
    expect(templatePropertyTag('properties.some-id')).toBe('{{ properties.some-id }}')
  })
  it.each([
    '{{ eval("x") }}',
    '{{ constructor }}',
    '{{ a.__proto__ }}',
    '{{ pair(a,b) }}',
    '{{ a + b }}',
    '{{ a }} garbage {{',
    '{{ a..b }}',
    '{{ "unterminated }}',
  ])('rejects invalid expressions: %s', source => {
    expect(() => parseDisplayTemplate(source)).toThrow()
  })
  it('never reads inherited values or recursively evaluates values', () => {
    expect(
      renderDisplayTemplate('{{ hidden }}', Object.create({ hidden: 'secret' })),
    ).toBe('')
    expect(
      renderDisplayTemplate('{{ value }}', { value: '{{ secret }}', secret: 'secret' }),
    ).toBe('{{ secret }}')
  })
  it('bounds source size, depth and output', () => {
    expect(() => parseDisplayTemplate('x'.repeat(4097))).toThrow()
    expect(() => parseDisplayTemplate(`{{ ${'a ?? '.repeat(25)}b }}`)).toThrow()
    expect(() => renderDisplayTemplate('{{ a }}', { a: 'x'.repeat(8193) })).toThrow()
  })
})
