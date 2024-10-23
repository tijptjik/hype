import type { NewOrganisationDB, OrganisationDB, TargetLang, NewOrganisationI18n, OrganisationI18n, Id, NewOrganisationRole, OrganisationRole, NewOrganisation, Organisation, OrganisationI18nDB, OrganisationRoleDB } from '$lib/types';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { organisation, organisationI18n, organisationRole, user } from '../schema';
import { OrganisationInsert, OrganisationUpdate, OrganisationUpdateAPI } from '../zod';


export type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;
// CREATE / UPDATE

export const createOrganisation = async (db: Database, data: NewOrganisationDB) => {
  const [insertedOrganisation] = await db
    .insert(organisation)
    .values({ ...data })
    .returning();

  if (!insertedOrganisation) {
    return error(404, 'Organisation has stepped through the looking glass');
  }

  return insertedOrganisation;
};

export const updateOrganisation = async (db: Database, data: OrganisationDB, ref: string) => {
  const [updatedOrganisation] = await db
    .update(organisation)
    .set({ ...data })
    .where(eq(organisation.code, ref))
    .returning();

  if (!updatedOrganisation) {
    return error(404, 'Organisation has stepped through the looking glass');
  }

  return updatedOrganisation;
};

export const createTranslations = async (
  db: Database,
  translations: Record<TargetLang, NewOrganisationI18n>,
  organisationId: string
) => {
  const translationsToInsert = Object.entries(translations).map(([lang, translation]) => ({
    ...translation,
    organisationId,
    lang: lang as 'zh-hant' | 'zh-hans'
  }));

  return await db.insert(organisationI18n).values(translationsToInsert).returning();
};

export const updateTranslations = async (
  db: Database,
  translations: Record<TargetLang, OrganisationI18n>,
  organisationId: string
) => {
  await db.delete(organisationI18n).where(eq(organisationI18n.organisationId, organisationId));
  return await createTranslations(db, translations, organisationId);
};

export const createUserRoles = async (
  db: Database,
  userRoles: Record<Id, NewOrganisationRole>,
  organisationId: string
) => {
  const userRolesToInsert = Object.entries(userRoles).map(([userId, role]) => ({
    ...role,
    organisationId,
    userId
  }));

  await db.insert(organisationRole).values(userRolesToInsert).returning();

  const rolesWithUsers = await db
    .select({
      role: organisationRole,
      user: user
    })
    .from(organisationRole)
    .innerJoin(user, eq(organisationRole.userId, user.id))
    .where(eq(organisationRole.organisationId, organisationId));

  return Object.values(rolesWithUsers).map((role) => ({
    ...role.role,
    user: role.user
  }));
};

export const updateUserRoles = async (
  db: Database,
  userRoles: Record<Id, OrganisationRole>,
  organisationId: string
) => {
  await db.delete(organisationRole).where(eq(organisationRole.organisationId, organisationId));
  return await createUserRoles(db, userRoles, organisationId);
};
// UTILS

export const extractEntitiesToInsert = (formData: NewOrganisation) => {
  let baseOrganisation = OrganisationInsert.parse(formData);
  let formTranslations: Record<TargetLang, NewOrganisationI18n> = formData.translations;
  let formUserRoles: Record<Id, NewOrganisationRole> = formData.userRoles;
  return { baseOrganisation, formTranslations, formUserRoles };
};

export const extractEntitiesToUpdate = (formData: Organisation) => {
  let baseOrganisation = OrganisationUpdate.parse(formData);
  let formTranslations: Record<TargetLang, OrganisationI18n> = formData.translations;
  let formUserRoles: Record<Id, OrganisationRole> = formData.userRoles;
  return { baseOrganisation, formTranslations, formUserRoles };
};

export const rebuildFormData = async (
  organisation: OrganisationDB,
  translations: OrganisationI18nDB[],
  userRoles: OrganisationRoleDB[]
) => {
  const formTranslations = translations.reduce(
    (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
      const { lang, ...translationWithoutLang } = translation;
      acc[lang] = translationWithoutLang;
      return acc;
    },
    {}
  ) as Record<TargetLang, OrganisationI18n>;

  const formUserRoles = userRoles.reduce(
    (acc: Record<string, Record<string, any>>, user: Record<string, any>) => {
      const { userId, ...userWithoutId } = user;
      acc[userId] = userWithoutId;
      return acc;
    },
    {}
  ) as Record<Id, OrganisationRole>;

  return await superValidate(
    {
      ...organisation,
      translations: formTranslations,
      userRoles: formUserRoles
    },
    zod(OrganisationUpdateAPI)
  );
};
