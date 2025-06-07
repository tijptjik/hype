// SVELTE
import { error, json } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { HubUpdateAPI } from '$lib/db/zod';
// SCHEMA
import { hub } from '$lib/db/schema';
// DB
import { getHub, updateHub } from '$lib/db/services/hub';
// API
import {
  getDatabase,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  logZodError,
  isValidQueryParamsOrError
} from '$lib/api';
// SERVICES
import {
  hubEntityWithRelations,
  getHubQueryContext,
  toResponseShape,
  toFormShape
} from '$lib/api/services/hub';
import { assertPermissionsToUpdateHub } from '$lib/api/services/hub';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms/client';
import type { Hub, HubDB, HubPartial } from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'hub';
const RESOURCE_PATH = 'hubs';

/********************
 *  READ
 ************/

/**
 * Reads a hub - SuperAdmin only
 */
export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
  // ASSERT : User logged in
  const { db, session } = await getDatabase(locals, platform);

  // ASSERT : SuperAdmin only for hub management
  if (!session?.user?.superAdmin) {
    return error(403, 'SuperAdmin access required');
  }

  // ASSERT : Valid query parameters
  let queryParams = isValidQueryParamsOrError(hub, url) as Record<
    string,
    string | string[]
  >;

  // CONTEXT : Get the query context
  let { conditions } = getHubQueryContext(queryParams);

  try {
    // Add condition for specific hub code
    conditions.push(eq(hub.code, params.code!));

    // DB : Get the hub
    const result = await getHub(db, hubEntityWithRelations, conditions);

    if (!result) {
      return error(404, 'Hub not found');
    }

    const data = await toResponseShape(result);

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Hub read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: PUT
 ************/

/**
 * Replaces a hub - SuperAdmin only
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session } = await getDatabase(locals, platform);

  // ASSERT : SuperAdmin only for hub management
  if (!session?.user?.superAdmin) {
    return error(403, 'SuperAdmin access required');
  }

  try {
    // ASSERT : Valid form
    const formData: Hub = await request.json();
    let form = (await superValidate(
      formData,
      // @ts-ignore - ZOD : Fix SuperForm type error
      zod(HubUpdateAPI)
    )) as SuperValidated<Hub>;

    // RETURN : early if the form is not valid
    if (!form.valid) {
      // @ts-ignore - ZOD : Fix SuperForm type error
      return SuperFormResponse<Hub>(form);
    }

    // ASSERT : Permissions to update hub
    assertPermissionsToUpdateHub(session);

    // DB : Update the hub
    const updatedHub = await updateHub(db, form.data, params.code!);

    // RESPONSE : Convert to form shape and return
    const updatedForm = await toFormShape(updatedHub);

    // STATE : Determine if redirect is needed (only when code changes)
    const shouldRedirect = formData.code !== params.code;

    // HTTP : 200 JSON or 400
    return SuperFormResponse<Hub>(updatedForm, shouldRedirect, false, RESOURCE_PATH);
  } catch (err) {
    logZodError(err, 'Hub update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a hub - SuperAdmin only
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db, session } = await getDatabase(locals, platform);

  // ASSERT : SuperAdmin only for hub management
  if (!session?.user?.superAdmin) {
    return error(403, 'SuperAdmin access required');
  }

  try {
    // ASSERT : Valid form data
    const newData: HubPartial = await request.json();

    // Get the existing hub to verify it exists
    const conditions = [eq(hub.code, params.code as string)];
    const existing = (await getHub(db, {}, conditions)) as HubDB;

    if (!existing) return error(404, 'Hub not found');

    // ASSERT : Code has (1) not changed, or (2) changed to another unique value
    // Use URL param code for lookup, form code for comparison
    if ('code' in newData && params.code !== newData.code) {
      // @ts-ignore - FORM : Fix form type error
      form = await assertCodeUnique(db, form, newData);
    }

    // ASSERT : Permissions to update hub
    assertPermissionsToUpdateHub(session);

    // DB : Update only the basic hub fields
    const updated = await updateHub(db, newData, params.code as string);

    // Return the updated hub
    return json({ type: 'success', data: updated });
  } catch (err) {
    logZodError(err, 'Hub patch error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch');
  }
};
