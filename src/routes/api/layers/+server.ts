// SVELTE
import { error } from '@sveltejs/kit';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { LayerInsertAPI } from '$lib/db/zod';
// API
import {
  getDatabase,
  isValidQueryParamsOrError,
  getPrisms,
  logZodError,
  SuperFormResponse,
  SuperFormErrorResponse,
  JSONResponseOrError
} from '$lib/api';
import {
  assertPermissionsToCreateLayer,
  getLayerQueryContext,
  layerCollectionWithRelations
} from '$lib/api/services/layer';
// DB
import { layer } from '$lib/db/schema';
import {
  listLayers,
  createLayerWithRelated,
  toResponseShape,
  toFormShape
} from '$lib/db/services/layer';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Layer, LayerNew } from '$lib/types';

/********************
 *  COMMON
 ************/
const RESOURCE_TYPE = 'layer';
const RESOURCE_PATH = 'layers';

/********************
 *  LIST
 ************/

/**
 * Lists layers
 */
export const GET: RequestHandler = async ({ locals, platform, url, request }) => {
  // ASSERT : User Logged in
  const { db, session, userId, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  let queryParams = isValidQueryParamsOrError(layer, url) as Record<
    string,
    string | string[]
  >;

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  let { conditions } = getLayerQueryContext(
    db,
    session,
    request,
    queryParams,
    userRoles,
    getPrisms(url)
  );

  try {
    // DB : Execute query with access control
    const result = await listLayers(db, layerCollectionWithRelations, conditions);

    // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async (layer) => {
        return await toResponseShape(layer, layer.i18n, layer.properties || []);
      })
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Zod list error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  try {
    // VALIDATION : Parse and validate form data
    const formData: LayerNew = await request.json();
    const form = (await superValidate(
      formData,
      // @ts-ignore - FORM : Fix type error
      zod(LayerInsertAPI)
    )) as SuperValidated<LayerNew>;

    if (!form.valid) {
      return SuperFormResponse<Layer>(form);
    }

    // ACCESS CONTROL : Check permissions
    assertPermissionsToCreateLayer(session, request, formData, userRoles);

    // DB : Create layer with related data
    const createdLayer = await createLayerWithRelated(db, form.data);

    // RESPONSE : Convert to form shape and return
    const updatedForm = await toFormShape(
      createdLayer.layer,
      createdLayer.i18n,
      createdLayer.properties,
      createdLayer.project
    );

    return SuperFormResponse<Layer>(updatedForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    logZodError(err, 'Zod create error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create');
  }
};
