// TESTS
import { describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  featureRevisionContentFixture,
  featureRevisionLocationFixture,
} from './fixtures/featureRevisionContent'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { prepareFeatureLocationFormCorrection } from '#lib/db/services/featureLocationFormCorrection.js'
import type { Database } from '#lib/types.js'

vi.mock('#lib/db/services/organisationLocation', () => ({
  prepareOrganisationLocationWrite: vi.fn(async () => ({
    revision: 'org-next',
    queries: [],
  })),
}))

describe('Feature form Location correction revisions', () => {
  function setup() {
    const previous = featureRevisionContentFixture()
    previous.placement.location = featureRevisionLocationFixture()
    previous.placement.addressMeta = {
      address: JSON.parse(JSON.stringify(emptyFeatureAddress())),
    }
    return { previous, content: structuredClone(previous) }
  }
  it('keeps display preferences Feature-owned without association or Organisation writes', async () => {
    const { previous, content } = setup()
    content.placement.addressMeta = {
      address: JSON.parse(
        JSON.stringify({
          ...emptyFeatureAddress(),
          locationDisplayMode: 'plus_code',
          markerCoordinates: [114, 22],
        }),
      ),
    }
    const authorizeOrganisation = vi.fn()
    const result = await prepareFeatureLocationFormCorrection({} as Database, {
      featureId: 'feature',
      organisationId: 'org',
      actorId: 'actor',
      guard: sql`1`,
      previous,
      content,
      authorizeOrganisation,
    })
    expect(authorizeOrganisation).not.toHaveBeenCalled()
    expect(result.queries).toEqual([])
    expect(content.placement.location).toEqual(previous.placement.location)
    expect(result.authorized).toBe(true)
  })
  it('rotates the association and membership tokens when accepted evidence changes', async () => {
    const { previous, content } = setup()
    content.translations.en.title.value = 'Corrected name'
    await prepareFeatureLocationFormCorrection({} as Database, {
      featureId: 'feature',
      organisationId: 'org',
      actorId: 'actor',
      guard: sql`1`,
      previous,
      content,
      authorizeOrganisation: async () => {},
    })
    expect(content.placement.location?.associationVersion).not.toBe(
      previous.placement.location?.associationVersion,
    )
    expect(content.placement.location?.memberships[0].bindingVersion).toBe(
      content.placement.location?.associationVersion,
    )
    expect(content.placement.location?.factsOrganisationRevision).toBe('org-next')
  })
})
