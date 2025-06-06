import { eq } from 'drizzle-orm';
import { userLayer, layer } from '$lib/db/schema';
// TYPES
import type { UserLayer, Layer, UserRoleDisco, Session } from '$lib/types';

/**
 * Fetches and constructs user layers from the database.
 *
 * @param db - The database instance to query.
 * @param userId - The ID of the user to fetch layers for.
 * @returns A Promise that resolves to an array of UserLayer objects.
 *
 * @remarks
 * This function fetches all layers that the user has access to,
 * including those inherited from their organisation roles.
 * It then maps these layers into UserLayer objects and returns them.
 */
export async function getUserLayers(db: any, userId: string): Promise<UserLayer[]> {
  // Fetch user layers
  let userLayers = await db
    .select()
    .from(userLayer)
    .where(eq(userLayer.userId, userId));

  // If no layers exist, create default layer
  if (userLayers.length === 0) {
    // First, get the layer data
    const defaultLayers = (await db
      .select()
      .from(layer)
      .where(eq(layer.isDefaultVisible, true))
      .all()) as Layer[];

    if (!defaultLayers) {
      console.error('Default layers not found');
      return [];
    }

    for (const layer of defaultLayers) {
      // Create the user layer
      const defaultUserLayer = {
        layerId: layer.id,
        userId: userId,
        isVisibleOnLoad: true
      };
      await db.insert(userLayer).values(defaultUserLayer);
    }

    // Return the newly created layer with the layer data
    userLayers = await db.select().from(userLayer).where(eq(userLayer.userId, userId));
  }

  return userLayers;
}
/**
 * Checks if the user has access to the control panel based on their roles.
 *
 * @param session - The user's session object, which may be null if not authenticated.
 * @returns A boolean indicating whether the user has control panel access.
 *
 * @remarks
 * This function considers 'superadmin', 'owner', and 'maintainer' as roles
 * that grant access to the control panel. It checks the user's roles array
 * in the session object and returns true if any of these roles are present.
 *
 * If the session is null or the user has no roles, it returns false.
 */
export function hasControlPanelAccess(session: Session | null): boolean {
  const permittedRoles = ['superadmin', 'owner', 'maintainer'];
  return (
    session?.user?.roles?.some((role: UserRoleDisco) =>
      permittedRoles.includes(role.role)
    ) || false
  );
}

export function isSuperAdmin(session: Session): boolean {
  return session?.user?.superAdmin || false;
}

export const getOrganisationIdforRoles = (userRoles: UserRoleDisco[]) => {
  return userRoles
    .map((role: UserRoleDisco) =>
      role.type === 'organisation' ? role.organisationId : null
    )
    .filter(Boolean);
};

export const getProjectIdforRoles = (userRoles: UserRoleDisco[]) => {
  return userRoles
    .map((role: UserRoleDisco) => (role.type === 'project' ? role.projectId : null))
    .filter(Boolean);
};
