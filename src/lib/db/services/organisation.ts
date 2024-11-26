import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { organisation, organisationI18n, organisationRole, user } from '../schema';
import { OrganisationInsert, OrganisationInsertAPI, OrganisationUpdate, OrganisationUpdateAPI } from '../zod';
import { toNestedTranslations, updatePartial } from '..';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  NewOrganisationDB,
  OrganisationDB,
  TargetLang,
  NewOrganisationI18n,
  OrganisationI18n,
  NewOrganisationRole,
  OrganisationRole,
  NewOrganisation,
  Organisation,
} from '$lib/types';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;
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
    return error(404, `Organisation <code>${ref}</code> has stepped through the looking glass`);
  }

  return updatedOrganisation;
};

export const patchOrganisation = async (db: Database, ref: string, data: Partial<OrganisationDB>, refType: 'id' | 'code') => {
  return await updatePartial(db, organisation, ref, refType, data);
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
  userRoles: NewOrganisationRole[],
  organisationId: string
) => {
  const userRolesToInsert = userRoles.map((role) => ({
    ...role,
    organisationId
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
  userRoles: OrganisationRole[],
  organisationId: string
) => {
  await db.delete(organisationRole).where(eq(organisationRole.organisationId, organisationId));
  return await createUserRoles(db, userRoles, organisationId);
};
// UTILS

export const extractEntitiesToInsert = (formData: NewOrganisation) => {
  let baseOrganisation = OrganisationInsert.parse(formData);
  let formTranslations: Record<TargetLang, NewOrganisationI18n> = formData.translations;
  let formUserRoles: NewOrganisationRole[] = formData.userRoles;
  return { baseOrganisation, formTranslations, formUserRoles };
};

export const extractEntitiesToUpdate = (formData: Organisation) => {
  let baseOrganisation = OrganisationUpdate.parse(formData);
  let formTranslations: Record<TargetLang, OrganisationI18n> = formData.translations;
  let formUserRoles: OrganisationRole[] = formData.userRoles;
  return { baseOrganisation, formTranslations, formUserRoles };
};

export const rebuildFormData = async (
  organisation: OrganisationDB,
  translations: OrganisationI18n[],
  userRoles: OrganisationRole[]
) => {
  const formData : Organisation = {
    ...organisation,
    translations: toNestedTranslations<OrganisationI18n>(translations),
    userRoles: userRoles
  };
  return await superValidate(formData, zod(OrganisationUpdateAPI));
};
