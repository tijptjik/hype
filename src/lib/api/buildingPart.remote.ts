// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery } from '#lib/api/server/guarded.js'
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DB
import { probeProjectQuery } from '#lib/db/services/project.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'

/** Find existing physical parents in the authoring Project's authorized scope.
 * @param input Project, explicit parent kind and search text.
 * @returns A bounded catalogue page, including shared and owned private Locations.
 * @remarks Selection is provisional; creation rechecks visibility and membership atomically.
 */
export const findBuildingPartParents = guardedQuery(
  z.strictObject({
    projectId: z.string().min(1),
    kind: z.enum(['building', 'building_part']),
    buildingId: z.string().min(1).max(200).optional(),
    q: z.string().trim().min(1).max(200),
  }),
  async (input, ctx) => {
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    return listLocationResources(ctx.db, {
      kind: input.kind,
      buildingId: input.kind === 'building_part' ? input.buildingId : undefined,
      q: input.q,
      organisationId: project.organisationId,
      includeCount: false,
    })
  },
)
