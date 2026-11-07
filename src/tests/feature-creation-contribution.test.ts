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
import { readFeatureImageRevisionPreview } from '#lib/api/services/imageRevisionPreview.js'
import { applyTaskUploadEvidence } from '#lib/db/services/featureUploadRead.js'
import { saveFeatureCreationUpload } from '#lib/db/services/featureLifecycleCreationUpload.js'

const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})

async function fixture() {
  const f = lifecycleFixture()
  connections.push(f)
  const initial = await f.initialize(false)
  const content = structuredClone(initial.content)
  content.gallery = { entries: {}, order: [] }
  const input = {
    actorId: 'author',
    scope: { organisationId: 'org', projectId: 'project', layerId: 'layer' },
    content,
    checks: [],
  }
  const draft = await saveFeatureCreationTaskDraft(f.db, input)
  return { ...f, input, draft }
}

describe('creation proposals without provisional Features', () => {
  it('keeps form edits and uploaded photos in the proposal until submission', async () => {
    const f = await fixture()
    expect(f.draft.featureId).toBeNull()
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
    const upload = {
      taskId: f.draft.task.id,
      actorId: 'author',
      storageNamespace: 'local' as const,
      storageKey: 'creation-photo',
      mediaType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      metadata: { version: 1 },
    }
    const first = await saveFeatureCreationUpload(f.db, upload)
    expect(await saveFeatureCreationUpload(f.db, upload)).toMatchObject({
      ...first,
      replayed: true,
    })
    const edited = structuredClone(f.input.content)
    edited.translations.en.title.value = 'Contributed Feature'
    await saveFeatureCreationTaskDraft(f.db, {
      ...f.input,
      content: edited,
      taskId: f.draft.task.id,
    })
    const current = await readFeatureCreationTask(f.db, {
      taskId: f.draft.task.id,
      guard: sql`1`,
    })
    expect(current?.content.gallery.order).toEqual([first.imageId])
    expect(current?.content.translations.en.title.value).toBe('Contributed Feature')
    expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(1)
    expect(
      await submitFeatureCreationTask(f.db, {
        taskId: f.draft.task.id,
        actorId: 'author',
      }),
    ).toBe(true)
    expect(
      await submitFeatureCreationTask(f.db, {
        taskId: f.draft.task.id,
        actorId: 'author',
      }),
    ).toBe(true)
    expect(
      await readFeatureCreationTask(f.db, { taskId: f.draft.task.id, guard: sql`1` }),
    ).toMatchObject({ isDraft: false, status: 'submitted' })
    await expect(
      saveFeatureCreationTaskDraft(f.db, { ...f.input, taskId: f.draft.task.id }),
    ).rejects.toThrow('already been submitted')
    await expect(
      saveFeatureCreationUpload(f.db, { ...upload, storageKey: 'late-photo' }),
    ).rejects.toThrow('already been submitted')
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('rejects stolen tasks, altered retries and hidden contribution destinations', async () => {
    const f = await fixture()
    await expect(
      saveFeatureCreationTaskDraft(f.db, {
        ...f.input,
        actorId: 'intruder',
        taskId: f.draft.task.id,
      }),
    ).rejects.toThrow('unavailable')
    await expect(
      submitFeatureCreationTask(f.db, { taskId: f.draft.task.id, actorId: 'intruder' }),
    ).rejects.toThrow('unavailable')
    const upload = {
      taskId: f.draft.task.id,
      actorId: 'author',
      storageNamespace: 'local' as const,
      storageKey: 'creation-photo',
      mediaType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      metadata: { version: 1 },
    }
    await saveFeatureCreationUpload(f.db, upload)
    await expect(
      saveFeatureCreationUpload(f.db, {
        ...upload,
        bytes: new Uint8Array([4, 5, 6]).buffer,
      }),
    ).rejects.toThrow('differs')
    f.sqlite.exec("UPDATE layer SET isPublished=0 WHERE id='layer'")
    expect(
      await submitFeatureCreationTask(f.db, {
        taskId: f.draft.task.id,
        actorId: 'author',
      }),
    ).toBe(false)
    await expect(saveFeatureCreationTaskDraft(f.db, f.input)).rejects.toThrow(
      'destination changed',
    )
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
  })
  it('restricts retained previews and accepts a contribution as an unpublished identity', async () => {
    const f = await fixture()
    const upload = await saveFeatureCreationUpload(f.db, {
      taskId: f.draft.task.id,
      actorId: 'author',
      storageNamespace: 'local',
      storageKey: 'private-photo',
      mediaType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      metadata: { version: 1 },
    })
    const revisionId = f.sqlite
      .prepare('SELECT imageRevisionId FROM featureUploadEvidence WHERE imageId=?')
      .get(upload.imageId)?.imageRevisionId as string
    const author = { user: { id: 'author' }, userRoles: [] }
    const staff = { user: { id: 'reviewer', superAdmin: true }, userRoles: [] }
    expect(await readFeatureImageRevisionPreview(f.db, revisionId, null)).toBeNull()
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, author),
    ).not.toBeNull()
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, author, true),
    ).toBeNull()
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, staff),
    ).toBeNull()
    expect(
      await submitFeatureCreationTask(f.db, {
        taskId: f.draft.task.id,
        actorId: 'author',
      }),
    ).toBe(true)
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, staff, true),
    ).not.toBeNull()
    const current = (await readFeatureCreationTask(f.db, {
      taskId: f.draft.task.id,
      guard: sql`1`,
    }))!
    const input = {
      taskId: current.taskId,
      proposalId: current.proposalId,
      expectedVersion: current.version,
      expectedModifiedAt: current.modifiedAt,
      actorId: 'reviewer',
      guard: sql`1`,
      accept: true,
      reason: 'Reviewed',
    }
    const accepted = await reviewFeatureCreationTask(f.db, input)
    expect(accepted?.featureId).toBeTruthy()
    expect(
      f.sqlite
        .prepare('SELECT isPublished,contributorId FROM feature WHERE id=?')
        .get(accepted!.featureId),
    ).toMatchObject({ isPublished: 0, contributorId: 'author' })
    expect(await reviewFeatureCreationTask(f.db, input)).toBeNull()
    const hydrated = await applyTaskUploadEvidence(f.db, [
      {
        id: current.taskId,
        featureId: accepted!.featureId,
        images: [{ imageId: upload.imageId, image: { id: upload.imageId } }],
      },
    ])
    expect(hydrated[0]).toHaveProperty('creationProposal.id', current.proposalId)
    expect(hydrated[0].images?.[0].image).toHaveProperty('imageRevisionId', revisionId)
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, author),
    ).not.toBeNull()
    f.sqlite.exec("UPDATE task SET projectId='wrong' WHERE id='" + current.taskId + "'")
    expect(
      await readFeatureImageRevisionPreview(f.db, revisionId, null, author),
    ).toBeNull()
  })
})
