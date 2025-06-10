// SVELTE
import { error } from '@sveltejs/kit';
// FORMS
import { superValidate } from 'sveltekit-superforms';
import {
  getDatabase,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  logZodError
} from '$lib/api';
// SCHEMA
import { hub } from '$lib/db/schema/index';
// DB
import { createHub, listHubs } from '$lib/db/services/hub';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { HubInsertAPI } from '$lib/db/zod';
// SERVICES
import {
  hubCollectionWithRelations,
  getHubQueryContext,
  toFormShape,
  toResponseShape
} from '$lib/api/services/hub';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type { HubNew, Hub, ResourceType } from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE: ResourceType = 'hub';
const RESOURCE_PATH = 'hubs';

/********************
 *  LIST
 ************/

/**
 * Lists hubs - SuperAdmin only
 */
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user } = await getDatabase(locals, platform);

  // ASSERT : SuperAdmin only for hub management
  if (!user?.superAdmin) {
    return error(403, 'SuperAdmin access required');
  }

  // ASSERT : Valid query parameters
  const queryParams = isValidQueryParamsOrError(hub, url) as Record<
    string,
    string | string[]
  >;

  try {
    const { conditions } = getHubQueryContext(queryParams);

    // DB : List all hubs
    const result = await listHubs(db, hubCollectionWithRelations, conditions);

    // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async (hub) => {
        return await toResponseShape(hub, true);
      })
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Hub list error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Creates a new hub - SuperAdmin only
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user } = await getDatabase(locals, platform);

  // ASSERT : SuperAdmin only for hub management
  if (!user?.superAdmin) {
    return error(403, 'SuperAdmin access required');
  }

  try {
    // ASSERT : Valid form
    const formData: HubNew = await request.json();
    const form = (await superValidate(
      formData,
      // @ts-ignore - ZOD : Fix SuperForm type error
      zod(HubInsertAPI)
    )) as SuperValidated<HubNew>;

    // RETURN : early if the form is not valid
    if (!form.valid) {
      // @ts-ignore - ZOD : Fix SuperForm type error
      return SuperFormResponse<Hub>(form);
    }

    // DB : Create the hub
    const createdHub = await createHub(db, form.data);

    // FORM : Rebuild the form data
    const updatedForm = await toFormShape(createdHub);

    // HTTP : 201 JSON
    // @ts-ignore - ZOD : Fix SuperForm type error
    return SuperFormResponse<Hub>(updatedForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    logZodError(err, 'Hub create error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create');
  }
};
