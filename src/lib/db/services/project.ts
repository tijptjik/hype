import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { project, projectI18n, projectRole, user, organisationRole, property } from '../schema';
import { ProjectInsert, ProjectUpdate, ProjectUpdateAPI } from '../zod';
import { toNestedTranslations } from '..';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  NewProjectDB,
  ProjectDB,
  TargetLang,
  NewProjectI18n,
  ProjectI18n,
  Id,
  NewProjectRole,
  ProjectRole,
  NewProject,
  FormTranslations,
  FormRelatedUsers,
  Project,
  OrganisationRole,
  FormRelatedProperties,
  NewProperty,
  Property,
  PropertyDB
} from '$lib/types';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;
// CREATE / UPDATE

export const createProject = async (db: Database, data: NewProjectDB) => {
  const [insertedProject] = await db
    .insert(project)
    .values({ ...data })
    .returning();

  if (!insertedProject) {
    return error(404, 'Project has stepped through the looking glass');
  }

  return insertedProject;
};

export const updateProject = async (db: Database, data: ProjectDB, ref: string) => {
  const [updatedProject] = await db
    .update(project)
    .set({ ...data })
    .where(eq(project.code, ref))
    .returning();

  if (!updatedProject) {
    return error(404, 'Project has stepped through the looking glass');
  }

  return updatedProject;
};

export const createTranslations = async (
  db: Database,
  translations: Record<TargetLang, NewProjectI18n>,
  projectId: string
) => {
  const translationsToInsert = Object.entries(translations).map(([lang, translation]) => ({
    ...translation,
    projectId,
    lang: lang as 'zh-hant' | 'zh-hans'
  }));

  return await db.insert(projectI18n).values(translationsToInsert).returning();
};

export const updateTranslations = async (
  db: Database,
  translations: Record<TargetLang, ProjectI18n>,
  projectId: string
) => {
  await db.delete(projectI18n).where(eq(projectI18n.projectId, projectId));
  return await createTranslations(db, translations, projectId);
};

export const createMaintainerRoles = async (
  db: Database,
  maintainerRoles: NewProjectRole[],
  projectId: string
) => {
  // Filter out members -- they are handled by the organisation roles
  const maintainerRolesToInsert = maintainerRoles.map(role => ({
    ...role,
    projectId,
  })).filter(role => role.role !== 'member');

  await db.insert(projectRole).values(maintainerRolesToInsert).returning();

  const rolesWithUsers = await db
    .select({
      role: projectRole,
      user: user
    })
    .from(projectRole)
    .innerJoin(user, eq(projectRole.userId, user.id))
    .where(eq(projectRole.projectId, projectId));

  return Object.values(rolesWithUsers).map((role) => ({
    ...role.role,
    user: role.user
  }));
};

export const updateMaintainerRoles = async (
  db: Database,
  maintainerRoles: ProjectRole[],
  projectId: Id,
  organisationId: Id
) => {
  // Get existing organization roles
  const orgRoles = await db
    .select({ userId: organisationRole.userId })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, organisationId));

  const existingOrgUserIds = orgRoles.map(role => role.userId);

  // Find users that need to be added to organization
  const newOrgUsers = maintainerRoles.map(role => role.userId).filter(userId => !existingOrgUserIds.includes(userId));

  // Add new users to organization role if needed
  if (newOrgUsers.length > 0) {
    await db.insert(organisationRole).values(
      newOrgUsers.map(userId => ({
        userId,
        organisationId,
        role: 'member' as OrganisationRole['role']
      }))
    );
  }

  // Now proceed with updating project roles
  await db.delete(projectRole).where(eq(projectRole.projectId, projectId));
  return await createMaintainerRoles(db, maintainerRoles, projectId);
};

// UTILS

export const extractEntitiesToInsert = (formData: NewProject) => {
  let baseProject = ProjectInsert.parse(formData);
  let formTranslations: FormTranslations<NewProjectI18n> = formData.translations;
  let formMaintainerRoles: FormRelatedUsers<NewProjectRole> = formData.maintainerRoles;
  let formProperties: FormRelatedProperties<NewProperty> = formData.properties;
  return { baseProject, formTranslations, formMaintainerRoles, formProperties };
};

export const extractEntitiesToUpdate = (formData: Project) => {
  let baseProject = ProjectUpdate.parse(formData);
  let formTranslations: FormTranslations<ProjectI18n> = formData.translations;
  let formMaintainerRoles: FormRelatedUsers<ProjectRole> = formData.maintainerRoles;
  let formProperties: FormRelatedProperties<Property> = formData.properties;
  return { baseProject, formTranslations, formMaintainerRoles, formProperties };
};

export async function mergeOrganizationRoles(db: any, result: Project): Promise<Project> {
  // Get organization roles for the project's organization
  const orgRoles = await db.query.organisationRole.findMany({
    where: and(eq(organisationRole.organisationId, result.organisationId)),
    with: {
      user: {
        columns: {
          // exclude sensitive fields
          email: false,
          emailVerified: false,
          createdAt: false,
          modifiedAt: false
        }
      }
    }
  });

  // Get existing maintainer user IDs
  const existingUserIds = result.maintainerRoles.map((userRole) => userRole.userId) || [];

  // Add organization users that aren't already maintainers
  orgRoles.forEach((orgRole: OrganisationRole) => {
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

export const rebuildFormData = async (
  db: Database,
  project: ProjectDB,
  translations: ProjectI18n[],
  maintainerRoles: ProjectRole[],
  properties: PropertyDB[]
) => {
  let extendedProject = {
    ...project,
    maintainerRoles,
    translations: toNestedTranslations<ProjectI18n>(translations),
    properties
  } as Project;

  const result = await mergeOrganizationRoles(db, extendedProject);

  return await superValidate(result, zod(ProjectUpdateAPI));
};
