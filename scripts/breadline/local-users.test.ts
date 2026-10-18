// TESTS
import { describe, expect, it } from 'bun:test'
// PIPELINE
import { planLocalLatentUsers } from './lib/local-users'

const empty = { users: [], accounts: [], importUsers: [], identities: [] }
const fixture = [
  {
    telephone: '+85288888888',
    emails: [
      'first@example.invalid',
      'second@example.invalid',
      'third@example.invalid',
    ],
  },
]
describe('local latent-user fixtures', () => {
  it('creates one credential-free user and three explicit local-only claim mappings', () => {
    const plan = planLocalLatentUsers(fixture, empty, 'seed')
    expect(plan.users).toHaveLength(1)
    expect(plan.importUsers[0]).toMatchObject({
      state: 'unclaimed',
      telephone: '+85288888888',
      claimedEmail: null,
    })
    expect(plan.users[0].email).toBeNull()
    expect(plan.accounts).toEqual([])
    expect(plan.identities).toHaveLength(3)
    expect(
      plan.identities.every(
        row =>
          row.sourceUserId < 0 &&
          row.sourceVolunteerId === null &&
          row.sourceUid === 'local-fixture',
      ),
    ).toBe(true)
    expect(planLocalLatentUsers(fixture, empty, 'seed')).toEqual(plan)
  })
  it('replans persisted fixtures without creating duplicates', () => {
    const first = planLocalLatentUsers(fixture, empty, 'seed')
    const next = planLocalLatentUsers(
      fixture,
      {
        users: first.users,
        accounts: first.accounts,
        importUsers: first.importUsers,
        identities: first.identities,
      },
      'seed',
    )
    expect(next.users).toEqual([])
    expect(next.identities).toEqual([])
    expect(next.exceptions).toEqual([])
  })
  it('keeps a single-email fixture unclaimed for social-login testing', () => {
    const input = [{ ...fixture[0], emails: ['one@example.invalid'] }]
    const plan = planLocalLatentUsers(input, empty, 'seed')
    expect(plan.users[0].email).toBeNull()
    expect(plan.users[0].emailVerified).toBe(0)
    expect(plan.importUsers[0].state).toBe('unclaimed')
    expect(plan.importUsers[0].claimedEmail).toBeNull()
    expect(plan.accounts).toEqual([])
    expect(plan.identities[0].email).toBe('one@example.invalid')
    const repeated = planLocalLatentUsers(
      input,
      {
        users: plan.users,
        accounts: plan.accounts,
        importUsers: plan.importUsers,
        identities: plan.identities,
      },
      'seed',
    )
    expect(repeated.exceptions).toEqual([])
    expect(repeated.users).toEqual([])
  })
  it('rejects overlaps, duplicate emails, noncanonical phones and empty email fixtures', () => {
    for (const value of [
      [...fixture, ...fixture],
      [{ ...fixture[0], emails: ['same@example.invalid', 'same@example.invalid'] }],
      [{ ...fixture[0], telephone: '88888888' }],
      [{ ...fixture[0], emails: [] }],
    ])
      expect(() => planLocalLatentUsers(value, empty, 'seed')).toThrow()
  })
})
