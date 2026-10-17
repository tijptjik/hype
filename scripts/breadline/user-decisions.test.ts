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
  it('retains every source/volunteer crosswalk and prefers the canonical profile', () => {
    const primary = source(1, 'primary@example.com')
    const old = { ...source(2, 'old@example.com'), last_updated_at: '2025-01-01' }
    const plan = planUsers([old, primary], target(), 'seed', decisions)
    expect(plan.users).toHaveLength(1)
    expect(plan.users[0].email).toBe(primary.email)
    expect(plan.users[0].name).toBe(primary.name)
    expect(plan.mapping.map(row => row.sourceVolunteerId)).toEqual([10, 20])
    expect(new Set(plan.mapping.map(row => row.targetUserId)).size).toBe(1)
    expect(plan.accounts).toHaveLength(2)
    expect(planUsers([primary, old], target(), 'seed', decisions)).toEqual(plan)
  })
  it('records exclusions without creating users, accounts or history mappings', () => {
    const plan = planUsers(
      [source(3, 'delete@example.com')],
      target('delete@example.com'),
      'seed',
      decisions,
    )
    expect(plan.mapping).toEqual([])
    expect(plan.users).toEqual([])
    expect(plan.accounts).toEqual([])
    expect(plan.excluded).toEqual([
      { sourceUserId: 3, sourceVolunteerId: 30, reason: 'reviewed_exclusion' },
    ])
    expect(plan.counts.excludedSourceRows).toBe(1)
    expect(plan.targetChanges).toEqual([
      { action: 'exclude', sourceUserId: 'delete@example.com' },
    ])
    expect(() => userPlanSql(plan)).toThrow()
  })
  it('maps history to the canonical target and blocks SQL until existing aliases are reconciled', () => {
    const old = source(2, 'old@example.com')
    const destination = target(
      'primary@example.com',
      'old@example.com',
      'hype-only@example.com',
    )
    destination.accounts.push({
      id: 'login',
      userId: 'old@example.com',
      providerId: 'google',
      accountId: old.uid,
    })
    const plan = planUsers([old], destination, 'seed', decisions)
    expect(plan.exceptions).toEqual([])
    expect(plan.mapping[0].targetUserId).toBe('primary@example.com')
    expect(plan.accounts).toEqual([])
    expect(plan.targetChanges).toHaveLength(2)
    expect(() => userPlanSql(plan)).toThrow()
    destination.users = destination.users.slice(0, 1)
    destination.accounts[0].userId = 'primary@example.com'
    const replay = planUsers([old], destination, 'seed', decisions)
    expect(replay.targetChanges).toEqual([])
    expect(replay.mapping).toEqual(plan.mapping)
    expect(userPlanSql(replay)).not.toContain('INSERT')
  })
  it('fails closed for missing destinations, unrelated providers and unverified primary accounts', () => {
    const old = source(2, 'old@example.com')
    expect(planUsers([old], target(), 'seed', decisions).exceptions[0].reason).toBe(
      'reviewed_merge_destination_missing',
    )
    const unrelated = target('primary@example.com', 'unrelated@example.com')
    unrelated.accounts.push({
      id: 'login',
      userId: 'unrelated@example.com',
      providerId: 'google',
      accountId: old.uid,
    })
    expect(planUsers([old], unrelated, 'seed', decisions).exceptions[0].reason).toBe(
      'conflicting_target_identities',
    )
    const unverified = target('primary@example.com', 'old@example.com')
    unverified.users[0].emailVerified = 0
    unverified.accounts.push({
      id: 'login',
      userId: 'old@example.com',
      providerId: 'google',
      accountId: old.uid,
    })
    expect(planUsers([old], unverified, 'seed', decisions).exceptions[0].reason).toBe(
      'target_email_ownership_unverified',
    )
  })
  it('rejects shared volunteers across excluded and retained identities', () => {
    const plan = planUsers(
      [
        source(1, 'primary@example.com'),
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

describe('matched profile phone backfill', () => {
  it('fills a blank phone from agreeing aliases, preserves nonblank values and replans without updates', () => {
    const destination = target('primary@example.com')
    destination.users[0].telephone = null
    const rows = [
      { ...source(1, 'primary@example.com'), telephone: '9123 4567' },
      { ...source(2, 'old@example.com'), telephone: '+85291234567' },
    ]
    const plan = planUsers(rows, destination, 'seed', decisions)
    expect(plan.phoneUpdates).toEqual([
      { id: 'primary@example.com', telephone: '+85291234567' },
    ])
    expect(userPlanSql(plan)).toContain(
      'AND ("telephone" IS NULL OR trim("telephone") = \'\')',
    )
    for (const phone of ['+85291234567', '+85298765432']) {
      destination.users[0].telephone = phone
      expect(planUsers(rows, destination, 'seed', decisions).phoneUpdates).toEqual([])
    }
  })
  it('requires review for conflicts or invalid phones and skips snapshots with unknown phone state', () => {
    const rows = [
      { ...source(1, 'primary@example.com'), telephone: '+85291234567' },
      { ...source(2, 'old@example.com'), telephone: '+85298765432' },
    ]
    const destination = target('primary@example.com')
    expect(planUsers(rows, destination, 'seed', decisions).phoneUpdates).toEqual([])
    destination.users[0].telephone = ''
    for (const phone of ['+85298765432', 'invalid']) {
      rows[1].telephone = phone
      const plan = planUsers(rows, destination, 'seed', decisions)
      expect(plan.phoneUpdates).toEqual([])
      expect(
        plan.warnings.some(
          warning => warning.reason === 'phone_backfill_requires_review',
        ),
      ).toBe(true)
    }
  })
})
