import { error } from '@sveltejs/kit';
import { actionResult, superValidate, type SuperValidated } from 'sveltekit-superforms';
import { getDatabaseOrError, JSONResponseOrError, SuperFormResponse } from '$lib/api';
// DB
import { hierarchicalResourceQuery } from '$lib/db';
import { organisationRole, organisationI18n } from '$lib/db/schema';
import {
  createOrganisation,
  createTranslations,
  createUserRoles,
  rebuildFormData,
  extractEntitiesToInsert
} from '$lib/db/services/organisation';
import { isFieldUnique } from '$lib/db';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationInsertAPI } from '$lib/db/zod';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { NewOrganisation, Organisation } from '$lib/types';

const RESOURCE_TYPE = 'organisation';
const RESOURCE_PATH = 'organisations';
const ACCESS_STRATEGY = 'ResourceOwn';

export const GET: RequestHandler = async ({ locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // DB : Build & Execute Query
    const result = await hierarchicalResourceQuery(
      db,
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

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: NewOrganisation = await request.json();
    const form = (await superValidate(
      formData,
      zod(OrganisationInsertAPI)
    )) as SuperValidated<Organisation>;

    // Check if the current user will lose access on membership changes
    const userLosesAccess = !Object.keys(form.data.userRoles).includes(userId) && accessStrategy !== 'SuperAdmin'; 
    const codeUnique = await isFieldUnique<Organisation>(db, formData as Organisation, RESOURCE_TYPE, 'code');

    if (!codeUnique) {
      form.valid = false;
      form.errors.code = ['Code already exists'];
    }

    if (!form.valid) {
      return SuperFormResponse<Organisation>(form);
    }

    const { baseOrganisation, formTranslations, formUserRoles } = extractEntitiesToInsert(
      form.data as NewOrganisation
    );
    const createdOrganisation = await createOrganisation(db, baseOrganisation);
    const createdTranslations = await createTranslations(
      db,
      formTranslations,
      createdOrganisation.id
    );
    const createdUserRoles = await createUserRoles(db, formUserRoles, createdOrganisation.id);
    const updatedForm = await rebuildFormData(
      createdOrganisation,
      createdTranslations,
      createdUserRoles
    );
    return SuperFormResponse<Organisation>(updatedForm, true, userLosesAccess, RESOURCE_PATH, 201);
  } catch (err) {
    console.error(err);
    return actionResult('error', 'Failed to create organisation', { status: 500 });
  }
};
