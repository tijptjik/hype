// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

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
vi.mock('$lib/api/services/authz', () => ({}))
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
vi.mock('$lib/db/services/task', () => ({}))
vi.mock('$lib/db/services/feature', () => ({}))
vi.mock('$lib/db/services/layer', () => ({}))
vi.mock('$lib/api/services/feature', () => ({}))
vi.mock('$lib/api/services/task', () => ({}))

import {
  beginMissingReportDraft,
  beginNewFeatureDraft,
  beginNewPhotosDraft,
  finalizeTaskDraft,
  submitMissingReport,
  submitNewFeature,
  submitNewPhotos,
} from '$lib/api/server/tasks.remote'

const guestContext = { user: { isAnonymous: true } }
const incompleteSessionContext = { user: {} }
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
