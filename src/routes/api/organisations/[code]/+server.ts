import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import { organisationRole, organisation, organisationI18n } from '$lib/db/schema';
import { getDatabaseOrError, JSONResponseOrError, type AccessStrategyOption } from '$lib/api';
import { genericEntityQuery } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import { actionResult } from 'sveltekit-superforms';
import type {
  TargetLang,
  Organisation,
  OrganisationI18n,
  OrganisationI18nKeyed,
  OrganisationRole,
  OrganisationRoleKeyed
} from '$lib/types';
// ZOD
import {
  OrganisationReqBody,
  OrganisationI18nReqBase,
  OrganisationRoleReqBase,
  OrganisationRoleBase
} from '$lib/db/zod';

const RESOURCE_TYPE = 'organisation';
const ACCESS_STRATEGY = 'EntityOwn' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'code';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  if (params.code !== 'new') {
    try {
      // DB : Build & Execute Query
      const result = await genericEntityQuery(
        db,
        params[PUBLIC_IDENTIFIER] as string,
        PUBLIC_IDENTIFIER,
        accessStrategy,
        {
          userRoles: {
            with: {
              user: true
            }
          },
          translations: true
        },
        userId,
        organisationRole,
        organisationI18n
      );

      // HTTP : 200 JSON or 404
      return JSONResponseOrError(result);
    } catch (e) {
      // DB : Query Error
      console.error('Database query error:', e);
      // HTTP : 500 Error
      return error(500, 'Dust Accumulation Critical');
    }
  } else {
    return error(500, 'The old shall never be new again');
  }
};

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  // TODO : Validate the form data

  try {
    const formData: Organisation = await request.json();
    const formTranslations: OrganisationI18n = formData.translations;
    const formUserRoles: OrganisationRole = formData.userRoles;

    delete formData.translations;
    delete formData.userRoles;

    const [updatedOrganisation] = await db
      .update(organisation)
      .set({ ...formData })
      // @ts-ignore
      .where(eq(organisation.code, params.code))
      .returning();

    if (!updatedOrganisation) {
      return error(404, 'Organisation not found');
    }

    const modifiedTranslations = [];

    for (let [lang, formTranslation] of Object.entries(formTranslations)) {
      // Convert API Schema to DB Schema
      const translation = {
        ...formTranslation,
        lang: lang as 'zh-hant' | 'zh-hans'
      } as OrganisationI18nKeyed;

      // Check if the translation already exists
      const existingTranslation = await db.query.organisationI18n.findFirst({
        where: and(
          eq(organisationI18n.organisationId, translation.organisationId),
          eq(organisationI18n.lang, lang as 'zh-hant' | 'zh-hans')
        )
      });

      // If it does, update it
      if (existingTranslation) {
        const [updatedTranslation] = await db
          .update(organisationI18n)
          .set(translation)
          .where(
            and(
              eq(organisationI18n.organisationId, translation.organisationId),
              eq(organisationI18n.lang, translation.lang)
            )
          )
          .returning();
        modifiedTranslations.push(updatedTranslation);
        // If it doesn't, insert it
      } else {
        const [insertedTranslation] = await db
          .insert(organisationI18n)
          .values(translation)
          .returning();
        modifiedTranslations.push(insertedTranslation);
      }
    }

    const modifiedUserRoles = [];
    for (let [userId, formUserRole] of Object.entries(formUserRoles)) {
      console.log('formUserRole', formUserRole);
      // Convert API Schema to DB Schema
      // Drop user from the object
      const { user, ...formUserRoleWithoutUser } = formUserRole;
      // Add organisationId and userId
      const userRole = {
        ...formUserRoleWithoutUser,
        organisationId: updatedOrganisation.id,
        userId: userId
      } as OrganisationRoleKeyed;

      const existingUserRole = await db.query.organisationRole.findFirst({
        where: and(
          eq(organisationRole.organisationId, userRole.organisationId),
          eq(organisationRole.userId, userRole.userId)
        )
      });

      if (existingUserRole) {
        const [updatedUserRole] = await db
          .update(organisationRole)
          .set(userRole)
          .where(
            and(
              eq(organisationRole.organisationId, userRole.organisationId),
              eq(organisationRole.userId, userRole.userId)
            )
          )
          .returning();
        modifiedUserRoles.push(updatedUserRole);
      } else {
        const [insertedUserRole] = await db.insert(organisationRole).values(userRole).returning();
        modifiedUserRoles.push(insertedUserRole);
      }
    }

    const rebuildForm = await superValidate(
      {
        ...updatedOrganisation,
        translations: modifiedTranslations,
        userRoles: modifiedUserRoles
      },
      zod(OrganisationReqBody)
    );

    return actionResult('success', rebuildForm, 200);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to update organisation');
  }
};
