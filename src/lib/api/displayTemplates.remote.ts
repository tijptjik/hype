// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import { requireLocationOrganisationManager } from './services/locationOwnership'
// DOMAIN
import {
  FeatureTypesSchema,
  FeatureNamingUpdateOptionsSchema,
} from '#lib/features/intents.js'
import { DisplayTemplateDefinitionSchema } from '#lib/templates/registry.js'
// SERVICES
import {
  listDisplayTemplates,
  saveDisplayTemplate,
} from '#lib/db/services/displayTemplate.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

// TABLE OF CONTENTS
// 1. Catalogue scope authorization
// 2. Registry queries and versioned writes

const scope = z.strictObject({
  organisationId: z.string().min(1).nullable(),
  projectId: z.string().min(1).nullable().optional(),
})

/** Resolve editing scope from persisted Organisation authority.
 * @param ctx Authenticated context. @param organisationId Private owner or community scope.
 * @returns Ownership guard for the write transaction.
 * @remarks Community registry administration requires SuperAdmin; selecting a template is a separate permission.
 */
async function authorizeTemplateScope(
  ctx: GuardedBaseContext,
  organisationId: string | null,
): Promise<SQL> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (organisationId !== null) {
    await requireLocationOrganisationManager(ctx, organisationId)
    const row = await ctx.db.get<{ hubId: string | null }>(
      sql`SELECT hubId FROM organisation WHERE id=${organisationId}`,
    )
    if (!row) error(404, 'ORGANISATION_NOT_FOUND')
    return sql`EXISTS(SELECT 1 FROM organisation WHERE id=${organisationId} AND hubId IS ${row.hubId})`
  }
  if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
  return sql`1`
}

/** Read central templates and an authorized Organisation catalogue.
 * @param input Organisation or community scope. @returns Current immutable versions.
 */
export const getDisplayTemplates = guardedQuery(scope, async (input, ctx) => {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  // Central definitions are inspectable without granting publication authority.
  if (input.organisationId !== null)
    await authorizeTemplateScope(ctx, input.organisationId)
  if (
    input.projectId &&
    !(await ctx.db.get(
      sql`SELECT id FROM project WHERE id=${input.projectId} AND (organisationId IS ${input.organisationId} OR ${input.organisationId === null && ctx.user.superAdmin ? 1 : 0}=1)`,
    ))
  )
    error(400, 'INVALID_TEMPLATE_SCOPE')
  return listDisplayTemplates(ctx.db, input.organisationId, {
    projectId: input.projectId,
    catalogue: true,
  })
})

/** Publish a new central version without changing consumers' accepted versions.
 * @param input Owner, definition and previous version. @returns Saved identity/version.
 */
export const publishDisplayTemplate = guardedCommand(
  scope.extend({
    id: z.string().min(1).max(100),
    expectedVersion: z.number().int().min(0),
    definition: DisplayTemplateDefinitionSchema,
  }),
  async (input, ctx) => {
    const guard = await authorizeTemplateScope(ctx, input.organisationId)
    if (
      input.projectId &&
      !(await ctx.db.get(
        sql`SELECT id FROM project WHERE id=${input.projectId} AND (organisationId IS ${input.organisationId} OR ${input.organisationId === null && ctx.user.superAdmin ? 1 : 0}=1)`,
      ))
    )
      error(400, 'INVALID_TEMPLATE_SCOPE')
    const saved = await saveDisplayTemplate(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      context: { projectId: input.projectId },
      guard,
    })
    if (!saved) error(409, 'TEMPLATE_VERSION_CHANGED')
    return saved
  },
)

/** Read the explicit Feature assignment and central versions available to its Organisation.
 * @param input Existing Feature identity. @returns Accepted version fence and selectable definitions.
 * @remarks Organisation management is required; this does not grant upward rights to Project editors.
 */
export const getFeatureDisplayTemplate = guardedQuery(
  z.strictObject({ featureId: z.string().min(1) }),
  async (input, ctx) => {
    const row = await ctx.db.get<{ organisationId: string }>(
      sql`SELECT organisationId FROM feature WHERE id=${input.featureId}`,
    )
    if (!row) error(404, 'FEATURE_NOT_FOUND')
    await authorizeTemplateScope(ctx, row.organisationId)
    const { readCurrentFeatureRevision } = await import(
      '#lib/db/services/featureLifecycle.js'
    )
    const current = await readCurrentFeatureRevision(ctx.db, {
      featureId: input.featureId,
      guard: sql`organisationId=${row.organisationId}`,
    })
    if (!current) error(409, 'FEATURE_HISTORY_UNAVAILABLE')
    return {
      organisationId: row.organisationId,
      projectId: current.state.projectId,
      revisionId: current.revisionId,
      version: current.version,
      reference: current.content.profile.nameTemplate?.rule.registry ?? null,
      templates: (
        await listDisplayTemplates(ctx.db, row.organisationId, {
          projectId: current.state.projectId,
        })
      ).filter(template => template.target === 'feature'),
    }
  },
)

/** Assign or regenerate one accepted Feature from an immutable central version.
 * @param input Feature, inspected revision and explicit template reference or removal.
 * @returns Accepted revision after atomic name regeneration.
 * @remarks Manual names remain intact. Regeneration reads accepted Location pins, never newer community facts.
 */
export const setFeatureDisplayTemplate = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    expectedRevisionId: z.string().min(1),
    expectedVersion: z.number().int().min(0),
    reference: z
      .strictObject({ id: z.string().min(1), version: z.number().int().positive() })
      .nullable(),
  }),
  async (input, ctx) => {
    const row = await ctx.db.get<{ organisationId: string }>(
      sql`SELECT organisationId FROM feature WHERE id=${input.featureId}`,
    )
    if (!row) error(404, 'FEATURE_NOT_FOUND')
    const ownership = await authorizeTemplateScope(ctx, row.organisationId)
    const { saveFeatureEdit } = await import('#lib/db/services/featureLifecycle.js')
    const revisionId = await saveFeatureEdit(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      reason: 'Change central display template',
      revisionBoundary: true,
      guard: sql`(${ownership}) AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND organisationId=${row.organisationId})`,
      derive: content => {
        if (input.reference) {
          content.profile.nameTemplate ??= {
            rule: {
              base: content.placement.location ? 'location' : 'feature',
              conditions: [],
            },
          }
          content.profile.nameTemplate.rule.registry = input.reference
        } else if (content.profile.nameTemplate)
          delete content.profile.nameTemplate.rule.registry
        return content
      },
      validate: () => [],
    })
    if (!revisionId) error(409, 'FEATURE_VERSION_CHANGED')
    return { revisionId }
  },
)

/** Read Organisation naming defaults and their inherited feature types.
 * @param input Organisation identity. @returns Versioned defaults for explicit adoption.
 */
export const getOrganisationTemplateDefaults = guardedQuery(
  z.strictObject({ organisationId: z.string().min(1) }),
  async (input, ctx) => {
    await authorizeTemplateScope(ctx, input.organisationId)
    const { readFeatureIntentPolicy } = await import(
      '#lib/db/services/featureIntentPolicy.js'
    )
    return readFeatureIntentPolicy(ctx.db, {
      type: 'organisation',
      id: input.organisationId,
    })
  },
)

/** Set or reset one Organisation default with optional reviewed Feature adoption.
 * @param input Inspected policy version, feature type and immutable template reference.
 * @returns Completion after an attributed, concurrency-fenced policy write.
 * @remarks Project and Layer overrides retain precedence unless explicitly reset in the reviewed choices. Only an inspected adoption token permits existing Feature updates.
 */
export const setOrganisationTemplateDefault = guardedCommand(
  z.strictObject({
    namingUpdateToken: z.string().min(1).optional(),
    namingUpdateOptions: FeatureNamingUpdateOptionsSchema.optional(),
    organisationId: z.string().min(1),
    featureType: z.string().min(1),
    version: z.number().int().min(0),
    fingerprint: z.string(),
    reference: z
      .strictObject({ id: z.string().min(1), version: z.number().int().positive() })
      .nullable(),
  }),
  async (input, ctx) => {
    const guard = await authorizeTemplateScope(ctx, input.organisationId)
    const { readFeatureIntentPolicy, prepareFeatureIntentPolicySave } = await import(
      '#lib/db/services/featureIntentPolicy.js'
    )
    const { executeRevisionBatch } = await import('#lib/db/services/revisionBatch.js')
    const owner = { type: 'organisation' as const, id: input.organisationId }
    const current = await readFeatureIntentPolicy(ctx.db, owner)
    const type = current.types.find(type => type.id === input.featureType)
    if (!type) error(400, 'FEATURE_TYPE_UNAVAILABLE')
    const namingRules = { ...current.namingRules }
    if (input.reference)
      namingRules[input.featureType] = {
        base: type.nameRule?.base ?? 'location',
        conditions: [],
        registry: input.reference,
      }
    else delete namingRules[input.featureType]
    const statements = await prepareFeatureIntentPolicySave(ctx.db, {
      scope: owner,
      actorId: ctx.user.id,
      version: input.version,
      fingerprint: input.fingerprint,
      definition:
        current.definition === null
          ? null
          : FeatureTypesSchema.parse(current.definition),
      namingRules,
      namingUpdateToken: input.namingUpdateToken,
      namingUpdateOptions: input.namingUpdateOptions,
    })
    if (!statements || !(await executeRevisionBatch(ctx.db, guard, statements)))
      error(409, 'POLICY_VERSION_CHANGED')
    return { version: input.version + 1 }
  },
)

/** List a bounded, stable page of accepted consumers before explicit regeneration.
 * @param input Organisation, template identity and last inspected Feature ID.
 * @returns At most twenty consumers with accepted revision fences and current names.
 * @remarks Only this Organisation's active identities are returned, including archived Features.
 * Consumers keep accepted Location pins; listing does not adopt any upstream or community update.
 */
export const getDisplayTemplateConsumers = guardedQuery(
  z.strictObject({
    organisationId: z.string().min(1),
    templateId: z.string().min(1),
    after: z.string().nullable(),
  }),
  async (input, ctx) => {
    await authorizeTemplateScope(ctx, input.organisationId)
    const { readDisplayTemplateConsumers } = await import(
      '#lib/db/services/displayTemplateConsumers.js'
    )
    return readDisplayTemplateConsumers(ctx.db, input)
  },
)
