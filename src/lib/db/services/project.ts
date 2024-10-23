import type { NewProjectDB, ProjectDB, TargetLang, NewProjectI18n, ProjectI18n, Id, NewProjectRole, ProjectRole, NewProject, FormTranslations, FormRelatedUsers, Project, ProjectI18nDB, ProjectRoleDB } from '$lib/types';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { project, projectI18n, projectRole, user } from '../schema';
import { ProjectInsert, ProjectUpdate, ProjectUpdateAPI } from '../zod';


export type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;
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
  maintainerRoles: Record<Id, NewProjectRole>,
  projectId: string
) => {
  const maintainerRolesToInsert = Object.entries(maintainerRoles).map(([userId, role]) => ({
    ...role,
    projectId,
    userId
  }));

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
  maintainerRoles: Record<Id, ProjectRole>,
  projectId: string
) => {
  await db.delete(projectRole).where(eq(projectRole.projectId, projectId));
  return await createMaintainerRoles(db, maintainerRoles, projectId);
};
// UTILS

export const extractEntitiesToInsert = (formData: NewProject) => {
  let baseProject = ProjectInsert.parse(formData);
  let formTranslations: FormTranslations<NewProjectI18n> = formData.translations;
  let formMaintainerRoles: FormRelatedUsers<NewProjectRole> = formData.maintainerRoles;
  return { baseProject, formTranslations, formMaintainerRoles };
};

export const extractEntitiesToUpdate = (formData: Project) => {
  let baseProject = ProjectUpdate.parse(formData);
  let formTranslations: FormTranslations<ProjectI18n> = formData.translations;
  let formMaintainerRoles: FormRelatedUsers<ProjectRole> = formData.maintainerRoles;
  return { baseProject, formTranslations, formMaintainerRoles };
};

export const rebuildFormData = async (
  project: ProjectDB,
  translations: ProjectI18nDB[],
  maintainerRoles: ProjectRoleDB[]
) => {
  const formTranslations = translations.reduce(
    (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
      const { lang, ...translationWithoutLang } = translation;
      acc[lang] = translationWithoutLang;
      return acc;
    },
    {}
  ) as Record<TargetLang, ProjectI18n>;

  const formMaintainerRoles = maintainerRoles.reduce(
    (acc: Record<string, Record<string, any>>, user: Record<string, any>) => {
      const { userId, ...userWithoutId } = user;
      acc[userId] = userWithoutId;
      return acc;
    },
    {}
  ) as Record<Id, ProjectRole>;

  return await superValidate(
    {
      ...project,
      translations: formTranslations,
      maintainerRoles: formMaintainerRoles
    },
    zod(ProjectUpdateAPI)
  );
};
