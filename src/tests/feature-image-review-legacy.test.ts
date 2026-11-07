// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  initializeFeatureRevision,
  createFeatureRevisionProposal,
  submitFeatureRevisionProposal,
  acceptFeatureRevisionProposal,
} from '#lib/db/services/featureRevision.js'
import { createImageAssetRevision } from '#lib/db/services/imageRevision.js'
import {
  readFeatureImageReview,
  saveFeatureImageReview,
} from '#lib/db/services/featureImageReview.js'

it('keeps legacy submitted candidates immutable and writes a separate reviewed acceptance revision', async () => {
  const source = lifecycleFixture(),
    f = publicationSqlite({})
  const db = f.db as unknown as Database
  try {
    const content = structuredClone((await source.initialize(false)).content)
    content.gallery = { entries: {}, order: [] }
    f.sqlite.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE feature(id TEXT PRIMARY KEY,isPublished INTEGER DEFAULT 0,localIsPublished INTEGER DEFAULT 0,isDraft INTEGER DEFAULT 0,isPendingReview INTEGER DEFAULT 1,publisherId TEXT,publishedAt TEXT,modifiedAt TEXT);
   INSERT INTO feature(id) VALUES('f');
   CREATE TABLE image(id TEXT PRIMARY KEY,isArchived INTEGER DEFAULT 0,createdAt TEXT,contributorId TEXT); INSERT INTO image(id) VALUES('photo');
   CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,type TEXT,isDraft INTEGER,isReviewed INTEGER,projectId TEXT); INSERT INTO task VALUES('task','f','newFeature',0,0,'project');
   CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
   CREATE TABLE featureInitialRevision(featureId TEXT,proposalId TEXT,mode TEXT);
   CREATE TABLE featureImageUploadRevision(proposalId TEXT,taskIds TEXT);`)
    for (const migration of [
      '0171_feature_revisions.sql',
      '0172_image_revisions.sql',
      '0201_task_image_review_context.sql',
    ])
      f.sqlite.exec(readFileSync('migrations/' + migration, 'utf8'))
    const command = { featureId: 'f', actorId: 'reviewer', guard: sql`1` }
    const base = (await initializeFeatureRevision(db, {
      ...command,
      content,
      published: false,
    }))!
    const image = (await createImageAssetRevision(db, {
      ...command,
      imageId: 'photo',
      storageNamespace: 'local',
      storageKey: 'original',
      contentHash: 'a'.repeat(64),
      mediaType: 'image/png',
      byteSize: 4,
      metadata: { version: 1 },
    }))!
    content.gallery = {
      order: ['photo'],
      entries: {
        photo: {
          imageRevisionId: image.imageRevisionId,
          intent: 'undefined',
          isPublished: true,
          caption: {},
          alt: {},
        },
      },
    }
    const proposal = (await createFeatureRevisionProposal(db, {
      ...command,
      baseRevisionId: base,
      content,
    }))!
    await submitFeatureRevisionProposal(db, {
      ...command,
      proposalId: proposal.proposalId,
      expectedCandidateRevisionId: proposal.candidateRevisionId,
    })
    f.sqlite
      .prepare("INSERT INTO featureInitialRevision VALUES('f',?,'contribution')")
      .run(proposal.proposalId)
    const scope = { taskId: 'task', proposalId: proposal.proposalId, guard: sql`1` }
    const original = (await readFeatureImageReview(db, scope))!
    expect(original.lifecycle).toBe(false)
    const reviewId = await saveFeatureImageReview(db, {
      ...scope,
      actorId: 'reviewer',
      proposalVersion: proposal.candidateRevisionId,
      expectedReviewId: null,
      expectedRevisionId: base,
      expectedGeneration: 0,
      patch: { imageId: 'photo', rotation: 90, caption: { en: 'Reviewed' } },
    })
    const acceptance = {
      ...command,
      proposalId: proposal.proposalId,
      expectedCandidateRevisionId: proposal.candidateRevisionId,
      expectedPublishedRevisionId: null,
      expectedComparisonRevisionId: base,
      expectedGeneration: 0,
      publicationIntent: 'initial' as const,
      validate: () => [],
      project: () => ({ statements: [], verify: sql`1` }),
    }
    expect(await acceptFeatureRevisionProposal(db, acceptance)).toEqual({
      status: 'stale',
    })
    const accepted = await acceptFeatureRevisionProposal(db, {
      ...acceptance,
      imageReview: { taskId: 'task', reviewId },
    })
    expect(accepted.status).toBe('accepted')
    if (accepted.status !== 'accepted') throw Error('Expected accepted result')
    expect(accepted.revisionId).not.toBe(proposal.candidateRevisionId)
    const result = JSON.parse(
      String(
        f.sqlite
          .prepare('SELECT content FROM featureRevision WHERE id=?')
          .get(accepted.revisionId)!.content,
      ),
    )
    expect(result.gallery.entries.photo.caption.en).toBe('Reviewed')
    expect(result.gallery.entries.photo.imageRevisionId).not.toBe(image.imageRevisionId)
    expect(
      JSON.parse(
        String(
          f.sqlite
            .prepare('SELECT content FROM featureRevision WHERE id=?')
            .get(proposal.candidateRevisionId)!.content,
        ),
      ),
    ).toEqual(content)
    // Retiring a merged identity must not hide the completed task's frozen submission.
    f.sqlite.exec("INSERT INTO feature(id) VALUES('survivor')")
    await initializeFeatureRevision(db, {
      ...command,
      featureId: 'survivor',
      content,
      published: true,
    })
    f.sqlite.exec(
      "UPDATE task SET isReviewed=1; UPDATE featureRevisionHead SET generation=generation+1,state='merged',publishedRevisionId=NULL,redirectFeatureId='survivor' WHERE featureId='f'",
    )
    const history = await readFeatureImageReview(db, scope)
    expect(history?.submitted.gallery).toEqual(content.gallery)
    expect(history?.content.gallery.entries.photo.caption.en).toBe('Reviewed')
    expect(await readFeatureImageReview(db, { ...scope, guard: sql`0` })).toBeNull()
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    source.sqlite.close()
    f.sqlite.close()
  }
})
