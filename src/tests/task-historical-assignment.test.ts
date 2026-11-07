// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { featureRevisionContentFixture } from './fixtures/featureRevisionContent'
import { assignInitialTaskHistoricalLayer } from '#lib/db/services/taskLayerAssignment.js'
import type { Database } from '#lib/types.js'

function fixture() {
  const f = publicationSqlite({})
  f.sqlite.exec(`
    CREATE TABLE feature(id TEXT PRIMARY KEY,layerId TEXT,projectId TEXT,organisationId TEXT,isIntangible INTEGER,isPublished INTEGER,isArchived INTEGER,modifiedAt TEXT);
    CREATE TABLE task(id TEXT,featureId TEXT,type TEXT,isDraft INTEGER,isReviewed INTEGER,projectId TEXT,organisationId TEXT,contributorId TEXT);
    CREATE TABLE layer(id TEXT,projectId TEXT,organisationId TEXT,historicalSourceLayerId TEXT);
    CREATE TABLE project(id TEXT,flags TEXT);
    INSERT INTO project VALUES('p','{"showHistoricalLayers":true}');
    INSERT INTO layer VALUES('live','p','o',NULL),('historic','p','o','live');
    INSERT INTO feature VALUES('f','live','p','o',0,0,0,'2026-11-07T00:00:00.000Z');
    INSERT INTO task VALUES('t','f','newFeature',0,0,'p','o','author');
    CREATE TABLE featureInitialRevision(featureId TEXT,proposalId TEXT,mode TEXT);
  `)
  f.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  f.sqlite.exec(readFileSync('migrations/0201_task_image_review_context.sql', 'utf8'))
  f.sqlite.exec(`CREATE TABLE featureRevisionWriteScope(featureId TEXT,token TEXT);
    CREATE TRIGGER status_guard BEFORE UPDATE OF isIntangible ON feature
    WHEN NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=NEW.id)
    BEGIN SELECT RAISE(ABORT,'revision scope required'); END;
    CREATE TRIGGER route AFTER UPDATE OF layerId,isIntangible ON feature BEGIN
      UPDATE feature SET layerId=CASE WHEN NEW.isIntangible=1 THEN 'historic' ELSE 'live' END WHERE id=NEW.id;
    END;
    INSERT INTO revisionChangeSet VALUES('c','author','user','submitted','now');`)
  const content = featureRevisionContentFixture()
  content.profile.isIntangible = false
  for (const id of ['base', 'candidate'])
    f.sqlite
      .prepare(
        'INSERT INTO featureRevision(id,featureId,changeSetId,content) VALUES(?,?,?,?)',
      )
      .run(id, 'f', 'c', JSON.stringify(content))
  f.sqlite.exec(`INSERT INTO featureRevisionHead(featureId) VALUES('f');
    INSERT INTO featureRevisionProposal(id,featureId,baseRevisionId,candidateRevisionId,contributorId,status,createdChangeSetId)
    VALUES('proposal','f','base','candidate','author','submitted','c');
    INSERT INTO featureInitialRevision VALUES('f','proposal','contribution');`)
  return f
}
const input = {
  taskId: 't',
  featureId: 'f',
  layerId: 'historic',
  projectId: 'p',
  organisationId: 'o',
  updatedAt: '2026-11-07T00:00:00.000Z',
  actorId: 'reviewer',
}

describe('historical assignment of frozen initial contributions', () => {
  it('routes the feature atomically and preserves the frozen candidate with attributed review evidence', async () => {
    const f = fixture()
    try {
      expect(
        await assignInitialTaskHistoricalLayer(f.db as unknown as Database, input),
      ).toBe(true)
      expect(
        f.sqlite.prepare('SELECT layerId,isIntangible FROM feature').get(),
      ).toMatchObject({ layerId: 'historic', isIntangible: 1 })
      expect(
        f.sqlite
          .prepare('SELECT status,candidateRevisionId FROM featureRevisionProposal')
          .get(),
      ).toMatchObject({ status: 'submitted', candidateRevisionId: 'candidate' })
      expect(
        f.sqlite
          .prepare(
            "SELECT json_extract(content,'$.profile.isIntangible') value FROM featureRevision WHERE id='candidate'",
          )
          .get(),
      ).toMatchObject({ value: 0 })
      expect(
        f.sqlite
          .prepare(
            "SELECT c.actorId,json_extract(r.content,'$.profile.isIntangible') value FROM featureRevisionReview v JOIN featureRevision r ON r.id=v.comparedRevisionId JOIN revisionChangeSet c ON c.id=v.changeSetId",
          )
          .get(),
      ).toMatchObject({ actorId: 'reviewer', value: 1 })
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get(),
      ).toMatchObject({ n: 0 })
    } finally {
      f.sqlite.close()
    }
  })
  it.each(['stale', 'reviewed', 'wrong-project'])(
    'rejects %s assignments without partial writes',
    async scenario => {
      const f = fixture()
      try {
        if (scenario === 'reviewed') f.sqlite.exec('UPDATE task SET isReviewed=1')
        const changed = {
          ...input,
          ...(scenario === 'stale' ? { updatedAt: 'old' } : {}),
          ...(scenario === 'wrong-project' ? { projectId: 'other' } : {}),
        }
        expect(
          await assignInitialTaskHistoricalLayer(f.db as unknown as Database, changed),
        ).toBe(false)
        expect(
          f.sqlite.prepare('SELECT layerId,isIntangible FROM feature').get(),
        ).toMatchObject({ layerId: 'live', isIntangible: 0 })
        expect(
          f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get(),
        ).toMatchObject({ n: 2 })
        expect(
          f.sqlite.prepare('SELECT count(*) n FROM featureRevisionReview').get(),
        ).toMatchObject({ n: 0 })
      } finally {
        f.sqlite.close()
      }
    },
  )
})
