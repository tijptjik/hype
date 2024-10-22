import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, type RequestHandler } from '@sveltejs/kit';
import { organisationRole, organisationI18n } from '$lib/db/schema';
import { getDatabaseOrError, JSONResponseOrError, SuperFormResponse, SuperFormErrorResponse, type AccessStrategyOption } from '$lib/api';
import { hierarchicalEntityQuery } from '$lib/db';
// DB
import {
  updateOrganisation,
  updateTranslations,
  updateUserRoles,
  rebuildFormData,
  extractEntitiesToUpdate
} from '$lib/db/organisation';
// ZOD
import { OrganisationUpdateAPI } from '$lib/db/zod';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms/client';
import type { Organisation } from '$lib/types';

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
    return error(500, 'The Old Shall Never Be New Again');
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
    const form = await superValidate(formData, zod(OrganisationUpdateAPI)) as SuperValidated<Organisation>;

    if (!form.valid) {
      // If validation fails, return form with the errors
      return SuperFormResponse(form, 400);
    }

    const { baseOrganisation, formTranslations, formUserRoles } = extractEntitiesToUpdate(form.data as Organisation);
    const updatedOrganisation = await updateOrganisation(db, baseOrganisation, params.code as string);
    const updatedTranslations = await updateTranslations(
      db,
      formTranslations,
      updatedOrganisation.id
    );
    const updatedUserRoles = await updateUserRoles(db, formUserRoles, updatedOrganisation.id);
    const rebuildForm = await rebuildFormData(
      updatedOrganisation,
      updatedTranslations,
      updatedUserRoles
    );

    return SuperFormResponse(rebuildForm);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};
