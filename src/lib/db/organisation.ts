import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
// SCHEMA
import { organisationRole, organisationI18n, organisation } from '$lib/db/schema';
// ZOD
import { NewOrganisationReqBody, OrganisationBase, OrganisationReqBody, NewOrganisationReqBase } from '$lib/db/zod';
// TYPES
import type { Organisation, OrganisationI18n, OrganisationI18nKeyed, OrganisationRole, OrganisationRoleKeyed } from '$lib/types';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { TargetLang, Id } from '$lib/types';
type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;

// CREATE / UPDATE

export const createOrganisation = async (db: Database, data: Organisation) => {
  const [insertedOrganisation] = await db
    .insert(organisation)
    .values({ ...data })
    .returning();

  if (!insertedOrganisation) {
    return error(404, 'Organisation has stepped through the looking glass');
  }

  return insertedOrganisation;
};

export const updateOrganisation = async (db: Database, data: Organisation, ref: string) => {
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
  translations: Record<TargetLang, OrganisationI18n>,
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
  userRoles: Record<Id, OrganisationRole>,
  organisationId: string
) => {
  const userRolesToInsert = Object.entries(userRoles).map(([userId, role]) => ({
    ...role,
    organisationId,
    userId
  }));

  return await db.insert(organisationRole).values(userRolesToInsert).returning();
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

export const extractEntities = (formData: Organisation) => {
  let formTranslations: Record<TargetLang, OrganisationI18n> = formData.translations;
  let formUserRoles: Record<Id, OrganisationRole> = formData.userRoles;
  console.log('baseOrganisation', formData);

  let baseOrganisation = NewOrganisationReqBody.parse(formData);

    
  return { baseOrganisation, formTranslations, formUserRoles };
};

export const rebuildFormData = async (
  organisation: Organisation,
  translations: OrganisationI18nKeyed[],
  userRoles: OrganisationRoleKeyed[]
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
    zod(OrganisationReqBody)
  );
};
