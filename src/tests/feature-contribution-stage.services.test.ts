// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFeature: vi.fn(),
  createI18n: vi.fn(),
  createProperties: vi.fn(),
  probeLayerForUpdate: vi.fn(),
  draftParse: vi.fn(value => value),
  finalParse: vi.fn(value => value),
}))

vi.mock('#lib/db/services/feature.js', () => mocks)
vi.mock('#lib/db/services/layer.js', () => mocks)
vi.mock('#lib/db/zod/schema/feature.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  FeatureDraftEntityFormData: { parse: mocks.draftParse },
  FeatureEntityFormData: { parse: mocks.finalParse },
}))

import { createUserContributedFeature } from '#lib/api/services/feature.js'

describe('feature contribution submission stage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.probeLayerForUpdate.mockResolvedValue({
      id: 'layer',
      projectId: 'project',
      organisationId: 'organisation',
    })
    mocks.createFeature.mockImplementation(async (_db, data) => ({
      id: 'feature',
      ...data,
    }))
  })

  it.each([undefined, false, true])(
    'persists the requested draft state (%s)',
    async isDraft => {
      const result = await createUserContributedFeature(
        {} as never,
        { layerId: 'layer', i18n: {}, properties: [], isDraft } as never,
        '',
        '',
      )
      expect(result).toMatchObject({
        isDraft: isDraft === true,
        isPublished: false,
        isArchived: false,
        isPendingReview: true,
      })
      expect(isDraft ? mocks.draftParse : mocks.finalParse).toHaveBeenCalledOnce()
      expect(mocks.createI18n).toHaveBeenCalledOnce()
      expect(mocks.createProperties).toHaveBeenCalledOnce()
    },
  )
})

it('retains selected building identity and address components through contribution preparation', async () => {
  const identity = {
    buildingSourceId: 'osm:42',
    buildingSource: 'hongkong-latest',
    addressMatch: 'building_address',
  }
  const components = {
    streetAddress: '22-24 Possession Street',
    streetName: 'Possession Street',
  }
  mocks.probeLayerForUpdate.mockResolvedValue({
    id: 'layer',
    projectId: 'project',
    organisationId: 'organisation',
  })
  mocks.createFeature.mockImplementation(async (_db, data) => ({
    id: 'feature',
    ...data,
  }))
  const result = await createUserContributedFeature(
    {} as never,
    {
      layerId: 'layer',
      addressMeta: identity,
      i18n: {
        en: {
          displayAddress: '22-24 Possession Street',
          displayAddressGen: true,
          addressProperties: components,
        },
      },
      properties: [],
      isDraft: true,
    } as never,
    '',
    '',
  )
  expect(result.addressMeta).toEqual(identity)
  expect(mocks.draftParse).toHaveBeenLastCalledWith(
    expect.objectContaining({
      i18n: expect.objectContaining({
        en: expect.objectContaining({
          displayAddressGen: true,
          addressProperties: components,
        }),
      }),
    }),
  )
})
