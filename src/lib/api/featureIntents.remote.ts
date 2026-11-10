// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, sql, type SQL } from 'drizzle-orm'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import {
  authorizeHubUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
  authorizeFeatureCreateForSubmission,
} from './services/authz'
import { authorizeLayerUpdateForSubmission } from './services/authz/layerPolicy'
// DOMAIN
import { FeatureTypesSchema, FeatureTypeIdSchema } from '#lib/features/intents.js'
// SERVICES
import {
  readFeatureIntentPolicy,
  saveFeatureIntentPolicy,
  type FeatureIntentScope,
} from '#lib/db/services/featureIntentPolicy.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

// TABLE OF CONTENTS
// 1. Policy scope and inherited configuration
// 2. Authorized policy writes
// 3. Feature authoring and association validation

const scopeSchema = z.strictObject({
  type: z.enum(['hub', 'project', 'layer']),
  id: z.string().min(1),
})

/** Authorize policy administration using the owner's existing configuration permission.
 * @param ctx Request context. @param scope Requested owner.
 * @returns Ownership predicate checked again in the write transaction.
 */
async function authorizeSettings(
  ctx: GuardedBaseContext,
  scope: FeatureIntentScope,
): Promise<SQL> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (scope.type === 'hub') {
    const row = await ctx.db.get<{ id: string }>(
      sql`SELECT id FROM hub WHERE id=${scope.id}`,
    )
    if (!row) error(404, 'HUB_NOT_FOUND')
    const decision = authorizeHubUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: row,
      submittedData: { i18n: true },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return sql`EXISTS(SELECT 1 FROM hub WHERE id=${scope.id})`
  }
  const row = await ctx.db.get<{
    id: string
    projectId: string
    organisationId: string
    hubId: string | null
  }>(
    scope.type === 'layer'
      ? sql`SELECT l.id,p.id projectId,p.organisationId,o.hubId FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE l.id=${scope.id}`
      : sql`SELECT p.id,p.id projectId,p.organisationId,o.hubId FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${scope.id}`,
  )
  if (!row) error(404, 'POLICY_OWNER_NOT_FOUND')
  const args = { user: ctx.user, userRoles: ctx.userRoles, resource: row }
  const decision =
    scope.type === 'layer'
      ? authorizeLayerUpdateForSubmission({
          ...args,
          submittedData: { metadata: true },
        })
      : authorizeProjectUpdateForSubmission({ ...args, submittedData: { flags: true } })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  return sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${row.projectId} AND p.organisationId=${row.organisationId} AND o.hubId IS ${row.hubId}) AND (${scope.type !== 'layer'} OR EXISTS(SELECT 1 FROM layer WHERE id=${scope.id} AND projectId=${row.projectId}))`
}

/** Read editable inherited rules. @param scope Owner. @returns Versioned configuration. */
export const getFeatureIntentSettings = guardedQuery(
  scopeSchema,
  async (scope, ctx) => {
    await authorizeSettings(ctx, scope)
    return readFeatureIntentPolicy(ctx.db, scope)
  },
)

/** Save explicit overrides; null resets inheritance. @param input Reviewed policy version. @returns Success after atomic history capture. */
export const updateFeatureIntentSettings = guardedCommand(
  z.strictObject({
    scope: scopeSchema,
    version: z.number().int().min(0),
    fingerprint: z.string(),
    definition: z
      .union([
        FeatureTypesSchema,
        z
          .array(FeatureTypeIdSchema)
          .min(1)
          .max(50)
          .refine(
            ids => new Set(ids).size === ids.length,
            'Feature types must be unique',
          ),
      ])
      .nullable(),
  }),
  async (input, ctx) => {
    const guard = await authorizeSettings(ctx, input.scope)
    const current = await readFeatureIntentPolicy(ctx.db, input.scope)
    if (current.fingerprint !== input.fingerprint)
      error(409, 'Inherited settings changed. Reload before saving.')
    if (input.definition !== null) {
      if (input.scope.type === 'layer') {
        if (
          !input.definition.every(
            id =>
              typeof id === 'string' &&
              current.inheritedTypes.some(type => type.id === id),
          )
        )
          error(422, 'Choose feature types from the project catalogue.')
      } else if (!FeatureTypesSchema.safeParse(input.definition).success)
        error(422, 'Invalid feature type catalogue.')
    }
    // Fence inherited versions inside the same transaction as the policy/history write.
    const inheritedGuard =
      and(
        guard,
        ...current.lineage.map(
          ({ scope, version }) =>
            sql`coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}),0)=${version}`,
        ),
      ) ?? guard
    if (
      !(await saveFeatureIntentPolicy(ctx.db, {
        ...input,
        actorId: ctx.user.id,
        guard: inheritedGuard,
      }))
    )
      error(409, 'Settings changed. Reload before saving.')
    await getFeatureIntentSettings(input.scope).refresh()
    return { saved: true }
  },
)

/** Read authoring choices only for a layer the caller may contribute to.
 * @param input Selected layer. @returns Effective types, including a single inferred choice.
 */
export const getFeatureIntentOptions = guardedQuery(
  z.object({ layerId: z.string().min(1) }),
  async ({ layerId }, ctx) => {
    const row = await ctx.db.get<{
      layerId: string
      projectId: string
      organisationId: string
      resourceHubId: string | null
    }>(
      sql`SELECT l.id layerId,p.id projectId,p.organisationId,o.hubId resourceHubId FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE l.id=${layerId}`,
    )
    if (!row) error(404, 'LAYER_NOT_FOUND')
    const decision = authorizeFeatureCreateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: row,
      submittedData: {},
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return (await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: layerId })).types
  },
)
