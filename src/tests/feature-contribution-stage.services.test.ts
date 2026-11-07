// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFeatureForm: vi.fn(),
  createFeatureTask: vi.fn(),
  saveFeatureTaskDraft: vi.fn(),
  saveUnlinkedFeatureForm: vi.fn(),
  probeFeatureForUpdate: vi.fn(),
  createI18n: vi.fn(),
  createProperties: vi.fn(),
  probeLayerForUpdate: vi.fn(),
  draftParse: vi.fn(value => value),
  finalParse: vi.fn(value => value),
}))

vi.mock('#lib/db/services/featureLifecycle.js', () => ({ hasFeatureLifecycleStorage: vi.fn(async () => false) }))
vi.mock('#lib/db/services/feature.js', () => mocks)
vi.mock('#lib/db/services/featureFormSave.js', () => mocks)
vi.mock('#lib/db/services/taskContribution.js', () => mocks)
vi.mock('#lib/db/services/featureCreationRevision.js', () => ({ featureRevisionCreationEnabled: async () => false }))
vi.mock('#lib/db/services/layer.js', () => mocks)
vi.mock('#lib/db/services/historicalLayers.js', () => ({
  historicalSourceLayerId: vi.fn(async () => null),
}))
vi.mock('#lib/db/zod/schema/feature.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  FeatureDraftEntityFormData: { parse: mocks.draftParse },
  FeatureEntityFormData: { parse: mocks.finalParse },
}))

import {
  createUserContributedFeature,
  createUserContributedFeatureTask,
  updateUserContributedFeatureDraft,
  updateUserContributedFeatureTaskDraft,
} from '#lib/api/services/feature.js'

describe('feature contribution submission stage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.probeLayerForUpdate.mockResolvedValue({
      id: 'layer',
      projectId: 'project',
      organisationId: 'organisation',
    })
    mocks.createFeatureForm.mockImplementation(async (_db, { data }) => ({
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
      expect(mocks.createFeatureForm).toHaveBeenCalledOnce()
      expect(mocks.createFeatureForm).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ i18n: expect.any(Object), properties: [] }),
      )
      expect(mocks.createI18n).not.toHaveBeenCalled()
      expect(mocks.createProperties).not.toHaveBeenCalled()
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
  mocks.createFeatureForm.mockImplementation(async (_db, { data }) => ({
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

it('requires the exact persisted draft state for atomic contribution updates', async () => {
  mocks.probeFeatureForUpdate.mockResolvedValue({
    id: 'feature',
    projectId: 'project',
    modifiedAt: 'original',
  })
  mocks.probeLayerForUpdate.mockResolvedValue({
    id: 'layer',
    projectId: 'project',
    organisationId: 'organisation',
  })
  mocks.saveUnlinkedFeatureForm.mockResolvedValue({ id: 'feature', isDraft: true })
  const input = { layerId: 'layer', i18n: {}, properties: [], isDraft: true } as never
  await updateUserContributedFeatureDraft({} as never, 'feature', input, '', '')
  expect(mocks.saveUnlinkedFeatureForm).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      featureId: 'feature',
      projectId: 'project',
      updatedAt: 'original',
      expectedDraftState: true,
      properties: [],
      data: expect.objectContaining({
        isDraft: true,
        isPublished: false,
        isPendingReview: true,
      }),
    }),
  )
  mocks.saveUnlinkedFeatureForm.mockResolvedValue(undefined)
  await expect(
    updateUserContributedFeatureDraft({} as never, 'feature', input, '', ''),
  ).rejects.toThrow('Feature draft update failed')
})

it('preserves fourth-language content and verification without copying failed translation fallbacks', async () => {
  mocks.probeLayerForUpdate.mockResolvedValue({
    id: 'layer',
    projectId: 'project',
    organisationId: 'organisation',
  })
  mocks.createFeatureForm.mockImplementation(async (_db, { data }) => ({
    id: 'feature',
    ...data,
  }))
  await createUserContributedFeature(
    { query: { property: { findMany: async () => [] } } } as never,
    {
      layerId: 'layer',
      isDraft: false,
      i18n: {
        ja: {
          title: '喫茶店',
          titleGen: true,
          description: '<p>説明</p>',
          descriptionGen: false,
        },
      },
      properties: [{ propertyId: 'p', i18n: { ja: { value: '値', valueGen: true } } }],
    } as never,
    '',
    '',
  )
  const payload = mocks.finalParse.mock.lastCall?.[0]
  expect(payload.i18n.ja).toMatchObject({
    title: '喫茶店',
    titleGen: true,
    description: '<p>説明</p>',
    descriptionGen: false,
  })
  expect(payload.i18n.en.title).toBe('')
  expect(payload.i18n.en.description).toBe('')
  expect(payload.properties[0].i18n.ja).toEqual({ value: '値', valueGen: true })
  expect(payload.properties[0].i18n.en.value).toBe('')
})

it.each([false, true])(
  'prepares the combined contribution at draft stage %s',
  async isDraft => {
    mocks.probeLayerForUpdate.mockResolvedValue({
      id: 'layer',
      projectId: 'project',
      organisationId: 'organisation',
    })
    const expected = { feature: { id: 'feature' }, task: { id: 'task' } }
    mocks.createFeatureTask.mockResolvedValue(expected)
    await expect(
      createUserContributedFeatureTask(
        {} as never,
        { layerId: 'layer', i18n: {}, properties: [], isDraft } as never,
        '',
        '',
        { contributorId: 'account' },
      ),
    ).resolves.toBe(expected)
    expect(mocks.createFeatureTask).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project',
          organisationId: 'organisation',
          isDraft,
          isPublished: false,
          isPendingReview: true,
        }),
        i18n: expect.any(Object),
        properties: [],
      }),
      { contributorId: 'account' },
    )
  },
)

it('maps a superseded combined draft save to a conflict without a separate Feature write', async () => {
  mocks.probeFeatureForUpdate.mockResolvedValue({
    id: 'feature',
    projectId: 'project',
    modifiedAt: 'feature-v1',
  })
  mocks.probeLayerForUpdate.mockResolvedValue({
    id: 'layer',
    projectId: 'project',
    organisationId: 'organisation',
  })
  mocks.saveUnlinkedFeatureForm.mockClear()
  mocks.saveFeatureTaskDraft.mockResolvedValue(undefined)
  const expected = {
    id: 'task',
    featureId: 'feature',
    contributorId: 'account',
    projectId: 'project',
    organisationId: 'organisation',
    modifiedAt: 'task-v1',
  }
  await expect(
    updateUserContributedFeatureTaskDraft(
      {} as never,
      expected,
      { layerId: 'layer', i18n: {}, properties: [], contributorId: 'spoofed' } as never,
      '',
      '',
    ),
  ).rejects.toMatchObject({ status: 409, body: { message: 'STALE_TASK_DRAFT' } })
  expect(mocks.saveFeatureTaskDraft).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      featureId: 'feature',
      updatedAt: 'feature-v1',
      expectedDraftState: true,
      data: expect.objectContaining({ contributorId: 'account', isDraft: true }),
    }),
    expected,
  )
  expect(mocks.saveUnlinkedFeatureForm).not.toHaveBeenCalled()
})
