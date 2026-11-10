import { sharedLocationEditRights } from './services/locationOwnership'
// FRAMEWORK
import { error } from '@sveltejs/kit'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
// API / AUTHORIZATION
import { guardedCommand, guardedQuery } from './server/guarded'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
// DOMAIN / SERVICES
import {
  SharedCorrectionPatchSchema,
  resolveSharedCorrections,
  omittedSourceContacts,
} from '#lib/locations/sharedCorrection.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from '#lib/db/services/locationShared.js'
import { prepareStaffLocationPropagation } from '#lib/db/services/locationStaffPropagation.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

const identity = z.object({
  featureId: z.string().min(1),
  meta: z.object({ isAdminRequest: z.boolean().optional() }).optional(),
})

/** Resolve shared contact authority from persisted Feature ancestry, never supplied Organisation IDs.
 * @param ctx Authenticated context. @param featureId Feature establishing resource scope.
 * @returns Current shared subject, source evidence, and write fence.
 */
async function scope(ctx: GuardedBaseContext, featureId: string) {
  const feature = await probeFeatureForUpdate(ctx.db, featureId)
  if (!feature) error(404, 'FEATURE_NOT_FOUND')
  const { canEdit } = await sharedLocationEditRights(ctx, feature.projectId)
  if (!canEdit && !ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
  const guard = buildFeatureCommandScopeGuard(ctx.db, featureId, feature)
  const subject = await ctx.db.get<{
    locationId: string
    revisionId: string
    facts: string
    rawSource: string
    associationVersion: string
  }>(sql`
    SELECT l.id locationId,r.id revisionId,r.facts,r.rawSource,fl.version associationVersion FROM featureLocation fl
    JOIN location l ON l.id=fl.locationId JOIN locationRevision r ON r.locationId=l.id
    WHERE fl.featureId=${featureId} AND l.state IN ('linked','unresolved') AND (${guard})
    ORDER BY r.version DESC LIMIT 1`)
  if (!subject) error(404, 'SHARED_LOCATION_NOT_FOUND')
  return {
    ...subject,
    feature,
    canEdit,
    guard: sql`(${guard}) AND EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${featureId} AND locationId=${subject.locationId} AND version=${subject.associationVersion})`,
  }
}

/** Read original source, effective Hype facts and attributed correction history.
 * @param input Feature scope. @returns Three-layer editor evidence; Organisation values remain separately scoped.
 */
export const getSharedLocationCorrection = guardedQuery(
  identity,
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    const head = await readSharedLocationCorrection(ctx.db, command.locationId)
    const upstream = readLocationFacts(command.facts)
    const corrections = head ? JSON.parse(head.corrections) : {}
    const history = await ctx.db.all<{
      id: string
      actorId: string
      createdAt: string
      corrections: string
      sourceRevisionId: string
      provenance: string
    }>(sql`
    SELECT id,actorId,createdAt,corrections,sourceRevisionId,provenance FROM locationSharedRevision
    WHERE locationId=${command.locationId} ORDER BY rowid DESC LIMIT 50`)
    return {
      locationId: command.locationId,
      sourceRevisionId: command.revisionId,
      revision: head?.id ?? null,
      superAdmin: Boolean(ctx.user.superAdmin),
      upstream,
      ...resolveSharedCorrections(
        upstream,
        corrections,
        true,
        omittedSourceContacts(command.rawSource),
      ),
      corrections,
      history,
    }
  },
)

/** Save authorized shared corrections and the originating Feature's adoption atomically.
 * @param input Exact displayed source/head pins and field choices. @returns Accepted shared revision.
 * @remarks Shared names, brands, addresses and all non-contact fields require explicit SuperAdmin authority.
 */
export const saveSharedLocationCorrection = guardedCommand(
  identity.extend({
    sourceRevisionId: z.string().min(1),
    expectedRevision: z.string().nullable(),
    patch: SharedCorrectionPatchSchema,
  }),
  async (input, ctx) => {
    const command = await scope(ctx, input.featureId)
    if (input.sourceRevisionId !== command.revisionId)
      error(409, 'SHARED_LOCATION_CHANGED')
    const shared = await prepareSharedLocationCorrection(ctx.db, {
      ...input,
      locationId: command.locationId,
      actorId: ctx.user.id,
      guard: command.guard,
      rights: { canEdit: command.canEdit, superAdmin: Boolean(ctx.user.superAdmin) },
      provenance: { kind: 'staff-correction', featureId: input.featureId },
    })
    const propagation = await prepareStaffLocationPropagation(ctx.db, {
      locationId: command.locationId,
      sourceRevisionId: input.sourceRevisionId,
      sharedRevisionId: shared.id,
      actorId: ctx.user.id,
      facts: shared.facts,
      fields: Object.keys(input.patch),
    })
    const saved = await executeRevisionBatch(
      ctx.db,
      sql`(${shared.guard}) AND (${propagation.guard})`,
      [...shared.queries, ...propagation.statements],
    )
    if (!saved) error(409, 'SHARED_LOCATION_CHANGED')
    return { revisionId: shared.id }
  },
)

/** Save SuperAdmin corrections from the standalone Location editor without changing publisher snapshots.
 * @param input Location identity and displayed source/shared pins with explicit field choices.
 * @returns New shared revision, atomically propagated to linked Features with attributed history.
 */
export const saveSharedLocationDirectoryCorrection = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1),
    sourceRevisionId: z.string().min(1),
    expectedRevision: z.string().nullable(),
    patch: SharedCorrectionPatchSchema,
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous || !ctx.user.superAdmin)
      error(403, 'SHARED_LOCATION_FIELD_REQUIRES_SUPERADMIN')
    const shared = await prepareSharedLocationCorrection(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      rights: { canEdit: true, superAdmin: true },
      guard: sql`EXISTS(SELECT 1 FROM location WHERE id=${input.locationId} AND state!='redirect')`,
      provenance: { kind: 'location-editor' },
    })
    const propagation = await prepareStaffLocationPropagation(ctx.db, {
      locationId: input.locationId,
      sourceRevisionId: input.sourceRevisionId,
      sharedRevisionId: shared.id,
      actorId: ctx.user.id,
      facts: shared.facts,
      fields: Object.keys(input.patch),
    })
    if (
      !(await executeRevisionBatch(
        ctx.db,
        sql`(${shared.guard}) AND (${propagation.guard})`,
        [...shared.queries, ...propagation.statements],
      ))
    )
      error(409, 'SHARED_LOCATION_CHANGED')
    return { revisionId: shared.id }
  },
)
