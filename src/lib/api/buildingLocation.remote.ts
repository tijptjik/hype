// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DB
import { probeProjectQuery } from '#lib/db/services/project.js'
import { importBuildingLocation as persistBuildingLocation } from '#lib/db/services/locationBuilding.js'
// DOMAIN
import { BuildingSourceSchema } from '#lib/locations/buildingSource.js'
import { LocationNamesEditSchema } from '#lib/locations/validation.js'

/** Resolve a published building into a reusable Organisation-owned Location.
 * @param input Project context, verified-on-server export reference and chosen visibility.
 * @returns Stable Hype identity and its current immutable baseline revision.
 * @remarks Authorisation precedes source reads; no Feature is linked by this command.
 */
export const importBuildingLocation = guardedCommand(
  z.strictObject({
    projectId: z.string().min(1),
    source: BuildingSourceSchema,
    visibility: z.enum(['shared', 'exclusive']),
    names: LocationNamesEditSchema.optional(),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    return persistBuildingLocation(
      ctx.db,
      project.organisationId,
      input.source,
      input.visibility,
      ctx.user.id,
      input.names,
    )
  },
)
