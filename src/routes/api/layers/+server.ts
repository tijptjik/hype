import { error, type RequestHandler } from '@sveltejs/kit';
import {
  getDatabaseOrError,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  SuperFormResponse
} from '$lib/api';
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
// DB
import { hierarchicalResourceQuery } from '$lib/db';
import { projectRole, layerI18n, layer } from '$lib/db/schema';
import {
  createLayer,
  createTranslations,
  extractEntitiesToInsert,
  rebuildFormData,
  createLayerProperties
} from '$lib/db/services/layer';
import { isFieldUnique } from '$lib/db';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { LayerInsertAPI, LayerUpdateAPI } from '$lib/db/zod';
// TYPES
import type { NewLayer, Layer } from '$lib/types';

const RESOURCE_TYPE = 'layer';
const RESOURCE_PATH = 'layers';
let ACCESS_STRATEGY = 'ResourceOwnChildren';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  // Layers which are published are visible to all users
  if (
    url.searchParams.get('isPublished') === 'true' &&
    url.searchParams.get('isAdminView') !== 'true'
  ) {
    ACCESS_STRATEGY = 'Public';
    // For the Admin View we use ResourceAll instead of Public so that
    // unpublished organisations are still visible -- in applyPublishedConstraints
    // we filter out unpublished records for the Public access strategy.
  } else if (url.searchParams.get('isAdminView') === 'true') {
    ACCESS_STRATEGY = 'ResourceAll';
  }

  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // Validate query parameters, or return 400
    const queryParams = isValidQueryParamsOrError(layer, url);

    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        translations: true,
        project: true,
        properties: {
          with: {
            property: {
              with: {
                translations: true
              }
            }
          }
        }
      },
      userId,
      projectRole,
      layerI18n,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project')
      },
      3,
      queryParams
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
    const formData: NewLayer = await request.json();
    const form = (await superValidate(
      formData,
      zod(LayerInsertAPI)
    )) as SuperValidated<Layer>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseLayer, formTranslations } = extractEntitiesToInsert(form.data);
    const createdLayer = await createLayer(db, baseLayer);
    const createdTranslations = await createTranslations(
      db,
      formTranslations,
      createdLayer.id
    );
    const createdProperties = await createLayerProperties(
      db,
      createdLayer.id,
      form.data.properties
    );

    const updatedForm = await rebuildFormData(
      createdLayer,
      createdTranslations,
      createdProperties
    );

    return SuperFormResponse(updatedForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to create layer');
  }
};
