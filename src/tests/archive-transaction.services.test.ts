// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import { updateOrganisationArchivedStateById } from '#lib/db/services/organisation.js'
import { updateProjectArchivedStateById } from '#lib/db/services/project.js'
import { updateLayerArchivedStateById } from '#lib/db/services/layer.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Creates a hierarchy with active and individually archived descendants. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  const columns =
    'isArchived INTEGER DEFAULT 0, localIsArchived INTEGER, modifiedAt TEXT'
  sqlite.exec(`
    CREATE TABLE organisation(id TEXT PRIMARY KEY, hubId TEXT, ${columns});
    CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT, ${columns});
    CREATE TABLE layer(id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT, ${columns});
    CREATE TABLE feature(id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT, layerId TEXT, ${columns});
    INSERT INTO organisation(id,hubId) VALUES ('o','h'),('other','h');
    INSERT INTO project(id,organisationId) VALUES ('p','o'),('other-p','o');
    INSERT INTO layer(id,organisationId,projectId) VALUES ('l','o','p');
    INSERT INTO feature(id,organisationId,projectId,layerId,isArchived) VALUES
      ('f','o','p','l',0),('archived','o','p','l',1),('outside','other','other','other',0);
  `)
  return { sqlite, db: db as unknown as Database }
}

/** Captures complete hierarchy state, including local snapshots and timestamps. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return ['organisation', 'project', 'layer', 'feature'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

for (const [kind, id, command] of [
  ['organisation', 'o', updateOrganisationArchivedStateById],
  ['project', 'p', updateProjectArchivedStateById],
  ['layer', 'l', updateLayerArchivedStateById],
] as const) {
  const expectedScope = { hubId: 'h', organisationId: 'o', projectId: 'p' }
  describe(`atomic ${kind} archive`, () => {
    it('archives and restores descendants while retaining individual archive state', async () => {
      const { sqlite, db } = fixture()
      try {
        expect(await command(db, { id, state: true, expectedScope })).toEqual({
          id,
          isArchived: true,
        })
        await command(db, { id, state: true, expectedScope })
        expect(
          sqlite
            .prepare("SELECT isArchived,localIsArchived FROM feature WHERE id='f'")
            .get(),
        ).toEqual({ isArchived: 1, localIsArchived: 0 })
        await command(db, { id, state: false, expectedScope })
        expect(
          sqlite
            .prepare("SELECT isArchived,localIsArchived FROM feature WHERE id='f'")
            .get(),
        ).toEqual({ isArchived: 0, localIsArchived: null })
        expect(
          sqlite.prepare("SELECT isArchived FROM feature WHERE id='archived'").get(),
        ).toEqual({ isArchived: 1 })
        expect(
          sqlite.prepare("SELECT isArchived FROM feature WHERE id='outside'").get(),
        ).toEqual({ isArchived: 0 })
      } finally {
        sqlite.close()
      }
    })

    for (const state of [false, true]) {
      it.each([
        'descendant failure',
        'skipped parent',
        'moved parent',
        'moved hub',
        'missing parent',
      ])(`preserves all rows for %s with state ${state}`, async scenario => {
        const { sqlite, db } = fixture()
        try {
          if (!state) {
            for (const table of ['organisation', 'project', 'layer', 'feature']) {
              sqlite.exec(`UPDATE ${table} SET isArchived=1,localIsArchived=0`)
            }
          }
          if (scenario === 'descendant failure')
            sqlite.exec(
              "CREATE TRIGGER fail_child BEFORE UPDATE ON feature BEGIN SELECT RAISE(ABORT,'archive failed'); END",
            )
          if (scenario === 'skipped parent')
            sqlite.exec(
              `CREATE TRIGGER skip_parent BEFORE UPDATE ON ${kind} BEGIN SELECT RAISE(IGNORE); END`,
            )
          if (scenario === 'moved parent') {
            if (kind === 'organisation')
              sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
            if (kind === 'project')
              sqlite.exec("UPDATE project SET organisationId='other' WHERE id='p'")
            if (kind === 'layer')
              sqlite.exec("UPDATE layer SET projectId='other-p' WHERE id='l'")
          }
          if (scenario === 'moved hub')
            sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
          if (scenario === 'missing parent')
            sqlite.exec(`DELETE FROM ${kind} WHERE id='${id}'`)
          const before = snapshot(sqlite)
          const pending = command(db, { id, state, expectedScope })
          if (scenario === 'descendant failure')
            await expect(pending).rejects.toThrow('archive failed')
          else expect(await pending).toBeNull()
          expect(snapshot(sqlite)).toEqual(before)
        } finally {
          sqlite.close()
        }
      })
    }
  })
}

it.each([false, true])(
  'restores archive snapshots before historical routing with recursive triggers %s',
  async recursive => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(`
      PRAGMA recursive_triggers=${recursive ? 1 : 0};
      ALTER TABLE project ADD COLUMN flags TEXT DEFAULT '{}';
      ALTER TABLE layer ADD COLUMN metadata TEXT;
      ALTER TABLE layer ADD COLUMN rank INTEGER DEFAULT 0;
      ALTER TABLE layer ADD COLUMN isDefaultVisible INTEGER DEFAULT 0;
      ALTER TABLE layer ADD COLUMN isPublished INTEGER DEFAULT 1;
      ALTER TABLE feature ADD COLUMN isIntangible INTEGER DEFAULT 0;
      ALTER TABLE feature ADD COLUMN geometry TEXT;
      ALTER TABLE feature ADD COLUMN spatialIndex TEXT;
      CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT,nameShort TEXT,nameGen INTEGER,nameShortGen INTEGER,PRIMARY KEY(layerId,locale));
      CREATE TABLE layerProperty(layerId TEXT,propertyId TEXT,isVisible INTEGER,isUserContributable INTEGER,UNIQUE(layerId,propertyId));
      CREATE TABLE featureSpatial(featureId TEXT,resolution INTEGER,cell TEXT,layerId TEXT,longitude REAL,latitude REAL,PRIMARY KEY(featureId,resolution));
    `)
      sqlite.exec(readFileSync('src/tests/fixtures/historical-layers.sql', 'utf8'))
      sqlite.exec("UPDATE feature SET isIntangible=1 WHERE id IN ('f','archived')")
      const expectedScope = { organisationId: 'o', projectId: 'p', hubId: 'h' }
      await updateLayerArchivedStateById(db, { id: 'l', state: true, expectedScope })
      // Enabling while the source is archived defers derivative creation until restoration.
      sqlite.exec(
        `UPDATE project SET flags='{"showHistoricalLayers":true}' WHERE id='p'`,
      )
      expect(
        sqlite.prepare("SELECT id FROM layer WHERE historicalSourceLayerId='l'").get(),
      ).toBeUndefined()
      // A trigger failure after descendant restoration must roll back snapshots and parent state.
      const beforeRestore = snapshot(sqlite)
      sqlite.exec(
        "CREATE TRIGGER reject_history BEFORE INSERT ON layer WHEN NEW.historicalSourceLayerId IS NOT NULL BEGIN SELECT RAISE(ABORT,'historical creation failed'); END",
      )
      await expect(
        updateLayerArchivedStateById(db, { id: 'l', state: false, expectedScope }),
      ).rejects.toThrow('historical creation failed')
      expect(snapshot(sqlite)).toEqual(beforeRestore)
      sqlite.exec('DROP TRIGGER reject_history')
      expect(
        await updateLayerArchivedStateById(db, {
          id: 'l',
          state: false,
          expectedScope,
        }),
      ).toEqual({ id: 'l', isArchived: false })
      expect(
        sqlite
          .prepare(
            "SELECT id,layerId,isArchived,localIsArchived FROM feature WHERE id IN ('f','archived') ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: 'archived', layerId: 'history:l', isArchived: 1, localIsArchived: null },
        { id: 'f', layerId: 'history:l', isArchived: 0, localIsArchived: null },
      ])
    } finally {
      sqlite.close()
    }
  },
)
