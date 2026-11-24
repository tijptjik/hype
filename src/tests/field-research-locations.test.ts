// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  researchLocationDescendants,
  researchLocationDescendantsSQL,
  researchLocationInclusionSQL,
} from '#lib/db/services/fieldResearchLocations.js'
import { sql } from 'drizzle-orm'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

describe('field session Location selection', () => {
  it('follows current, visible containment, including nested parts and scoped suppressions', async () => {
    const { db, sqlite } = publicationSqlite({}, 100)
    try {
      sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY, matchingType TEXT, state TEXT, ownerOrganisationId TEXT);
        CREATE TABLE locationCanonical(aliasId TEXT PRIMARY KEY, locationId TEXT);
        CREATE TABLE locationMembershipHead(relationshipId TEXT, parentLocationId TEXT, childLocationId TEXT, assertionState TEXT, membershipState TEXT, effectiveFrom TEXT, effectiveTo TEXT, scopeOrganisationId TEXT);
        INSERT INTO location VALUES ('p','premises','linked',NULL),('b','building','linked',NULL),('f','building_part','linked',NULL),('u','building_part','linked',NULL),('foreign','building','manual','other'),('stale','building','linked',NULL),('blocked','building','linked',NULL);
        ALTER TABLE location ADD COLUMN redirectTargetId TEXT;
        INSERT INTO location VALUES ('old-b','building','redirect',NULL,'b');
        INSERT INTO locationCanonical VALUES ('old-b','b');
        INSERT INTO locationMembershipHead VALUES
          ('p-b','p','b','asserted','current',NULL,NULL,NULL),
          ('b-f','old-b','f','asserted','current',NULL,NULL,NULL),
          ('f-u','f','u','asserted','current',NULL,NULL,NULL),
          ('p-foreign','p','foreign','asserted','current',NULL,NULL,NULL),
          ('p-stale','p','stale','asserted','former',NULL,NULL,NULL),
          ('p-blocked','p','blocked','asserted','current',NULL,NULL,NULL),
          ('p-blocked','p','blocked','suppressed','current',NULL,NULL,'org');`)
      const query = (parts: boolean) =>
        researchLocationDescendants(db as unknown as Database, 'p', 'org', parts)
      expect((await query(false)).map(row => row.id).sort()).toEqual(['b', 'p'])
      expect((await query(true)).map(row => row.id).sort()).toEqual([
        'b',
        'f',
        'p',
        'u',
      ])
      sqlite.exec(`CREATE TABLE fieldResearchSessionLocation(sessionId TEXT, locationId TEXT);
        INSERT INTO fieldResearchSessionLocation VALUES ('s','b'),('another','f')`)
      const counts = async () =>
        JSON.parse(
          (await db.get<{ counts: string }>(
            sql`SELECT ${researchLocationInclusionSQL(sql`root.id`, sql`'org'`, sql`'s'`)} counts FROM location root WHERE id='b'`,
          ))!.counts,
        )
      expect(await counts()).toEqual({ included: 0, total: 2 })
      sqlite.exec("INSERT INTO fieldResearchSessionLocation VALUES ('s','f')")
      expect(await counts()).toEqual({ included: 1, total: 2 })
      sqlite.exec("INSERT INTO fieldResearchSessionLocation VALUES ('s','u')")
      expect(await counts()).toEqual({ included: 2, total: 2 })
      const guard = async () =>
        db.get<{ valid: number }>(
          sql`SELECT NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(['b', 'f', 'u'])}) selected WHERE selected.value NOT IN (SELECT id FROM (${researchLocationDescendantsSQL('p', 'org', true)}))) valid`,
        )
      expect((await guard())?.valid).toBe(1)
      sqlite.exec(
        "UPDATE locationMembershipHead SET membershipState='former' WHERE relationshipId='b-f'",
      )
      expect((await guard())?.valid).toBe(0)
    } finally {
      sqlite.close()
    }
  })
})
