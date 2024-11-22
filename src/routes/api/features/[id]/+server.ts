import { error, json, type RequestHandler } from '@sveltejs/kit';
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
import { hierarchicalEntityQuery, toNestedTranslations } from '$lib/db';
import {
  updateFeature,
  updateTranslations,
  updateProperties,
  extractEntitiesToUpdate,
  rebuildFormData,
  patchFeature
} from '$lib/db/services/feature';
import { featureI18n, projectRole } from '$lib/db/schema';
// ZOD
import { FeaturePatch, FeatureUpdateAPI } from '$lib/db/zod';
// TYPES
import type { Feature, FeaturePartialUpdate } from '$lib/types';

const RESOURCE_TYPE = 'feature';
const RESOURCE_PATH = 'features';
const ACCESS_STRATEGY = 'EntityOwnGrandChild' as AccessStrategyOption;
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
    const result = await hierarchicalEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER] as string,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        translations: true,
        properties: {
          with: {
            translations: true,
            property: true
          }
        }
      },
      userId,
      projectRole,
      featureI18n,
      4 // Depth is 4 for features (organisation -> project -> layer -> feature)
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

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: Feature = await request.json();
    const form = (await superValidate(formData, zod(FeatureUpdateAPI))) as SuperValidated<Feature>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseFeature, formTranslations, formProperties } = extractEntitiesToUpdate(
      form.data as Feature
    );

    // Update the base feature
    const updatedFeature = await updateFeature(
      db,
      baseFeature,
      params[PUBLIC_IDENTIFIER] as string
    );

    // Update translations
    const updatedTranslations = await updateTranslations(
      db, 
      formTranslations, 
      updatedFeature.id
    );

    // Update feature properties
    const updatedProperties = await updateProperties(
      db,
      formProperties,
      updatedFeature.id
    );

    // Rebuild form data with all updated entities
    const updatedForm = await rebuildFormData(
      updatedFeature,
      updatedTranslations,
      updatedProperties
    );

    return SuperFormResponse(updatedForm, false, false, RESOURCE_PATH, 200);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};

export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db } = await getDatabaseOrError(locals, platform, ACCESS_STRATEGY, RESOURCE_TYPE);

  try {
    const formData: FeaturePartialUpdate = await request.json();
    const form = await superValidate(formData, zod(FeaturePatch));

    if (!form.valid) {
      return json(form, { status: 400 });
    }

    const updated = await patchFeature(db, params.id as string, form.data);
    return json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Failed to update layer' }, { status: 500 });
  }
};
