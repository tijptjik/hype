// SVELTE
import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
// I18N
import { m } from '$lib/i18n';
// DRIZZLE
import { eq } from 'drizzle-orm';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationInsertAPI, OrganisationInsertSuperAdminAPI } from '$lib/db/zod';
// SCHEMA
import { organisation } from '$lib/db/schema/index';
// DB
import {
  getOrganisation,
  toFormShape,
  updateOrganisation,
  updateOrganisationWithRelated,
  toResponseShape
} from '$lib/db/services/organisation';
// API
import {
  getDatabase,
  JSONResponseOrError,
  SuperFormErrorResponse,
  SuperFormResponse
} from '$lib/api';
import {
  assertPermissionsToUpdateOrganisation,
  getOrganisationQueryContext,
  isAccessLostUponSuccess,
  organisationWithRelations,
  assertCodeUnique
} from '$lib/api/services/organisation';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms/client';
import type {
  Organisation,
  OrganisationDB,
  OrganisationPartial,
  Code
} from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'organisation';
const RESOURCE_PATH = 'organisations';

/********************
 *  READ
 ************/

/**
 * Reads an organisation
 */
export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  try {
    // GET : Context for organisation query
    const { params: queryParams, conditions } = getOrganisationQueryContext(
      user!,
      request,
      {},
      userRoles
    );

    // EXTEND : Add GET identifier (code)
    if (params.code) {
      conditions.push(eq(organisation.code, params.code));
    }

    const result = await getOrganisation(
      db,
      organisationWithRelations,
      conditions,
      locals.hub
    );

    if (!result) {
      return error(404, m.brief_jumpy_firefox_bump({ key: 'Organisation' }));
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result,
      result.i18n,
      result.userRoles,
      false, // isCollection
      user.superAdmin || false // isSuperAdmin
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: PUT
 ************/

/**
 * Replaces an organisation
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form
    const formData: Organisation = await request.json();

    // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
    const updateSchema = user.superAdmin
      ? OrganisationInsertSuperAdminAPI
      : OrganisationInsertAPI;

    // @ts-ignore - FORM : Fix type error
    let form = (await superValidate(
      formData,
      // @ts-ignore - FORM : Fix type error
      zod(updateSchema)
    )) as SuperValidated<Organisation>;

    // ASSERT : Code has (1) not changed, or (2) changed to another unique value
    // Use URL param code for lookup, form code for comparison
    if (params.code !== formData.code) {
      // @ts-ignore - FORM : Fix form type error
      form = await assertCodeUnique(db, form, formData);
    }

    // RETURN : early if the form is not valid
    // @ts-ignore - FORM : Fix SuperForm type error
    if (!form.valid) return SuperFormResponse<Organisation>(form);

    // ASSERT : Permissions to update organisation
    assertPermissionsToUpdateOrganisation(user, request, formData, userRoles);

    // STATE : Will the current user lose access on membership changes.
    const isAccessLost = isAccessLostUponSuccess(user, formData, userRoles);

    // DB : Update the organisation and related data using URL param code for lookup
    const updatedOrganisation = await updateOrganisationWithRelated(
      db,
      form.data,
      params.code
    );

    // FORM : Rebuild the form data
    const updatedForm = await toFormShape(
      updatedOrganisation,
      updatedOrganisation.i18n,
      updatedOrganisation.userRoles,
      user.superAdmin || false
    );

    // STATE : Determine if redirect is needed (only when code changes or access is lost)
    const shouldRedirect = isAccessLost || params.code !== formData.code;

    // HTTP : 200 JSON or 400
    // @ts-ignore - FORM : Fix SuperForm type error
    return SuperFormResponse<Organisation>(
      updatedForm,
      shouldRedirect,
      isAccessLost,
      RESOURCE_PATH
    );
  } catch (err) {
    // DB : Query Error
    console.error('Database query error:', err);
    // HTTP : 500 Error
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates an organisation - only the fields that are provided in the request body.
 * This endpoint is used for updating fields that don't require a full form submission,
 * such as the organisation publish or archive status.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db, user, userRoles } = await getDatabase(locals, platform);
  try {
    // ASSERT : Valid form data
    const newData: OrganisationPartial = await request.json();

    // Get the existing organisation to verify access
    const existing = (await getOrganisation(
      db,
      {},
      [
        eq(organisation.code, params.code as string)
      ],
      locals.hub
    )) as OrganisationDB;

    if (!existing) {
      return error(404, 'Organisation not found');
    }

    // ASSERT : Code has (1) not changed, or (2) changed to another unique value
    // Use URL param code for lookup, form code for comparison
    if ('code' in newData && params.code !== newData.code) {
      // @ts-ignore - FORM : Fix form type error
      form = await assertCodeUnique(db, form, newData);
    }

    // Use assertion functions for access control
    assertPermissionsToUpdateOrganisation(user, request, existing, userRoles);

    // DB : Update only the basic organisation fields (no relations for PATCH)
    const updated = await updateOrganisation(db, newData, params.code as string);

    // DB : Get the updated organisation with all relations for response
    const updatedWithRelations = await getOrganisation(
      db,
      organisationWithRelations,
      [eq(organisation.code, params.code as string)],
      locals.hub
    );

    if (!updatedWithRelations) {
      return error(500, 'Failed to retrieve updated organisation');
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      updatedWithRelations,
      updatedWithRelations.i18n,
      updatedWithRelations.userRoles,
      false, // isCollection
      user!.superAdmin || false // isSuperAdmin
    );

    return json({ type: 'success', data });
  } catch (err) {
    // DB : Query Error
    console.error('Database query error:', err);
    // HTTP : 500 Error
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch');
  }
};
