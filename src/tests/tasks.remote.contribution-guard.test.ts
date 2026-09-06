// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reviewMocks = vi.hoisted(() => ({
  loadTask: vi.fn(),
  probeTaskQuery: vi.fn(),
  authorizeTaskReadForProbe: vi.fn(),
  updateTask: vi.fn(),
  archiveImages: vi.fn(),
  publishImages: vi.fn(),
  probeFeatureForUpdate: vi.fn(),
  probeLayerForUpdate: vi.fn(),
  updateFeatureByIdWithConcurrency: vi.fn(),
  assertUserContributedFeatureDraftIsSubmittable: vi.fn(),
  updateUserContributedFeatureDraft: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => {
  const withRemoteMetadata = (handler: unknown, type: 'command' | 'form' | 'query') =>
    Object.assign(handler as object, {
      __: { type, id: '', name: '' },
    })

  return {
    guardedCommand: (_schema: unknown, handler: unknown) =>
      withRemoteMetadata(handler, 'command'),
    guardedForm: (_schema: unknown, handler: unknown) =>
      withRemoteMetadata(handler, 'form'),
    guardedQuery: (_schema: unknown, handler: unknown) =>
      withRemoteMetadata(handler, 'query'),
  }
})

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const thrown = new Error(message) as Error & { status: number }
    thrown.status = status
    throw thrown
  },
}))

vi.mock('$lib/i18n', () => ({ getLocale: vi.fn() }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))
vi.mock('$lib/api', () => ({ getValidQueryParams: vi.fn() }))
vi.mock('$lib/api/services/authz', () => ({
  authorizeTaskReadForProbe: reviewMocks.authorizeTaskReadForProbe,
}))
vi.mock('$lib/db/schema', () => ({ task: {} }))
vi.mock('$lib/db/zod/schema/task', () => ({
  BeginMissingReportDraftSchema: {},
  BeginNewFeatureDraftSchema: {},
  BeginNewPhotosDraftSchema: {},
  FinalizeTaskDraftSchema: {},
  GetTaskEditorDataSchema: {},
  GetTasksSchema: {},
  ReassignTaskLayerSchema: {},
  ReviewTaskSchema: {},
  SubmitMissingReportSchema: {},
  SubmitNewFeatureSchema: {},
  SubmitNewPhotosSchema: {},
}))
vi.mock('$lib/db/services/task', () => reviewMocks)
vi.mock('$lib/db/services/feature', () => reviewMocks)
vi.mock('$lib/db/services/layer', () => reviewMocks)
vi.mock('$lib/api/services/feature', () => reviewMocks)
vi.mock('$lib/api/services/task', () => ({
  getTaskWithRelations: vi.fn(),
  toEntityResponseShape: vi.fn(task => task),
}))

import {
  beginMissingReportDraft,
  beginNewFeatureDraft,
  beginNewPhotosDraft,
  finalizeTaskDraft,
  submitMissingReport,
  submitNewFeature,
  submitNewPhotos,
  reviewTask,
  reassignTaskLayer,
} from '$lib/api/server/tasks.remote'

const guestContext = { user: { isAnonymous: true } }
const incompleteSessionContext = { user: {} }
const editDraftHandler = beginNewFeatureDraft as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const finalizeHandler = finalizeTaskDraft as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const reviewHandler = reviewTask as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const reassignHandler = reassignTaskLayer as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const contributionHandlers = [
  beginMissingReportDraft,
  beginNewFeatureDraft,
  beginNewPhotosDraft,
  finalizeTaskDraft,
  submitMissingReport,
  submitNewFeature,
  submitNewPhotos,
] as Array<(input: unknown, ctx: unknown) => Promise<unknown>>

describe('task contribution account guard', () => {
  it('rejects every contribution path for an anonymous guest', async () => {
    for (const handler of contributionHandlers) {
      await expect(handler({}, guestContext)).rejects.toMatchObject({
        status: 403,
        message: 'ACCOUNT_REQUIRED',
      })
    }
  })

  it('rejects an incomplete session rather than treating it as an account', async () => {
    await expect(
      beginNewPhotosDraft({}, incompleteSessionContext),
    ).rejects.toMatchObject({
      status: 403,
      message: 'ACCOUNT_REQUIRED',
    })
  })
})

describe('completed task write guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reviewMocks.probeTaskQuery.mockResolvedValue({ id: 'task' })
    reviewMocks.authorizeTaskReadForProbe.mockReturnValue({ allowed: true })
  })

  it.each(['newFeature', 'newPhoto', 'reportedMissing'])(
    'rejects another review of a completed %s task before side effects',
    async type => {
      reviewMocks.loadTask.mockResolvedValue({ id: 'task', type, isReviewed: true })
      await expect(
        reviewHandler(
          { id: 'task', action: 'reject' } as never,
          {
            user: {},
            event: { locals: { hub: {} } },
          } as never,
        ),
      ).rejects.toMatchObject({ status: 409, message: 'TASK_ALREADY_REVIEWED' })
      expect(reviewMocks.updateTask).not.toHaveBeenCalled()
      expect(reviewMocks.archiveImages).not.toHaveBeenCalled()
      expect(reviewMocks.publishImages).not.toHaveBeenCalled()
      expect(reviewMocks.probeFeatureForUpdate).not.toHaveBeenCalled()
    },
  )

  it('rejects layer reassignment of a completed task before changing the feature', async () => {
    reviewMocks.loadTask.mockResolvedValue({
      id: 'task',
      type: 'newFeature',
      isReviewed: true,
    })
    await expect(
      reassignHandler(
        { id: 'task', layerId: 'layer' } as never,
        {
          user: {},
          event: { locals: { hub: {} } },
        } as never,
      ),
    ).rejects.toMatchObject({ status: 409, message: 'TASK_ALREADY_REVIEWED' })
    expect(reviewMocks.probeLayerForUpdate).not.toHaveBeenCalled()
    expect(reviewMocks.probeFeatureForUpdate).not.toHaveBeenCalled()
  })

  it('still publishes images and records a review for a pending task', async () => {
    const pendingTask = { id: 'task', type: 'newPhoto', isReviewed: false }
    reviewMocks.loadTask.mockResolvedValue(pendingTask)
    await reviewHandler(
      { id: 'task', action: 'acceptAll' },
      { db: 'db', user: {}, userId: 'reviewer', event: { locals: { hub: {} } } },
    )
    expect(reviewMocks.publishImages).toHaveBeenCalledWith(
      'db',
      'task',
      false,
      'reviewer',
    )
    expect(reviewMocks.updateTask).toHaveBeenCalledWith(
      'db',
      expect.objectContaining({ isReviewed: true, reviewOutcome: 'accepted' }),
      'task',
    )
  })
})

describe('task draft finalization recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each(['conflict', 'failure', 'missing'])(
    'keeps a task retryable after a feature %s',
    async failure => {
      const draft = {
        id: 'task',
        contributorId: 'contributor',
        type: 'newFeature',
        featureId: 'feature',
        isDraft: true,
        images: [{ imageId: 'image' }],
      }
      const ctx = {
        user: { id: 'contributor', isAnonymous: false },
        userId: 'contributor',
        db: { query: { task: { findFirst: vi.fn(async () => ({ ...draft })) } } },
      }
      reviewMocks.updateTask.mockImplementation(async (_db, patch) => {
        Object.assign(draft, patch)
        return { ...draft }
      })
      reviewMocks.probeFeatureForUpdate.mockResolvedValue(
        failure === 'missing' ? null : { id: 'feature', modifiedAt: 'version' },
      )
      if (failure === 'failure') {
        reviewMocks.updateFeatureByIdWithConcurrency.mockRejectedValue(
          new Error('write failed'),
        )
      } else {
        reviewMocks.updateFeatureByIdWithConcurrency.mockResolvedValue(undefined)
      }

      await expect(finalizeHandler({ id: 'task' }, ctx)).rejects.toThrow()
      expect(reviewMocks.updateTask).not.toHaveBeenCalled()
      expect(draft.isDraft).toBe(true)

      // A fresh request must retry the feature write rather than return early.
      reviewMocks.probeFeatureForUpdate.mockResolvedValue({
        id: 'feature',
        modifiedAt: 'fresh',
      })
      reviewMocks.updateFeatureByIdWithConcurrency.mockResolvedValue({
        id: 'feature',
        isDraft: false,
      })
      await expect(finalizeHandler({ id: 'task' }, ctx)).resolves.toMatchObject({
        data: { isDraft: false },
      })
      expect(reviewMocks.updateFeatureByIdWithConcurrency).toHaveBeenLastCalledWith(
        ctx.db,
        { id: 'feature', updatedAt: 'fresh', data: { isDraft: false } },
      )
      expect(draft.isDraft).toBe(false)
    },
  )
})

describe('submitted contribution edit guard', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    { isDraft: false, isReviewed: false },
    { isDraft: false, isReviewed: true },
    { isDraft: true, isReviewed: true },
  ])('rejects editing a submitted or reviewed task: %j', async state => {
    const ctx = {
      user: { id: 'contributor', isAnonymous: false },
      userId: 'contributor',
      event: {},
      db: {
        query: {
          task: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'task',
              contributorId: 'contributor',
              type: 'newFeature',
              featureId: 'feature',
              ...state,
            }),
          },
        },
      },
    }
    await expect(
      editDraftHandler({ task: { taskId: 'task', feature: {} } }, ctx),
    ).rejects.toMatchObject({ status: 409, message: 'TASK_DRAFT_ALREADY_SUBMITTED' })
    expect(reviewMocks.updateUserContributedFeatureDraft).not.toHaveBeenCalled()
    expect(reviewMocks.updateTask).not.toHaveBeenCalled()
  })

  it('allows the contributor to continue editing an unreviewed draft', async () => {
    const ctx = {
      user: { id: 'contributor', isAnonymous: false },
      userId: 'contributor',
      event: {},
      db: {
        query: {
          task: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'task',
              contributorId: 'contributor',
              type: 'newFeature',
              featureId: 'feature',
              isDraft: true,
              isReviewed: false,
            }),
          },
        },
      },
    }
    reviewMocks.updateUserContributedFeatureDraft.mockResolvedValue({
      id: 'feature',
      organisationId: 'organisation',
      projectId: 'project',
      layerId: 'layer',
    })
    await expect(
      editDraftHandler({ task: { taskId: 'task', feature: {} } }, ctx),
    ).resolves.toMatchObject({ data: { featureId: 'feature' } })
    expect(reviewMocks.updateUserContributedFeatureDraft).toHaveBeenCalledWith(
      ctx.db,
      'feature',
      { contributorId: 'contributor', isDraft: true },
      '',
      '',
    )
    expect(reviewMocks.updateTask).toHaveBeenCalledOnce()
  })
})
