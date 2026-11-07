// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  saveFeatureCreationTaskDraft,
  readFeatureCreationTask,
  submitFeatureCreationTask,
  reviewFeatureCreationTask,
} from '#lib/db/services/featureLifecycleCreationTask.js'
import { saveFeatureCreationUpload } from '#lib/db/services/featureLifecycleCreationUpload.js'
import {
  readFeatureImageReview,
  saveFeatureImageReview,
} from '#lib/db/services/featureImageReview.js'
import { readFeatureImageRevisionPreview } from '#lib/api/services/imageRevisionPreview.js'

import {
  createPartialFeatureProposal,
  readCurrentFeatureRevision,
  saveFeatureEdit,
  acceptPartialFeatureProposal,
} from '#lib/db/services/featureLifecycle.js'
import { buildFeatureChanges } from '#lib/revisions/featureChanges.js'
import { prepareFeatureContributionTask } from '#lib/db/services/featureLifecycleTask.js'

const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
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
  const task = (await readFeatureCreationTask(f.db, {
    taskId: draft.task.id,
    guard: sql`1`,
  }))!
  const scope = { taskId: task.taskId, proposalId: task.proposalId, guard: sql`1` }
  const input = {
    ...scope,
    proposalVersion: task.version,
    expectedReviewId: null,
    expectedRevisionId: null,
    actorId: 'author',
  }
  return { ...f, task, upload, scope, input }
}

describe('review-owned task images', () => {
  it('stacks edits without changing submission pins and accepts the exact reviewed baseline', async () => {
    const f = await fixture()
    const before = f.sqlite
      .prepare('SELECT * FROM featureRevisionProposal WHERE id=?')
      .get(f.task.proposalId)
    const receipt = f.sqlite.prepare('SELECT * FROM featureUploadEvidence').all()
    const first = await saveFeatureImageReview(f.db, {
      ...f.input,
      patch: {
        imageId: f.upload.imageId,
        rotation: 90,
        caption: { en: 'Reviewed' },
        sortMode: 'manual',
      },
    })
    expect(first).toBeTruthy()
    expect(
      await saveFeatureImageReview(f.db, {
        ...f.input,
        patch: { imageId: f.upload.imageId, rotation: 180 },
      }),
    ).toBeNull()
    const second = await saveFeatureImageReview(f.db, {
      ...f.input,
      expectedReviewId: first!,
      patch: { imageId: f.upload.imageId, presentationMode: 'cover' },
    })
    const review = (await readFeatureImageReview(f.db, f.scope))!
    expect(review.images[f.upload.imageId].contributorId).toBe('author')
    expect(review.images[f.upload.imageId].metadata).toMatchObject({
      renderRotation: 90,
      presentationMode: 'cover',
    })
    expect(review.content.gallery.entries[f.upload.imageId].caption).toEqual({
      en: 'Reviewed',
    })
    expect(review.submitted.gallery.entries[f.upload.imageId].imageRevisionId).toBe(
      f.upload.imageRevisionId,
    )
    expect(
      f.sqlite
        .prepare('SELECT * FROM featureRevisionProposal WHERE id=?')
        .get(f.task.proposalId),
    ).toEqual(before)
    expect(f.sqlite.prepare('SELECT * FROM featureUploadEvidence').all()).toEqual(
      receipt,
    )
    const accept = {
      ...f.scope,
      expectedVersion: f.task.version,
      expectedModifiedAt: f.task.modifiedAt,
      actorId: 'author',
      accept: true,
      reason: 'Reviewed',
    }
    expect(await reviewFeatureCreationTask(f.db, accept)).toBeNull()
    expect(
      await reviewFeatureCreationTask(f.db, {
        ...accept,
        imageReview: { taskId: f.task.taskId, reviewId: first },
      }),
    ).toBeNull()
    const accepted = await reviewFeatureCreationTask(f.db, {
      ...accept,
      imageReview: { taskId: f.task.taskId, reviewId: second },
    })
    expect(accepted?.featureId).toBeTruthy()
    const outcome = (await readFeatureImageReview(f.db, f.scope))!
    expect(outcome.status).toBe('accepted')
    expect(outcome.stale).toBe(false)
    const result = f.sqlite
      .prepare(
        'SELECT r.content FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.id=?',
      )
      .get(accepted!.featureId!)!
    expect(JSON.parse(String(result.content)).gallery).toEqual(review.content.gallery)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('retains rejected edits privately and prevents writes after the task completes', async () => {
    const f = await fixture()
    const id = await saveFeatureImageReview(f.db, {
      ...f.input,
      patch: { imageId: f.upload.imageId, rotation: 270 },
    })
    const review = (await readFeatureImageReview(f.db, f.scope))!
    const pin = review.content.gallery.entries[f.upload.imageId].imageRevisionId
    expect(await readFeatureImageRevisionPreview(f.db, pin, null)).toBeNull()
    expect(
      await readFeatureImageRevisionPreview(f.db, pin, null, {
        user: { id: 'author', isAnonymous: false },
        userRoles: [],
      }),
    ).toBeNull()
    expect(
      await readFeatureImageRevisionPreview(f.db, pin, null, {
        user: { id: 'author', isAnonymous: false, superAdmin: true },
        userRoles: [],
      }),
    ).toBeTruthy()
    expect(
      await reviewFeatureCreationTask(f.db, {
        ...f.scope,
        expectedVersion: f.task.version,
        expectedModifiedAt: f.task.modifiedAt,
        actorId: 'author',
        accept: false,
        reason: 'Rejected',
      }),
    ).toEqual({ featureId: null })
    expect(
      await saveFeatureImageReview(f.db, {
        ...f.input,
        expectedReviewId: id,
        patch: { imageId: f.upload.imageId, rotation: 0 },
      }),
    ).toBeNull()
    const outcome = (await readFeatureImageReview(f.db, f.scope))!
    expect(outcome.reviewId).toBe(id)
    expect(outcome.status).toBe('rejected')
    expect(outcome.stale).toBe(false)
  })

  it('does not grant arbitrary image or proposal access and retains excluded evidence', async () => {
    const f = await fixture()
    await expect(
      saveFeatureImageReview(f.db, {
        ...f.input,
        patch: { imageId: 'photo', rotation: 90 },
      }),
    ).rejects.toThrow('does not belong')
    expect(
      await readFeatureImageReview(f.db, { ...f.scope, taskId: 'unrelated' }),
    ).toBeNull()
    expect(
      await saveFeatureImageReview(f.db, {
        ...f.input,
        guard: sql`0`,
        patch: { imageId: f.upload.imageId, rotation: 90 },
      }),
    ).toBeNull()
    const id = await saveFeatureImageReview(f.db, {
      ...f.input,
      patch: { imageId: f.upload.imageId, included: false },
    })
    const accepted = await reviewFeatureCreationTask(f.db, {
      ...f.scope,
      expectedVersion: f.task.version,
      expectedModifiedAt: f.task.modifiedAt,
      actorId: 'author',
      accept: true,
      reason: 'Excluded photo',
      imageReview: { taskId: f.task.taskId, reviewId: id },
    })
    expect(accepted?.featureId).toBeTruthy()
    expect(
      f.sqlite
        .prepare('SELECT * FROM featureUploadEvidence WHERE imageId=?')
        .get(f.upload.imageId),
    ).toBeTruthy()
  })
})

it('replaces only reviewer bytes and retains the original asset and metadata', async () => {
  const f = await fixture()
  const id = await saveFeatureImageReview(f.db, {
    ...f.input,
    patch: { imageId: f.upload.imageId },
    replacement: {
      storageNamespace: 'local',
      storageKey: 'review/replacement',
      contentHash: 'a'.repeat(64),
      mediaType: 'image/png',
      byteSize: 4,
    },
  })
  const review = (await readFeatureImageReview(f.db, f.scope))!
  expect(review.reviewId).toBe(id)
  expect(review.content.gallery.entries[f.upload.imageId].imageRevisionId).not.toBe(
    f.upload.imageRevisionId,
  )
  expect(
    f.sqlite
      .prepare(
        'SELECT a.storageKey FROM imageAssetVersion a JOIN imageRevision r ON r.assetVersionId=a.id WHERE r.id=?',
      )
      .get(f.upload.imageRevisionId)?.storageKey,
  ).toBe('submission')
  expect(review.images[f.upload.imageId].metadata).toMatchObject({
    renderRotation: 0,
    contentHash: 'a'.repeat(64),
  })
})

it('requires a fresh comparison after accepted content changes and preserves unrelated staff edits', async () => {
  const f = lifecycleFixture()
  connections.push(f)
  const initial = await f.initialize(false),
    proposed = structuredClone(initial.content)
  proposed.gallery.entries.photo.caption = { en: 'Submitted caption' }
  const common = { featureId: 'f', actorId: 'editor', guard: sql`1` }
  const proposal = (await createPartialFeatureProposal(f.db, {
    ...common,
    baseRevisionId: initial.revisionId,
    changes: buildFeatureChanges(initial.content, proposed),
    submit: true,
    attachTask: proposalId =>
      prepareFeatureContributionTask(f.db, {
        taskId: 'photo-task',
        proposalId,
        featureId: 'f',
        organisationId: 'org',
        projectId: 'project',
        actorId: 'editor',
        type: 'newPhoto',
        submitted: true,
      }),
  }))!
  const input = {
    taskId: 'photo-task',
    proposalId: proposal.proposalId,
    proposalVersion: proposal.version,
    expectedReviewId: null,
    expectedRevisionId: initial.revisionId,
    actorId: 'editor',
    guard: sql`1`,
  }
  const first = await saveFeatureImageReview(f.db, {
    ...input,
    patch: { imageId: 'photo', rotation: 90 },
  })
  const staff = await saveFeatureEdit(f.db, {
    ...common,
    expectedRevisionId: initial.revisionId,
    expectedVersion: 0,
    validate: () => [],
    derive: content => {
      content.translations.en.title.value = 'Staff title'
      return content
    },
  })
  const before = await readFeatureImageReview(f.db, input)
  expect(before?.stale).toBe(true)
  const accept = {
    ...common,
    proposalId: proposal.proposalId,
    expectedProposalVersion: proposal.version,
    expectedRevisionId: staff!,
    expectedVersion: 1,
    validate: () => [],
    attachmentGuard: sql`1`,
  }
  expect(
    await acceptPartialFeatureProposal(f.db, {
      ...accept,
      imageReview: { taskId: input.taskId, reviewId: first },
    }),
  ).toEqual({ status: 'stale' })
  const second = await saveFeatureImageReview(f.db, {
    ...input,
    expectedReviewId: first,
    expectedRevisionId: staff,
    refresh: true,
    patch: { imageId: 'photo' },
  })
  expect(second).toBeTruthy()
  expect(
    await acceptPartialFeatureProposal(f.db, {
      ...accept,
      imageReview: { taskId: input.taskId, reviewId: second },
    }),
  ).toMatchObject({ status: 'accepted' })
  const result = (await readCurrentFeatureRevision(f.db, common))!
  expect(result.content.translations.en.title.value).toBe('Staff title')
  expect(result.content.gallery.entries.photo.caption.en).toBe('Submitted caption')
  expect(result.content.gallery.entries.photo.imageRevisionId).not.toBe('image-r1')
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('stores explicit sorting in the review snapshot without changing the submission', async () => {
  const f = await fixture()
  const saved = await saveFeatureImageReview(f.db, {
    ...f.input,
    patch: { imageId: f.upload.imageId, sortMode: 'manual', order: [f.upload.imageId] },
  })
  expect(saved).toBeTruthy()
  const review = (await readFeatureImageReview(f.db, f.scope))!
  expect(review.content.gallery.sortMode).toBe('manual')
  expect(review.submitted.gallery.sortMode).toBeUndefined()
  expect(review.content.gallery.order).toEqual([f.upload.imageId])
})
