// DRIZZLE
import { and, eq } from 'drizzle-orm'
// AUTH
import { canReadAllUserContacts } from './authz/userDirectory'
// DB
import { organisation } from '#lib/db/schema/organisation.js'
import { project, projectRole } from '#lib/db/schema/project.js'
import { UserDirectoryProfileAPI } from '#lib/db/zod/schema/user.js'
// UTILS
import { chunkedInArray } from '#lib/utils/batch-query.js'
// TYPES
import type { Database, UserRoleDisco } from '#lib/types.js'
import type { z } from 'zod'

// TABLE OF CONTENTS
// 1. Telephone visibility
// 2. Directory response projection

/**
 * Resolves telephone visibility for a page of users in one bounded SQL query.
 * @param db Request-scoped database.
 * @param actor Fresh session roles and the server-resolved active hub.
 * @param userIds Target users on the current page.
 * @returns IDs whose telephone may be returned.
 * @remarks Explicit management capabilities apply only to shared projects in the
 * active hub. HYPE/core administrators and super admins can read all contacts.
 */
export async function getTelephoneVisibleUserIds(
  db: Database,
  actor: {
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
    userRoles: UserRoleDisco[]
    hubId?: string | null
  },
  userIds: string[],
): Promise<Set<string>> {
  if (actor.isAnonymous || userIds.length === 0) return new Set()
  if (canReadAllUserContacts(actor)) return new Set(userIds)
  if (!actor.hubId) return new Set()
  const projectIds = actor.userRoles.flatMap(role =>
    role.type === 'project' &&
    (role.capabilities?.manageVolunteers === true ||
      role.capabilities?.manageDropOffs === true)
      ? [role.projectId]
      : [],
  )
  if (projectIds.length === 0) return new Set()

  // Bind arrays as JSON so large memberships and pages stay below D1's parameter limit.
  const rows = await db
    .selectDistinct({ userId: projectRole.userId })
    .from(projectRole)
    .innerJoin(project, eq(project.id, projectRole.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .where(
      and(
        eq(organisation.hubId, actor.hubId),
        eq(project.isArchived, false),
        eq(organisation.isArchived, false),
        chunkedInArray(projectRole.projectId, projectIds, 4),
        chunkedInArray(projectRole.userId, userIds, 4),
      ),
    )
  return new Set(rows.map(row => row.userId))
}

/**
 * Produces the directory allow-list with contact permissions applied before parsing.
 * @param row Persisted user record.
 * @param canReadTelephone Whether the viewer manages this user's project in this hub.
 * @param canReadEmail Whether the viewer is a HYPE/core administrator or super admin.
 * @returns Permission-filtered directory fields without verification metadata.
 * @remarks Other hub admins await interaction/onboarding rules for email access.
 * Missing telephone permission omits the field entirely.
 */
export function toUserDirectoryProfile(
  row: Record<string, unknown>,
  canReadTelephone: boolean,
  canReadEmail = false,
): z.infer<typeof UserDirectoryProfileAPI> {
  const { telephone, email, emailVerified: _verified, ...publicFields } = row
  return UserDirectoryProfileAPI.parse({
    ...publicFields,
    email: canReadEmail ? email : null,
    ...(canReadTelephone ? { telephone } : {}),
  })
}
