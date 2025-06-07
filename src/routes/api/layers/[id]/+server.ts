// SVELTE
import { error, json } from '@sveltejs/kit';
// I18N
import { m } from '$lib/i18n';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// DRIZZLE
import { eq, SQL } from 'drizzle-orm';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { LayerUpdateAPI } from '$lib/db/zod';
// API
import {
  JSONResponseOrError,
  SuperFormErrorResponse,
  getDatabase,
  getPrisms,
  SuperFormResponse,
  logZodError
} from '$lib/api';
import {
  assertPermissionsToUpdateLayer,
  getLayerQueryContext,
  layerEntityWithRelations
} from '$lib/api/services/layer';
// DB
import { layer } from '$lib/db/schema';
import {
  getLayer,
  updateLayerWithRelated,
  toFormShape,
  toResponseShape,
  updateLayer
} from '$lib/db/services/layer';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type {
  Layer,
  LayerDB,
  LayerI18nDB,
  LayerPartial,
  LayerPropertyPartial,
  Id
} from '$lib/types';

import type { SuperValidated } from 'sveltekit-superforms';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'layer';
const RESOURCE_PATH = 'layers';

/********************
 *  READ
 ************/

/**
 * Reads a project
 */
export const GET: RequestHandler = async ({
  params,
  url,
  locals,
  platform,
  request
}) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  // CONTEXT : Get the query context
  let { conditions } = getLayerQueryContext(
    db,
    session,
    request,
    {},
    userRoles,
    getPrisms(url)
  );

  try {
    // Add condition for specific layer id code
    conditions.push(eq(layer.id, params.id as string));

    // DB : Get the layer
    const result = await getLayer(db, layerEntityWithRelations, conditions, locals.hub);

    if (!result) {
      return error(404, 'Project not found');
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result as LayerDB,
      (result as any).i18n || [],
      (result as any).properties || []
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    console.error('ERROR', e);
    logZodError(e, 'Zod read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE :: PUT
 ************/

/**
 * Updates a layer
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form
    const formData: Layer = await request.json();
    const form = (await superValidate(
      formData,
      // @ts-ignore - FORM : Fix type error
      zod(LayerUpdateAPI)
    )) as SuperValidated<Layer>;

    // RETURN : early if the form is not valid
    if (!form.valid) return SuperFormResponse<Layer>(form);

    // ACCESS CONTROL : Check permissions
    assertPermissionsToUpdateLayer(
      session,
      request,
      formData,
      userRoles,
      params.id as Id
    );

    // DB : Update the layer
    const updatedLayer = await updateLayerWithRelated(db, form.data, params.id);

    // RESPONSE : Convert to form shape and return
    const updatedForm = await toFormShape(
      updatedLayer,
      updatedLayer.i18n,
      updatedLayer.properties,
      updatedLayer.project
    );

    // HTTP : 200 JSON or 400
    return SuperFormResponse<Layer>(updatedForm, false, false, RESOURCE_PATH);
  } catch (err) {
    logZodError(err, 'Update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update');
  }
};

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a layer - only the fields that are provided in the request body. This endpoint is used for updating fields that don't require a full form submission, such as the layer publish or archive status.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  if (!params.id) return error(400, m.deft_sleek_wasp_dine());
  const { db, session, userRoles } = await getDatabase(locals, platform);
  try {
    // ASSERT : Valid form data
    const newData: LayerPartial = await request.json();

    // Get the existing layer to verify access
    const conditions = [eq(layer.id, params.id as string)];
    const existing = (await getLayer(db, {}, conditions, locals.hub)) as LayerDB;

    if (!existing) return error(404, m.quiet_soft_mole_animate());

    // Use assertion functions for access control
    assertPermissionsToUpdateLayer(
      session,
      request,
      existing,
      userRoles,
      params.id as Id
    );

    // DB : Update only the basic layer fields (no relations for PATCH)
    const updated = await updateLayer(db, newData, params.id);

    // Return the updated layer in the format expected by components
    return json({ type: 'success', data: updated });
  } catch (err) {
    logZodError(err, 'Update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch');
  }
};
