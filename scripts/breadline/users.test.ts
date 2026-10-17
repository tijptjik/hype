// BUN
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
// USERNAMES
import { generateRunnerUsernameFromId } from '../../src/lib/utils/username-generator.server'
// PIPELINE
import {
  planUsers,
  normalizeTelephone,
  userPlanSql,
  type LegacyUser,
  type TargetIdentitySnapshot,
} from './lib/users'

const empty: TargetIdentitySnapshot = { users: [], accounts: [] }
/**
 * Construct synthetic legacy identity rows without personal data.
 * @param overrides Values to vary for each behavior.
 * @returns Complete source-shaped user fixture.
 */
function row(overrides: Partial<LegacyUser> = {}): LegacyUser {
  return {
    id: 1,
    volunteer_id: 10,
    uid: '123456789012345678901',
    email: ' Person@Example.com ',
    name: "O'Example",
    telephone: '+852 9123 4567',
    locale: 'zh_HK',
    picture: null,
    created_at: '2019-01-01T00:00:00Z',
    last_updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Breadline user mapping', () => {
  it('creates a Google user and token-free account with stable IDs and normalized fields', () => {
    const plan = planUsers([row()], empty, 'seed')
    expect(plan.counts).toEqual({
      source: 1,
      created: 1,
      matchedGroups: 0,
      accountsCreated: 1,
      exceptions: 0,
      excludedSourceRows: 0,
      mappedSourceRows: 1,
    })
    expect(plan.users[0]).toMatchObject({
      email: 'person@example.com',
      locale: 'zh-hant',
      emailVerified: 1,
      isAnonymous: 0,
      isArchived: 0,
      telephone: '+85291234567',
      createdAt: Date.parse('2019-01-01T00:00:00Z'),
    })
    expect(plan.accounts[0].userId).toBe(plan.users[0].id)
    expect(plan.accounts[0]).not.toHaveProperty('accessToken')
    expect(planUsers([row()], empty, 'seed')).toEqual(plan)
    expect(planUsers([row()], empty, 'other-target').users[0].id).not.toBe(
      plan.users[0].id,
    )
  })
  it('recognizes prior unverified imports by the durable target seed without verifying their emails', () => {
    for (const email of ['legacy@example.com', null]) {
      const legacy = row({ email, uid: 'legacy-facebook-id' })
      const first = planUsers([legacy], empty, 'seed')
      const destination: TargetIdentitySnapshot = {
        users: first.users,
        accounts: first.accounts,
      }
      const next = planUsers([legacy], destination, 'seed')
      expect(next.users).toEqual([])
      expect(next.accounts).toEqual([])
      expect(next.exceptions).toEqual([])
      expect(next.mapping[0].targetUserId).toBe(first.users[0].id)
      expect(destination.users[0].emailVerified).toBe(0)
      if (email) {
        expect(
          planUsers([legacy], destination, 'different-seed').exceptions[0].reason,
        ).toBe('target_email_ownership_unverified')
      }
    }
  })
  it('normalizes phones and retains invalid numbers only as offline warnings', () => {
    for (const phone of [
      '9123 4567',
      '+852 9123-4567',
      '85291234567',
      '0085291234567',
    ]) {
      expect(normalizeTelephone(phone)).toBe('+85291234567')
    }
    expect(normalizeTelephone('+44 20 7946 0018')).toBe('+442079460018')
    for (const phone of ['+85238863932', '+85274855020', '+85255555555']) {
      expect(normalizeTelephone(phone)).toBe(phone)
      const plan = planUsers([row({ telephone: phone })], empty, 'seed')
      expect(plan.users[0].telephone).toBe(phone)
      expect(
        plan.warnings.some(
          warning => warning.reason === 'phone_range_unrecognized_preserved',
        ),
      ).toBe(true)
    }

    for (const phone of [null, '', 'not a phone', '123', '+85291234567 ext 12'])
      expect(normalizeTelephone(phone)).toBeNull()
    const plan = planUsers([row({ telephone: 'invalid' })], empty, 'seed')
    expect(plan.users[0].telephone).toBeNull()
    expect(
      plan.warnings.some(warning => warning.reason === 'invalid_phone_requires_review'),
    ).toBe(true)
  })
  it('uses a TitleCase adjective plus Runner and two digits, retrying username collisions', () => {
    const first = planUsers([row()], empty, 'seed').users[0]
    expect(first.username).toMatch(/^[a-z]+runner[0-9]{2}$/)
    expect(first.displayUsername).toMatch(/^[A-Z][a-z]+Runner[0-9]{2}$/)
    expect(first.username).toBe(first.displayUsername.toLowerCase())
    expect(first.username.length).toBeLessThanOrEqual(32)
    const target: TargetIdentitySnapshot = {
      users: [
        {
          id: 'other',
          email: 'other@example.com',
          username: first.username,
          emailVerified: 1,
          isArchived: 0,
          isAnonymous: 0,
        },
      ],
      accounts: [],
    }
    const next = planUsers([row()], target, 'seed')
    expect(next.users[0].username).not.toBe(first.username)
    expect(next.users[0].id).toBe(first.id)
    expect(next.users[0].username).toMatch(/^[a-z]+runner[0-9]{2}$/)
  })
  it('avoids the name library string-seed collision cluster', () => {
    const names = new Set(
      Array.from({ length: 1000 }, (_, index) =>
        generateRunnerUsernameFromId(`u${index}`),
      ),
    )
    expect(names.size).toBeGreaterThan(990)
  })
  it('does not verify an absent email even for a Google identity', () => {
    expect(
      planUsers([row({ email: null })], empty, 'seed').users[0].emailVerified,
    ).toBe(0)
  })
  it('combines Facebook and Google email matches while retaining both history crosswalks', () => {
    const plan = planUsers(
      [row(), row({ id: 2, volunteer_id: 20, uid: 'Facebook_42' })],
      empty,
      'seed',
    )
    expect(plan.users).toHaveLength(1)
    expect(plan.accounts).toHaveLength(1)
    expect(plan.mapping.map(mapping => mapping.sourceVolunteerId)).toEqual([10, 20])
    expect(new Set(plan.mapping.map(mapping => mapping.targetUserId)).size).toBe(1)
  })
  it('retains Facebook-only and unknown-UID users without fake provider accounts', () => {
    for (const uid of ['Facebook_42', 'legacy-unknown', null]) {
      const plan = planUsers([row({ uid })], empty, 'seed')
      expect(plan.users).toHaveLength(1)
      expect(plan.accounts).toHaveLength(0)
      expect(plan.users[0].emailVerified).toBe(0)
      expect(plan.mapping).toHaveLength(1)
      expect(plan.warnings[0].reason).toBe(
        'email_claim_required_no_portable_google_identity',
      )
    }
  })
  it('matches existing verified email without overwriting its profile', () => {
    const target: TargetIdentitySnapshot = {
      users: [
        {
          id: 'existing',
          email: 'PERSON@example.com',
          username: 'existing',
          emailVerified: 1,
          isArchived: 0,
          isAnonymous: 0,
        },
      ],
      accounts: [],
    }
    const plan = planUsers([row()], target, 'seed')
    expect(plan.users).toHaveLength(0)
    expect(plan.accounts[0].userId).toBe('existing')
    expect(plan.mapping[0].disposition).toBe('match')
    expect(
      planUsers([row()], { ...target, accounts: plan.accounts }, 'seed').accounts,
    ).toHaveLength(0)
  })
  it('rejects identity conflicts and unverified email-only matches without losing exception references', () => {
    const target: TargetIdentitySnapshot = {
      users: [
        {
          id: 'email',
          email: 'person@example.com',
          username: null,
          emailVerified: 1,
          isArchived: 0,
          isAnonymous: 0,
        },
        {
          id: 'provider',
          email: 'other@example.com',
          username: null,
          emailVerified: 1,
          isArchived: 0,
          isAnonymous: 0,
        },
      ],
      accounts: [
        {
          id: 'a',
          userId: 'provider',
          providerId: 'google',
          accountId: '123456789012345678901',
        },
      ],
    }
    const plan = planUsers([row()], target, 'seed')
    expect(plan.exceptions).toEqual([
      { sourceUserIds: [1], reason: 'conflicting_target_identities' },
    ])
    expect(plan.accounts).toHaveLength(0)
    expect(
      planUsers(
        [row()],
        { users: [{ ...target.users[0], emailVerified: 0 }], accounts: [] },
        'seed',
      ).exceptions[0].reason,
    ).toBe('target_email_ownership_unverified')
  })
  it('does not split a volunteer across email identities or invent missing timestamps', () => {
    const split = planUsers(
      [
        row(),
        row({ id: 2, email: 'second@example.com', uid: '223456789012345678901' }),
      ],
      empty,
      'seed',
    )
    expect(split.counts.exceptions).toBe(2)
    expect(split.users).toHaveLength(0)
    expect(
      planUsers([row({ created_at: null })], empty, 'seed').exceptions[0].reason,
    ).toBe('invalid_source_timestamps')
  })
  it('reconciles a completed import on replan and renders escaped SQL for SQLite', () => {
    const plan = planUsers([row()], empty, 'seed')
    const db = new Database(':memory:')
    try {
      db.run('PRAGMA foreign_keys=ON')
      db.run(
        'CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, username TEXT UNIQUE, displayUsername TEXT, telephone TEXT, locale TEXT, image TEXT, emailVerified INTEGER, isAnonymous INTEGER, isArchived INTEGER, createdAt INTEGER, updatedAt INTEGER)',
      )
      db.run(
        'CREATE TABLE account (id TEXT PRIMARY KEY, userId TEXT REFERENCES user(id), providerId TEXT, accountId TEXT, createdAt INTEGER, updatedAt INTEGER, UNIQUE(providerId,accountId))',
      )
      db.exec(userPlanSql(plan))
      expect(db.query('SELECT name FROM user').get()).toEqual({ name: "O'Example" })
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      const target = {
        users: db.query('SELECT * FROM user').all(),
        accounts: db.query('SELECT * FROM account').all(),
      } as TargetIdentitySnapshot
      const next = planUsers([row()], target, 'seed')
      expect(next.users).toHaveLength(0)
      expect(next.accounts).toHaveLength(0)
      expect(next.mapping[0].targetUserId).toBe(plan.mapping[0].targetUserId)
      // Verify duplicate insert rejection independently of multi-statement execution.
      expect(() => db.query(userPlanSql(plan).split('\n')[1]).run()).toThrow()
    } finally {
      db.close()
    }
  })
})
