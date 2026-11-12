import { expect, it } from 'vitest'
import {
  draftNameMode,
  selectedDraftNameMode,
  hasStaleCoordinateTitle,
} from '#lib/features/draftNaming.js'
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
import { featurePlusCode } from '#lib/addresses/plusCode.js'
it('inherits a represented place name even with a retained feature-based rule', () => {
  expect(
    draftNameMode({
      ...DEFAULT_FEATURE_TYPES[1],
      nameRule: { base: 'feature', conditions: [] },
    }),
  ).toBe('inherit')
  expect(draftNameMode(DEFAULT_FEATURE_TYPES[0])).toBe('independent')
})
it('repairs only coordinate placeholders when a named represented location exists', () => {
  const input = {
    relation: 'represents',
    names: { en: 'Arome Bakery' },
    coordinates: [114.15, 22.3],
    titles: { en: { title: featurePlusCode([114.15, 22.3]) } },
  }
  expect(hasStaleCoordinateTitle(input)).toBe(true)
  expect(
    hasStaleCoordinateTitle({ ...input, titles: { en: { title: 'My own title' } } }),
  ).toBe(false)
  expect(hasStaleCoordinateTitle({ ...input, names: {} })).toBe(false)
  expect(hasStaleCoordinateTitle({ ...input, relation: 'locatedAt' })).toBe(true)
})

it('uses a newly named service point instead of a coordinate placeholder', () => {
  const input = {
    created: true,
    names: { en: 'Breadline @ The One' },
    coordinates: [114.15, 22.3],
    titles: { en: { title: featurePlusCode([114.15, 22.3]) } },
  }
  expect(selectedDraftNameMode(DEFAULT_FEATURE_TYPES[0], input)).toBe('inherit')
  expect(
    selectedDraftNameMode(DEFAULT_FEATURE_TYPES[0], { ...input, created: false }),
  ).toBe('independent')
  expect(
    selectedDraftNameMode(DEFAULT_FEATURE_TYPES[0], {
      ...input,
      titles: { en: { title: 'My dropoff' } },
    }),
  ).toBe('independent')
})

it('replaces the old default-pin code after the marker has moved', () => {
  expect(
    selectedDraftNameMode(DEFAULT_FEATURE_TYPES[0], {
      created: true,
      names: { en: 'Sheung Wan' },
      coordinates: [114.15249, 22.2888],
      titles: { en: { title: '7PJP8599+PP' } },
    }),
  ).toBe('inherit')
})
