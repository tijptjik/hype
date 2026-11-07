// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  initializeFeatureRevision,
  acceptFeatureRevisionProposal,
  createFeatureRevisionProposal,
  submitFeatureRevisionProposal,
} from '#lib/db/services/featureRevision.js'
import { createImageAssetRevision } from '#lib/db/services/imageRevision.js'
import {
  readFeatureImageReview,
  saveFeatureImageReview,
} from '#lib/db/services/featureImageReview.js'

import { reviewInitialFeatureContribution } from '#lib/db/services/featureInitialReview.js'
import { prepareRevisionCheck } from '#lib/db/services/revisionBatch.js'

import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
vi.mock('#lib/db/services/featureRevisionSource.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('#lib/db/services/featureRevisionSource.js')>()
  return {
    ...actual,
    readFeatureRevisionSource: vi.fn(actual.readFeatureRevisionSource),
  }
})
vi.mock('#lib/db/services/featureRevisionContent.js', async importOriginal => ({
  ...(await importOriginal<
    typeof import('#lib/db/services/featureRevisionContent.js')
  >()),
  parseFeatureRevisionSource: () => ({ galleryLinks: [] }),
}))
vi.mock('#lib/db/services/featureRevisionProjection.js', async importOriginal => ({
  ...(await importOriginal<
    typeof import('#lib/db/services/featureRevisionProjection.js')
  >()),
  // Model the projection's edit fence before its gallery attachment check.
  prepareFeatureEditorialProjection: (
    db: Database,
    input: { gallery: { attachmentGuard: import('drizzle-orm').SQL } },
  ) => ({
    statements: [
      db.run(sql`UPDATE feature SET modifiedAt='projected' WHERE id='f'`),
      prepareRevisionCheck(db, input.gallery.attachmentGuard),
    ],
    verify: sql`1`,
  }),
}))

it('checks the task snapshot before projection while retaining reviewed-photo guards', async () => {
  const source = lifecycleFixture(),
    f = publicationSqlite({})
  const db = f.db as unknown as Database
  try {
    const content = structuredClone((await source.initialize(false)).content)
    vi.mocked(readFeatureRevisionSource).mockResolvedValue({ snapshot: '{}' } as never)
    content.gallery = { entries: {}, order: [] }
    f.sqlite.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE feature(id TEXT PRIMARY KEY,isPublished INTEGER DEFAULT 0,localIsPublished INTEGER DEFAULT 0,isDraft INTEGER DEFAULT 0,isPendingReview INTEGER DEFAULT 1,publisherId TEXT,publishedAt TEXT,modifiedAt TEXT,layerId TEXT DEFAULT 'layer',projectId TEXT DEFAULT 'project',organisationId TEXT DEFAULT 'org',isArchived INTEGER DEFAULT 0);
   CREATE TABLE layer(id TEXT,projectId TEXT,isPublished INTEGER,isArchived INTEGER); INSERT INTO layer VALUES('layer','project',1,0);
   CREATE TABLE project(id TEXT,organisationId TEXT,isPublished INTEGER,isArchived INTEGER); INSERT INTO project VALUES('project','org',1,0);
   CREATE TABLE organisation(id TEXT,isPublished INTEGER,isArchived INTEGER); INSERT INTO organisation VALUES('org',1,0);
   INSERT INTO feature(id,modifiedAt) VALUES('f','original');
   CREATE TABLE image(id TEXT PRIMARY KEY,isArchived INTEGER DEFAULT 0,createdAt TEXT,contributorId TEXT); INSERT INTO image(id) VALUES('photo');
   CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,type TEXT,isDraft INTEGER,isReviewed INTEGER,projectId TEXT,contributorId TEXT); INSERT INTO task VALUES('task','f','newFeature',0,0,'project','reviewer');
   CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
   CREATE TABLE featureInitialRevision(featureId TEXT,proposalId TEXT,mode TEXT);
   CREATE TABLE featureImageUploadRevision(proposalId TEXT,taskIds TEXT,featureId TEXT,candidateRevisionId TEXT,imageId TEXT,imageRevisionId TEXT);`)
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
    const input = {
      ...command,
      taskId: 'task',
      actorId: 'reviewer',
      reason: 'Review',
      accept: true,
      completion: [],
      imageReview: { taskId: 'task', reviewId },
      guard: sql`EXISTS(SELECT 1 FROM feature WHERE id='f' AND modifiedAt='original')`,
    }
    expect(
      await reviewInitialFeatureContribution(db, { ...input, guard: sql`0` }),
    ).toBe(false)
    expect(
      await reviewInitialFeatureContribution(db, {
        ...input,
        imageReview: { taskId: 'task', reviewId: 'stale' },
      }),
    ).toBe(false)
    expect(await reviewInitialFeatureContribution(db, input)).toBe(true)
    expect(
      f.sqlite
        .prepare(
          "SELECT isPublished,localIsPublished,publisherId,publishedAt FROM feature WHERE id='f'",
        )
        .get(),
    ).toEqual({
      isPublished: 0,
      localIsPublished: 0,
      publisherId: null,
      publishedAt: null,
    })
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId,generation FROM featureRevisionHead WHERE featureId='f'",
        )
        .get(),
    ).toEqual({
      publishedRevisionId: null,
      generation: 1,
    })
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM featureRevisionPublication WHERE revisionId IS NOT NULL',
        )
        .get()!.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()!.modifiedAt,
    ).not.toBe('original')
    expect(await reviewInitialFeatureContribution(db, input)).toBe(false)
    // A separate explicit publish can select the exact privately accepted content.
    const acceptedId = f.sqlite
      .prepare(
        "SELECT previousRevisionId FROM featureRevisionPublication WHERE featureId='f' AND generation=1",
      )
      .get()!.previousRevisionId as string
    const acceptedContent = JSON.parse(
      f.sqlite
        .prepare('SELECT content FROM featureRevision WHERE id=?')
        .get(acceptedId)!.content as string,
    )
    const staffDraft = (await createFeatureRevisionProposal(db, {
      ...command,
      baseRevisionId: acceptedId,
      content: acceptedContent,
    }))!
    expect(
      await acceptFeatureRevisionProposal(db, {
        ...command,
        proposalId: staffDraft.proposalId,
        expectedCandidateRevisionId: staffDraft.candidateRevisionId,
        expectedPublishedRevisionId: null,
        expectedComparisonRevisionId: acceptedId,
        expectedGeneration: 1,
        publicationIntent: 'republish',
        acceptOwnDraft: true,
        validate: () => [],
        project: () => ({ statements: [], verify: sql`1` }),
      }),
    ).toMatchObject({ status: 'accepted' })
    expect(
      f.sqlite
        .prepare("SELECT isPublished,localIsPublished FROM feature WHERE id='f'")
        .get(),
    ).toEqual({ isPublished: 1, localIsPublished: 1 })
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    source.sqlite.close()
    f.sqlite.close()
  }
})
