// @vitest-environment node
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
import { lifecycleFixture } from './fixtures/featureLifecycle'
// TYPES
import type { Database } from '#lib/types.js'

const mocks = vi.hoisted(() => ({
  db: null as Database | null,
  edit: true,
  publish: false,
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const remote = (
    schema: { parse: (value: unknown) => unknown },
    handler: (value: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (value: unknown) =>
        handler(schema.parse(value), {
          db: mocks.db,
          user: { id: 'translator' },
          userRoles: [],
        }),
      'command',
    )
  return { guardedQuery: remote, guardedCommand: remote }
})
vi.mock('#lib/api/services/authz/feature', () => ({
  authorizeFeatureUpdateForSubmission: () => ({ allowed: mocks.edit }),
  authorizeFeaturePublishForSubmission: () => ({ allowed: mocks.publish }),
}))
vi.mock('#lib/db/services/feature.js', () => ({
  probeFeatureForUpdate: async () => ({
    id: 'f',
    organisationId: 'org',
    projectId: 'project',
    layerId: 'layer',
    resourceHubId: null,
  }),
}))
vi.mock('#lib/db/services/featurePresentationPolicy.js', () => ({
  readFeaturePresentationPolicy: async () => ({ allowDescriptions: true }),
}))
import { saveFeatureTranslationDraft } from '#lib/api/featureRevisions.remote.js'
let f: ReturnType<typeof lifecycleFixture>
beforeEach(() => {
  f = lifecycleFixture()
  mocks.db = f.db
  mocks.edit = true
  mocks.publish = false
})
afterEach(() => f.sqlite.close())

it.each([true, false])(
  'applies authorised translator text with publication=%s',
  async published => {
    const initial = await f.initialize(published)
    const input = {
      featureId: 'f',
      baseRevisionId: initial.revisionId,
      expectedGeneration: 0,
      patch: { translations: { en: { description: 'Immediate staff translation' } } },
    }
    const result = await saveFeatureTranslationDraft(input)
    expect(result.revisionId).toBeTruthy()
    expect(
      f.sqlite
        .prepare(
          "SELECT description FROM featureI18n WHERE featureId='f' AND locale='en'",
        )
        .get()?.description,
    ).toBe('Immediate staff translation')
    expect(
      f.sqlite
        .prepare("SELECT isPublished,currentRevisionId FROM feature WHERE id='f'")
        .get(),
    ).toMatchObject({
      isPublished: Number(published),
      currentRevisionId: result.revisionId,
    })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
    ).toBe(0)
    await expect(saveFeatureTranslationDraft(input)).rejects.toMatchObject({
      status: 409,
    })
  },
)
it('denies actors without text-edit authority before saving', async () => {
  const initial = await f.initialize()
  mocks.edit = false
  await expect(
    saveFeatureTranslationDraft({
      featureId: 'f',
      baseRevisionId: initial.revisionId,
      expectedGeneration: 0,
      patch: { translations: { en: { title: 'Denied' } } },
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(
    f.sqlite.prepare("SELECT currentRevisionId FROM feature WHERE id='f'").get()
      ?.currentRevisionId,
  ).toBe(initial.revisionId)
})
it('rolls text and history back when the revision write fails', async () => {
  const initial = await f.initialize()
  f.sqlite.exec(
    "CREATE TRIGGER fail_staff_translation BEFORE INSERT ON featureRevision BEGIN SELECT RAISE(ABORT,'late failure'); END",
  )
  const before = f.sqlite.prepare('SELECT * FROM featureI18n').all()
  await expect(
    saveFeatureTranslationDraft({
      featureId: 'f',
      baseRevisionId: initial.revisionId,
      expectedGeneration: 0,
      patch: { translations: { en: { description: 'Rolled back' } } },
    }),
  ).rejects.toThrow()
  expect(f.sqlite.prepare('SELECT * FROM featureI18n').all()).toEqual(before)
  expect(
    f.sqlite.prepare("SELECT currentRevisionId FROM feature WHERE id='f'").get()
      ?.currentRevisionId,
  ).toBe(initial.revisionId)
})

it('rejects a stale generation even when successive saves retain the same revision id', async () => {
  const initial = await f.initialize()
  const first = await saveFeatureTranslationDraft({
    featureId: 'f',
    baseRevisionId: initial.revisionId,
    expectedGeneration: 0,
    patch: { translations: { en: { description: 'First' } } },
  })
  const second = await saveFeatureTranslationDraft({
    featureId: 'f',
    baseRevisionId: first.revisionId,
    expectedGeneration: 1,
    patch: { translations: { en: { description: 'Second' } } },
  })
  expect(second.revisionId).toBe(first.revisionId)
  await expect(
    saveFeatureTranslationDraft({
      featureId: 'f',
      baseRevisionId: first.revisionId,
      expectedGeneration: 1,
      patch: { translations: { en: { description: 'Stale' } } },
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    f.sqlite
      .prepare(
        "SELECT description FROM featureI18n WHERE featureId='f' AND locale='en'",
      )
      .get()?.description,
  ).toBe('Second')
})
