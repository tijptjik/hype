// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery } from '#lib/api/server/guarded.js'
import {
  authorizeProjectUpdateForSubmission,
  authorizeLayerUpdateForSubmission,
  authorizeHubUpdateForSubmission,
} from '#lib/api/services/authz/index.js'
// DB
import { probeProjectForUpdate } from '#lib/db/services/project.js'
import { probeLayerForUpdate } from '#lib/db/services/layer.js'
import { probeHubForUpdate } from '#lib/db/services/hub.js'
import { listAdminResourceHistory } from '#lib/db/services/resourceHistory.js'
import { listPropertyCatalogHistory } from '#lib/db/services/resourceHistory.js'
import { listStaffRoleHistory } from '#lib/db/services/staffRoleHistory.js'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
import type { Id } from '#lib/types.js'

/**
 * Loads profile history for an authenticated resource editor.
 * @param input Resource identity and optional continuation cursor.
 * @returns Attributed revisions and predecessor comparisons.
 * @remarks Ancestry comes from persisted probes, never client-supplied scope.
 */
export const getAdminResourceHistory = guardedQuery(
  z.strictObject({
    resource: z.enum(['project', 'layer', 'hub']),
    id: z.string().min(1),
    kind: z.enum(['profile', 'fields', 'staff']).optional(),
    before: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  async (input, ctx): Promise<OrganisationHistoryPage> => {
    const common = {
      user: ctx.user,
      userRoles: ctx.userRoles,
      submittedData:
        input.kind === 'staff'
          ? { userRoles: [] }
          : input.kind === 'fields'
            ? { properties: [] }
            : { i18n: true },
    }
    if (input.resource === 'hub') {
      const probe = await probeHubForUpdate(ctx.db, input.id as Id)
      if (!probe) error(404, 'HUB_NOT_FOUND')
      const decision = authorizeHubUpdateForSubmission({ ...common, resource: probe })
      if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
      if (input.kind === 'staff')
        return listStaffRoleHistory(
          ctx.db,
          { ...input, resource: 'hub' },
          sql`EXISTS(SELECT 1 FROM hub WHERE id=${input.id})`,
        )
      if (input.kind === 'fields')
        return listPropertyCatalogHistory(
          ctx.db,
          { scope: 'hub', id: input.id },
          sql`EXISTS(SELECT 1 FROM hub WHERE id=${input.id})`,
          input.before,
        )
      return listAdminResourceHistory(ctx.db, input)
    }
    if (input.resource === 'project') {
      const probe = await probeProjectForUpdate(ctx.db, input.id as Id)
      if (!probe) error(404, 'PROJECT_NOT_FOUND')
      const decision = authorizeProjectUpdateForSubmission({
        ...common,
        resource: probe,
      })
      if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
      if (input.kind === 'staff')
        return listStaffRoleHistory(
          ctx.db,
          { ...input, resource: 'project' },
          sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${input.id} AND p.organisationId=${probe.organisationId} AND o.hubId IS ${probe.hubId})`,
        )
      if (input.kind === 'fields')
        return listPropertyCatalogHistory(
          ctx.db,
          { scope: 'project', id: input.id },
          sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${input.id} AND p.organisationId=${probe.organisationId} AND o.hubId IS ${probe.hubId})`,
          input.before,
        )
      return listAdminResourceHistory(ctx.db, {
        ...input,
        organisationId: probe.organisationId,
        hubId: probe.hubId,
      })
    }
    if (input.kind === 'staff') error(400, 'LAYER_HAS_NO_STAFF_ROLES')
    if (input.kind === 'fields') error(400, 'LAYER_FIELDS_HAVE_NO_OWNED_CATALOGUE')
    const probe = await probeLayerForUpdate(ctx.db, input.id as Id)
    if (!probe) error(404, 'LAYER_NOT_FOUND')
    const decision = authorizeLayerUpdateForSubmission({ ...common, resource: probe })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return listAdminResourceHistory(ctx.db, {
      ...input,
      projectId: probe.projectId,
      organisationId: probe.organisationId,
      hubId: probe.hubId,
    })
  },
)
