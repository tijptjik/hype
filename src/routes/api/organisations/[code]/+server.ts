import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import { organisationRole, organisation, organisationI18n } from '$lib/db/schema';
import { getDatabaseOrError, JSONResponseOrError, type AccessStrategyOption } from '$lib/api';
import { hierarchicalEntityQuery } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import { actionResult } from 'sveltekit-superforms';
import type {
  TargetLang,
  Organisation,
  OrganisationI18nKeyed,
  OrganisationI18n,
  OrganisationRoleKeyed,
  OrganisationRole,
  Id
} from '$lib/types';
// ZOD
import { OrganisationReqBody, OrganisationBase } from '$lib/db/zod';
import { fail } from '@sveltejs/kit';

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
      const result = await hierarchicalEntityQuery(
        db,
        params[PUBLIC_IDENTIFIER] as string,
        PUBLIC_IDENTIFIER,
        accessStrategy,
        {
          userRoles: {
            with: {
              user: {
                columns: {
                  email: false,
                  emailVerified: false,
                  createdAt: false,
                  modifiedAt: false
                }
              }
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

  try {
    const formData: Organisation = await request.json();
    const form = await superValidate(formData, zod(OrganisationReqBody));

    // If validation fails, return a 400 response with the validation errors
    if (!form.valid) {
      console.log('VALIDATION FAILED', form);
      return fail(400, { form });
    }

    let formTranslations: Record<TargetLang, OrganisationI18n> = form.data.translations;
    let formUserRoles: Record<Id, OrganisationRole> = formData.userRoles;

    const baseOrganisation = OrganisationBase.parse(formData);

    const [updatedOrganisation] = await db
      .update(organisation)
      .set({ ...baseOrganisation })
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

    // First, delete all existing user roles for this organisation
    await db
      .delete(organisationRole)
      .where(eq(organisationRole.organisationId, updatedOrganisation.id));

    // Prepare all user roles for insertion
    const userRolesToInsert = Object.entries(formUserRoles).map(([userId, formUserRole]) => {
      // Convert API Schema to DB Schema
      // Drop user from the object
      const { user, ...formUserRoleWithoutUser } = formUserRole;
      // Add organisationId and userId
      return {
        ...formUserRoleWithoutUser,
        organisationId: updatedOrganisation.id,
        userId: userId
      } as OrganisationRoleKeyed;
    });

    // Insert all user roles at once
    const modifiedUserRoles = await db
      .insert(organisationRole)
      .values(userRolesToInsert)
      .returning();

    // Reduce translations to a single object with language as key
    if (modifiedTranslations) {
      formTranslations = modifiedTranslations.reduce(
        (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
          const { lang, ...translationWithoutLang } = translation;
          acc[lang] = translationWithoutLang;
          return acc;
        },
        {}
      ) as Record<TargetLang, OrganisationI18n>;
    }
    if (modifiedUserRoles) {
      formUserRoles = modifiedUserRoles.reduce(
        (acc: Record<string, Record<string, any>>, user: Record<string, any>) => {
          const { userId, ...userWithoutId } = user;
          acc[userId] = userWithoutId;
          return acc;
        },
        {}
      ) as Record<Id, OrganisationRole>;
    }

    const rebuildForm = await superValidate(
      {
        ...updatedOrganisation,
        translations: formTranslations,
        userRoles: formUserRoles
      },
      zod(OrganisationReqBody)
    );

    return actionResult('success', rebuildForm, 200);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to update organisation');
  }
};
