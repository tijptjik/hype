import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import {
  organisationRole,
  OrganisationSchema,
  OrganisationDBSchema,
  organisation,
  organisationI18n,
  OrganisationI18n
} from '$lib/db/schema';
import { getDatabaseOrError, JSONResponseOrError, type AccessStrategyOption } from '$lib/api';
import { genericEntityQuery } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { actionResult } from 'sveltekit-superforms';
import type { TargetLang } from '$lib/types';

// Infer the type of OrganisationSchema
type OrganisationDBType = z.infer<typeof OrganisationDBSchema>;
type OrganisationType = z.infer<typeof OrganisationSchema>;
type OrganisationI18nType = z.infer<typeof OrganisationI18n>;

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
  try {
    // DB : Build & Execute Query
    const result = await genericEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        userRoles: true,
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
};

//   try {
//     // DB : Build & Execute Query
//     // @ts-ignore
//     console.info('Searching for', params.code);
//     const result = await db.query.organisation.findFirst({
//       // @ts-ignore
//       where: eq(organisation.code, params.code),
//       with: {
//         translations: true
//       }
//     });

//     // HTTP : 200 JSON or 404
//     // Always return { form }
//     return JSONResponseOrError(result);
//   } catch (e) {
//     // DB : Query Error
//     console.error('Database query error:', e);
//     // HTTP : 500 Error
//     return error(500, 'Dust Accumulation Critical');
//   }
// };

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: OrganisationType = await request.json();
    const formTranslations: Record<TargetLang, Omit<OrganisationI18nType, 'lang'>> = formData.translations || {};

    delete formData.translations;

    console.debug('formData', formData);
    console.debug('translations', formTranslations);

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
      const translation = { ...formTranslation, lang: lang as 'zh-hant' | 'zh-hans' } as OrganisationI18nType;
      const existingTranslation = await db.query.organisationI18n.findFirst({
        where: and(
          eq(organisationI18n.organisationId, translation.organisationId),
          eq(organisationI18n.lang, lang as 'zh-hant' | 'zh-hans')
        )
      });

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
      } else {
        const [insertedTranslation] = await db
          .insert(organisationI18n)
          .values(translation)
          .returning();
        modifiedTranslations.push(insertedTranslation);
      }
    }

    const rebuildForm = await superValidate({
      ...updatedOrganisation,
      translations: modifiedTranslations
    },
    zod(OrganisationSchema)
    );

    console.debug('rebuildForm', rebuildForm);

    return actionResult('success', rebuildForm, 200);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to update organisation');
  }
};
