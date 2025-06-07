// DRIZZLE
import { and, eq, SQL } from 'drizzle-orm';
// FORMS
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
// SCHEMA
import {
  project,
  projectI18n,
  projectRole,
  organisationRole,
  feature
} from '../schema';
// AUTH
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user';
// DB
import { toLocaleMap, toRelatedRecords } from '..';
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { ProjectAPI, ProjectCollectionAPI } from '../zod';
// SERVICES
import { createPropertiesWithRelated, updatePropertiesWithRelated } from './property';
import { getProjectHubFilter } from './hub';
// TYPES
import type {
  ProjectDBNew,
  ProjectDB,
  ProjectI18n,
  ProjectI18nDB,
  ProjectI18nNew,
  ProjectI18nPartial,
  Id,
  ProjectRoleNew,
  Project,
  Property,
  PropertyNew,
  Database,
  Locale,
  ProjectNew,
  ProjectDBPartial,
  OrganisationRolePartialExtra,
  PropertyValueI18nNew,
  PropertyI18nNew,
  ProjectDBRaw,
  ProjectRoleDB,
  PropertyRaw,
  HubOpts
} from '$lib/types';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listProjects
//    - getProject
//    - createProject
//    - updateProject
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createI18n
//    - updateI18n
//    - ensureOrganisationMembership
//    - createMaintainerRoles
//    - updateMaintainerRoles
//
// 3. CRUD :: ORCHESTRATION
//    - createProjectWithRelated
//    - updateProjectWithRelated
//
// 4. ROLES
//    - listMaintainerRoles
//    - mergeOrganisationRoles
//
// 5. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//
// 6. UTILS :: LOOKUPS
//    - getProjectForFeatureId
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

export const listProjects = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
) : Promise<ProjectDBRaw[]> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getProjectHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.project.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

export const getProject = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<ProjectDBRaw | undefined> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getProjectHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.project.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

/**
 * Creates a new project in the database
 * @param db - The database instance
 * @param data - The project data to insert
 * @returns The newly created project
 * @throws {Error} If the project creation fails
 */
export const createProject = async (
  db: Database,
  data: ProjectDBNew
): Promise<ProjectDB> => await insert(db, project, data);

/**
 * Updates an existing project in the database
 * @param db - The database instance
 * @param data - The updated project data
 * @param ref - The project code reference
 * @returns The updated project
 * @throws {Error} If the project update fails or project is not found
 */
export const updateProject = async (
  db: Database,
  data: ProjectDBPartial,
  ref: string
): Promise<ProjectDB> => await update(db, project, data, project.code, ref);

/********************
 *  2. CRUD :: RELATIONAL OPERATIONS
 ************/

/**
 * Creates relational i18n records for a project
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param projectId - The ID of the project
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, ProjectI18nNew>,
  projectId: string
): Promise<ProjectI18nDB[]> => {
  return await insertManyRelated(
    db,
    projectI18n,
    toRelatedRecords(i18n, 'projectId', projectId, 'locale') as any,
    'projectId',
    projectId
  );
};

/**
 * Updates translations for a project by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param projectId - The ID of the project
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, ProjectI18nPartial>,
  projectId: string
): Promise<ProjectI18nDB[]> => {
  return await replaceManyRelated(
    db,
    projectI18n,
    toRelatedRecords(i18n, 'projectId', projectId, 'locale') as any,
    projectI18n.projectId,
    projectId
  );
};

/**
 * Ensures users are added as members to the organisation if they're not already
 * @param db - The database instance
 * @param maintainerRoles - Array of maintainer roles
 * @param organisationId - The ID of the organisation
 */
const ensureOrganisationMembership = async (
  db: Database,
  maintainerRoles: ProjectRoleNew[],
  organisationId: string
) => {
  // Get existing organization roles
  const orgRoles = await db
    .select({ userId: organisationRole.userId })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, organisationId));

  const existingOrgUserIds = orgRoles.map((role) => role.userId);

  // Find users that need to be added to organization
  const newOrgUsers = maintainerRoles
    .map((role) => role.userId)
    .filter((userId) => !existingOrgUserIds.includes(userId));

  // Add new users to organization role if needed
  if (newOrgUsers.length > 0) {
    await db.insert(organisationRole).values(
      newOrgUsers.map((userId) => ({
        userId,
        organisationId,
        role: 'member' as const
      }))
    );
  }
};

/**
 * Creates maintainer roles for a project
 * Also ensures that new maintainers are added as members to the parent organisation
 * @param db - The database instance
 * @param maintainerRoles - Array of new maintainer roles to create
 * @param projectId - The ID of the project
 * @param organisationId - The ID of the parent organisation
 * @returns Array of created maintainer roles with associated user information
 */
export const createMaintainerRoles = async (
  db: Database,
  maintainerRoles: ProjectRoleNew[],
  projectId: string,
  organisationId: string
): Promise<ProjectRoleNew[]> => {
  // Ensure users are members of the organisation
  await ensureOrganisationMembership(db, maintainerRoles, organisationId);

  return await insertManyRelated(
    db,
    projectRole,
    maintainerRoles as ProjectRoleDB[],
    'projectId',
    projectId
  );
};

/**
 * Updates maintainer roles for a project by deleting existing ones and creating new ones
 * Also ensures that new maintainers are added as members to the parent organisation
 * @param db - The database instance
 * @param maintainerRoles - Array of maintainer roles to update
 * @param projectId - The ID of the project
 * @param organisationId - The ID of the parent organisation
 * @returns Array of updated maintainer roles with associated user information
 */
export const updateMaintainerRoles = async (
  db: Database,
  maintainerRoles: ProjectRoleNew[],
  projectId: Id,
  organisationId: Id
) => {
  // Ensure users are members of the organisation
  await ensureOrganisationMembership(db, maintainerRoles, organisationId);

  // Now proceed with updating project roles
  return await replaceManyRelated(
    db,
    projectRole,
    maintainerRoles as ProjectRoleDB[],
    projectRole.projectId,
    projectId
  );
};

// ═══════════════════════
// 3. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new project with translations, maintainer roles, and properties
 * @param db - The database instance
 * @param data - The project data to insert
 * @returns The newly created project with related data
 */
export const createProjectWithRelated = async (db: Database, data: ProjectNew) => {
  const project = await createProject(db, data);
  const i18n = await createI18n(
    db,
    data.i18n as Record<Locale, ProjectI18nNew>,
    project.id
  );
  await createMaintainerRoles(
    db,
    data.maintainerRoles as ProjectRoleDB[],
    project.id,
    project.organisationId
  );
  const maintainerRoles = await listMaintainerRoles(db, project.id);

  let properties: Property[] = [];
  if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
    properties = await createPropertiesWithRelated(
      db,
      data.properties as PropertyNew[],
      project.id
    );
  }

  return { ...project, i18n, maintainerRoles, properties };
};

/**
 * Updates a project with translations, maintainer roles, and properties
 * @param db - The database instance
 * @param data - The project data to update
 * @param lookupCode - Optional code to lookup the project (defaults to data.code)
 * @returns The updated project with related data
 */
export const updateProjectWithRelated = async (
  db: Database,
  data: Project,
  lookupCode?: string
) => {
  const codeToUse = lookupCode || data.code;
  const project = await updateProject(db, data, codeToUse);
  const i18n = await updateI18n(db, data.i18n, project.id);
  await updateMaintainerRoles(
    db,
    data.maintainerRoles,
    project.id,
    project.organisationId
  );
  const maintainerRoles = await listMaintainerRoles(db, project.id);

  let properties: Property[] = [];
  // properties can be null in an update if none are sent, or empty array to delete all
  if (data.properties) {
    properties = await updatePropertiesWithRelated(db, data.properties, project.id);
  }

  return { ...project, i18n, maintainerRoles, properties };
};

/**
 * Reads maintainer roles for a project
 * @param db - The database instance
 * @param projectId - The ID of the project
 * @returns Array of maintainer roles with associated user information
 */
export const listMaintainerRoles = async (db: Database, projectId: string) => {
  return await db.query.projectRole.findMany({
    with: {
      user: true
    },
    where: eq(projectRole.projectId, projectId)
  });
};

// ═══════════════════════
// 4. ROLES
// ═══════════════════════

/**
 * Rebuilds form data from database entities
 * @param project - The project database entity
 * @param translations - Array of project translations
 * @param maintainerRoles - Array of project maintainer roles
 * @param properties - Array of project properties
 * @returns Validated form data
 */
export const toFormShape = async (
  project: ProjectDB,
  i18n: ProjectI18nNew[],
  maintainerRoles: ProjectRoleNew[],
  properties: PropertyNew[]
): Promise<SuperValidated<Project>> => {
  const formData: Project = {
    ...project,
    i18n: toLocaleMap<ProjectI18n>(i18n) as any,
    maintainerRoles,
    properties: properties
      .sort((a, b) => {
        // Primary sort: 'classifier' before 'specifier'
        if (a.type === 'classifier' && b.type === 'specifier') {
          return -1;
        }
        if (a.type === 'specifier' && b.type === 'classifier') {
          return 1;
        }
        // Secondary sort: by rank (existing logic)
        return (a.rank ?? 0) - (b.rank ?? 0);
      })
      .map((property) => ({
        ...property,
        i18n: toLocaleMap<PropertyI18n>(property.i18n) as any,
        values: property.values.map((value) => ({
          ...value,
          i18n: toLocaleMap<PropertyValueI18nNew>(value.i18n) as any
        }))
      })) as Property[]
  };
  // @ts-ignore TODO - Fix Zod type error
  const form = await superValidate(formData, zod(ProjectAPI) as any);
  return form as SuperValidated<Project>;
};

/**
 * Builds response data from database entities
 * @param project - The project database entity
 * @param translations - Array of project translations
 * @param maintainerRoles - Array of project maintainer roles
 * @param properties - Array of project properties
 * @returns A parsed response shape
 */
export const toResponseShape = async (
  project: ProjectDB,
  i18n: ProjectI18nNew[],
  maintainerRoles: ProjectRoleNew[],
  properties: PropertyRaw[],
  isCollection: boolean = false
) => {
  const data: any = {
    ...project,
    i18n: toLocaleMap<ProjectI18n>(i18n) as any,
    maintainerRoles,
    properties: properties.map((property: PropertyRaw) => ({
      ...property,
      // Only transform i18n if it has actual data, otherwise set to null
      i18n:
        Array.isArray(property.i18n) && property.i18n.length > 0
          ? (toLocaleMap<PropertyI18n>(property.i18n) as any)
          : Array.isArray(property.i18n)
            ? undefined
            : property.i18n,
      values: property.values?.map((value) => ({
        ...value,
        // Only transform i18n if it has actual data, otherwise set to null
        i18n:
          Array.isArray(value.i18n) && value.i18n.length > 0
            ? (toLocaleMap<PropertyValueI18nNew>(value.i18n) as any)
            : Array.isArray(value.i18n)
              ? undefined
              : value.i18n
      }))
    })) as PropertyNew[]
  };
  return isCollection
    ? (ProjectCollectionAPI.parse(data) as Project)
    : (ProjectAPI.parse(data) as Project);
};

// ═══════════════════════
// 5. UTILS :: LOOKUPS
// ═══════════════════════

/**
 * Retrieves the project associated with a feature ID
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @returns The associated project or undefined if not found
 */
export const getProjectForFeatureId = async (
  db: Database,
  featureId: Id
): Promise<ProjectDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: true } } }
  });

  return record?.layer?.project || undefined;
};

// ═══════════════════════
// 6. UTILS :: MERGE
// ═══════════════════════

export async function mergeOrganisationRoles(
  db: any,
  result: Project
): Promise<Project> {
  // Get organization roles for the project's organization
  const orgRoles = await db.query.organisationRole.findMany({
    where: and(eq(organisationRole.organisationId, result.organisationId)),
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected
      }
    }
  });

  // Get existing maintainer user IDs
  const existingUserIds =
    result.maintainerRoles.map((userRole) => userRole.userId) || [];

  // Add organization users that aren't already maintainers
  orgRoles.forEach((orgRole: OrganisationRolePartialExtra) => {
    if (!existingUserIds.includes(orgRole.userId)) {
      result.maintainerRoles.push({
        projectId: result.id,
        userId: orgRole.userId,
        role: 'member',
        user: orgRole.user
      });
    }
  });

  return result;
}
