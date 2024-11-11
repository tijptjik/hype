import { error, type RequestHandler } from '@sveltejs/kit';
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import {
  getDatabaseOrError,
  JSONResponseOrError,
  SuperFormErrorResponse,
  SuperFormResponse,
  type AccessStrategyOption
} from '$lib/api';
// DB
import { hierarchicalEntityQuery } from '$lib/db';
import { updateLayer, updateTranslations, extractEntitiesToUpdate, rebuildFormData, updateLayerProperties, mergeProjectProperties } from '$lib/db/services/layer';
import {
  projectRole,
  layerI18n
} from '$lib/db/schema';
// ZOD
import { LayerUpdateAPI } from '$lib/db/zod';
// TYPES
import type { Layer } from '$lib/types';

const RESOURCE_TYPE = 'layer';
const RESOURCE_PATH = 'layers';
const ACCESS_STRATEGY = 'EntityOwnChild' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'id';

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
    let result = await hierarchicalEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        translations: true,
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
      3
    );

    // Merge in all available project properties
    if (result) {
      result = await mergeProjectProperties(db, result);
    }

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
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
    const formData: Layer = await request.json();
    const form = await superValidate(formData, zod(LayerUpdateAPI)) as SuperValidated<Layer>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseLayer, formTranslations } = extractEntitiesToUpdate(form.data as Layer);
    const updatedLayer = await updateLayer(db, baseLayer, params[PUBLIC_IDENTIFIER] as string);
    const updatedTranslations = await updateTranslations(db, formTranslations, updatedLayer.id);

    // Add property handling
    if (form.data.properties) {
      await updateLayerProperties(db, updatedLayer.id, form.data.properties);
    }

    const updatedForm = await rebuildFormData(updatedLayer, updatedTranslations);
    return SuperFormResponse(updatedForm, false, false, RESOURCE_PATH, 200);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};
