import { describe, expect, test } from 'bun:test'
import {
  researchDefaultSummary,
  researchProjectProperties,
} from '../lib/fieldResearch/propertyChoices.js'

describe('research project property choices', () => {
  test('keeps project fields and enabled assigned inherited fields in order', () => {
    const properties = [
      { id: 'local', scope: 'project', isEnabled: true },
      { id: 'added', scope: 'hub', isEnabled: true },
      { id: 'disabled', scope: 'hub', isEnabled: false },
      { id: 'available', scope: 'hub', isEnabled: true },
    ]
    expect(
      researchProjectProperties(properties, new Set(['added', 'disabled'])).map(
        property => property.id,
      ),
    ).toEqual(['local', 'added'])
  })
  test('summarizes default selections', () => {
    expect(researchDefaultSummary([])).toBe('No default')
    expect(researchDefaultSummary(['Revealed'])).toBe('Revealed')
    expect(researchDefaultSummary(['Revealed', 'Exposed'])).toBe('Two values')
    expect(researchDefaultSummary(['A', 'B', 'C'])).toBe('Three values')
  })
})
