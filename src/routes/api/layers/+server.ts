import { error, type RequestHandler } from '@sveltejs/kit';
import { getDatabaseOrError, JSONResponseOrError, SuperFormResponse } from '$lib/api';
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
// DB
import { hierarchicalResourceQuery, validateTableColumns } from '$lib/db';
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
const ACCESS_STRATEGY = 'ResourceOwnChildren';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const queryParams = Object.fromEntries(
      Array.from(url.searchParams.entries()).filter(([key]) => 
        !['organisation', 'project'].includes(key)
      )
    );

    if (Object.keys(queryParams).length > 0) {
      const { valid, invalidColumns } = validateTableColumns(layer, Object.keys(queryParams));
      if (!valid) {
        return error(400, `Invalid filter fields: ${invalidColumns.join(', ')}`);
      }
    }

    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        translations: true
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
    const form = (await superValidate(formData, zod(LayerInsertAPI))) as SuperValidated<Layer>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseLayer, formTranslations } = extractEntitiesToInsert(form.data);
    const createdLayer = await createLayer(db, baseLayer);
    const createdTranslations = await createTranslations(db, formTranslations, createdLayer.id);
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
