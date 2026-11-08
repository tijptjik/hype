// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { TaskListProfileAPI } from '#lib/db/zod/schema/task.js'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { saveFeatureImageUploadDraft } from '#lib/db/services/featureImageUploadRevision.js'
import { prepareFeatureUploadSubmission } from '#lib/db/services/featureUploadTasks.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { readFeatureImageReview, saveFeatureImageReview } from '#lib/db/services/featureImageReview.js'
import { prepareTaskPhotoAcceptance, type PhotoAcceptanceMode } from '#lib/db/services/taskPhotoAcceptance.js'
import { acceptPartialFeatureProposal, readCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => { for (const f of connections.splice(0)) f.sqlite.close() })
const command = { featureId: 'f', actorId: 'author', guard: sql`1` }
async function fixture(intents = ['undefined', 'research']) {
  const f = lifecycleFixture(); connections.push(f)
  const initial = await f.initialize(false)
  f.sqlite.exec("INSERT INTO task(id,featureId,organisationId,projectId,contributorId,isDraft,isReviewed,type) VALUES('task','f','org','project','author',1,0,'newPhoto')")
  const uploads: Extract<Awaited<ReturnType<typeof saveFeatureImageUploadDraft>>, { status: 'saved' }>[] = []
  for (const [index, intent] of intents.entries()) {
    const upload = await saveFeatureImageUploadDraft(f.db, { ...command, storageNamespace: 'local', storageKey: 'task-upload-' + index, mediaType: 'image/jpeg', bytes: new Uint8Array([index,2,3]).buffer, taskIds: ['task'], draftContributor: true, intent, deriveMetadata: () => ({ version: 1, presentationMode: 'contain' as const }) })
    if (upload.status !== 'saved') throw Error('Expected upload')
    uploads.push(upload)
  }
  await executeRevisionBatch(f.db, sql`1`, await prepareFeatureUploadSubmission(f.db, { ...command, taskId: 'task' }))
  f.sqlite.exec("UPDATE task SET isDraft=0 WHERE id='task'")
  async function tokens() {
    return Promise.all(uploads.map(async upload => {
      const row = (await readFeatureImageReview(f.db, { taskId: 'task', proposalId: upload.proposalId, guard: sql`1` }))!
      return { proposalId: row.proposalId, proposalVersion: row.proposalVersion, expectedReviewId: row.reviewId, expectedRevisionId: row.currentRevisionId, expectedGeneration: row.currentGeneration }
    }))
  }
  async function plan(mode: PhotoAcceptanceMode) { return prepareTaskPhotoAcceptance(f.db, { taskId: 'task', actorId: 'author', mode, reviews: await tokens() }, sql`1`) }
  async function accept(prepared: NonNullable<Awaited<ReturnType<typeof plan>>>) {
    if (prepared.rejectAll) return executeRevisionBatch(f.db, prepared.guard, prepared.decisions)
    const p = prepared.primary
    return acceptPartialFeatureProposal(f.db, { ...command, guard: prepared.guard, attachmentGuard: prepared.guard, proposalId: p.proposalId, expectedProposalVersion: p.proposalVersion, expectedRevisionId: p.currentRevisionId!, expectedVersion: p.currentGeneration, imageReview: { taskId: 'task', reviewId: p.reviewId }, reviewedContent: prepared.content, completion: prepared.decisions, validate: () => [] })
  }
  return { ...f, initial, uploads, tokens, plan, accept }
}
for (const mode of ['acceptAll', 'acceptClassified'] as const) it(`${mode} decides all proposals atomically and preserves saved edits and existing images`, async () => {
  const f = await fixture()
  const [first, second] = await f.tokens()
  await saveFeatureImageReview(f.db, { ...second, taskId: 'task', actorId: 'author', guard: sql`1`, patch: { imageId: f.uploads[1].imageId, rotation: 90, caption: { en: 'Reviewed caption' } } })
  const plan = (await f.plan(mode))!
  expect(plan).toBeTruthy()
  expect(await f.accept(plan)).toMatchObject({ status: 'accepted' })
  const current = (await readCurrentFeatureRevision(f.db, command))!
  expect(current.content.gallery.entries.photo).toEqual(f.initial.content.gallery.entries.photo)
  expect(current.content.gallery.entries.research).toEqual(f.initial.content.gallery.entries.research)
  const unclassified = current.content.gallery.entries[f.uploads[0].imageId]
  if (mode === 'acceptAll') expect(unclassified).toMatchObject({ intent: 'general', isPublished: true })
  else expect(unclassified).toBeUndefined()
  expect(current.content.gallery.entries[f.uploads[1].imageId]).toMatchObject({ intent: 'research', isPublished: false, caption: { en: 'Reviewed caption' } })
  expect(current.content.gallery.entries[f.uploads[1].imageId].imageRevisionId).not.toBe(f.uploads[1].imageRevisionId)
  expect(f.sqlite.prepare('SELECT isReviewed,reviewAction FROM task').get()).toMatchObject({ isReviewed: 1, reviewAction: mode === 'acceptAll' ? 'added-all-photos' : 'added-classified-photos' })
  // Every persisted acceptance action must remain readable by the reviewed queue.
  const reviewedTask = f.sqlite.prepare('SELECT reviewAction FROM task').get()
  expect(TaskListProfileAPI.pick({ reviewAction: true }).parse(reviewedTask)).toEqual(reviewedTask)
  expect(f.sqlite.prepare("SELECT count(*) n FROM featureRevisionProposal WHERE status='submitted'").get()?.n).toBe(0)
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
for (const mode of ['acceptAll', 'acceptClassified'] as const) it(`${mode} preserves existing-image intent edits without changing submitted evidence`, async () => {
  const f = await fixture(['general'])
  const [token] = await f.tokens()
  const before = (await readFeatureImageReview(f.db, { taskId: 'task', proposalId: token.proposalId, guard: sql`1` }))!
  expect(before.imageIds).not.toContain('photo')
  await saveFeatureImageReview(f.db, { ...token, taskId: 'task', actorId: 'author', guard: sql`1`, patch: { imageId: 'photo', intent: 'research' } })
  const saved = (await readFeatureImageReview(f.db, { taskId: 'task', proposalId: token.proposalId, guard: sql`1` }))!
  expect(saved.content.gallery.entries.photo).toMatchObject({ intent: 'research', isPublished: false })
  expect(saved.submitted).toEqual(before.submitted)
  expect((await readCurrentFeatureRevision(f.db, command))!.revisionId).toBe(f.initial.revisionId)
  expect(await f.accept((await f.plan(mode))!)).toMatchObject({ status: 'accepted' })
  expect((await readCurrentFeatureRevision(f.db, command))!.content.gallery.entries.photo).toEqual({
    ...f.initial.content.gallery.entries.photo, intent: 'research', isPublished: false,
  })
})
it('rejects all unclassified submissions without publishing or changing the existing gallery', async () => {
  const f = await fixture(['undefined','undefined'])
  const plan = (await f.plan('acceptClassified'))!
  expect(plan.rejectAll).toBe(true)
  expect(await f.accept(plan)).toBeTruthy()
  expect((await readCurrentFeatureRevision(f.db, command))!.revisionId).toBe(f.initial.revisionId)
  expect(f.sqlite.prepare('SELECT isReviewed,reviewOutcome FROM task').get()).toMatchObject({ isReviewed: 1, reviewOutcome: 'rejected' })
})
it('rejects omitted and stale evidence and rolls back publication when task completion fails', async () => {
  const f = await fixture()
  const tokens = await f.tokens()
  expect(await prepareTaskPhotoAcceptance(f.db, { taskId:'task', actorId:'author', mode:'acceptAll', reviews:tokens.slice(0,1) }, sql`1`)).toBeNull()
  const plan = (await f.plan('acceptAll'))!
  f.sqlite.exec("CREATE TRIGGER block_completion BEFORE UPDATE OF isReviewed ON task BEGIN SELECT RAISE(IGNORE); END")
  expect(await f.accept(plan)).toEqual({ status: 'stale' })
  expect((await readCurrentFeatureRevision(f.db, command))!.revisionId).toBe(f.initial.revisionId)
  expect(f.sqlite.prepare("SELECT count(*) n FROM featureRevisionProposal WHERE status='submitted'").get()?.n).toBe(2)
  f.sqlite.exec('DROP TRIGGER block_completion')
  await saveFeatureImageReview(f.db, { ...tokens[1], taskId:'task', actorId:'author', guard:sql`1`, patch:{ imageId:f.uploads[1].imageId, caption:{en:'Newer edit'} } })
  expect(await f.accept(plan)).toEqual({ status: 'stale' })
  expect((await readCurrentFeatureRevision(f.db, command))!.revisionId).toBe(f.initial.revisionId)
})

import { readFileSync } from 'node:fs'
import { publicationSqlite } from './fixtures/publicationSqlite'
import type { Database } from '#lib/types.js'
import { initializeFeatureRevision, createFeatureRevisionProposal, submitFeatureRevisionProposal, acceptFeatureRevisionProposal } from '#lib/db/services/featureRevision.js'
import { createImageAssetRevision } from '#lib/db/services/imageRevision.js'
for (const mode of ['acceptAll', 'acceptClassified'] as const) it(`supports ${mode} on the retained legacy schema`, async () => {
  const source = lifecycleFixture(), f = publicationSqlite({}), db = f.db as unknown as Database
  try {
    const content = structuredClone((await source.initialize(false)).content)
    content.gallery = { entries:{}, order:[] }
    f.sqlite.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,isPublished INTEGER DEFAULT 0,localIsPublished INTEGER DEFAULT 0,isDraft INTEGER DEFAULT 0,isPendingReview INTEGER DEFAULT 1,publisherId TEXT,publishedAt TEXT,modifiedAt TEXT);
      INSERT INTO feature(id,organisationId,projectId) VALUES('f','org','project');
      CREATE TABLE image(id TEXT PRIMARY KEY,isArchived INTEGER DEFAULT 0,createdAt TEXT,contributorId TEXT);
      CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,type TEXT,isDraft INTEGER,isReviewed INTEGER,projectId TEXT,organisationId TEXT,reviewerId TEXT,reviewReason TEXT,reviewOutcome TEXT,reviewAction TEXT,modifiedAt TEXT);
      INSERT INTO task(id,featureId,type,isDraft,isReviewed,projectId,organisationId) VALUES('task','f','newPhoto',0,0,'project','org');
      CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
      CREATE TABLE featureInitialRevision(featureId TEXT,proposalId TEXT,mode TEXT);
      CREATE TABLE featureImageUploadRevision(proposalId TEXT,taskIds TEXT,featureId TEXT,imageId TEXT);`)
    for (const migration of ['0171_feature_revisions.sql','0172_image_revisions.sql','0201_task_image_review_context.sql']) f.sqlite.exec(readFileSync('migrations/'+migration,'utf8'))
    const base = (await initializeFeatureRevision(db, { ...command, content, published:false }))!
    const tokens = [], originals = []
    for (const [index,intent] of ['undefined','research'].entries()) {
      const id = 'upload-'+index
      f.sqlite.prepare('INSERT INTO image(id) VALUES(?)').run(id)
      const image = (await createImageAssetRevision(db, { ...command, imageId:id, storageNamespace:'local', storageKey:id, contentHash:String(index).repeat(64), mediaType:'image/png', byteSize:4, metadata:{ version:1 } }))!
      const candidate = structuredClone(content)
      candidate.gallery = { order:[id], entries:{ [id]:{ imageRevisionId:image.imageRevisionId, intent, isPublished:false, caption:{}, alt:{} } } }
      const p = (await createFeatureRevisionProposal(db, { ...command, baseRevisionId:base, content:candidate }))!
      await submitFeatureRevisionProposal(db, { ...command, proposalId:p.proposalId, expectedCandidateRevisionId:p.candidateRevisionId })
      f.sqlite.prepare("INSERT INTO featureImageUploadRevision VALUES(?,'[\"task\"]','f',?)").run(p.proposalId,id)
      f.sqlite.prepare("INSERT INTO taskImage VALUES('task',?)").run(id)
      const review = (await readFeatureImageReview(db, { taskId:'task', proposalId:p.proposalId, guard:sql`1` }))!
      tokens.push({ proposalId:p.proposalId, proposalVersion:p.candidateRevisionId, expectedReviewId:review.reviewId, expectedRevisionId:review.currentRevisionId, expectedGeneration:review.currentGeneration })
      originals.push({ id:p.candidateRevisionId, content:candidate })
    }
    const plan = (await prepareTaskPhotoAcceptance(db, { taskId:'task', actorId:'author', mode, reviews:tokens }, sql`1`))!
    expect(plan).toBeTruthy()
    const accepted = await acceptFeatureRevisionProposal(db, { ...command, guard:plan.guard, proposalId:plan.primary.proposalId, expectedCandidateRevisionId:plan.primary.proposalVersion, expectedPublishedRevisionId:null, expectedComparisonRevisionId:base, expectedGeneration:0, publicationIntent:'initial', imageReview:{ taskId:'task', reviewId:plan.primary.reviewId }, reviewedContent:plan.content, decisionStatements:plan.decisions, validate:()=>[], project:()=>({statements:[],verify:sql`1`}) })
    expect(accepted.status).toBe('accepted')
    if (accepted.status !== 'accepted') throw Error('Expected acceptance')
    const result = JSON.parse(String(f.sqlite.prepare('SELECT content FROM featureRevision WHERE id=?').get(accepted.revisionId)!.content))
    expect(result.gallery.order).toHaveLength(mode === 'acceptAll' ? 2 : 1)
    expect(result.gallery.entries['upload-1']).toMatchObject({ intent:'research', isPublished:false })
    for (const original of originals) expect(JSON.parse(String(f.sqlite.prepare('SELECT content FROM featureRevision WHERE id=?').get(original.id)!.content))).toEqual(original.content)
    expect(f.sqlite.prepare('SELECT isReviewed FROM task').get()?.isReviewed).toBe(1)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally { source.sqlite.close(); f.sqlite.close() }
})
