// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// VITEST
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0174_hub_counts.sql', 'utf8')

/** Creates an isolated ownership graph with the production foreign-key actions. */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE hub(id TEXT PRIMARY KEY, code TEXT UNIQUE);
    CREATE TABLE organisation(id TEXT PRIMARY KEY, hubId TEXT REFERENCES hub(id) ON DELETE SET NULL ON UPDATE CASCADE, isCoreInclusive INTEGER DEFAULT 1, isHubExclusive INTEGER DEFAULT 0);
    CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE);
    CREATE TABLE layer(id TEXT PRIMARY KEY, organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE ON UPDATE CASCADE,
      projectId TEXT REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE);
    INSERT INTO hub VALUES ('a','a'),('b','b'),('empty','empty'),('core','core');
    INSERT INTO organisation(id,hubId) VALUES ('o','a'),('other','b'),('unassigned',NULL);
    INSERT INTO project VALUES ('p','o');
    INSERT INTO layer VALUES ('l','o','p');`)
  db.exec(migration)
  return db
}

/** Compares persisted totals with independent full aggregates after each mutation. */
function assertParity(db: DatabaseSync): void {
  expect(db.prepare('SELECT * FROM hubCounts ORDER BY hubId').all()).toEqual(
    db
      .prepare(`SELECT h.id AS hubId,
      (SELECT count(*) FROM organisation o WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id))) AS organisationCount,
      (SELECT count(*) FROM project p JOIN organisation o ON o.id=p.organisationId WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id))) AS projectCount,
      (SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id))) AS layerCount
      FROM hub h ORDER BY h.id`)
      .all(),
  )
}

describe('stored hub scope counts', () => {
  it.each([
    [
      "UPDATE organisation SET isCoreInclusive=0 WHERE id='o'",
      "UPDATE organisation SET isCoreInclusive=1 WHERE id='o'",
    ],
    [
      "UPDATE organisation SET isHubExclusive=1 WHERE id='o'",
      "UPDATE organisation SET hubId=NULL WHERE id='o'",
      "UPDATE organisation SET hubId='b' WHERE id='o'",
      "UPDATE organisation SET isHubExclusive=0 WHERE id='o'",
    ],
    [
      "UPDATE organisation SET isHubExclusive=1 WHERE id='o'",
      "DELETE FROM hub WHERE id='a'",
    ],
    [
      "UPDATE organisation SET hubId='core' WHERE id='o'",
      "UPDATE organisation SET isHubExclusive=1 WHERE id='o'",
    ],
    [
      "INSERT INTO project VALUES ('other-p','other')",
      "UPDATE layer SET projectId='other-p' WHERE id='l'",
    ],
    ["UPDATE project SET id='renamed' WHERE id='p'"],
    ["DELETE FROM hub WHERE id='core'", "INSERT INTO hub VALUES ('new-core','core')"],
    [
      "UPDATE hub SET code='former-core' WHERE id='core'",
      "UPDATE hub SET code='core' WHERE id='empty'",
    ],
    [
      "UPDATE organisation SET hubId='b' WHERE id='o'",
      "UPDATE organisation SET hubId=NULL WHERE id='o'",
      "UPDATE organisation SET hubId='a' WHERE id='o'",
    ],
    [
      "UPDATE project SET organisationId='other' WHERE id='p'",
      "UPDATE layer SET organisationId='other' WHERE id='l'",
    ],
    ["DELETE FROM organisation WHERE id='o'"],
    ["DELETE FROM project WHERE id='p'"],
    ["DELETE FROM hub WHERE id='a'"],
    ["UPDATE hub SET id='renamed' WHERE id='a'"],
    ["UPDATE organisation SET id='renamed' WHERE id='o'"],
    [
      "INSERT INTO hub VALUES ('new','new')",
      "INSERT INTO organisation(id,hubId) VALUES ('new-o','new')",
      "INSERT INTO project VALUES ('new-p','new-o')",
      "INSERT INTO layer VALUES ('new-l','new-o','new-p')",
      "DELETE FROM layer WHERE id='new-l'",
    ],
  ])('backfills and tracks mutation sequence %j', (...statements: string[]) => {
    const db = fixture()
    try {
      assertParity(db)
      for (const statement of statements) {
        db.exec(statement)
        assertParity(db)
      }
    } finally {
      db.close()
    }
  })

  it('repairs already-applied ownership counters and replaces legacy triggers', () => {
    const db = fixture()
    try {
      db.exec(`UPDATE hubCounts SET organisationCount=0,projectCount=0,layerCount=0;
        CREATE TRIGGER hub_counts_organisation_move AFTER UPDATE OF hubId ON organisation BEGIN SELECT 1; END;
        CREATE TRIGGER hub_counts_project_move AFTER UPDATE OF organisationId ON project BEGIN SELECT 1; END;
        CREATE TRIGGER hub_counts_layer_move AFTER UPDATE OF organisationId ON layer BEGIN SELECT 1; END;`)
      db.exec(readFileSync('migrations/0175_hub_scope_counts.sql', 'utf8'))
      assertParity(db)
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('hub_counts_organisation_move','hub_counts_project_move','hub_counts_layer_move')",
          )
          .all(),
      ).toEqual([])
      db.exec("UPDATE organisation SET isHubExclusive=1 WHERE id='o'")
      assertParity(db)
      db.exec("UPDATE organisation SET isCoreInclusive=0 WHERE id='other'")
      assertParity(db)
    } finally {
      db.close()
    }
  })

  it('rolls counters back with failed transactions', () => {
    const db = fixture()
    try {
      db.exec("BEGIN; UPDATE organisation SET hubId='b' WHERE id='o'; ROLLBACK;")
      assertParity(db)
      const plan = db
        .prepare("EXPLAIN QUERY PLAN SELECT * FROM hubCounts WHERE hubId='a'")
        .all()
      expect(JSON.stringify(plan)).toContain('SEARCH')
      expect(JSON.stringify(plan)).not.toContain('SCAN')
    } finally {
      db.close()
    }
  })
})
