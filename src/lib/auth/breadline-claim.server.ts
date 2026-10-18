// AUTH
import { APIError } from 'better-auth/api'
import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context'
// LIBRARIES
import { nanoid } from 'nanoid'
// TYPES
import type { BetterAuthOptions } from 'better-auth'
import type { DBAdapter, DBAdapterInstance } from 'better-auth/adapters'
import type { D1Database } from '@cloudflare/workers-types'

// +++ Table Of Contents
// 1. TYPES AND CANDIDATE RESOLUTION
// 2. ATOMIC OWNERSHIP CLAIM
// 3. BETTER AUTH INTEGRATION
// ---

type UserValidation = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>
type ClaimProof = {
  userId: string
  email: string
  name: string
  image: string | null
} & (
  | { method: 'oauth'; providerId: string; accountId: string }
  | { method: 'magic-link' }
)
interface Candidate {
  userId: string
  isArchived: number
}

/**
 * Resolve private imported eligibility without treating a typed email as ownership proof.
 * @param db Authoritative D1 database.
 * @param email Canonical email asserted by the authentication flow.
 * @returns A unique unclaimed candidate, or null when no import is claimable.
 * @remarks Multiple targets fail closed; source subjects and other emails are never returned.
 */
async function candidateForEmail(
  db: D1Database,
  email: string,
): Promise<Candidate | null> {
  const found = await db
    .prepare(`SELECT DISTINCT o.userId, u.isArchived
    FROM breadlineImportIdentity i
    JOIN breadlineImportUser o ON o.userId = i.userId
    JOIN user u ON u.id = o.userId
    WHERE i.email = ? AND o.state = 'unclaimed'`)
    .bind(email)
    .all<Candidate>()
  if (found.results.length > 1) throw unavailable()
  const candidate = found.results[0] ?? null
  if (candidate?.isArchived) throw unavailable()
  return candidate
}

/** @returns An opaque rejection that does not disclose imported identities. */
function unavailable(): APIError {
  return new APIError('CONFLICT', {
    code: 'BREADLINE_CLAIM_UNAVAILABLE',
    message: 'Account unavailable. Please sign in again.',
  })
}

/**
 * Atomically assigns a latent user and, for OAuth, attaches exactly the proven credential.
 * @param db Authoritative D1 database.
 * @param proof Server-validated email and authentication source.
 * @param credential OAuth account values supplied by Better Auth, never a client payload.
 * @returns Nothing after the winning claim and credential commit.
 * @remarks A nonce guards every statement in one D1 batch. Losing requests do not update
 * profiles or attach accounts. Constraint failures roll back ownership and profile changes.
 */
export async function claimBreadlineUser(
  db: D1Database,
  proof: ClaimProof,
  credential?: Record<string, unknown>,
): Promise<void> {
  if (
    proof.method === 'oauth' &&
    (!credential ||
      credential.providerId !== proof.providerId ||
      credential.accountId !== proof.accountId ||
      credential.userId !== proof.userId)
  )
    throw unavailable()
  const key = nanoid(32)
  const now = Date.now()
  const statements = [
    db
      .prepare(`UPDATE breadlineImportUser SET state = 'claimed', claimedEmail = ?, claimedAt = ?, claimKey = ?
      WHERE userId = ? AND state = 'unclaimed'
      AND EXISTS (SELECT 1 FROM breadlineImportIdentity WHERE userId = ? AND email = ?)
      AND EXISTS (SELECT 1 FROM user WHERE id = ? AND isArchived = 0 AND isAnonymous = 0 AND email IS NULL)
      AND NOT EXISTS (SELECT 1 FROM account WHERE userId = ?)
      AND NOT EXISTS (SELECT 1 FROM session WHERE userId = ?)
      AND NOT EXISTS (SELECT 1 FROM passkey WHERE userId = ?)`)
      .bind(
        proof.email,
        now,
        key,
        proof.userId,
        proof.userId,
        proof.email,
        proof.userId,
        proof.userId,
        proof.userId,
        proof.userId,
      ),
    db
      .prepare(`UPDATE user SET email = ?, emailVerified = 1, name = ?, image = ?, updatedAt = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM breadlineImportUser WHERE userId = ? AND claimKey = ?)`)
      .bind(proof.email, proof.name, proof.image, now, proof.userId, proof.userId, key),
  ]
  if (credential) {
    // The fixed account-field allowlist bounds SQL size and excludes arbitrary adapter/client keys.
    const values: Record<string, unknown> = {
      ...credential,
      id: typeof credential.id === 'string' ? credential.id : nanoid(12),
      createdAt: credential.createdAt ?? now,
      updatedAt: credential.updatedAt ?? now,
    }
    const columns = [
      'id',
      'userId',
      'accountId',
      'providerId',
      'issuer',
      'accessToken',
      'refreshToken',
      'accessTokenExpiresAt',
      'refreshTokenExpiresAt',
      'scope',
      'idToken',
      'password',
      'createdAt',
      'updatedAt',
    ].filter(column => values[column] !== undefined)
    const parameters = columns.map(column => {
      const value = values[column]
      if (value instanceof Date) return value.getTime()
      if (value === null || typeof value === 'string' || typeof value === 'number')
        return value
      throw unavailable()
    })
    statements.push(
      db
        .prepare(`INSERT INTO account (${columns.map(column => `"${column}"`).join(',')})
      SELECT ${columns.map(() => '?').join(',')} WHERE EXISTS (
        SELECT 1 FROM breadlineImportUser WHERE userId = ? AND claimKey = ?)`)
        .bind(...parameters, proof.userId, key),
    )
  }
  const result = await db.batch(statements)
  if (result[0].meta.changes !== 1) throw unavailable()
}

/**
 * Wrap the normal adapter with request-local, verified Breadline claim provisioning.
 * @param db Authoritative D1 database used by the normal adapter.
 * @param normalAdapter Production Drizzle adapter factory.
 * @param sendClaimLink Sends a one-time sign-in link for eligible password signup.
 * @returns Adapter and validation gate for the same Better Auth instance.
 * @remarks OAuth user creation is deferred until its account insert, making ownership,
 * profile and credential atomic. Magic-link verification already supplies a usable
 * authentication method, so it can claim at user creation without an account row.
 */
export function breadlineClaimIntegration(
  db: D1Database,
  normalAdapter: DBAdapterInstance,
  sendClaimLink?: (
    email: string,
    context: Parameters<UserValidation>[1],
  ) => Promise<void>,
): {
  adapter: DBAdapterInstance
  validateUserInfo: UserValidation
  assertEmailChange: (email: unknown) => Promise<void>
} {
  const pending = new WeakMap<object, ClaimProof>()
  const validateUserInfo: UserValidation = async ({ user, source }, context) => {
    if (source.action !== 'create-user' || typeof user.email !== 'string') return
    const email = user.email.trim().toLowerCase()
    const candidate = await candidateForEmail(db, email)
    if (!candidate) return
    if (
      user.emailVerified !== true ||
      (source.method !== 'oauth' && source.method !== 'magic-link')
    ) {
      // Signup's opaque response still needs a real path to the account, not a dead-end email.
      if (source.method === 'email-password' && sendClaimLink)
        await sendClaimLink(email, context)
      return {
        error: 'BREADLINE_EMAIL_VERIFICATION_REQUIRED',
        errorDescription:
          'Use an email sign-in link to access your imported Breadline account.',
      }
    }
    const profile = {
      userId: candidate.userId,
      email,
      name: typeof user.name === 'string' ? user.name : '',
      image: typeof user.image === 'string' ? user.image : null,
    }
    if (source.method === 'oauth') {
      const providerId = source.oauth?.providerId
      const accountId = source.oauth?.profile?.sub ?? source.oauth?.profile?.id
      if (!providerId || typeof accountId !== 'string' || !accountId)
        throw unavailable()
      pending.set(context.context, {
        ...profile,
        method: 'oauth',
        providerId,
        accountId,
      })
    } else pending.set(context.context, { ...profile, method: 'magic-link' })
  }
  const adapter: DBAdapterInstance = options => {
    const normal = normalAdapter(options)
    const wrapped: DBAdapter = {
      ...normal,
      // D1 uses the atomic claim batch above; retain this wrapper inside Better Auth's scope.
      transaction: async callback => callback(wrapped),
      async create(args) {
        const context = tryGetCurrentAuthEndpointContext()?.context
        const proof = context ? pending.get(context) : undefined
        if (!proof) return normal.create(args)
        if (args.model === 'user') {
          if (
            args.data.email?.trim().toLowerCase() !== proof.email ||
            args.data.emailVerified !== true
          )
            throw unavailable()
          if (proof.method === 'magic-link') await claimBreadlineUser(db, proof)
          const latent = await normal.findOne<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'id', value: proof.userId }],
          })
          if (!latent) throw unavailable()
          // Better Auth will use this ID for its account write and eventual session.
          return {
            ...latent,
            email: proof.email,
            emailVerified: true,
            name: proof.name,
            image: proof.image,
          } as never
        }
        if (args.model === 'account' && proof.method === 'oauth') {
          await claimBreadlineUser(db, proof, args.data)
          if (context) pending.delete(context)
          return (await normal.findOne({
            model: 'account',
            where: [
              { field: 'providerId', value: args.data.providerId },
              { field: 'accountId', value: args.data.accountId },
              { field: 'userId', value: proof.userId },
            ],
          })) as never
        }
        return normal.create(args)
      },
    }
    return wrapped
  }
  return {
    adapter,
    validateUserInfo,
    assertEmailChange: async email => {
      if (
        typeof email === 'string' &&
        (await candidateForEmail(db, email.trim().toLowerCase()))
      ) {
        throw new APIError('FORBIDDEN', {
          code: 'BREADLINE_EMAIL_VERIFICATION_REQUIRED',
          message:
            'Use an email sign-in link to access your imported Breadline account.',
        })
      }
    },
  }
}
