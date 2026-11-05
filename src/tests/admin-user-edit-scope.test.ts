// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { adminUserEditCondition } from '#lib/api/services/authz/adminUser.js'
import type { SessionUser } from '#lib/types.js'

const actor = { id: 'actor', isAnonymous: false, superAdmin: false } as SessionUser
const dialect = new SQLiteSyncDialect()

describe('admin profile persisted scope', () => {
  it('does not allow anonymous super-admin-shaped input', () => {
    expect(
      dialect.sqlToQuery(
        adminUserEditCondition({ ...actor, isAnonymous: true, superAdmin: true }),
      ).sql,
    ).toBe('0')
  })
  it('allows explicit super admins globally', () => {
    expect(
      dialect.sqlToQuery(adminUserEditCondition({ ...actor, superAdmin: true })).sql,
    ).toBe('1')
  })
  it('correlates target membership and staff to the same non-archived organisation', () => {
    const query = dialect.sqlToQuery(adminUserEditCondition(actor))
    expect(query.sql).toContain('audience.userId = "user"."id"')
    expect(query.sql).toContain('staff.organisationId = o.id')
    expect(query.sql).toContain('staff.hubId = o.hubId')
    expect(query.sql).toContain('o.isArchived = 0')
    expect(query.sql).toContain('o.permitUserDetailsEdit = 1')
    expect(query.sql).not.toContain('projectRole')
    expect(query.params).toEqual(['actor', 'actor'])
  })
})

describe('audience isolation against SQLite', () => {
  it('permits only the shared audience, and immediately denies revoked staff', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY);
        CREATE TABLE organisation (id TEXT PRIMARY KEY, hubId TEXT, isArchived INTEGER);
        CREATE TABLE organisationRole (organisationId TEXT, userId TEXT, role TEXT);
        CREATE TABLE hubRole (hubId TEXT, userId TEXT, role TEXT);
        INSERT INTO user VALUES ('target'), ('unrelated');
        INSERT INTO organisation VALUES ('foodworks', 'hub1', 0), ('other', 'hub2', 0);
        INSERT INTO organisationRole VALUES ('foodworks', 'target', 'user'), ('other', 'unrelated', 'user');`)
      db.exec(
        readFileSync(
          'migrations/0180_organisation_user_details_permission.sql',
          'utf8',
        ),
      )
      db.exec("INSERT INTO organisation(id,hubId,isArchived) VALUES ('new', 'hub3', 0)")
      expect(
        db
          .prepare(
            'SELECT DISTINCT permitUserDetailsEdit AS permission FROM organisation',
          )
          .all(),
      ).toEqual([{ permission: 0 }])
      expect(() =>
        db.exec("UPDATE organisation SET permitUserDetailsEdit=2 WHERE id='new'"),
      ).toThrow()
      const query = dialect.sqlToQuery(adminUserEditCondition(actor))
      const visible = () =>
        db
          .prepare(`SELECT id FROM user WHERE ${query.sql}`)
          .all(...(query.params as string[]))
          .map(row => row.id)
      expect(visible()).toEqual([])
      db.exec("INSERT INTO organisationRole VALUES ('foodworks', 'actor', 'owner')")
      expect(visible()).toEqual([])
      // A grant on another organisation cannot unlock the target's organisation.
      db.exec("UPDATE organisation SET permitUserDetailsEdit=1 WHERE id='other'")
      expect(visible()).toEqual([])
      db.exec("UPDATE organisation SET permitUserDetailsEdit=1 WHERE id='foodworks'")
      expect(visible()).toEqual(['target'])
      // Reuse an already-built UPDATE predicate to simulate an open editor after revocation.
      db.exec("UPDATE organisation SET permitUserDetailsEdit=0 WHERE id='foodworks'")
      expect(
        db
          .prepare(`UPDATE user SET id=id WHERE id='target' AND ${query.sql}`)
          .run(...(query.params as string[])).changes,
      ).toBe(0)
      expect(visible()).toEqual([])
      db.exec("UPDATE organisation SET permitUserDetailsEdit=1 WHERE id='foodworks'")
      db.exec("DELETE FROM organisationRole WHERE userId='actor'")
      expect(visible()).toEqual([])
      db.exec("INSERT INTO hubRole VALUES ('hub1', 'actor', 'admin')")
      expect(visible()).toEqual(['target'])
      db.exec("UPDATE organisation SET permitUserDetailsEdit=0 WHERE id='foodworks'")
      expect(visible()).toEqual([])
      db.exec("UPDATE organisation SET permitUserDetailsEdit=1 WHERE id='foodworks'")
      db.exec("DELETE FROM organisationRole WHERE userId='target'")
      expect(visible()).toEqual([])
      db.exec("INSERT INTO organisationRole VALUES ('foodworks', 'target', 'user')")
      expect(visible()).toEqual(['target'])
      db.exec("UPDATE organisation SET isArchived=1 WHERE id='foodworks'")
      expect(visible()).toEqual([])
    } finally {
      db.close()
    }
  })
})
