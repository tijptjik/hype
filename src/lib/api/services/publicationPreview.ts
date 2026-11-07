// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, sql, type SQL } from 'drizzle-orm'
// API
import { applyQueryFilters } from '#lib/api/index.js'
// DB
import { applyPrismConstraints } from '#lib/db/index.js'
import { organisation, project, layer, feature } from '#lib/db/schema/index.js'
import { descendantPublicationState, featurePublicationEligibility } from '#lib/db/services/publication.js'
// PUBLICATION
import { canPreviewPublication } from '#lib/publication/permissions.js'
// ENUMS
import { HierarchicalResource } from '#lib/enums.js'
// TYPES
import type { GuardedQueryContext } from '#lib/api/guarded.types.js'
import type { PublicationPreview } from '#lib/publication/preview.js'
import type { PublicationTarget } from '#lib/publication/permissions.js'
import type { Prisms, QueryParams } from '#lib/types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PREVIEW AUTHORIZATION
// - resolvePublicationPreview
//
// 2. PREVIEW QUERY CONDITIONS
// - publicationPreviewConditions
// ---

/********************
 *  1. PREVIEW AUTHORIZATION
 ************/
// +++ Preview Authorization

/**
 * Resolves and authorizes saved publication intent on every request.
 * @param ctx Trusted session, database and hub context.
 * @param preview Requested resource and publication choice.
 * @returns Persisted target ancestry.
 * @remarks Preview never mutates state and never widens a project role upwards.
 * Archived ancestors remain unavailable. Unpublished ancestors supply hierarchy
 * context only; sibling resources and saved publication state remain unchanged.
 */
export async function resolvePublicationPreview(
  ctx: GuardedQueryContext,
  preview: PublicationPreview,
): Promise<PublicationTarget & { ref: string }> {
  const { db, user, userRoles, event } = ctx
  if (!user.id || user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  let ref = preview.id
  let projectId: string | null = null
  let organisationId: string
  if (preview.type === 'layer') {
    const row = await db.query.layer.findFirst({
      where: eq(layer.id, preview.id),
      columns: { organisationId: true, projectId: true, isArchived: true },
    })
    if (!row || row.isArchived) throw error(404, 'PREVIEW_NOT_AVAILABLE')
    organisationId = row.organisationId
    projectId = row.projectId
  } else if (preview.type === 'project') {
    const row = await db.query.project.findFirst({
      where: eq(project.id, preview.id),
      columns: { organisationId: true, isArchived: true, code: true },
    })
    if (!row || row.isArchived) throw error(404, 'PREVIEW_NOT_AVAILABLE')
    organisationId = row.organisationId
    projectId = preview.id
    ref = row.code
  } else organisationId = preview.id
  const parent = await db.query.organisation.findFirst({
    where: eq(organisation.id, organisationId),
    columns: { id: true, code: true, hubId: true, isArchived: true },
  })
  if (!parent || parent.isArchived) throw error(404, 'PREVIEW_NOT_AVAILABLE')
  if (preview.type === 'organisation') ref = parent.code
  const target = { organisationId, projectId, hubId: parent.hubId, ref }
  if (!canPreviewPublication(user, userRoles, target))
    throw error(403, 'INSUFFICIENT_ROLE')
  // Hub filtering is also applied by the normal DB services; this gate prevents cross-hub previews.
  if (!event.locals.hub.isCore && parent.hubId !== event.locals.hub.id)
    throw error(403, 'INSUFFICIENT_ROLE')
  if (preview.type === 'layer') {
    const parentProject = await db.query.project.findFirst({
      where: eq(project.id, projectId!),
      columns: { organisationId: true, isArchived: true },
    })
    if (
      !parentProject ||
      parentProject.isArchived ||
      parentProject.organisationId !== organisationId
    )
      throw error(404, 'PREVIEW_NOT_AVAILABLE')
  }
  return target
}

// ---
/********************
 *  2. PREVIEW QUERY CONDITIONS
 ************/
// +++ Preview Query Conditions

/**
 * Builds the preview equivalent of the parent publication cascade.
 * @param ctx Trusted request context.
 * @param preview Requested saved publication plan.
 * @param resource Resource family being read.
 * @param filters Ordinary lookup/list conditions; publication flags cannot override the plan.
 * @param prisms Optional hierarchy narrowing, intersected with the authorized target.
 * @returns SQL predicates and remaining filters for normal pagination/search.
 * @remarks The public response profile stays unchanged. Counts and feature hydration
 * receive these same predicates; archived rows and unsaved feature drafts stay excluded.
 */
export async function publicationPreviewConditions(
  ctx: GuardedQueryContext,
  preview: PublicationPreview,
  resource: 'organisation' | 'project' | 'layer' | 'feature',
  filters: QueryParams = {},
  prisms?: Partial<Prisms>,
): Promise<{ conditions: SQL[]; filtersToApply: QueryParams }> {
  const target = await resolvePublicationPreview(ctx, preview)
  const table = { organisation, project, layer, feature }[resource]
  const conditions: SQL[] = [eq(table.isArchived, false)]
  if (resource === 'organisation')
    conditions.push(eq(organisation.id, target.organisationId))
  if (resource === 'project')
    conditions.push(
      preview.type === 'organisation'
        ? eq(project.organisationId, target.organisationId)
        : eq(project.id, target.projectId!),
    )
  if (resource === 'layer')
    conditions.push(
      preview.type === 'layer'
        ? eq(layer.id, preview.id)
        : preview.type === 'project'
          ? eq(layer.projectId, preview.id)
          : eq(layer.organisationId, preview.id),
    )
  if (resource === 'feature')
    conditions.push(
      preview.type === 'layer'
        ? eq(feature.layerId, preview.id)
        : preview.type === 'project'
          ? eq(feature.projectId, preview.id)
          : eq(feature.organisationId, preview.id),
      eq(feature.isDraft, false),
      await featurePublicationEligibility(ctx.db),
    )
  const depth = { organisation: 0, project: 1, layer: 2, feature: 3 }
  if (depth[resource] > depth[preview.type] && resource !== 'organisation') {
    const child = { project, layer, feature }[resource]
    conditions.push(
      sql`${descendantPublicationState(child, preview.publishChildren)} = 1`,
    )
  }
  // Keep search and lookup filters, but publication and archive visibility belong to this plan.
  const {
    isPublished: _published,
    isArchived: _archived,
    isDraft: _draft,
    ...filtersToApply
  } = filters
  applyQueryFilters(table, filtersToApply, conditions)
  if (prisms)
    conditions.push(
      ...applyPrismConstraints(ctx.db, HierarchicalResource[resource], prisms),
    )
  return { conditions, filtersToApply }
}
