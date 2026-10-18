// BUN
import { describe, expect, it } from 'bun:test'
// PIPELINE
import { parseUserDecisions } from './lib/user-decisions'
import {
  planUsers,
  userPlanSql,
  type LegacyUser,
  type TargetIdentitySnapshot,
} from './lib/users'

const decisions = parseUserDecisions({
  version: 1,
  merges: [
    {
      targetEmail: 'primary@example.com',
      sourceEmails: ['old@example.com', 'hype-only@example.com'],
    },
  ],
  excludeEmails: ['delete@example.com'],
})
/**
 * Build an independent source identity with a portable Google subject.
 * @param id Source identity number.
 * @param email Synthetic email.
 * @returns Complete legacy fixture.
 */
function source(id: number, email: string): LegacyUser & { uid: string } {
  return {
    id,
    email,
    volunteer_id: id * 10,
    uid: String(id).padStart(21, '1'),
    name: email,
    telephone: null,
    locale: 'en',
    picture: null,
    created_at: '2020-01-01',
    last_updated_at: '2021-01-01',
  }
}
/**
 * Build verified destination identities without credentials.
 * @param emails Synthetic destination emails.
 * @returns Identity-only target snapshot.
 */
function target(...emails: string[]): TargetIdentitySnapshot {
  return {
    users: emails.map(email => ({
      id: email,
      email,
      username: null,
      emailVerified: 1,
      isArchived: 0,
      isAnonymous: 0,
    })),
    accounts: [],
  }
}

describe('reviewed user decisions', () => {
  it('rejects overlap, chains, cycles, invalid emails and malformed rules', () => {
    for (const invalid of [
      null,
      {},
      { ...decisions, version: 2 },
      { ...decisions, excludeEmails: [' OLD@EXAMPLE.COM '] },
      {
        ...decisions,
        merges: [
          ...decisions.merges,
          { targetEmail: 'old@example.com', sourceEmails: ['next@example.com'] },
        ],
      },
      {
        ...decisions,
        merges: [
          { targetEmail: 'primary@example.com', sourceEmails: ['primary@example.com'] },
        ],
      },
      { ...decisions, excludeEmails: ['invalid'] },
    ])
      expect(() => parseUserDecisions(invalid)).toThrow()
  })
  it('preserves same-phone source identities without choosing the old canonical email', () => {
    const rows = [source(1, 'primary@example.com'), source(2, 'old@example.com')].map(
      row => ({ ...row, telephone: '+85291234567' }),
    )
    const plan = planUsers(rows, target(), 'seed', decisions)
    expect(plan.users).toHaveLength(1)
    expect(plan.users[0].email).toBeNull()
    expect(plan.importUsers[0].state).toBe('unclaimed')
    expect(plan.accounts).toEqual([])
    expect(plan.mapping.map(row => row.sourceVolunteerId)).toEqual([10, 20])
  })
  it('does not let reviewed email merges override different phone identities', () => {
    const rows = [
      { ...source(1, 'primary@example.com'), telephone: '+85291234567' },
      { ...source(2, 'old@example.com'), telephone: '+85298765432' },
    ]
    const plan = planUsers(rows, target(), 'seed', decisions)
    expect(plan.mapping).toEqual([])
    expect(
      plan.exceptions.every(
        exception => exception.reason === 'reviewed_merge_spans_multiple_phones',
      ),
    ).toBe(true)
  })
  it('records reviewed exclusions without creating users, credentials or history mappings', () => {
    const plan = planUsers(
      [source(3, 'delete@example.com')],
      target(),
      'seed',
      decisions,
    )
    expect(plan.users).toEqual([])
    expect(plan.accounts).toEqual([])
    expect(plan.mapping).toEqual([])
    expect(plan.identities).toEqual([])
    expect(plan.excluded).toEqual([
      { sourceUserId: 3, sourceVolunteerId: 30, reason: 'reviewed_exclusion' },
    ])
    expect(userPlanSql(plan)).not.toContain('INSERT')
  })
  it('rejects shared volunteers across excluded and retained identities', () => {
    const plan = planUsers(
      [
        { ...source(1, 'primary@example.com'), telephone: '+85291234567' },
        { ...source(2, 'delete@example.com'), volunteer_id: 10 },
      ],
      target(),
      'seed',
      decisions,
    )
    expect(plan.mapping).toEqual([])
    expect(plan.exceptions[0].reason).toBe(
      'excluded_volunteer_shared_with_retained_user',
    )
  })
})

describe('reviewed telephone corrections', () => {
  const reviewed = {
    version: 1 as const,
    merges: [],
    excludeEmails: [],
    telephoneOverrides: [
      { sourceUserId: 1, expectedTelephone: '+601211909179', telephone: null },
    ],
  }
  it('clears the reviewed phone, retains the sole email/history and leaves other phones alone', () => {
    const rows = [
      { ...source(1, 'first@example.com'), telephone: '+60 12 1190 9179' },
      { ...source(2, 'second@example.com'), telephone: '+85250621990' },
    ]
    const plan = planUsers(rows, { users: [], accounts: [] }, 'seed', reviewed)
    expect(plan.exceptions).toEqual([])
    const cleared = plan.users.find(user => user.email === 'first@example.com')
    expect(cleared?.telephone).toBeNull()
    expect(plan.identities.find(identity => identity.sourceUserId === 1)).toMatchObject(
      { userId: cleared?.id, email: 'first@example.com', sourceVolunteerId: 10 },
    )
    expect(
      plan.users.find(user => user.email === 'second@example.com')?.telephone,
    ).toBe('+85250621990')
    expect(
      planUsers(
        rows,
        {
          users: plan.users,
          accounts: plan.accounts,
          importUsers: plan.importUsers,
          identities: plan.identities,
        },
        'seed',
        reviewed,
      ).users,
    ).toEqual([])
  })
  it('accepts a later canonical correction but refuses to discard a changed source number', () => {
    const rows = [{ ...source(1, 'first@example.com'), telephone: '+601211909179' }]
    const corrected = {
      ...reviewed,
      telephoneOverrides: [
        { ...reviewed.telephoneOverrides[0], telephone: '+60121190917' },
      ],
    }
    expect(
      planUsers(rows, { users: [], accounts: [] }, 'seed', corrected).users[0]
        .telephone,
    ).toBe('+60121190917')
    expect(() =>
      planUsers(
        [{ ...rows[0], telephone: '+60121190917' }],
        { users: [], accounts: [] },
        'seed',
        reviewed,
      ),
    ).toThrow('Reviewed telephone source changed')
  })
  it('rejects duplicate IDs, invalid corrections and malformed override rules', () => {
    for (const telephoneOverrides of [
      'invalid',
      [reviewed.telephoneOverrides[0], reviewed.telephoneOverrides[0]],
      [{ ...reviewed.telephoneOverrides[0], sourceUserId: 0 }],
      [{ ...reviewed.telephoneOverrides[0], expectedTelephone: '' }],
      [{ ...reviewed.telephoneOverrides[0], telephone: '+852983261' }],
      [{ ...reviewed.telephoneOverrides[0], telephone: ' +85291234567 ' }],
    ])
      expect(() => parseUserDecisions({ ...reviewed, telephoneOverrides })).toThrow(
        'Invalid user decisions',
      )
  })
})
