import { eq } from 'drizzle-orm';
import { userLayer, layer } from '$lib/db/schema/index';
// TYPES
import type { UserLayer, Layer, UserRoleDisco, SessionUser, Id } from '$lib/types';

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
export function hasControlPanelAccess(user: SessionUser | null): boolean {
  const permittedRoles = ['superadmin', 'owner', 'maintainer'];
  return (
    user?.roles?.some((role: UserRoleDisco) => permittedRoles.includes(role.role)) ||
    false
  );
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.superAdmin || false;
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

// ═══════════════════════
// 2.1 PERMISSIONS :: ORGANISATION
// ═══════════════════════

/**
 * Checks if the user can manage organisations (create/update/delete)
 * Only superadmins can manage organisations
 */
export function canManageOrganisations(user: SessionUser | null): boolean {
  return user?.superAdmin ?? false;
}

/**
 * Checks if the user is an owner of a specific organisation
 */
export function isOrganisationOwner(
  user: SessionUser | null,
  organisationId: string
): boolean {
  if (!user?.roles) return false;
  
  return user.roles.some(
    (role: UserRoleDisco) =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      role.role === 'owner'
  );
}

/**
 * Checks if the user can update a specific organisation
 * Must be organisation owner or superadmin
 */
export function canUpdateOrganisation(
  user: SessionUser | null,
  organisationId: string
): boolean {
  if (!user) return false;
  
  return (
    canManageOrganisations(user) ||
    isOrganisationOwner(user, organisationId)
  );
}

// ═══════════════════════
// 2.2 PERMISSIONS :: PROJECT
// ═══════════════════════

/**
 * Checks if the user is a maintainer of a specific project
 */
export function isProjectMaintainer(
  user: SessionUser | null,
  projectId: string
): boolean {
  if (!user?.roles) return false;
  
  return user.roles.some(
    (role: UserRoleDisco) =>
      role.type === 'project' &&
      role.projectId === projectId &&
      role.role === 'maintainer'
  );
}

/**
 * Checks if the user is a member of a specific project
 */
export function isProjectMember(
  user: SessionUser | null,
  projectId: string
): boolean {
  if (!user?.roles) return false;
  
  return user.roles.some(
    (role: UserRoleDisco) =>
      role.type === 'project' &&
      role.projectId === projectId &&
      role.role === 'member'
  );
}

/**
 * Checks if the user can create projects
 * Must be organisation owner or superadmin
 */
export function canCreateProjects(user: SessionUser | null, organisationId?: Id): boolean {
  if (!user) return false;
  
  // SuperAdmin can always create projects
  if (canManageOrganisations(user)) return true;
  
  // If organisationId is provided, check if user is owner of that specific organisation
  if (organisationId) {
    return isOrganisationOwner(user, organisationId);
  }
  
  // If no organisationId provided, check if user is owner of any organisation
  return user.roles?.some(
    (role: UserRoleDisco) =>
      role.type === 'organisation' && role.role === 'owner'
  ) ?? false;
}

/**
 * Checks if the user can update a specific project
 * Must be project maintainer, organisation owner, or superadmin
 */
export function canUpdateProject(
  user: SessionUser | null,
  projectId: string,
  organisationId?: string
): boolean {
  if (!user) return false;
  
  return (
    user.superAdmin === true ||
    isProjectMaintainer(user, projectId) ||
    (organisationId ? isOrganisationOwner(user, organisationId) : false)
  );
}

// ═══════════════════════
// 2.3 PERMISSIONS :: LAYER
// ═══════════════════════

/**
 * Checks if the user can create layers for a specific project
 * Must be project maintainer or superadmin
 */
export function canCreateLayers(
  user: SessionUser | null,
  projectId: string
): boolean {
  if (!user) return false;
  
  return (
    user.superAdmin === true ||
    isProjectMaintainer(user, projectId)
  );
}

/**
 * Checks if the user can update layers for a specific project
 * Must be project maintainer, member, or superadmin
 */
export function canUpdateLayer(
  user: SessionUser | null,
  projectId: string
): boolean {
  if (!user) return false;
  
  return (
    user.superAdmin === true ||
    isProjectMaintainer(user, projectId) ||
    isProjectMember(user, projectId)
  );
}

// ═══════════════════════
// 2.4 PERMISSIONS :: FEATURE
// ═══════════════════════

/**
 * Checks if the user can manage features for a specific project
 * Must be project maintainer, member, or superadmin
 */
export function canManageFeatures(
  user: SessionUser | null,
  projectId: string
): boolean {
  if (!user) return false;
  
  return (
    user.superAdmin === true ||
    isProjectMaintainer(user, projectId) ||
    isProjectMember(user, projectId)
  );
}

// ═══════════════════════
// 2.5 PERMISSIONS :: RESOURCE
// ═══════════════════════

/**
 * Check if the user can create new entities for the given resource type
 * @param user - The user to check permissions for
 * @param resource - The resource type to check permissions for
 * @returns boolean indicating if new buttons should be shown
 */
export function canCreateEntity(user: SessionUser | null, resource: string): boolean {
  if (!resource || !user) return false;

  switch (resource) {
    case 'organisation':
      return canManageOrganisations(user);

    case 'project':
      return canCreateProjects(user);

    case 'layer': {
      // For layers, we need to check if user can create layers for any project they have access to
      // This is a simplified check - in practice, you might want to be more specific
      return user.superAdmin === true || 
             user.roles?.some(role => role.type === 'project' && role.role === 'maintainer') === true;
    }

    case 'feature': {
      // For features, we need to check if user can manage features for any project they have access to
      // This is a simplified check - in practice, you might want to be more specific
      return user.superAdmin === true || 
             user.roles?.some(role => 
               role.type === 'project' && 
               (role.role === 'maintainer' || role.role === 'member')
             ) === true;
    }

    case 'task':
      // Tasks cannot be created manually
      return false;

    case 'hub':
      // Only superAdmin can create hubs
      return user.superAdmin === true;

    default:
      return false;
  }
}
