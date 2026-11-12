// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import {
  authorizeHubUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
  authorizeFeatureCreateForSubmission,
} from './services/authz'
import { requireLocationOrganisationManager } from './services/locationOwnership'
import { authorizeLayerUpdateForSubmission } from './services/authz/layerPolicy'
// SERVICES
import {
  readFeatureIntentPolicy,
  type FeatureIntentScope,
} from '#lib/db/services/featureIntentPolicy.js'
import { DisplayTemplateDefinitionSchema } from '#lib/templates/registry.js'
import { saveDisplayTemplate } from '#lib/db/services/displayTemplate.js'
import { readFeatureNameExamples } from '#lib/db/services/featureNameExamples.js'
// DOMAIN
import {
  isFeatureNameBooleanField,
  isFeatureNameTextField,
} from '#lib/features/locationPolicy.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

// TABLE OF CONTENTS
// 1. Policy scope and inherited configuration
// 2. Editable policy reads
// 3. Feature authoring and association validation

const scopeSchema = z.strictObject({
  type: z.enum(['hub', 'organisation', 'project', 'layer']),
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
  if (scope.type === 'organisation') {
    await requireLocationOrganisationManager(ctx, scope.id)
    return sql`EXISTS(SELECT 1 FROM organisation WHERE id=${scope.id})`
  }
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
    return (
      await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: layerId })
    ).types.filter(type => type.enabled !== false)
  },
)

/** List boolean, toggle, phone and short-text properties usable in localized generated names.
 * @param scope Authorized policy owner. @returns Selectable property identities and labels.
 * @remarks Examples are saved values restricted to the authorized project or layer.
 */
export const getFeatureNameProperties = guardedQuery(
  scopeSchema,
  async (scope, ctx) => {
    await authorizeSettings(ctx, scope)
    const projectId =
      scope.type === 'project'
        ? scope.id
        : scope.type === 'layer'
          ? (
              await ctx.db.get<{ projectId: string }>(
                sql`SELECT projectId FROM layer WHERE id=${scope.id}`,
              )
            )?.projectId
          : null
    if (!projectId) {
      const { listOrganisationScopedProperties, listHubScopedProperties } =
        await import('#lib/db/services/property.js')
      const fields =
        scope.type === 'organisation'
          ? await listOrganisationScopedProperties(ctx.db, scope.id)
          : await listHubScopedProperties(ctx.db, scope.id)
      return fields
        .filter(
          field => isFeatureNameBooleanField(field) || isFeatureNameTextField(field),
        )
        .map(field => ({
          id: field.id,
          label: field.key,
          component: field.component,
          examples: {},
          test: isFeatureNameBooleanField(field)
            ? ('boolean' as const)
            : ('hasValue' as const),
        }))
    }
    const { listResolvedProjectProperties } = await import(
      '#lib/db/services/property.js'
    )
    const examples = await readFeatureNameExamples(
      ctx.db,
      projectId,
      scope.type === 'layer' ? scope.id : undefined,
    )
    return (await listResolvedProjectProperties(ctx.db, projectId))
      .filter(
        field => isFeatureNameBooleanField(field) || isFeatureNameTextField(field),
      )
      .map(field => ({
        id: field.id,
        label: field.key,
        component: field.component,
        examples: examples[field.id] ?? {},
        test: isFeatureNameBooleanField(field)
          ? ('boolean' as const)
          : ('hasValue' as const),
      }))
  },
)

/** Resolve the owning project for the naming editor's Fields link.
 * @param scope Authorized naming-policy owner.
 * @returns Project identity, or null for a hub without project fields.
 */
export const getFeatureNameFieldsProject = guardedQuery(
  scopeSchema,
  async (scope, ctx): Promise<string | null> => {
    await authorizeSettings(ctx, scope)
    if (scope.type === 'project') return scope.id
    if (scope.type === 'hub' || scope.type === 'organisation') return null
    const row = await ctx.db.get<{ projectId: string }>(
      sql`SELECT projectId FROM layer WHERE id=${scope.id}`,
    )
    return row?.projectId ?? null
  },
)

/** List central versions available for the authorized naming-policy scope.
 * @param scope Persisted Hub, Project or Layer owner. @returns Community and owner-local versions.
 * @remarks Scope administration already controls public naming; private Organisation catalogues never cross ownership.
 */
export const getFeatureNamingTemplates = guardedQuery(
  scopeSchema,
  async (scope, ctx) => {
    await authorizeSettings(ctx, scope)
    const owner =
      scope.type === 'hub'
        ? null
        : scope.type === 'organisation'
          ? { organisationId: scope.id }
          : await ctx.db.get<{ organisationId: string }>(
              scope.type === 'project'
                ? sql`SELECT organisationId FROM project WHERE id=${scope.id}`
                : sql`SELECT p.organisationId FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=${scope.id}`,
            )
    const { listDisplayTemplates } = await import('#lib/db/services/displayTemplate.js')
    const project =
      scope.type === 'project'
        ? scope.id
        : scope.type === 'layer'
          ? (
              await ctx.db.get<{ projectId: string }>(
                sql`SELECT projectId FROM layer WHERE id=${scope.id}`,
              )
            )?.projectId
          : null
    let canEdit = ctx.user.superAdmin
    if (!canEdit && owner?.organisationId) {
      try {
        await requireLocationOrganisationManager(ctx, owner.organisationId)
        canEdit = true
      } catch {
        // Policy editors may select or copy a shared template without editing its identity.
        canEdit = false
      }
    }
    return (
      await listDisplayTemplates(ctx.db, owner?.organisationId ?? null, {
        projectId: project,
        hubId: scope.type === 'hub' ? scope.id : null,
      })
    )
      .filter(template => template.target === 'feature')
      .map(template => ({
        ...template,
        canEdit: canEdit && template.organisationId === (owner?.organisationId ?? null),
      }))
  },
)

/** Publish a reusable naming template from an authorized policy editor.
 * @param input Policy context and immutable definition. @returns Saved reference.
 * @remarks Publication never updates other consumers. Organisation ownership remains unchanged.
 */
export const publishFeatureNamingTemplate = guardedCommand(
  z.strictObject({
    scope: scopeSchema,
    id: z.string().min(1),
    expectedVersion: z.number().int().min(0),
    definition: DisplayTemplateDefinitionSchema,
  }),
  async (input, ctx) => {
    const guard = await authorizeSettings(ctx, input.scope)
    const scope = input.scope
    const owner =
      scope.type === 'project' || scope.type === 'layer'
        ? await ctx.db.get<{ organisationId: string; projectId: string }>(
            scope.type === 'project'
              ? sql`SELECT organisationId,id projectId FROM project WHERE id=${scope.id}`
              : sql`SELECT p.organisationId,p.id projectId FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=${scope.id}`,
          )
        : {
            organisationId: scope.type === 'organisation' ? scope.id : null,
            projectId: null,
          }
    if (!owner || input.definition.target !== 'feature')
      error(400, 'INVALID_TEMPLATE_SCOPE')
    if (input.expectedVersion > 0 && owner.organisationId)
      await requireLocationOrganisationManager(ctx, owner.organisationId)
    // Community publication remains restricted to its existing registry authority.
    if (owner.organisationId === null && !ctx.user.superAdmin)
      error(403, 'INSUFFICIENT_ROLE')
    const result = await saveDisplayTemplate(ctx.db, {
      ...input,
      organisationId: owner.organisationId,
      actorId: ctx.user.id,
      guard,
      context: {
        projectId: owner.projectId,
        hubId: scope.type === 'hub' ? scope.id : null,
      },
    })
    if (!result) error(409, 'TEMPLATE_VERSION_CHANGED')
    return result
  },
)
