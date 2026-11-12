// TESTS
import { required } from './fixtures/required'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  featureRevisionContentFixture,
  featureRevisionLocationFixture,
} from './fixtures/featureRevisionContent'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { prepareSharedLocationCorrection } from '#lib/db/services/locationShared.js'
import {
  prepareOrganisationLocationWrite,
  readOrganisationLocation,
} from '#lib/db/services/organisationLocation.js'
import { prepareFeatureLocationFormCorrection } from '#lib/db/services/featureLocationFormCorrection.js'
import { readLocationResetSources } from '#lib/db/services/locationReset.js'
import type { Database } from '#lib/types.js'

vi.mock('#lib/db/services/locationShared', () => ({
  sharedLocationFacts: vi.fn(async () => ({
    facts: { names: { en: 'Community', fr: 'Communauté' } },
  })),
  readSharedLocationCorrection: vi.fn(async () => null),
  prepareSharedLocationCorrection: vi.fn(async () => ({
    id: 'shared-next',
    queries: [],
    facts: { phoneNumber: ['+85221234567'] },
  })),
}))

vi.mock('#lib/db/services/organisationLocation', () => ({
  readOrganisationLocation: vi.fn(async () => null),
  prepareOrganisationLocationWrite: vi.fn(async () => ({
    revision: 'org-next',
    guard: sql`1`,
    queries: [],
  })),
}))

vi.mock('#lib/db/services/revisionBatch', () => ({
  prepareRevisionCheck: vi.fn(() => ({})),
}))

vi.mock('#lib/db/services/locationReset', () => ({
  readLocationResetSources: vi.fn(),
}))

describe('Feature form Location correction revisions', () => {
  beforeEach(() => vi.clearAllMocks())
  function setup() {
    const previous = featureRevisionContentFixture()
    previous.placement.location = featureRevisionLocationFixture()
    previous.placement.addressMeta = {
      address: JSON.parse(JSON.stringify(emptyFeatureAddress())),
    }
    return { previous, content: structuredClone(previous) }
  }
  it('requires Organisation authority to change name inheritance', async () => {
    const { previous, content } = setup()
    await expect(
      prepareFeatureLocationFormCorrection({} as Database, {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        nameMode: 'independent',
      }),
    ).rejects.toThrow('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
  })
  it('inherits the pinned Location name rather than trusting submitted title text', async () => {
    const { previous, content } = setup()
    required(previous.placement.location).acceptancePolicy = { nameMode: 'independent' }
    required(content.placement.location).acceptancePolicy = { nameMode: 'independent' }
    const facts = {
      names: { en: 'Breadline @ The One' },
      phoneNumber: [],
      brands: [],
      location: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        address: emptyFeatureAddress().source,
      },
    }
    vi.mocked(readLocationResetSources).mockResolvedValue({
      facts,
      locationFacts: facts,
    } as never)
    const authorizeOrganisation = vi.fn(async () => {})
    const result = await prepareFeatureLocationFormCorrection(
      {
        get: vi.fn(async () => ({ projectId: 'project' })),
      } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        nameMode: 'inherit',
        authorizeOrganisation,
      },
    )
    expect(authorizeOrganisation).toHaveBeenCalledOnce()
    expect(content.translations.en.title.value).toBe('Breadline @ The One')
    expect(content.placement.location?.acceptancePolicy?.nameMode).toBe('inherit')
    expect(content.placement.location?.acceptedOverrides).toEqual(
      previous.placement.location?.acceptedOverrides,
    )
    expect(result.authorized).toBe(true)
    expect(result.comparison.translations.en.title).toEqual(
      content.translations.en.title,
    )
  })
  it.each(['whatsappNumber', 'contactPhone', 'phoneNumber'])(
    'saves %s with the correct ownership after a text-to-phone migration',
    async key => {
      const { previous, content } = setup()
      previous.properties.structured.selection.definition.key = key
      content.properties.structured.selection.definition.key = key
      content.properties.structured.selection.definition.component = 'PhoneField'
      content.properties.structured.selection.value = '["+85221234567"]'
      const authorizeOrganisation = vi.fn(async () => {})
      const get = vi.fn(async () => ({ id: 'source' }))
      const result = await prepareFeatureLocationFormCorrection(
        { get } as unknown as Database,
        {
          featureId: 'feature',
          organisationId: 'org',
          actorId: 'actor',
          guard: sql`1`,
          previous,
          content,
          authorizeOrganisation,
        },
      )
      expect(authorizeOrganisation).toHaveBeenCalledTimes(key === 'phoneNumber' ? 1 : 0)
      expect(get).not.toHaveBeenCalled()
      expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
      if (key === 'phoneNumber') {
        expect(result.comparison.properties.structured).toEqual(
          content.properties.structured,
        )
        expect(content.placement.location?.acceptedOverrides.phoneNumber).toEqual({
          mode: 'override',
          value: ['+85221234567'],
        })
        expect(content.placement.location?.factsOrganisationRevision).toBe('org-next')
        expect(content.placement.location?.acceptancePolicy).toEqual(
          previous.placement.location?.acceptancePolicy,
        )
        expect(prepareOrganisationLocationWrite).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            organisationId: 'org',
            locationId: content.placement.location?.locationId,
            actorId: 'actor',
          }),
        )
      } else {
        expect(content.placement.location).toEqual(previous.placement.location)
        expect(result.comparison.properties.structured).toEqual(
          previous.properties.structured,
        )
      }
    },
  )
  it('replaces only the phone override without advancing accepted community pins', async () => {
    const { previous, content } = setup()
    for (const value of [previous, content]) {
      value.properties.structured.selection.definition.key = 'phoneNumber'
      value.properties.structured.selection.value = '["+85220000000"]'
      required(value.placement.location).acceptedOverrides = {
        phoneNumber: { mode: 'override', value: ['+85220000000'] },
        brands: { mode: 'clear' },
      }
      required(value.placement.location).acceptancePolicy = {
        factsSharedFields: [{ field: 'phoneNumber', revision: 'accepted-shared' }],
      }
    }
    content.properties.structured.selection.value = '["+85221234567"]'
    await prepareFeatureLocationFormCorrection({} as Database, {
      featureId: 'feature',
      organisationId: 'org',
      actorId: 'actor',
      guard: sql`1`,
      previous,
      content,
      authorizeOrganisation: async () => {},
    })
    expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
    expect(content.placement.location?.acceptedOverrides).toEqual({
      phoneNumber: { mode: 'override', value: ['+85221234567'] },
      brands: { mode: 'clear' },
    })
    expect(content.placement.location?.acceptancePolicy).toEqual(
      previous.placement.location?.acceptancePolicy,
    )
  })
  it('saves mobility solely through community curation, with an accepted field pin', async () => {
    const { previous, content } = setup()
    const accessibility = {
      wheelchair: 'yes',
      stepFreeEntrance: 'yes',
      lift: 'not_needed',
      toilet: 'unknown',
    } as const
    await prepareFeatureLocationFormCorrection(
      { get: async () => ({ id: 'source' }) } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        profileEdit: {
          expectedRevision: required(previous.placement.location).associationVersion,
          values: { accessibility },
        },
        authorizeCommunity: async () => ({ canEdit: true, superAdmin: false }),
      },
    )
    expect(prepareSharedLocationCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: { accessibility: { mode: 'override', value: accessibility } },
      }),
    )
    expect(prepareOrganisationLocationWrite).not.toHaveBeenCalled()
    expect(
      content.placement.location?.acceptancePolicy?.factsSharedFields,
    ).toContainEqual({ field: 'accessibility', revision: 'shared-next' })
  })
  it('keeps contact assignments independent and supports phone editing without a universal property', async () => {
    const { previous, content } = setup()
    await prepareFeatureLocationFormCorrection(
      { get: async () => ({ id: 'source' }) } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        profileEdit: {
          expectedRevision: required(previous.placement.location).associationVersion,
          values: {
            phoneNumber: ['+85221234567'],
            websites: ['https://example.com'],
            socials: { instagram: 'https://instagram.com/example' },
          },
        },
        fieldModes: {
          phoneNumber: 'community',
          websites: 'internal',
          socials: 'community',
        },
        authorizeCommunity: async () => ({ canEdit: true, superAdmin: false }),
        authorizeOrganisation: async () => {},
      },
    )
    expect(prepareSharedLocationCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: {
          phoneNumber: { mode: 'override', value: ['+85221234567'] },
          socials: {
            mode: 'override',
            value: { instagram: 'https://instagram.com/example' },
          },
        },
      }),
    )
    expect(content.placement.location?.acceptedOverrides.websites).toEqual({
      mode: 'override',
      value: ['https://example.com'],
    })
  })
  it('rejects stale profile edits before preparing any writes', async () => {
    const { previous, content } = setup()
    await expect(
      prepareFeatureLocationFormCorrection({} as Database, {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        profileEdit: { expectedRevision: 'outdated', values: { websites: [] } },
      }),
    ).rejects.toThrow('LOCATION_CHANGED')
    expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
    expect(prepareOrganisationLocationWrite).not.toHaveBeenCalled()
  })
  it('defaults shared-record phone edits to community and retains its Organisation override atomically', async () => {
    const { previous, content } = setup()
    for (const value of [previous, content]) {
      value.properties.structured.selection.definition.key = 'phoneNumber'
      value.properties.structured.selection.value = '["+85220000000"]'
    }
    content.properties.structured.selection.value = '+85221234567'
    const rights = vi.fn(async () => ({ canEdit: true, superAdmin: false }))
    await prepareFeatureLocationFormCorrection(
      { get: async () => ({ id: 'source' }) } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        defaultFieldMode: 'community',
        authorizeCommunity: rights,
        authorizeOrganisation: async () => {},
      },
    )
    expect(rights).toHaveBeenCalledOnce()
    expect(prepareSharedLocationCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: { phoneNumber: { mode: 'override', value: ['+85221234567'] } },
        provenance: expect.objectContaining({ authorOrganisationId: 'org' }),
      }),
    )
    expect(prepareOrganisationLocationWrite).toHaveBeenCalledOnce()
    expect(content.placement.location?.acceptedOverrides.phoneNumber).toEqual({
      mode: 'override',
      value: ['+85221234567'],
    })
    expect(
      content.placement.location?.acceptancePolicy?.factsSharedFields,
    ).toContainEqual({ field: 'phoneNumber', revision: 'shared-next' })
  })
  it('preserves another Feature’s current Organisation field choices when editing a phone', async () => {
    const { previous, content } = setup()
    for (const value of [previous, content])
      value.properties.structured.selection.definition.key = 'phoneNumber'
    content.properties.structured.selection.value = '+85221234567'
    vi.mocked(readOrganisationLocation).mockResolvedValueOnce({
      revision: 'latest',
      overrides: {
        brands: { mode: 'clear' },
        names: { en: { mode: 'override', value: 'Other Feature name' } },
      },
    })
    await prepareFeatureLocationFormCorrection({} as Database, {
      featureId: 'feature',
      organisationId: 'org',
      actorId: 'actor',
      guard: sql`1`,
      previous,
      content,
      authorizeOrganisation: async () => {},
    })
    expect(content.placement.location?.acceptedOverrides).toEqual({
      phoneNumber: { mode: 'override', value: ['+85221234567'] },
      brands: { mode: 'clear' },
      names: { en: { mode: 'override', value: 'Other Feature name' } },
    })
  })
  it('persists field choices without publishing an unchanged field', async () => {
    const { previous, content } = setup()
    await prepareFeatureLocationFormCorrection({} as Database, {
      featureId: 'feature',
      organisationId: 'org',
      actorId: 'actor',
      guard: sql`1`,
      previous,
      content,
      fieldModes: { phoneNumber: 'community' },
      authorizeOrganisation: async () => {},
    })
    expect(content.placement.location?.acceptancePolicy?.fieldEditModes).toEqual({
      phoneNumber: 'community',
    })
    expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
    expect(prepareOrganisationLocationWrite).not.toHaveBeenCalled()
  })
  it('does not publish other internal locales when contributing a name', async () => {
    const { previous, content } = setup()
    for (const value of [previous, content])
      required(value.placement.location).acceptedOverrides = {
        names: { fr: { mode: 'override', value: 'Private' } },
      }
    await prepareFeatureLocationFormCorrection(
      {
        get: async () => ({
          id: 'source',
          facts: JSON.stringify({
            names: { en: 'Community', fr: 'Communauté' },
            phoneNumber: [],
            brands: [],
            location: {
              geometry: { type: 'Point', coordinates: [114, 22] },
              address: emptyFeatureAddress().source,
            },
          }),
        }),
      } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        names: { en: 'New community name' },
        fieldModes: { names: 'community' },
        authorizeCommunity: async () => ({ canEdit: true, superAdmin: false }),
        authorizeOrganisation: async () => {},
      },
    )
    expect(prepareSharedLocationCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: {
          names: {
            mode: 'override',
            value: { en: 'New community name', fr: 'Communauté' },
          },
        },
      }),
    )
  })
  it('resets the phone override to accepted source evidence without adopting a new shared head', async () => {
    const { previous, content } = setup()
    for (const value of [previous, content]) {
      value.properties.structured.selection.definition.key = 'phoneNumber'
      value.properties.structured.selection.value = '["+85220000000"]'
      required(value.placement.location).acceptedOverrides = {
        phoneNumber: { mode: 'override', value: ['+85220000000'] },
      }
      required(value.placement.location).acceptancePolicy = {
        factsSharedFields: [{ field: 'phoneNumber', revision: 'accepted-shared' }],
      }
    }
    const facts = {
      names: { en: 'Place' },
      phoneNumber: ['+85229999999'],
      brands: [],
      location: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        address: emptyFeatureAddress().source,
      },
    }
    vi.mocked(readLocationResetSources).mockResolvedValueOnce({
      facts,
      locationFacts: facts,
    } as never)
    const result = await prepareFeatureLocationFormCorrection(
      { get: async () => ({ projectId: 'project' }) } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        reset: {
          expectedRevision: required(previous.placement.location).associationVersion,
          names: [],
          location: false,
          phoneNumber: true,
        },
        authorizeOrganisation: async () => {},
      },
    )
    expect(content.placement.location?.acceptedOverrides.phoneNumber).toEqual({
      mode: 'inherit',
    })
    expect(content.properties.structured.selection.value).toBe('["+85229999999"]')
    expect(result.comparison.properties.structured).toEqual(
      content.properties.structured,
    )
    expect(readLocationResetSources).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        factsRevisionId: previous.placement.location?.factsRevisionId,
        acceptancePolicy: previous.placement.location?.acceptancePolicy,
      }),
    )
    expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
  })
  it.each(['', '[]'])(
    'retains an explicit empty phone override for %j',
    async value => {
      const { previous, content } = setup()
      for (const item of [previous, content])
        item.properties.structured.selection.definition.key = 'phoneNumber'
      previous.properties.structured.selection.value = '["+85221234567"]'
      content.properties.structured.selection.value = value
      await prepareFeatureLocationFormCorrection({} as Database, {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        authorizeOrganisation: async () => {},
      })
      expect(content.placement.location?.acceptedOverrides.phoneNumber).toEqual({
        mode: 'override',
        value: [],
      })
      expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
    },
  )
  it('keeps unlinked phone edits Feature-owned', async () => {
    const { previous, content } = setup()
    previous.placement.location = null
    content.placement.location = null
    content.properties.structured.selection.definition.key = 'phoneNumber'
    content.properties.structured.selection.value = '["+85221234567"]'
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
    expect(result.queries).toEqual([])
    expect(authorizeOrganisation).not.toHaveBeenCalled()
    expect(prepareSharedLocationCorrection).not.toHaveBeenCalled()
  })
  it('requires Organisation override authority for a linked universal phone field', async () => {
    const { previous, content } = setup()
    previous.properties.structured.selection.definition.key = 'phoneNumber'
    content.properties.structured.selection.definition.key = 'phoneNumber'
    content.properties.structured.selection.definition.component = 'PhoneField'
    content.properties.structured.selection.value = '["+85221234567"]'
    await expect(
      prepareFeatureLocationFormCorrection({} as Database, {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
      }),
    ).rejects.toThrow('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
  })
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
  it('retains the pinned Location point for address edits without provider coordinates', async () => {
    const { previous, content } = setup()
    content.placement.addressMeta = {
      address: JSON.parse(
        JSON.stringify({
          ...emptyFeatureAddress(),
          overrides: { en: { buildingNumberExpression: '1B' } },
          markerCoordinates: [115, 23],
        }),
      ),
    }
    const facts = {
      names: {},
      phoneNumber: [],
      brands: [],
      location: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        address: emptyFeatureAddress().source,
      },
    }
    vi.mocked(readLocationResetSources).mockResolvedValue({
      facts,
      locationFacts: facts,
    } as never)
    await prepareFeatureLocationFormCorrection(
      {
        get: vi.fn(async () => ({ projectId: 'project' })),
      } as unknown as Database,
      {
        featureId: 'feature',
        organisationId: 'org',
        actorId: 'actor',
        guard: sql`1`,
        previous,
        content,
        authorizeOrganisation: async () => {},
      },
    )
    expect(content.placement.location?.acceptedOverrides.location).toMatchObject({
      mode: 'override',
      value: { geometry: { coordinates: [114, 22] } },
    })
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
