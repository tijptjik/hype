// NODE
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
// VITEST
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const spatialMigration = readFileSync(
  'migrations/0078_feature_spatial_index.sql',
  'utf8',
)
const searchMigration = readFileSync(
  'migrations/0079_feature_query_indexes.sql',
  'utf8',
)
const migration = readFileSync('migrations/0080_feature_count_cache.sql', 'utf8')
const searchFtsMigration = readFileSync(
  'migrations/0081_feature_search_fts.sql',
  'utf8',
)
const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE user (id TEXT PRIMARY KEY);
CREATE TABLE hub (id TEXT PRIMARY KEY, code TEXT, domain TEXT);
CREATE TABLE organisation (id TEXT PRIMARY KEY, code TEXT, hubId TEXT REFERENCES hub(id) ON DELETE SET NULL ON UPDATE CASCADE,
  isHubExclusive INTEGER DEFAULT 0, isCoreInclusive INTEGER DEFAULT 1, isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT, organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE layer (id TEXT PRIMARY KEY, organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  projectId TEXT REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE, isPublished INTEGER DEFAULT 1, isArchived INTEGER DEFAULT 0);
CREATE TABLE feature (id TEXT PRIMARY KEY, organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  layerId TEXT NOT NULL REFERENCES layer(id) ON DELETE CASCADE ON UPDATE CASCADE,
  isPublished INTEGER NOT NULL DEFAULT 1, isArchived INTEGER NOT NULL DEFAULT 0, isDraft INTEGER NOT NULL DEFAULT 0,
  isVisitable INTEGER NOT NULL DEFAULT 1, isIntangible INTEGER NOT NULL DEFAULT 0,
  geometry TEXT NOT NULL DEFAULT '{"type":"Point","coordinates":[114.17,22.32]}', modifiedAt TEXT DEFAULT 'original-version');
CREATE TABLE featureI18n (featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, locale TEXT,
  title TEXT, description TEXT, displayAddress TEXT, addressProperties TEXT, PRIMARY KEY(featureId,locale));
CREATE TABLE property (id TEXT PRIMARY KEY);
CREATE TABLE propertyValue (id TEXT PRIMARY KEY, propertyId TEXT REFERENCES property(id) ON DELETE CASCADE);
CREATE TABLE featureProperty (featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  propertyId TEXT REFERENCES property(id) ON DELETE CASCADE, propertyValueId TEXT REFERENCES propertyValue(id) ON DELETE SET NULL,
  value TEXT, PRIMARY KEY(featureId,propertyId));
CREATE TABLE userFeature (userId TEXT REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE,
  featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, isWishlisted INTEGER DEFAULT 0,
  isVisited INTEGER DEFAULT 0, visitedAt TEXT, PRIMARY KEY(userId,featureId));
CREATE TABLE hubRole (hubId TEXT REFERENCES hub(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
CREATE TABLE organisationRole (organisationId TEXT REFERENCES organisation(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
CREATE TABLE projectRole (projectId TEXT REFERENCES project(id) ON DELETE CASCADE, userId TEXT REFERENCES user(id) ON DELETE CASCADE, role TEXT);
INSERT INTO user VALUES ('user-1'),('user-2');
INSERT INTO hub(id,code,domain) VALUES ('hub-1','hub-one','one.test');
INSERT INTO organisation(id,code) VALUES ('org-1','org-one'),('org-2','org-two');
INSERT INTO project(id,code,organisationId) VALUES ('project-1','project-one','org-1'),('project-2','project-two','org-2');
INSERT INTO layer(id,organisationId,projectId) VALUES ('layer-1','org-1','project-1'),('layer-2','org-2','project-2');
INSERT INTO property VALUES ('property-1');
INSERT INTO propertyValue VALUES ('value-1','property-1');
`
const featureInsert = `INSERT INTO feature(id,organisationId,projectId,layerId) VALUES ('feature-1','org-1','project-1','layer-1');`
const englishInsert = `INSERT INTO featureI18n(featureId,locale,title,addressProperties) VALUES ('feature-1','en','First','{"neighbourhood":"Central"}');`

/**
 * Executes real migration triggers against an isolated SQLite database.
 * @param statements Mutations and final read.
 * @param beforeMigration Existing corpus to seed before count storage is introduced.
 * @param recursive Whether implicit REPLACE deletes should run recursive triggers.
 * @returns The final SQLite JSON result.
 */
async function query(
  statements: string,
  beforeMigration = '',
  recursive = false,
): Promise<Array<Record<string, unknown>>> {
  const { stdout } = await execFileAsync(
    'sqlite3',
    [
      ':memory:',
      '-batch',
      '-json',
      '-cmd',
      '.explain off',
      `${schema}\nPRAGMA recursive_triggers = ${recursive ? 1 : 0};\n${spatialMigration}\n${searchMigration}\n${beforeMigration}\n${migration}\n${searchFtsMigration}\n${statements}`,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  )
  return JSON.parse(stdout.trim() || '[]')
}

/**
 * Compares all materialized bins with a fresh canonical aggregate.
 * @param statements Mutations under test.
 * @param recursive SQLite REPLACE trigger mode.
 * @returns Nothing after asserting exact bin equality and one entry per feature.
 */
async function expectCanonicalBins(
  statements: string,
  recursive = false,
): Promise<void> {
  const fields = [
    'organisationId',
    'projectId',
    'layerId',
    'isPublished',
    'isArchived',
    'isDraft',
    'isVisitable',
    'isIntangible',
  ]
  const dimensions = fields.map(field => `f.${field}`).join(',')
  const rows = await query(
    `${statements}
    WITH canonical AS (
      SELECT ${dimensions}, coalesce(json_extract(i.addressProperties,'$.neighbourhood'),'') AS neighbourhood, count(*) AS totalCount
      FROM feature f LEFT JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
      GROUP BY ${dimensions}, coalesce(json_extract(i.addressProperties,'$.neighbourhood'),'')
    ), differences AS (
      SELECT * FROM (SELECT * FROM canonical EXCEPT SELECT * FROM featureCountRollup)
      UNION ALL SELECT * FROM (SELECT * FROM featureCountRollup EXCEPT SELECT * FROM canonical)
    )
    SELECT (SELECT count(*) FROM differences) AS differences,
      (SELECT count(*) FROM feature) - (SELECT count(*) FROM featureCountEntry) AS missingEntries;`,
    '',
    recursive,
  )
  expect(rows).toEqual([{ differences: 0, missingEntries: 0 }])
}

describe('feature count rollup migration', () => {
  it('seeds existing features in complete bins while preserving orphan translations', async () => {
    const before = `${featureInsert}${englishInsert}
      PRAGMA foreign_keys=OFF;
      INSERT INTO featureI18n(featureId,locale,title) VALUES ('orphan','en','Retained orphan');
      PRAGMA foreign_keys=ON;`
    expect(
      await query(
        `SELECT neighbourhood,totalCount,(SELECT count(*) FROM featureI18n WHERE featureId='orphan') AS orphanCount FROM featureCountRollup;`,
        before,
      ),
    ).toEqual([{ neighbourhood: 'Central', totalCount: 1, orphanCount: 1 }])
  })

  it('increments shared bins, moves all scope/status/flag dimensions, and removes zero bins', async () => {
    await expectCanonicalBins(`${featureInsert}${englishInsert}
      INSERT INTO feature(id,organisationId,projectId,layerId) VALUES ('feature-2','org-1','project-1','layer-1');
      INSERT INTO featureI18n(featureId,locale,title,addressProperties) VALUES ('feature-2','en','Second','{"neighbourhood":"Central"}');
      UPDATE feature SET organisationId='org-2',projectId='project-2',layerId='layer-2',isPublished=0,isArchived=1,isDraft=1,isVisitable=0,isIntangible=1 WHERE id='feature-1';`)
    expect(
      await query(
        `${featureInsert} DELETE FROM feature; SELECT count(*) AS bins FROM featureCountRollup;`,
      ),
    ).toEqual([{ bins: 0 }])
  })

  it.each([false, true])(
    'handles English REPLACE, missing neighbourhood and locale moves with recursive triggers=%s',
    async recursive => {
      await expectCanonicalBins(
        `${featureInsert}${englishInsert}
      INSERT OR REPLACE INTO featureI18n(featureId,locale,title,addressProperties) VALUES ('feature-1','en','Second','{"neighbourhood":"Kowloon"}');`,
        recursive,
      )
      await expectCanonicalBins(
        `${featureInsert}${englishInsert} UPDATE featureI18n SET addressProperties='{}';`,
        recursive,
      )
      await expectCanonicalBins(
        `${featureInsert}${englishInsert} UPDATE featureI18n SET locale='zh-Hant';`,
        recursive,
      )
      await expectCanonicalBins(
        `${featureInsert} INSERT INTO featureI18n(featureId,locale,title,addressProperties) VALUES ('feature-1','zh-Hant','First','{"neighbourhood":"Central"}'); UPDATE featureI18n SET locale='en';`,
        recursive,
      )
      await expectCanonicalBins(
        `${featureInsert}${englishInsert} DELETE FROM featureI18n;`,
        recursive,
      )
    },
  )

  it('moves a canonical English translation between features without losing either missing bin', async () => {
    await expectCanonicalBins(`${featureInsert}${englishInsert}
      INSERT INTO feature(id,organisationId,projectId,layerId) VALUES ('feature-2','org-1','project-1','layer-1');
      UPDATE featureI18n SET featureId='feature-2';`)
  })

  it.each([false, true])(
    'keeps one contribution when a feature is replaced with recursive triggers=%s',
    async recursive => {
      await expectCanonicalBins(
        `${featureInsert}${englishInsert}
      INSERT OR REPLACE INTO feature(id,organisationId,projectId,layerId) VALUES ('feature-1','org-2','project-2','layer-2');`,
        recursive,
      )
    },
  )

  it.each(['feature', 'layer', 'project', 'organisation'])(
    'decrements exactly once through %s deletion cascades',
    async table => {
      await expectCanonicalBins(
        `${featureInsert}${englishInsert} DELETE FROM ${table};`,
      )
    },
  )

  it('survives parent and feature ID cascades without duplicating contributions', async () => {
    await expectCanonicalBins(
      `${featureInsert}${englishInsert} UPDATE organisation SET id='org-new' WHERE id='org-1'; UPDATE project SET id='project-new' WHERE id='project-1'; UPDATE layer SET id='layer-new' WHERE id='layer-1'; UPDATE feature SET id='feature-new';`,
    )
  })

  it('rolls back entry moves, totals and revisions together', async () => {
    expect(
      await query(`${featureInsert}${englishInsert}
      CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision;
      BEGIN; UPDATE feature SET isPublished=0,layerId='layer-2'; DELETE FROM featureI18n; ROLLBACK;
      SELECT neighbourhood,totalCount,isPublished,layerId,(SELECT revision FROM featureCountRevision)-(SELECT revision FROM baseline) AS revisionDelta FROM featureCountRollup;`),
    ).toEqual([
      {
        neighbourhood: 'Central',
        totalCount: 1,
        isPublished: 1,
        layerId: 'layer-1',
        revisionDelta: 0,
      },
    ])
  })
})

describe('feature count revisions', () => {
  it('ignores no-op fields and modifiedAt but invalidates geometry and title changes', async () => {
    expect(
      await query(`${featureInsert}${englishInsert}
      CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision;
      UPDATE feature SET modifiedAt='next',isPublished=isPublished;
      UPDATE featureI18n SET title=title;
      SELECT revision-(SELECT revision FROM baseline) AS delta FROM featureCountRevision;`),
    ).toEqual([{ delta: 0 }])
    expect(
      await query(`${featureInsert}${englishInsert}
      CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision;
      UPDATE feature SET geometry='{"type":"Point","coordinates":[114.2,22.3]}';
      UPDATE featureI18n SET title='Changed';
      SELECT revision-(SELECT revision FROM baseline) AS delta, (SELECT totalCount FROM featureCountRollup) AS total FROM featureCountRevision;`),
    ).toEqual([{ delta: 2, total: 1 }])
  })

  it('revises property predicates and FK value removal', async () => {
    expect(
      await query(`${featureInsert}
      CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision;
      INSERT INTO featureProperty VALUES ('feature-1','property-1','value-1',NULL);
      UPDATE featureProperty SET value='10'; DELETE FROM propertyValue;
      SELECT revision-(SELECT revision FROM baseline) AS delta FROM featureCountRevision;`),
    ).toEqual([{ delta: 3 }])
  })

  it('isolates user membership revisions, revises both owners on reassignment and survives user deletion', async () => {
    expect(
      await query(`${featureInsert}
      CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision;
      INSERT INTO userFeature(userId,featureId,isWishlisted) VALUES ('user-1','feature-1',1);
      UPDATE userFeature SET isVisited=1; UPDATE userFeature SET userId='user-2'; DELETE FROM user WHERE id='user-2';
      SELECT userId,revision,(SELECT revision FROM featureCountRevision)-(SELECT revision FROM baseline) AS datasetDelta FROM featureCountUserRevision ORDER BY userId;`),
    ).toEqual([
      { userId: 'user-1', revision: 3, datasetDelta: 0 },
      { userId: 'user-2', revision: 2, datasetDelta: 0 },
    ])
  })

  it('rolls back list revision changes independently of dataset counts', async () => {
    expect(
      await query(`${featureInsert}
      INSERT INTO userFeature(userId,featureId,isWishlisted) VALUES ('user-1','feature-1',1);
      BEGIN; UPDATE userFeature SET isVisited=1; ROLLBACK;
      SELECT revision FROM featureCountUserRevision;`),
    ).toEqual([{ revision: 1 }])
  })

  it.each([
    "UPDATE layer SET projectId='project-2' WHERE id='layer-1'",
    "UPDATE project SET organisationId='org-2' WHERE id='project-1'",
    "UPDATE organisation SET hubId='hub-1',isHubExclusive=1 WHERE id='org-1'",
    "UPDATE hub SET domain='updated.test'",
    "INSERT INTO projectRole VALUES ('project-1','user-1','maintainer')",
  ])('invalidates trusted scope predicates after %s', async mutation => {
    expect(
      await query(
        `CREATE TEMP TABLE baseline AS SELECT revision FROM featureCountRevision; ${mutation}; SELECT revision-(SELECT revision FROM baseline) AS delta FROM featureCountRevision;`,
      ),
    ).toEqual([{ delta: 1 }])
  })
})

describe('persisted feature count cache', () => {
  it('retains only 512 recent entries and leaves cache rows intact when source revision changes', async () => {
    expect(
      await query(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<520)
      INSERT INTO featureCountCache(key,revision,totalCount,facets,updatedAt) SELECT printf('key-%04d',x),0,0,'{"neighbourhoods":{}}',x FROM n;
      ${featureInsert}
      SELECT count(*) AS entries,min(updatedAt) AS oldest,max(updatedAt) AS newest FROM featureCountCache;`),
    ).toEqual([{ entries: 512, oldest: 9, newest: 520 }])
  })

  it('allows a revision-guarded cache write to reject an obsolete aggregate', async () => {
    expect(
      await query(`CREATE TEMP TABLE observed AS SELECT revision FROM featureCountRevision;
      ${featureInsert}
      INSERT INTO featureCountCache(key,revision,totalCount,facets,updatedAt)
      SELECT 'old',revision,0,'{"neighbourhoods":{}}',0 FROM observed
      WHERE revision=(SELECT revision FROM featureCountRevision);
      SELECT count(*) AS entries FROM featureCountCache;`),
    ).toEqual([{ entries: 0 }])
  })
})
