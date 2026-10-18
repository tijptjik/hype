// NODE
import { createHash } from 'node:crypto'
// VALIDATION
import { z } from 'zod'
// PIPELINE
import { normalizeTelephone, planUsers } from './users'
// TYPES
import type { LegacyUser, TargetIdentitySnapshot, UserImportPlan } from './users'

const fixtureSchema = z
  .array(
    z
      .object({
        telephone: z
          .string()
          .refine(
            value => normalizeTelephone(value) === value,
            'Use a canonical E.164 phone',
          ),
        emails: z
          .array(z.string().trim().toLowerCase().email())
          .min(1)
          .refine(
            emails => new Set(emails).size === emails.length,
            'Duplicate fixture email',
          ),
      })
      .strict(),
  )
  .superRefine((fixtures, context) => {
    const phones = new Set<string>()
    const emails = new Set<string>()
    for (const fixture of fixtures) {
      if (
        phones.has(fixture.telephone) ||
        fixture.emails.some(email => emails.has(email))
      )
        context.addIssue({ code: 'custom', message: 'Local fixtures must not overlap' })
      phones.add(fixture.telephone)
      for (const email of fixture.emails) emails.add(email)
    }
  })

/**
 * Plan explicit local test identities separately from the immutable Breadline source.
 * @param input Private JSON fixture array of canonical phones and distinct eligible emails.
 * @param target Local destination identity snapshot.
 * @param seed Durable local import seed.
 * @returns A separate local-fixture plan with stable negative source keys and no provider credentials.
 * @remarks Negative keys and the local-fixture subject marker cannot collide with positive
 * Breadline user IDs. Fixture rows must never be counted as Breadline source users/history.
 */
export function planLocalLatentUsers(
  input: unknown,
  target: TargetIdentitySnapshot,
  seed: string,
): UserImportPlan {
  const fixtures = fixtureSchema.parse(input)
  const rows: LegacyUser[] = fixtures.flatMap(fixture =>
    fixture.emails.map(email => ({
      id: -Number.parseInt(
        createHash('sha256')
          .update(`local-fixture:${fixture.telephone}:${email}`)
          .digest('hex')
          .slice(0, 12),
        16,
      ),
      volunteer_id: null,
      uid: 'local-fixture',
      email,
      name: null,
      telephone: fixture.telephone,
      locale: 'en',
      picture: null,
      created_at: '2026-10-19T00:00:00+08:00',
      last_updated_at: '2026-10-19T00:00:00+08:00',
    })),
  )
  const plan = planUsers(rows, target, seed)
  // Local fixtures exercise first-login claiming even when only one email is eligible.
  for (const user of plan.users) {
    user.email = null
    user.emailVerified = 0
  }
  for (const ownership of plan.importUsers) {
    ownership.state = 'unclaimed'
    ownership.claimedEmail = null
  }
  return plan
}
