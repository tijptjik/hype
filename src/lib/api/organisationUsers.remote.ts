// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { eq } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
import { canManageOrganisationUsers } from './services/authz/organisationUsers'
// DB
import { organisation } from '#lib/db/schema/index.js'
// POLICY
import { DEFAULT_ORGANISATION_USER_POLICY } from '#lib/organisation-users/policy.js'
import { enrolOrganisationUserFromCard } from '#lib/organisation-users/enrol.server.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. AUTHORISATION
// 2. POLICY READ (WRITES USE THE ORGANISATION FORM)
// 3. CARD ONBOARDING

const organisationIdSchema = z.object({ organisationId: z.string().min(1).max(100) })

/**
 * Authorize scoped audience administration using the persisted organisation.
 * @param ctx Guarded request identity.
 * @param organisationId Requested organisation.
 * @returns The authorized organisation.
 */
async function authorize(
  ctx: GuardedBaseContext,
  organisationId: string,
): Promise<typeof organisation.$inferSelect> {
  const target = await ctx.db.query.organisation.findFirst({
    where: eq(organisation.id, organisationId),
  })
  if (
    !target ||
    !canManageOrganisationUsers({ ...ctx.user, roles: ctx.userRoles }, target)
  )
    throw error(403, 'INSUFFICIENT_ROLE')
  return target
}

/**
 * Read organisation enrolment policy using the current hub domain, without exposing users or grants.
 * @param params Organisation identifier.
 * @returns Persisted policy or disabled defaults.
 */
export const getOrganisationUserPolicy = guardedQuery(
  organisationIdSchema,
  async (params, ctx): Promise<OrganisationUserPolicy> => {
    await authorize(ctx, params.organisationId)
    const row = await ctx.event.locals.platform.env.DB.prepare(
      `SELECT p.enabled,p.hubSignIn,p.customCard,p.contribution,p.revision,
    CASE WHEN p.emailDomain IS NOT NULL THEN lower(trim(h.domain)) ELSE NULL END AS emailDomain
    FROM organisationUserPolicy p JOIN organisation o ON o.id=p.organisationId LEFT JOIN hub h ON h.id=o.hubId
    WHERE p.organisationId=?`,
    )
      .bind(params.organisationId)
      .first<{
        enabled: number
        hubSignIn: number
        emailDomain: string | null
        contribution: number
        customCard: number
        revision: number
      }>()
    return row
      ? {
          enabled: Boolean(row.enabled),
          hubSignIn: Boolean(row.hubSignIn),
          emailDomain: row.emailDomain,
          contribution: Boolean(row.contribution),
          customCard: Boolean(row.customCard),
          revision: row.revision,
        }
      : { ...DEFAULT_ORGANISATION_USER_POLICY }
  },
)

/**
 * Read an available custom-card onboarding action in the trusted active hub.
 * @param params Published organisation identifier.
 * @returns Availability and current membership, without a directory or contacts.
 */
export const getOrganisationOnboarding = guardedQuery(
  organisationIdSchema,
  async (params, ctx): Promise<{ available: boolean; joined: boolean }> => {
    const row =
      await ctx.event.locals.platform.env.DB.prepare(`SELECT EXISTS(SELECT 1 FROM organisationRole ou WHERE ou.organisationId=o.id AND ou.userId=? AND ou.role IN ('user','member','owner')) AS joined
    FROM organisation o JOIN organisationUserPolicy p ON p.organisationId=o.id
    WHERE o.id=? AND o.isPublished=1 AND o.isArchived=0 AND p.enabled=1 AND p.customCard=1
      AND (o.hubId=? OR (o.isCoreInclusive=1 AND o.isHubExclusive=0 AND ?=1))`)
        .bind(
          ctx.user.id,
          params.organisationId,
          ctx.event.locals.hub?.id ?? null,
          Number(ctx.event.locals.hub?.code === 'core'),
        )
        .first<{ joined: number }>()
    return { available: Boolean(row), joined: Boolean(row?.joined) }
  },
)

/**
 * Enrol the current durable account through an explicit custom-card action.
 * @param params Published organisation identifier.
 * @returns Confirmation of the idempotent membership grant.
 */
export const joinOrganisationFromCard = guardedCommand(
  organisationIdSchema,
  async (params, ctx): Promise<{ joined: true }> => {
    const hub = ctx.event.locals.hub
    if (ctx.user.isAnonymous !== false || (!hub?.id && hub?.code !== 'core'))
      throw error(403, 'ACCOUNT_REQUIRED')
    if (
      !(await enrolOrganisationUserFromCard(
        ctx.event.locals.platform.env.DB,
        ctx.user.id,
        params.organisationId,
        hub?.id ?? null,
        hub?.code === 'core',
      ))
    )
      throw error(403, 'Organisation onboarding is unavailable.')
    return { joined: true }
  },
)
