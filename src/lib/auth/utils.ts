// import type { Session } from '@auth/core/types';
import { type DefaultSession } from "@auth/sveltekit";
import type { User as SchemaUser } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { organisationRole, projectRole, organisation, project } from '$lib/db/schema';


interface Session {
  user: {
      roles?: UserRole[];
  } & DefaultSession['user'] & SchemaUser;
}

// Utility functions


export interface UserRole {
  type: 'organisations' | 'projects';
  role: string;
  resourceId: string;
  resourceName: string;
  resourceRef: string;
  parentId?: string;
  parentName?: string;
  parentRef?: string;
  parentType?: 'organisations' | 'projects';
}

/**
 * Fetches and constructs user roles from the database.
 * 
 * @param db - The database instance to query.
 * @param userId - The ID of the user to fetch roles for.
 * @returns A Promise that resolves to an array of UserRole objects.
 * 
 * @remarks
 * This function performs two separate database queries:
 * 1. It fetches organisation roles for the user.
 * 2. It fetches project roles for the user, including associated organisation information.
 * 
 * The results are then mapped into UserRole objects and combined into a single array.
 * 
 * Organisation roles are structured as:
 * - type: 'organisations'
 * - role: The user's role in the organisation
 * - resourceId: The organisation's ID
 * - resourceName: The organisation's name
 * - resourceRef: The organisation's code
 * 
 * Project roles are structured as:
 * - type: 'projects'
 * - role: The user's role in the project
 * - resourceId: The project's ID
 * - resourceName: The project's name
 * - resourceRef: The project's code
 * - parentId: The associated organisation's ID
 * - parentName: The associated organisation's name
 * - parentRef: The associated organisation's code
 * - parentType: Always 'organisations'
 */
export async function getUserRoles(db: any, userId: string): Promise<UserRole[]> {
  const userRoles: UserRole[] = [];

  // Fetch organisation roles
  const orgRoles = await db
    .select({
      role: organisationRole.role,
      organisationId: organisation.id,
      organisationName: organisation.name,
      organisationRef: organisation.code
    })
    .from(organisationRole)
    .innerJoin(organisation, eq(organisationRole.organisationId, organisation.id))
    .where(eq(organisationRole.userId, userId));

  userRoles.push(
    ...orgRoles.map(
      (role: {
        role: string;
        organisationId: string;
        organisationName: string;
        organisationRef: string;
      }) => ({
        type: 'organisations' as const,
        role: role.role,
        resourceId: role.organisationId,
        resourceName: role.organisationName,
        resourceRef: role.organisationRef
      })
    )
  );

  // Fetch project roles
  const projRoles = await db
    .select({
      role: projectRole.role,
      projectId: project.id,
      projectName: project.name,
      projectRef: project.code,
      organisationId: project.organisationId,
      organisationName: organisation.name,
      organisationRef: organisation.code
    })
    .from(projectRole)
    .innerJoin(project, eq(projectRole.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(eq(projectRole.userId, userId));

  userRoles.push(
    ...projRoles.map(
      (role: {
        role: string;
        projectId: string;
        projectName: string;
        projectRef: string;
        organisationId: string;
        organisationName: string;
        organisationRef: string;
      }) => ({
        type: 'projects' as const,
        role: role.role,
        resourceId: role.projectId,
        resourceName: role.projectName,
        resourceRef: role.projectRef,
        parentId: role.organisationId,
        parentName: role.organisationName,
        parentRef: role.organisationRef,
        parentType: 'organisations' as const
      })
    )
  );

  return userRoles;
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
  return session?.user?.roles?.some((role: UserRole) => permittedRoles.includes(role.type)) || false;
}
