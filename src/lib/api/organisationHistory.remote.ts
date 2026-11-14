// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery } from '#lib/api/server/guarded.js'
import { authorizeOrganisationUpdateForSubmission } from '#lib/api/services/authz/index.js'
// DB
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
import { listOrganisationHistory } from '#lib/db/services/resourceHistory.js'

import { listOrganisationPropertyHistory } from '#lib/db/services/resourceHistory.js'

import { listStaffRoleHistory } from '#lib/db/services/staffRoleHistory.js'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

/**
 * Loads configuration history for an authenticated organisation editor.
 * @param input Organisation identity and optional bounded continuation cursor.
 * @returns Attributed revisions with field comparisons, scoped to current ownership.
 * @remarks The client cannot supply a hub or actor; ordinary published-read access is insufficient.
 */
export const getOrganisationHistory = guardedQuery(
  z.strictObject({
    organisationId: z.string().min(1),
    kind: z.enum(['profile', 'fields', 'staff']).optional(),
    before: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  async (input, ctx): Promise<OrganisationHistoryPage> => {
    const probe = await probeOrganisationQuery(ctx.db, {
      ref: input.organisationId,
      refKey: 'id',
    })
    if (!probe) error(404, 'ORGANISATION_NOT_FOUND')
    const decision = authorizeOrganisationUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: probe,
      submittedData: input.kind === 'staff' ? { userRoles: [] } : { i18n: true },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    if (input.kind === 'staff')
      return listStaffRoleHistory(
        ctx.db,
        { resource: 'organisation', id: input.organisationId, before: input.before },
        sql`EXISTS(SELECT 1 FROM organisation WHERE id=${input.organisationId} AND hubId IS ${probe.hubId})`,
      )
    const { kind, ...pagination } = input
    const read =
      kind === 'fields' ? listOrganisationPropertyHistory : listOrganisationHistory
    return read(ctx.db, { ...pagination, hubId: probe.hubId })
  },
)
