// ROLE HIERARCHY
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
import { eq } from 'drizzle-orm'
import { hub, userLayer } from '#lib/db/schema/index.js'
import { canAccessAnalytics } from '#lib/api/services/authz/user.js'
// TYPES
import type { Database, UserRoleDisco, SessionUser } from '#lib/types.js'
import type { UserLayer } from '#lib/db/zod/schema/user.types.js'

/**
 * Fetches and constructs user layers from the database.
 *
 * @param db - The database instance to query.
 * @param userId - The ID of the user to fetch layers for.
 * @returns A Promise that resolves to an array of UserLayer objects.
 *
 * @remarks
 * This function loads persisted user layer defaults across hubs.
 * Initial fallbacks are handled by hub defaults in app state, not by auto-writing rows.
 */
export async function getUserLayers(
  db: Database,
  userId: string,
): Promise<UserLayer[]> {
  const rows = await db
    .select({
      userId: userLayer.userId,
      hubId: userLayer.hubId,
      layerId: userLayer.layerId,
      isDefaultVisible: userLayer.isDefaultVisible,
      hubCode: hub.code,
    })
    .from(userLayer)
    .leftJoin(hub, eq(userLayer.hubId, hub.id))
    .where(eq(userLayer.userId, userId))

  return rows as UserLayer[]
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.superAdmin || false
}

/**
 * Checks whether the user should see the admin analytics surface.
 */
export function canViewAnalytics(user: SessionUser | null): boolean {
  if (!user) return false

  return canAccessAnalytics({
    superAdmin: user.superAdmin,
    userRoles: user.roles ?? [],
  })
}

export const getOrganisationIdforRoles = (userRoles: UserRoleDisco[]) => {
  return userRoles
    .map((role: UserRoleDisco) =>
      role.type === 'organisation' && isOrganisationStaffRole(role.role)
        ? role.organisationId
        : null,
    )
    .filter(Boolean)
}


// ═══════════════════════
// 2.1 PERMISSIONS :: ORGANISATION
// ═══════════════════════




// ═══════════════════════
// 2.2 PERMISSIONS :: PROJECT
// ═══════════════════════





// ═══════════════════════
// 2.3 PERMISSIONS :: LAYER
// ═══════════════════════



// ═══════════════════════
// 2.4 PERMISSIONS :: FEATURE
// ═══════════════════════


// ═══════════════════════
// 2.5 PERMISSIONS :: RESOURCE
// ═══════════════════════
