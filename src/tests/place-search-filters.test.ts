import { expect, it } from 'vitest'
import {
  matchesPlaceSearchFilters,
  placeSearchFilterParams,
} from '#lib/locations/placeSearchFilters.js'
import { placeTaxonomyPath } from '#lib/locations/placeTaxonomy.js'
it('defaults to open and unknown, with closed choices exact and any unrestricted', () => {
  for (const unknown of [undefined, null, 'unknown'])
    expect(matchesPlaceSearchFilters({}, { operatingStatus: unknown })).toBe(true)
  expect(matchesPlaceSearchFilters({}, { operatingStatus: 'open' })).toBe(true)
  for (const closed of ['temporarily_closed', 'permanently_closed'] as const) {
    expect(matchesPlaceSearchFilters({}, { operatingStatus: closed })).toBe(false)
    expect(matchesPlaceSearchFilters({ operatingStatus: closed }, {})).toBe(false)
    expect(
      matchesPlaceSearchFilters(
        { operatingStatus: closed },
        { operatingStatus: closed },
      ),
    ).toBe(true)
    expect(
      matchesPlaceSearchFilters(
        { operatingStatus: 'any' },
        { operatingStatus: closed },
      ),
    ).toBe(true)
  }
  expect(placeSearchFilterParams({ operatingStatus: 'open' })).toEqual({})
})
it('matches taxonomy descendants and rejects unrelated or unclassified candidates', () => {
  const path = placeTaxonomyPath('abortion_clinic')
  expect(path.length).toBeGreaterThan(1)
  expect(
    matchesPlaceSearchFilters(
      { taxonomyCategory: path[0].name },
      { taxonomyPrimary: 'abortion_clinic' },
    ),
  ).toBe(true)
  expect(
    matchesPlaceSearchFilters(
      { taxonomyPrimary: 'abortion_clinic' },
      { taxonomyPrimary: 'restaurant' },
    ),
  ).toBe(false)
  expect(matchesPlaceSearchFilters({ taxonomyCategory: path[0].name }, {})).toBe(false)
})
