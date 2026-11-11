// TESTS
import { expect, it } from 'vitest'
// DOMAIN
import { retainCommunityEditOverrides } from '#lib/locations/communityEdit.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

it('retains only contributed fields, including explicit community suppression', () => {
  const facts = LocationFactsSchema.parse({
    names: { en: 'Community' },
    phoneNumber: [],
    brands: [],
    accessibility: null,
    location: {
      geometry: { type: 'Point', coordinates: [114, 22] },
      address: emptyFeatureAddress().source,
    },
  })
  expect(
    retainCommunityEditOverrides(
      {
        brands: { mode: 'clear' },
        names: { en: { mode: 'override', value: 'Internal' } },
      },
      facts,
      ['phoneNumber', 'accessibility'],
    ),
  ).toEqual({
    brands: { mode: 'clear' },
    names: { en: { mode: 'override', value: 'Internal' } },
    phoneNumber: { mode: 'override', value: [] },
    accessibility: { mode: 'clear' },
  })
})
