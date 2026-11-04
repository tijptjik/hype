// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// SERVICES
import {
  enrolOrganisationUserOnSignIn,
  enrolOrganisationUserFromCard,
} from '#lib/organisation-users/enrol.server.js'
import { canManageOrganisationUsers } from '#lib/api/services/authz/organisationUsers.js'
import { OrganisationUserPolicySchema } from '#lib/organisation-users/policy.js'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { UserRoleDisco } from '#lib/types.js'

let sqlite: DatabaseSync
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT,domain TEXT); INSERT INTO hub VALUES('core','core','hype.hk'),('a','breadline','example.org'),('b','other','other.org');
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INTEGER DEFAULT 0,isPublished INTEGER DEFAULT 1,isCoreInclusive INTEGER DEFAULT 0,isHubExclusive INTEGER DEFAULT 0);
    INSERT INTO organisation(id,hubId) VALUES('org','a'),('other','b'),('no-hub',NULL);
    CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT,emailVerified INTEGER,isArchived INTEGER DEFAULT 0,isAnonymous INTEGER DEFAULT 0);
    INSERT INTO user(id,email,emailVerified) VALUES('user','Person@Example.org',1);
    CREATE TABLE organisationRole(organisationId TEXT REFERENCES organisation(id),userId TEXT REFERENCES user(id),role TEXT NOT NULL DEFAULT 'member',PRIMARY KEY(organisationId,userId));
    CREATE TABLE breadlineImportIdentity(sourceUserId INTEGER PRIMARY KEY);`)
  sqlite.exec(readFileSync('migrations/0168_organisation_users.sql', 'utf8'))
  sqlite.exec("INSERT INTO organisationUserPolicy VALUES('org',1,1,'example.org',1,1)")
})
afterEach(() => sqlite.close())

/** Expose production SQL through the real D1 prepare/batch shape with rollback.
 * @returns D1-compatible SQLite fixture.
 */
function database(): D1Database {
  const prepare = (sql: string, parameters: unknown[] = []) => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...(parameters as never[])) ?? null,
    run: async () => sqlite.prepare(sql).run(...(parameters as never[])),
  })
  return {
    prepare,
    batch: async (statements: Array<ReturnType<typeof prepare>>) => {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
}

describe('organisation audience membership', () => {
  it('records matching OR reasons once, independently from staff roles', async () => {
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    expect(
      JSON.parse(
        (
          sqlite.prepare('SELECT grant FROM organisationRole').get() as {
            grant: string
          }
        ).grant,
      ),
    ).toEqual({ 'email:example.org': 'user', 'hub:a': 'user' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
    sqlite.exec("UPDATE organisationRole SET grant=json_remove(grant,'$.hub:a')")
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
  })
  it('requires verified exact-domain email and trusted hub and rejects anonymous/archived users', async () => {
    for (const email of [
      'person@notexample.org',
      'person@example.org.attacker.invalid',
      'person@sub.example.org',
    ]) {
      sqlite.prepare('UPDATE user SET email=?').run(email)
      await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    }
    sqlite.exec("UPDATE user SET email='person@example.org',emailVerified=0")
    await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    sqlite.exec('UPDATE user SET emailVerified=1,isAnonymous=1')
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    sqlite.exec('UPDATE user SET isAnonymous=0,isArchived=1')
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 0,
    })
  })
  it('resolves trusted core sign-in without assuming the router supplies a hub ID', async () => {
    sqlite.exec(
      "UPDATE organisation SET hubId='core' WHERE id='org'; UPDATE organisationUserPolicy SET emailDomain=NULL",
    )
    await enrolOrganisationUserOnSignIn(database(), 'user', null, false)
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 0,
    })
    await enrolOrganisationUserOnSignIn(database(), 'user', null, true)
    expect(sqlite.prepare('SELECT grant FROM organisationRole').get()).toEqual({
      grant: JSON.stringify({ 'hub:core': 'user' }),
    })
  })
  it('uses current hub and domain policy after reassignment', async () => {
    sqlite.exec(
      "UPDATE organisation SET hubId='b' WHERE id='org'; UPDATE organisationUserPolicy SET emailDomain='new.example.org'",
    )
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 0,
    })
    await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    expect(sqlite.prepare('SELECT grant FROM organisationRole').get()).toEqual({
      grant: JSON.stringify({ 'hub:b': 'user' }),
    })
  })
  it('uses the current hub domain, not a separately supplied policy domain', async () => {
    sqlite.exec(
      "UPDATE organisationUserPolicy SET hubSignIn=0,emailDomain='untrusted.org'; UPDATE hub SET domain=' EXAMPLE.ORG ' WHERE id='a'",
    )
    await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    expect(sqlite.prepare('SELECT grant FROM organisationRole').get()).toEqual({
      grant: JSON.stringify({ 'email:example.org': 'user' }),
    })
    sqlite.exec(
      "DELETE FROM organisationRole; UPDATE hub SET domain='new.org' WHERE id='a'",
    )
    await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 0,
    })
    sqlite.exec("UPDATE user SET email='person@new.org'")
    await enrolOrganisationUserOnSignIn(database(), 'user', 'b')
    expect(sqlite.prepare('SELECT grant FROM organisationRole').get()).toEqual({
      grant: JSON.stringify({ 'email:new.org': 'user' }),
    })
  })
  it('stops new grants after disabling policy or removing the hub without removing existing members', async () => {
    await enrolOrganisationUserOnSignIn(database(), 'user', 'a')
    sqlite.exec(
      "UPDATE organisationUserPolicy SET enabled=0; INSERT INTO user(id,email,emailVerified) VALUES('new','new@example.org',1)",
    )
    await enrolOrganisationUserOnSignIn(database(), 'new', 'a')
    sqlite.exec(
      "UPDATE organisationUserPolicy SET enabled=1; UPDATE organisation SET hubId=NULL WHERE id='org'",
    )
    await enrolOrganisationUserOnSignIn(database(), 'new', 'a')
    expect(sqlite.prepare('SELECT userId FROM organisationRole').all()).toEqual([
      { userId: 'user' },
    ])
  })
  it('onboards only from an available organisation in the active hub, idempotently', async () => {
    expect(await enrolOrganisationUserFromCard(database(), 'user', 'org', 'b')).toBe(
      false,
    )
    expect(await enrolOrganisationUserFromCard(database(), 'user', 'org', 'a')).toBe(
      true,
    )
    expect(await enrolOrganisationUserFromCard(database(), 'user', 'org', 'a')).toBe(
      true,
    )
    sqlite.exec("UPDATE organisation SET isCoreInclusive=1 WHERE id='org'")
    expect(await enrolOrganisationUserFromCard(database(), 'user', 'org', 'b')).toBe(
      false,
    )
    expect(
      await enrolOrganisationUserFromCard(database(), 'user', 'org', null, true),
    ).toBe(true)
    expect(
      await enrolOrganisationUserFromCard(database(), 'user', 'org', null, false),
    ).toBe(false)
    sqlite.exec('UPDATE organisationUserPolicy SET customCard=0')
    expect(await enrolOrganisationUserFromCard(database(), 'user', 'org', 'a')).toBe(
      false,
    )
    expect(sqlite.prepare('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
  })
  it('allows only scoped owners/admins to manage users and contacts', () => {
    const target = { id: 'org', hubId: 'a', isArchived: false }
    const actor = { id: 'user', isAnonymous: false, roles: [] as UserRoleDisco[] }
    const role = (organisationId: string, role: string) =>
      ({ type: 'organisation', organisationId, role }) as UserRoleDisco
    expect(canManageOrganisationUsers(actor, target)).toBe(false)
    expect(
      canManageOrganisationUsers({ ...actor, roles: [role('org', 'member')] }, target),
    ).toBe(false)
    expect(
      canManageOrganisationUsers({ ...actor, roles: [role('other', 'owner')] }, target),
    ).toBe(false)
    expect(
      canManageOrganisationUsers({ ...actor, roles: [role('org', 'owner')] }, target),
    ).toBe(true)
    expect(
      canManageOrganisationUsers(
        { ...actor, isAnonymous: true, superAdmin: true },
        target,
      ),
    ).toBe(false)
    expect(
      canManageOrganisationUsers(
        { ...actor, superAdmin: true },
        { ...target, isArchived: true },
      ),
    ).toBe(false)
  })
  it('normalizes domains and rejects wildcard, email and host suffix patterns', () => {
    const policy = { enabled: true, hubSignIn: false, customCard: false, revision: 0 }
    expect(
      OrganisationUserPolicySchema.parse({ ...policy, emailDomain: ' Example.ORG ' })
        .emailDomain,
    ).toBe('example.org')
    for (const domain of [
      '*.example.org',
      '@example.org',
      'a@example.org',
      'example.org/path',
      '',
    ])
      expect(
        OrganisationUserPolicySchema.safeParse({ ...policy, emailDomain: domain })
          .success,
      ).toBe(false)
  })
})
