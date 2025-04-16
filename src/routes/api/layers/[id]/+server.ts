import { error, type RequestHandler, json } from '@sveltejs/kit';
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
import {
  updateLayer,
  updateTranslations,
  extractEntitiesToUpdate,
  rebuildFormData,
  updateLayerProperties,
  mergeProjectProperties,
  patchLayer
} from '$lib/db/services/layer';
import { projectRole, layerI18n } from '$lib/db/schema';
// ZOD
import { LayerUpdateAPI, LayerPatch } from '$lib/db/zod';
// TYPES
import type { Layer, LayerPartialUpdate } from '$lib/types';

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
    const form = (await superValidate(
      formData,
      zod(LayerUpdateAPI)
    )) as SuperValidated<Layer>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseLayer, formTranslations } = extractEntitiesToUpdate(form.data as Layer);
    const updatedLayer = await updateLayer(
      db,
      baseLayer,
      params[PUBLIC_IDENTIFIER] as string
    );
    const updatedTranslations = await updateTranslations(
      db,
      formTranslations,
      updatedLayer.id
    );

    const updatedLayerProperties = await updateLayerProperties(
      db,
      updatedLayer.id,
      formData.properties
    );

    const updatedForm = await rebuildFormData(
      updatedLayer,
      updatedTranslations,
      updatedLayerProperties
    );
    return SuperFormResponse(updatedForm, false, false, RESOURCE_PATH, 200);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};

// TODO When a layer is
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: LayerPartialUpdate = await request.json();
    const form = await superValidate(formData, zod(LayerPatch), { defaults: {} });

    if (!form.valid) {
      return json(form, { status: 400 });
    }

    const updated = await patchLayer(db, params.id as string, form.data);
    return json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Failed to update layer' }, { status: 500 });
  }
};
