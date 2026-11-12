import { expect, it } from 'vitest'
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
} from '../lib/templates/displayTemplate'
import {
  componentFields,
  expressionSource,
  updateComponentField,
} from '../lib/templates/componentEditor'

it('locates components without mistaking quoted closing braces for tag boundaries', () => {
  const source = 'Before {{ optional(branch, "}}", "!") }} after'
  const component = parseDisplayTemplate(source).components[0]
  expect(source.slice(component.start, component.end)).toBe(
    '{{ optional(branch, "}}", "!") }}',
  )
  const fields = componentFields(component.expression)
  const updated = updateComponentField(component.expression, fields[1].path, ' - ')
  const result =
    source.slice(0, component.start) +
    `{{ ${expressionSource(updated)} }}` +
    source.slice(component.end)
  expect(renderDisplayTemplate(result, { branch: 'Central' })).toBe(
    'Before  - Central! after',
  )
})
it('edits nested constituents while preserving the fallback', () => {
  const node = parseDisplayTemplate(
    '{{ pair(brand.name, branch, " - ") ?? source.name }}',
  ).components[0].expression
  const separator = componentFields(node).find(field => field.label === 'Separator')
  if (!separator) throw new Error('Missing separator field')
  const updated = expressionSource(updateComponentField(node, separator.path, ' / '))
  expect(
    renderDisplayTemplate(`{{ ${updated} }}`, {
      'brand.name': 'Brand',
      branch: 'Branch',
    }),
  ).toBe('Brand / Branch')
  expect(renderDisplayTemplate(`{{ ${updated} }}`, { 'source.name': 'Original' })).toBe(
    'Original',
  )
})
