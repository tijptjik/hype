// NODE
import { readFileSync } from 'node:fs'
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

/**
 * Model a completed import using only persisted identity and ownership columns.
 * @param plan Fresh import plan.
 * @returns Snapshot suitable for a repeat plan, without session or token data.
 */
function destination(plan: ReturnType<typeof planUsers>): TargetIdentitySnapshot {
  return {
    users: plan.users,
    accounts: plan.accounts,
    importUsers: plan.importUsers,
    identities: plan.identities,
  }
}

describe('Breadline phone-based user mapping', () => {
  it('auto-claims a single identity with normalized phone, stable IDs and token-free credentials', () => {
    const plan = planUsers([row()], empty, 'seed')
    expect(plan.users[0]).toMatchObject({
      email: 'person@example.com',
      name: "O'Example",
      telephone: '+85291234567',
      locale: 'zh-hant',
      emailVerified: 1,
      isAnonymous: 0,
      isArchived: 0,
    })
    expect(plan.importUsers).toEqual([
      {
        userId: plan.users[0].id,
        telephone: '+85291234567',
        state: 'claimed',
        claimedEmail: 'person@example.com',
      },
    ])
    expect(plan.accounts).toHaveLength(1)
    expect(plan.accounts[0]).not.toHaveProperty('accessToken')
    expect(planUsers([row()], empty, 'seed')).toEqual(plan)
    expect(planUsers([row()], empty, 'other-target').users[0].id).not.toBe(
      plan.users[0].id,
    )
  })
  it('groups phone spelling variants and multiple emails into a credential-free latent user', () => {
    const rows = [
      row(),
      row({
        id: 2,
        volunteer_id: 20,
        telephone: '85291234567',
        email: 'second@example.com',
        name: 'Second',
        uid: '223456789012345678901',
      }),
    ]
    const plan = planUsers(rows, empty, 'seed')
    expect(plan.users).toHaveLength(1)
    expect(plan.users[0]).toMatchObject({
      email: null,
      name: null,
      image: null,
      emailVerified: 0,
      isAnonymous: 0,
    })
    expect(plan.importUsers[0].state).toBe('unclaimed')
    expect(plan.accounts).toEqual([])
    expect(plan.identities.map(identity => identity.email)).toEqual([
      'person@example.com',
      'second@example.com',
    ])
    expect(plan.mapping.map(mapping => mapping.sourceVolunteerId)).toEqual([10, 20])
    expect(new Set(plan.mapping.map(mapping => mapping.targetUserId)).size).toBe(1)
    expect(planUsers([...rows].reverse(), empty, 'seed')).toEqual(plan)
  })
  it('auto-claims repeated rows for the same email/name, including Facebook to Google transitions', () => {
    const plan = planUsers(
      [
        row(),
        row({
          id: 2,
          volunteer_id: 20,
          uid: 'Facebook_42',
          email: 'person@example.com',
          name: " O'Example ",
        }),
      ],
      empty,
      'seed',
    )
    expect(plan.users).toHaveLength(1)
    expect(plan.importUsers[0].state).toBe('claimed')
    expect(plan.accounts).toHaveLength(1)
    expect(plan.identities).toHaveLength(2)
  })
  it('keeps a single email with conflicting names latent and does not guess from a name alone', () => {
    for (const rows of [
      [row(), row({ id: 2, name: 'Another name' })],
      [row({ email: null })],
    ]) {
      const plan = planUsers(rows, empty, 'seed')
      expect(plan.importUsers[0].state).toBe('unclaimed')
      expect(plan.users[0].email).toBeNull()
      expect(plan.users[0].name).toBeNull()
      expect(plan.accounts).toEqual([])
    }
  })
  it('auto-claims a unique email without a name or portable Google ID without verifying it', () => {
    for (const uid of ['Facebook_42', 'legacy-unknown', null]) {
      const plan = planUsers([row({ uid, name: null })], empty, 'seed')
      expect(plan.importUsers[0].state).toBe('claimed')
      expect(plan.users[0].email).toBe('person@example.com')
      expect(plan.users[0].emailVerified).toBe(0)
      expect(plan.accounts).toEqual([])
    }
  })
  it('strips whitespace, enforces numbering rules and retains invalid-phone email identities', () => {
    for (const phone of [
      '9123 4567',
      ' \t+852 9123-4567 \n',
      '85291234567',
      '0085291234567',
    ])
      expect(normalizeTelephone(phone)).toBe('+85291234567')
    expect(normalizeTelephone('+44 20 7946 0018')).toBe('+442079460018')
    // Eight-digit HK numbers remain structurally acceptable even when allocation metadata is unknown.
    for (const phone of [
      '+85238863932',
      '+85274855020',
      '+85255555555',
      '+85288888888',
    ])
      expect(normalizeTelephone(phone)).toBe(phone)
    const phones = [
      null,
      '',
      'not a phone',
      '123',
      '+85291234567 ext 12',
      '+852983261',
      '+8529070331',
      '+852905 822 381',
    ]
    for (const phone of phones) {
      expect(normalizeTelephone(phone)).toBeNull()
      const rows = [row({ telephone: phone })]
      const plan = planUsers(rows, empty, 'seed')
      expect(plan.exceptions).toEqual([])
      expect(plan.users[0]).toMatchObject({
        telephone: null,
        email: 'person@example.com',
      })
      expect(plan.importUsers[0]).toMatchObject({ telephone: null, state: 'claimed' })
      expect(plan.mapping[0].sourceVolunteerId).toBe(10)
      expect(planUsers(rows, destination(plan), 'seed').users).toEqual([])
    }
    const noIdentity = planUsers([row({ telephone: null, email: null })], empty, 'seed')
    expect(noIdentity.users).toEqual([])
    expect(noIdentity.exceptions).toHaveLength(1)
  })
  it('groups missing-phone rows by exact email without merging unrelated null phones', () => {
    const rows = [
      row({ telephone: null }),
      row({ id: 2, telephone: 'invalid' }),
      row({
        id: 3,
        volunteer_id: 30,
        telephone: null,
        email: 'other@example.com',
        uid: '223456789012345678901',
      }),
    ]
    const plan = planUsers(rows, empty, 'seed')
    expect(plan.exceptions).toEqual([])
    expect(plan.users).toHaveLength(2)
    expect(plan.mapping[0].targetUserId).not.toBe(plan.mapping[2].targetUserId)
    expect(plan.identities).toHaveLength(3)
    expect(planUsers(rows, destination(plan), 'seed').exceptions).toEqual([])
  })
  it('keeps an existing history owner when its invalid phone is cleared for completion', () => {
    const rows = [row({ telephone: '+852983261' })]
    const first = planUsers(rows, empty, 'seed')
    const originalId = first.users[0].id
    const oldId = 'persisted-history-owner'
    const target = destination(first)
    target.users[0].id = oldId
    target.accounts[0].userId = oldId
    for (const owner of target.importUsers ?? []) owner.userId = oldId
    for (const identity of target.identities ?? []) identity.userId = oldId
    const next = planUsers(rows, target, 'seed')
    expect(originalId).not.toBe(oldId)
    expect(next.exceptions).toEqual([])
    expect(next.users).toEqual([])
    expect(next.mapping[0].targetUserId).toBe(oldId)
  })
  it('attaches a missing phone to the one known phone for the exact email', () => {
    const plan = planUsers(
      [row(), row({ id: 2, volunteer_id: 20, telephone: null, uid: 'Facebook_2' })],
      empty,
      'seed',
    )
    expect(plan.exceptions).toEqual([])
    expect(plan.mapping).toHaveLength(2)
    expect(plan.users).toHaveLength(1)
    expect(plan.users[0].telephone).toBe('+85291234567')
  })
  it('does not treat a missing phone as a second phone in reviewed email merges', () => {
    const plan = planUsers(
      [
        row(),
        row({ id: 2, email: 'old@example.com', telephone: null, uid: 'Facebook_2' }),
      ],
      empty,
      'seed',
      {
        version: 1,
        merges: [
          { targetEmail: 'person@example.com', sourceEmails: ['old@example.com'] },
        ],
        excludeEmails: [],
      },
    )
    expect(plan.exceptions).toEqual([])
    expect(plan.mapping).toHaveLength(2)
    expect(plan.importUsers[0].state).toBe('unclaimed')
    expect(plan.accounts).toEqual([])
  })
  it('uses a sole known exact-email phone but never infers across two actual phones', () => {
    const invalid = planUsers(
      [row(), row({ id: 2, telephone: 'invalid' })],
      empty,
      'seed',
    )
    expect(invalid.mapping).toHaveLength(2)
    expect(invalid.exceptions).toEqual([])
    const conflict = planUsers(
      [
        row(),
        row({ id: 2, telephone: '+85298765432', uid: 'Facebook_2' }),
        row({ id: 3, telephone: null, uid: 'Facebook_3' }),
      ],
      empty,
      'seed',
    )
    expect(conflict.users).toEqual([])
    expect(conflict.counts.exceptions).toBe(3)
  })
  it('quarantines ambiguous emails, volunteers and providers across different phone groups', () => {
    for (const [overrides, reason] of [
      [
        { volunteer_id: 20, uid: '223456789012345678901' },
        'email_spans_multiple_phones',
      ],
      [
        { email: 'second@example.com', uid: '223456789012345678901' },
        'volunteer_spans_multiple_phones',
      ],
      [
        { email: 'second@example.com', volunteer_id: 20 },
        'google_identity_spans_multiple_phones',
      ],
    ] as const) {
      const plan = planUsers(
        [row(), row({ id: 2, telephone: '+85298765432', ...overrides })],
        empty,
        'seed',
      )
      expect(plan.users).toEqual([])
      expect(plan.counts.exceptions).toBe(2)
      expect(plan.exceptions.every(exception => exception.reason === reason)).toBe(true)
    }
  })
  it('rejects invalid emails, timestamps and duplicated source IDs without silent data loss', () => {
    expect(
      planUsers([row({ email: 'invalid' })], empty, 'seed').exceptions[0].reason,
    ).toBe('invalid_email')
    expect(
      planUsers([row({ created_at: null })], empty, 'seed').exceptions[0].reason,
    ).toBe('invalid_source_timestamps')
    expect(() => planUsers([row(), row()], empty, 'seed')).toThrow(
      'Duplicate source user ID',
    )
  })
  it('uses Runner names and retries case-insensitive username collisions', () => {
    const first = planUsers([row()], empty, 'seed').users[0]
    expect(first.username).toMatch(/^[a-z]+runner[0-9]{2}$/)
    expect(first.displayUsername).toMatch(/^[A-Z][a-z]+Runner[0-9]{2}$/)
    const target: TargetIdentitySnapshot = {
      users: [{ ...first, id: 'other', email: 'other@example.com', telephone: null }],
      accounts: [],
    }
    const next = planUsers([row()], target, 'seed')
    expect(next.users[0].username).not.toBe(first.username)
    expect(next.users[0].id).toBe(first.id)
    const names = new Set(
      Array.from({ length: 1000 }, (_, index) =>
        generateRunnerUsernameFromId(`u${index}`),
      ),
    )
    expect(names.size).toBeGreaterThan(990)
  })
  it('replans claimed and latent imports without inserts or reopening ownership', () => {
    for (const rows of [
      [row()],
      [row(), row({ id: 2, email: 'second@example.com', uid: 'Facebook_2' })],
    ]) {
      const first = planUsers(rows, empty, 'seed')
      const target = destination(first)
      // Simulate a completed first login, then an owner changing their primary email.
      const owner = target.importUsers?.[0]
      if (!owner) throw new Error('Missing fixture ownership')
      owner.state = 'claimed'
      owner.claimedEmail = 'person@example.com'
      target.users[0].email = 'changed@example.com'
      const next = planUsers(rows, target, 'seed')
      expect(next.users).toEqual([])
      expect(next.accounts).toEqual([])
      expect(next.importUsers).toEqual([])
      expect(next.identities).toEqual([])
      expect(next.exceptions).toEqual([])
      expect(next.mapping[0].targetUserId).toBe(first.users[0].id)
    }
  })
  it('requires fresh identity ownership instead of consolidating established HYPE users', () => {
    const first = planUsers([row()], empty, 'seed')
    expect(
      planUsers([row()], { users: first.users, accounts: first.accounts }, 'seed')
        .exceptions[0].reason,
    ).toBe('target_requires_fresh_database')
    const target = destination(first)
    target.users[0].id = 'established'
    target.accounts = []
    target.importUsers = []
    expect(planUsers([row()], target, 'seed').exceptions[0].reason).toBe(
      'conflicting_target_identities',
    )
  })
  it('quarantines changed source cohorts without mutating a claimed identity', () => {
    const first = planUsers([row()], empty, 'seed')
    const next = planUsers(
      [row(), row({ id: 2, email: 'new@example.com' })],
      destination(first),
      'seed',
    )
    expect(next.exceptions[0].reason).toBe('import_source_identity_changed')
    expect(next.users).toEqual([])
    expect(next.accounts).toEqual([])
  })
  it('reconciles SQL against SQLite with private crosswalks, quoting and unique phone enforcement', () => {
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
      db.exec(readFileSync('migrations/0089_breadline_phone_identity.sql', 'utf8'))
      db.exec(readFileSync('migrations/0090_breadline_claim_audit.sql', 'utf8'))
      db.exec(readFileSync('migrations/0091_breadline_email_identity.sql', 'utf8'))
      db.exec(userPlanSql(plan))
      expect(db.query('SELECT name FROM user').get()).toEqual({ name: "O'Example" })
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(
        db.query('SELECT count(*) AS n FROM breadlineImportIdentity').get(),
      ).toEqual({ n: 1 })
      const target = {
        users: db.query('SELECT * FROM user').all(),
        accounts: db.query('SELECT * FROM account').all(),
        importUsers: db.query('SELECT * FROM breadlineImportUser').all(),
        identities: db.query('SELECT * FROM breadlineImportIdentity').all(),
      } as TargetIdentitySnapshot
      expect(planUsers([row()], target, 'seed').counts.matchedGroups).toBe(1)
      // Verify duplicate insert rejection independently of multi-statement execution.
      expect(() => db.query(userPlanSql(plan).split('\n')[1]).run()).toThrow()
      expect(() =>
        db.run("INSERT INTO user (id, telephone) VALUES ('duplicate', '+85291234567')"),
      ).toThrow()
      db.run(
        "INSERT INTO user (id, telephone) VALUES ('null-one', NULL), ('null-two', NULL)",
      )
      expect(() =>
        db.run(
          "INSERT INTO breadlineImportUser VALUES ('null-one', '+85298765432', 'claimed', NULL)",
        ),
      ).toThrow()
      expect(() =>
        userPlanSql({ ...plan, model: 'old' } as unknown as typeof plan),
      ).toThrow('Regenerate')
    } finally {
      db.close()
    }
  })
})
