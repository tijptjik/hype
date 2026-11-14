// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  reconciliationQuery,
  reconciliationDistance,
} from '#lib/locations/reconciliation.js'
import type { PlacePreview } from '#lib/locations/sourcePreview.js'
describe('reconciliation search intent', () => {
  const item = {
    name: 'Bakery - Central',
    brand: 'Bakery',
    properties: { branch: 'Central' },
  }
  it('uses the selected source without inferring a missing brand', () => {
    expect(reconciliationQuery(item, 'brand')).toBe('Bakery')
    expect(reconciliationQuery(item, 'name')).toBe('Bakery - Central')
    expect(reconciliationQuery(item, 'field:branch')).toBe('Central')
    expect(reconciliationQuery({ ...item, brand: '' }, 'brand')).toBe('')
    expect(reconciliationQuery(item, 'field:missing')).toBe('')
  })
  it('bounds text and computes actual metres for radius filtering', () => {
    expect(
      reconciliationQuery({ ...item, brand: 'x'.repeat(300) }, 'brand'),
    ).toHaveLength(200)
    const preview = {
      location: { geometry: { type: 'Point', coordinates: [114, 22.00045] } },
    } as PlacePreview
    expect(reconciliationDistance([114, 22], preview)).toBeGreaterThan(50)
    expect(reconciliationDistance([114, 22], preview)).toBeLessThan(51)
    expect(
      reconciliationDistance([114, 22], {
        location: { geometry: { type: 'Point', coordinates: [NaN, 22] } },
      } as PlacePreview),
    ).toBe(Infinity)
  })
})
