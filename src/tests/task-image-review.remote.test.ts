// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { withRemoteMeta } from './remote-function-mock'
import {
  saveFeatureCreationTaskDraft,
  submitFeatureCreationTask,
} from '#lib/db/services/featureLifecycleCreationTask.js'
import { saveFeatureCreationUpload } from '#lib/db/services/featureLifecycleCreationUpload.js'
const state = vi.hoisted(() => ({ ctx: null as any, put: vi.fn(), transform: vi.fn() }))
vi.mock('#lib/api/server/guarded', () => {
  const remote = (schema: any, handler: any) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), state.ctx),
      'command',
    )
  return { guardedQuery: remote, guardedCommand: remote }
})
vi.mock('#lib/images/revisionTransform.js', () => ({
  transformImageRevision: state.transform,
}))
vi.mock('#lib/images/storage.js', () => ({
  toImageStage: () => 'local',
  getOriginalsBucketForStage: () => ({ put: state.put }),
}))
import {
  getTaskImageReviews,
  saveTaskImageReview,
  replaceTaskReviewImage,
} from '#lib/api/taskImageReview.remote.js'
const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
  vi.clearAllMocks()
})
async function fixture() {
  const f = lifecycleFixture()
  connections.push(f)
  const initial = await f.initialize(false),
    content = structuredClone(initial.content)
  content.gallery = { entries: {}, order: [] }
  const draft = await saveFeatureCreationTaskDraft(f.db, {
    actorId: 'author',
    content,
    checks: [],
    scope: { organisationId: 'org', projectId: 'project', layerId: 'layer' },
  })
  const upload = await saveFeatureCreationUpload(f.db, {
    taskId: draft.task.id,
    actorId: 'author',
    storageNamespace: 'local',
    storageKey: 'submission',
    mediaType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    metadata: { version: 1 },
  })
  await submitFeatureCreationTask(f.db, { taskId: draft.task.id, actorId: 'author' })
  state.ctx = {
    db: f.db,
    user: { id: 'author', superAdmin: true, isAnonymous: false },
    userId: 'author',
    userRoles: [],
    isAdminRequest: true,
    event: { locals: { platform: { env: {} } } },
  }
  const scope = { taskId: draft.task.id, meta: { isAdminRequest: true as const } }
  return { f, upload, scope }
}
it('authorizes before exposing review data and returns only the image projection', async () => {
  const { scope } = await fixture()
  const [review] = await getTaskImageReviews(scope)
  expect(Object.keys(review.content)).toEqual(['gallery'])
  expect(review).not.toHaveProperty('comparisonGuard')
  expect(Object.keys(review.submitted)).toEqual(['gallery'])
  state.ctx.user.superAdmin = false
  await expect(getTaskImageReviews(scope)).rejects.toMatchObject({ status: 403 })
})
it('validates replacements before storage and rejects stale replay without another write', async () => {
  const { scope, upload } = await fixture()
  const [review] = await getTaskImageReviews(scope)
  const input = {
    ...scope,
    proposalId: review.proposalId,
    proposalVersion: review.proposalVersion,
    expectedReviewId: null,
    expectedRevisionId: null,
    expectedGeneration: 0,
    patch: { imageId: upload.imageId },
    bytes: btoa('verified bytes'),
    mediaType: 'image/png' as const,
  }
  state.transform.mockRejectedValueOnce(new Error('Bad image'))
  await expect(replaceTaskReviewImage(input)).rejects.toThrow('Bad image')
  expect(state.put).not.toHaveBeenCalled()
  state.transform.mockResolvedValue(new Response('decoded'))
  const result = await replaceTaskReviewImage(input)
  expect(result?.reviewId).toBeTruthy()
  expect(state.put).toHaveBeenCalledTimes(1)
  expect(state.put.mock.calls[0][0]).toMatch(/^review\//)
  await expect(replaceTaskReviewImage(input)).rejects.toMatchObject({ status: 409 })
  expect(state.put).toHaveBeenCalledTimes(1)
  await expect(
    saveTaskImageReview({
      ...input,
      expectedReviewId: result!.reviewId,
      patch: { imageId: 'unrelated', rotation: 90 },
    }),
  ).rejects.toThrow('does not belong')
})
