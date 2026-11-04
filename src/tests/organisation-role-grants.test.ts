// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import {
  hasOrganisationRoleAtLeast,
  isOrganisationStaffRole,
} from '#lib/roles/organisation.js'
import { prepareOrganisationStaffRoles } from '#lib/db/services/organisationRoleGrants.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'
import type { UserRoleDisco } from '#lib/types.js'

describe('organisation role hierarchy and provenance', () => {
  it.each([0, 1])(
    'retains the strongest independent role with recursive triggers=%s',
    recursive => {
      const db = new DatabaseSync(':memory:')
      try {
        db.exec(`PRAGMA recursive_triggers=${recursive};
        CREATE TABLE organisation(id TEXT PRIMARY KEY);
        CREATE TABLE user(id TEXT PRIMARY KEY);
        CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT DEFAULT 'member',PRIMARY KEY(organisationId,userId));
        CREATE TABLE breadlineImportIdentity(sourceUserId INTEGER PRIMARY KEY);
        INSERT INTO organisationRole VALUES('org','person','owner');`)
        db.exec(readFileSync('migrations/0168_organisation_users.sql', 'utf8'))
        expect(db.prepare('SELECT role,grant FROM organisationRole').get()).toEqual({
          role: 'owner',
          grant: '{"manual":"owner"}',
        })
        db.exec(
          `UPDATE organisationRole SET grant=json_patch(grant,'{"breadline:1":"user","project:p":"member"}');`,
        )
        expect(db.prepare('SELECT role FROM organisationRole').get()).toEqual({
          role: 'owner',
        })
        db.exec("UPDATE organisationRole SET grant=json_remove(grant,'$.manual')")
        expect(db.prepare('SELECT role FROM organisationRole').get()).toEqual({
          role: 'member',
        })
        db.exec("UPDATE organisationRole SET grant=json_remove(grant,'$.project:p')")
        expect(db.prepare('SELECT role FROM organisationRole').get()).toEqual({
          role: 'user',
        })
        db.exec("UPDATE organisationRole SET role='owner'")
        expect(db.prepare('SELECT grant FROM organisationRole').get()).toEqual({
          grant: '{"breadline:1":"user","manual":"owner"}',
        })
        db.exec("UPDATE organisationRole SET grant=json_remove(grant,'$.breadline:1')")
        expect(db.prepare('SELECT role FROM organisationRole').get()).toEqual({
          role: 'owner',
        })
        expect(() =>
          db.exec(`UPDATE organisationRole SET grant='{"manual":"admin"}'`),
        ).toThrow()
        db.exec("UPDATE organisationRole SET grant='{}'")
        expect(db.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
          n: 0,
        })
        db.exec(
          "INSERT INTO organisationRole(organisationId,userId,role) VALUES('org','legacy','member')",
        )
        expect(db.prepare('SELECT grant FROM organisationRole').get()).toEqual({
          grant: '{"manual":"member"}',
        })
      } finally {
        db.close()
      }
    },
  )
  it('replaces 250 manual staff assignments without deleting user or independent grants', async () => {
    const { sqlite, db } = publicationSqlite({})
    try {
      sqlite.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY);
        CREATE TABLE user(id TEXT PRIMARY KEY);
        CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT DEFAULT 'member',PRIMARY KEY(organisationId,userId));
        CREATE TABLE breadlineImportIdentity(sourceUserId INTEGER PRIMARY KEY);`)
      sqlite.exec(readFileSync('migrations/0168_organisation_users.sql', 'utf8'))
      sqlite.exec(`INSERT INTO organisationRole VALUES('org','audience','user','{"breadline:1":"user"}');
        INSERT INTO organisationRole VALUES('org','former-staff','owner','{"manual":"owner","onboarding":"user"}');
        INSERT INTO organisationRole VALUES('org','owner','owner','{"manual":"owner","breadline:2":"user"}');`)
      const roles = Array.from({ length: 250 }, (_, i) => ({
        userId: i ? 'staff-' + i : 'owner',
        role: i ? 'member' : 'owner',
      }))
      const statements = prepareOrganisationStaffRoles(
        db as unknown as Database,
        'org',
        roles,
      )
      for (const statement of statements)
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      await db.batch(statements)
      expect(
        sqlite
          .prepare(
            "SELECT role,grant FROM organisationRole WHERE userId='former-staff'",
          )
          .get(),
      ).toEqual({ role: 'user', grant: '{"onboarding":"user"}' })
      expect(
        sqlite
          .prepare("SELECT role FROM organisationRole WHERE userId='audience'")
          .get(),
      ).toEqual({ role: 'user' })
      expect(
        JSON.parse(
          String(
            sqlite
              .prepare("SELECT grant FROM organisationRole WHERE userId='owner'")
              .get()!.grant,
          ),
        ),
      ).toEqual({ manual: 'owner', 'breadline:2': 'user' })
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS n FROM organisationRole WHERE role IN ('member','owner')",
          )
          .get(),
      ).toEqual({ n: 250 })
      expect(() =>
        prepareOrganisationStaffRoles(db as unknown as Database, 'org', [
          { userId: 'audience', role: 'user' },
        ]),
      ).toThrow('Invalid')
    } finally {
      sqlite.close()
    }
  })
  it('includes stronger roles in user qualification, but limits staff to member and owner', () => {
    for (const role of ['user', 'member', 'owner']) {
      const roles = [
        { type: 'organisation', organisationId: 'org', userId: 'person', role },
      ] as UserRoleDisco[]
      expect(hasOrganisationRoleAtLeast(roles, 'org')).toBe(true)
      expect(hasOrganisationRoleAtLeast(roles, 'other')).toBe(false)
      expect(hasOrganisationRoleAtLeast(roles, 'org', 'member')).toBe(role !== 'user')
      expect(isOrganisationStaffRole(role)).toBe(role !== 'user')
    }
  })
})
