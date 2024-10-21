import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError, SuperFormResponseOrError } from '$lib/api';
import { organisationRole, organisationI18n } from '$lib/db/schema';
import { hierarchicalResourceQuery } from '$lib/db';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
// DB
import {
  createOrganisation,
  createTranslations,
  createUserRoles,
  rebuildFormData,
  extractEntities
} from '$lib/db/organisation';
// ZOD
import { NewOrganisationReqBody, OrganisationReqBody } from '$lib/db/zod';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

// TYPES
import type { Organisation } from '$lib/types';
type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;

const RESOURCE_TYPE = 'organisation';
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
  console.log('POST');
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: Organisation = await request.json();
    console.log('step 2');
    const form = await superValidate(formData, zod(NewOrganisationReqBody));
    console.log('step 3');

    if (!form.valid) {
      // If validation fails, return a 400 response with the validation errors
      return SuperFormResponseOrError(form, 400);
    }
    console.log('step 4');
    const { baseOrganisation, formTranslations, formUserRoles } = extractEntities(form.data);
    console.log('step 5');
    const createdOrganisation = await createOrganisation(db, baseOrganisation);
    console.log('step 6');
    const createdTranslations = await createTranslations(
      db,
      formTranslations,
      createdOrganisation.id
    );
    console.log('step 7');
    const createdUserRoles = await createUserRoles(db, formUserRoles, createdOrganisation.id);
    console.log('step 8');
    const rebuildForm = await rebuildFormData(
      createdOrganisation,
      createdTranslations,
      createdUserRoles
    );
    console.log('step 9');
    return SuperFormResponseOrError(rebuildForm);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to create organisation');
  }
};
