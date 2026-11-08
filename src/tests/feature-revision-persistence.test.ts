// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SERVICES
import {
  initializeFeatureRevision,
  createFeatureRevisionProposal,
  saveFeatureRevisionProposal,
  submitFeatureRevisionProposal,
  acceptFeatureRevisionProposal,
  rejectFeatureRevisionProposal,
  withdrawFeatureRevisionProposal,
  unpublishFeatureRevision,
} from '#lib/db/services/featureRevision.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

const publicProjection = sqliteTable('publicProjection', {
  featureId: text('featureId').primaryKey(),
  content: text('content').notNull(),
})

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.sqlite.close()
})

function fixture() {
  const connection = publicationSqlite({})
  connections.push(connection)
  const { sqlite } = connection
  sqlite.exec(
    `PRAGMA foreign_keys=ON; CREATE TABLE feature(id TEXT PRIMARY KEY, isPublished INTEGER NOT NULL DEFAULT 1,localIsPublished INTEGER,isDraft INTEGER NOT NULL DEFAULT 0,isPendingReview INTEGER NOT NULL DEFAULT 0,publisherId TEXT,publishedAt TEXT,modifiedAt TEXT); INSERT INTO feature(id) VALUES ('f'),('other'); CREATE TABLE publicProjection(featureId TEXT PRIMARY KEY, content TEXT NOT NULL); INSERT INTO publicProjection VALUES ('f','{"en":"Old","zh":"舊"}');`,
  )
  sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  const db = connection.db as unknown as Database
  const base = { en: 'Old', zh: '舊' }
  const project = (content: RevisionValue) => ({
    statements: [
      db
        .update(publicProjection)
        .set({ content: JSON.stringify(content) })
        .where(eq(publicProjection.featureId, 'f')),
    ],
    verify: sql`EXISTS (SELECT 1 FROM publicProjection WHERE featureId='f' AND content=${JSON.stringify(content)})`,
  })
  const common = { actorId: 'editor', guard: sql`1`, featureId: 'f' }
  const baseline = () =>
    initializeFeatureRevision(db, { ...common, content: base, published: true })
  const proposal = async (baseRevisionId: string, content: RevisionValue) => {
    const created = await createFeatureRevisionProposal(db, {
      ...common,
      baseRevisionId,
      content,
    })
    expect(created).not.toBeNull()
    expect(
      await submitFeatureRevisionProposal(db, {
        ...common,
        proposalId: created!.proposalId,
        expectedCandidateRevisionId: created!.candidateRevisionId,
      }),
    ).toBe(true)
    return created!
  }
  return { sqlite, db, common, base, project, baseline, proposal }
}

describe('persisted feature revision workflow', () => {
  it('keeps dependent Location edits pending until the complete reference set is resolved', async () => {
    const f = fixture()
    const location = { locationId: 'place', factsRevisionId: 'facts' }
    const baseline = (await initializeFeatureRevision(f.db, {
      ...f.common,
      content: { location },
      published: true,
    }))!
    const moved = { locationId: 'other-place', factsRevisionId: 'facts' }
    const a = await f.proposal(baseline, { location: moved })
    const b = await f.proposal(baseline, {
      location: { ...location, factsRevisionId: 'new-facts' },
    })
    const mergePolicy = {
      isAtomic: (path: readonly string[]) =>
        path.length === 1 && path[0] === 'location',
    }
    const common = { ...f.common, validate: () => [], project: f.project, mergePolicy }
    expect(
      (
        await acceptFeatureRevisionProposal(f.db, {
          ...common,
          proposalId: a.proposalId,
          expectedCandidateRevisionId: a.candidateRevisionId,
          expectedPublishedRevisionId: baseline,
          expectedGeneration: 0,
        })
      ).status,
    ).toBe('accepted')
    const comparison = {
      ...common,
      proposalId: b.proposalId,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: a.candidateRevisionId,
      expectedGeneration: 1,
    }
    expect(await acceptFeatureRevisionProposal(f.db, comparison)).toMatchObject({
      status: 'conflict',
      conflicts: [{ path: ['location'] }],
    })
    expect(
      f.sqlite
        .prepare('SELECT status FROM featureRevisionProposal WHERE id=?')
        .get(b.proposalId),
    ).toEqual({ status: 'submitted' })
    expect(
      f.sqlite
        .prepare("SELECT content FROM publicProjection WHERE featureId='f'")
        .get(),
    ).toEqual({ content: JSON.stringify({ location: moved }) })
    const reviewed = { locationId: 'other-place', factsRevisionId: 'reviewed-facts' }
    const result = await acceptFeatureRevisionProposal(f.db, {
      ...comparison,
      resolutions: [{ path: ['location'], result: { present: true, value: reviewed } }],
    })
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(
        f.sqlite
          .prepare(
            'SELECT previousRevisionId,mergedFromRevisionId,content FROM featureRevision WHERE id=?',
          )
          .get(result.revisionId),
      ).toEqual({
        previousRevisionId: a.candidateRevisionId,
        mergedFromRevisionId: b.candidateRevisionId,
        content: JSON.stringify({ location: reviewed }),
      })
    }
  })

  it('leaves public content untouched until acceptance then commits all evidence together', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const candidate = await f.proposal(baseline, { en: 'New', zh: '舊' })
    expect(f.sqlite.prepare('SELECT content FROM publicProjection').get()).toEqual({
      content: JSON.stringify(f.base),
    })
    const result = await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      actorId: 'reviewer',
      publisherUserId: 'reviewer',
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    })
    expect(result).toEqual({
      status: 'accepted',
      revisionId: candidate.candidateRevisionId,
    })
    expect(
      f.sqlite
        .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
        .get(),
    ).toEqual({ publishedRevisionId: candidate.candidateRevisionId, generation: 1 })
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
    ).toEqual({ status: 'accepted' })
    expect(
      f.sqlite
        .prepare(
          "SELECT c.actorId FROM featureRevisionReview r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.action='accepted'",
        )
        .get(),
    ).toEqual({ actorId: 'reviewer' })
    expect(
      f.sqlite
        .prepare(
          'SELECT c.actorId FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?',
        )
        .get(candidate.candidateRevisionId),
    ).toEqual({ actorId: 'editor' })
    expect(
      f.sqlite
        .prepare("SELECT publisherId,isPendingReview,isDraft FROM feature WHERE id='f'")
        .get(),
    ).toEqual({ publisherId: 'reviewer', isPendingReview: 0, isDraft: 0 })
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('merges a second independent proposal into the first accepted revision with both parents', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const a = await f.proposal(baseline, { en: 'New', zh: '舊' }),
      b = await f.proposal(baseline, { en: 'Old', zh: '新' })
    await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...a,
      expectedCandidateRevisionId: a.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    })
    const stale = await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...b,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    })
    expect(stale).toEqual({ status: 'stale' })
    const accepted = await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...b,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: a.candidateRevisionId,
      expectedGeneration: 1,
      validate: () => [],
      project: f.project,
    })
    expect(accepted.status).toBe('accepted')
    if (accepted.status === 'accepted')
      expect(
        f.sqlite
          .prepare(
            'SELECT previousRevisionId,mergedFromRevisionId,content FROM featureRevision WHERE id=?',
          )
          .get(accepted.revisionId),
      ).toEqual({
        previousRevisionId: a.candidateRevisionId,
        mergedFromRevisionId: b.candidateRevisionId,
        content: JSON.stringify({ en: 'New', zh: '新' }),
      })
  })
  it('preserves conflicts and accepts an explicit reviewer resolution with evidence', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const a = await f.proposal(baseline, { en: 'A', zh: '舊' }),
      b = await f.proposal(baseline, { en: 'B', zh: '舊' })
    await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...a,
      expectedCandidateRevisionId: a.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    })
    const input = {
      ...f.common,
      ...b,
      expectedCandidateRevisionId: b.candidateRevisionId,
      expectedPublishedRevisionId: a.candidateRevisionId,
      expectedGeneration: 1,
      validate: () => [],
      project: f.project,
    }
    expect((await acceptFeatureRevisionProposal(f.db, input)).status).toBe('conflict')
    const resolutions = [
      { path: ['en'], result: { present: true as const, value: 'Resolved' } },
    ]
    expect(
      (await acceptFeatureRevisionProposal(f.db, { ...input, resolutions })).status,
    ).toBe('accepted')
    expect(
      f.sqlite
        .prepare(
          "SELECT resolutions FROM featureRevisionReview WHERE proposalId=? AND action='accepted'",
        )
        .get(b.proposalId),
    ).toEqual({ resolutions: JSON.stringify(resolutions) })
  })
  it('rolls back every write when projection verification fails', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const candidate = await f.proposal(baseline, { en: 'New', zh: '舊' })
    const before = f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()
    expect(
      await acceptFeatureRevisionProposal(f.db, {
        ...f.common,
        ...candidate,
        expectedCandidateRevisionId: candidate.candidateRevisionId,
        expectedPublishedRevisionId: baseline,
        expectedGeneration: 0,
        validate: () => [],
        project: content => ({ ...f.project(content), verify: sql`0` }),
      }),
    ).toEqual({ status: 'stale' })
    expect(f.sqlite.prepare('SELECT content FROM publicProjection').get()).toEqual({
      content: JSON.stringify(f.base),
    })
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
    ).toEqual({ status: 'submitted' })
    expect(f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()).toEqual(
      before,
    )
  })
  it('rejects stale, unauthorized and duplicate decisions without publishing', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const candidate = await f.proposal(baseline, { en: 'New', zh: '舊' })
    const input = {
      ...f.common,
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    }
    expect(
      await acceptFeatureRevisionProposal(f.db, { ...input, guard: sql`0` }),
    ).toEqual({ status: 'stale' })
    expect(
      await rejectFeatureRevisionProposal(f.db, {
        ...input,
        reason: 'Incorrect translation',
      }),
    ).toBe(true)
    expect(
      await rejectFeatureRevisionProposal(f.db, { ...input, reason: 'Retry' }),
    ).toBe(false)
    expect(await acceptFeatureRevisionProposal(f.db, input)).toEqual({
      status: 'stale',
    })
    expect(f.sqlite.prepare('SELECT content FROM publicProjection').get()).toEqual({
      content: JSON.stringify(f.base),
    })
  })
  it('freezes submitted candidates and prevents one contributor overwriting another draft', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const created = (await createFeatureRevisionProposal(f.db, {
      ...f.common,
      baseRevisionId: baseline,
      content: f.base,
    }))!
    const input = {
      ...f.common,
      ...created,
      expectedCandidateRevisionId: created.candidateRevisionId,
      content: { en: 'New' },
    }
    expect(
      await saveFeatureRevisionProposal(f.db, { ...input, actorId: 'other-user' }),
    ).toBeNull()
    const next = (await saveFeatureRevisionProposal(f.db, input))!
    expect(next).not.toBe(created.candidateRevisionId)
    expect(await saveFeatureRevisionProposal(f.db, input)).toBeNull()
    await submitFeatureRevisionProposal(f.db, {
      ...input,
      expectedCandidateRevisionId: next,
    })
    expect(
      await saveFeatureRevisionProposal(f.db, {
        ...input,
        expectedCandidateRevisionId: next,
      }),
    ).toBeNull()
  })
  it('enforces append-only history, same-feature parents and terminal proposal state at database level', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    expect(() =>
      f.sqlite
        .prepare("UPDATE featureRevision SET content='{}' WHERE id=?")
        .run(baseline),
    ).toThrow(/immutable/)
    expect(() =>
      f.sqlite.prepare('DELETE FROM featureRevision WHERE id=?').run(baseline),
    ).toThrow(/immutable/)
    expect(() =>
      f.sqlite
        .prepare(
          "INSERT INTO featureRevision(id,featureId,previousRevisionId,changeSetId,content) SELECT 'bad','other',id,changeSetId,content FROM featureRevision WHERE id=?",
        )
        .run(baseline),
    ).toThrow(/predecessor missing/)
    const candidate = await f.proposal(baseline, { en: 'New' })
    await rejectFeatureRevisionProposal(f.db, {
      ...f.common,
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      reason: 'No',
    })
    expect(() =>
      f.sqlite
        .prepare("UPDATE featureRevisionProposal SET status='draft' WHERE id=?")
        .run(candidate.proposalId),
    ).toThrow(/transition/)
  })
  it('detects a generation change even if the published revision ID returns to the reviewed value', async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    const candidate = await f.proposal(baseline, { en: 'New' })
    f.sqlite
      .prepare(
        "UPDATE featureRevisionHead SET publishedRevisionId=NULL,generation=1 WHERE featureId='f'",
      )
      .run()
    f.sqlite
      .prepare(
        "UPDATE featureRevisionHead SET publishedRevisionId=?,generation=2 WHERE featureId='f'",
      )
      .run(baseline)
    expect(
      await acceptFeatureRevisionProposal(f.db, {
        ...f.common,
        ...candidate,
        expectedCandidateRevisionId: candidate.candidateRevisionId,
        expectedPublishedRevisionId: baseline,
        expectedGeneration: 0,
        validate: () => [],
        project: f.project,
      }),
    ).toEqual({ status: 'stale' })
  })
})

it('requires explicit first-publication intent before publishing a never-published staff draft', async () => {
  const f = fixture()
  f.sqlite.exec("UPDATE feature SET isPublished=0,isDraft=1 WHERE id='f'")
  const baseline = (await initializeFeatureRevision(f.db, {
    ...f.common,
    content: f.base,
    published: false,
  }))!
  const candidate = await f.proposal(baseline, { en: 'First publication', zh: '舊' })
  expect(
    await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: null,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    }),
  ).toEqual({ status: 'stale' })
  expect(
    f.sqlite.prepare("SELECT isPublished,isDraft FROM feature WHERE id='f'").get(),
  ).toEqual({ isPublished: 0, isDraft: 1 })
  expect(
    (
      await acceptFeatureRevisionProposal(f.db, {
        ...f.common,
        ...candidate,
        expectedCandidateRevisionId: candidate.candidateRevisionId,
        expectedPublishedRevisionId: null,
        expectedGeneration: 0,
        publicationIntent: 'initial',
        validate: () => [],
        project: f.project,
      })
    ).status,
  ).toBe('accepted')
  expect(
    f.sqlite.prepare("SELECT isPublished,isDraft FROM feature WHERE id='f'").get(),
  ).toEqual({ isPublished: 1, isDraft: 0 })
})

it('retains system attribution for policy-authorized acceptance without changing the author', async () => {
  const f = fixture(),
    baseline = (await f.baseline())!
  const candidate = await f.proposal(baseline, { en: 'Policy accepted', zh: '舊' })
  expect(
    (
      await acceptFeatureRevisionProposal(f.db, {
        ...f.common,
        ...candidate,
        actorId: 'system:location-adoption',
        origin: 'system',
        reason: 'Accepted under the captured Location policy',
        expectedCandidateRevisionId: candidate.candidateRevisionId,
        expectedPublishedRevisionId: baseline,
        expectedGeneration: 0,
        validate: () => [],
        project: f.project,
      })
    ).status,
  ).toBe('accepted')
  expect(
    f.sqlite
      .prepare(
        "SELECT c.actorId,c.origin,c.reason FROM featureRevisionReview r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.action='accepted'",
      )
      .get(),
  ).toEqual({
    actorId: 'system:location-adoption',
    origin: 'system',
    reason: 'Accepted under the captured Location policy',
  })
  expect(
    f.sqlite
      .prepare(
        'SELECT c.actorId,c.origin FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?',
      )
      .get(candidate.candidateRevisionId),
  ).toEqual({ actorId: 'editor', origin: 'user' })
})

it('does not append history for an unchanged draft save', async () => {
  const f = fixture(),
    baseline = (await f.baseline())!
  const draft = (await createFeatureRevisionProposal(f.db, {
    ...f.common,
    baseRevisionId: baseline,
    content: f.base,
  }))!
  const before = f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()
  expect(
    await saveFeatureRevisionProposal(f.db, {
      ...f.common,
      ...draft,
      expectedCandidateRevisionId: draft.candidateRevisionId,
      content: f.base,
    }),
  ).toBe(draft.candidateRevisionId)
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()).toEqual(
    before,
  )
})

it('rolls back projection, heads and decision when the final publication receipt fails', async () => {
  const f = fixture(),
    baseline = (await f.baseline())!
  const candidate = await f.proposal(baseline, { en: 'Changed', zh: '舊' })
  f.sqlite.exec(
    "CREATE TRIGGER inject_publication_failure BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation=1 BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;",
  )
  await expect(
    acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: f.project,
    }),
  ).rejects.toThrow()
  expect(f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get()).toEqual({
    status: 'submitted',
  })
  expect(
    f.sqlite
      .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
      .get(),
  ).toEqual({ publishedRevisionId: baseline, generation: 0 })
  expect(f.sqlite.prepare('SELECT content FROM publicProjection').get()).toEqual({
    content: JSON.stringify(f.base),
  })
  expect(
    f.sqlite
      .prepare("SELECT count(*) n FROM featureRevisionReview WHERE action='accepted'")
      .get(),
  ).toEqual({ n: 0 })
})

it('records withdrawal and unpublication without erasing prior content', async () => {
  const f = fixture(),
    baseline = (await f.baseline())!
  const draft = (await createFeatureRevisionProposal(f.db, {
    ...f.common,
    baseRevisionId: baseline,
    content: { en: 'Draft' },
  }))!
  const input = {
    ...f.common,
    ...draft,
    expectedCandidateRevisionId: draft.candidateRevisionId,
  }
  expect(
    await withdrawFeatureRevisionProposal(f.db, {
      ...input,
      actorId: 'not-the-author',
    }),
  ).toBe(false)
  expect(await withdrawFeatureRevisionProposal(f.db, input)).toBe(true)
  expect(await submitFeatureRevisionProposal(f.db, input)).toBe(false)
  expect(
    await unpublishFeatureRevision(f.db, {
      ...f.common,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      projection: { statements: [], verify: sql`1` },
    }),
  ).toBe(true)
  expect(
    f.sqlite
      .prepare('SELECT publishedRevisionId,generation FROM featureRevisionHead')
      .get(),
  ).toEqual({ publishedRevisionId: null, generation: 1 })
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()).toEqual({
    n: 2,
  })
  expect(
    f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get(),
  ).toEqual({ isPublished: 0 })
})

for (const changed of ['head', 'scope'] as const) {
  it(`rechecks ${changed} changes occurring after the review preflight inside the publication batch`, async () => {
    const f = fixture(),
      baseline = (await f.baseline())!
    f.sqlite.exec(
      'CREATE TABLE reviewPermission(allowed INTEGER); INSERT INTO reviewPermission VALUES (1);',
    )
    const candidate = await f.proposal(baseline, { en: 'Changed', zh: '舊' })
    const result = await acceptFeatureRevisionProposal(f.db, {
      ...f.common,
      guard: sql`EXISTS (SELECT 1 FROM reviewPermission WHERE allowed=1)`,
      ...candidate,
      expectedCandidateRevisionId: candidate.candidateRevisionId,
      expectedPublishedRevisionId: baseline,
      expectedGeneration: 0,
      validate: () => [],
      project: content => {
        if (changed === 'head')
          f.sqlite.exec(
            "UPDATE featureRevisionHead SET generation=1 WHERE featureId='f'",
          )
        else f.sqlite.exec('UPDATE reviewPermission SET allowed=0')
        return f.project(content)
      },
    })
    expect(result).toEqual({ status: 'stale' })
    expect(
      f.sqlite.prepare('SELECT status FROM featureRevisionProposal').get(),
    ).toEqual({ status: 'submitted' })
    expect(f.sqlite.prepare('SELECT content FROM publicProjection').get()).toEqual({
      content: JSON.stringify(f.base),
    })
  })
}
