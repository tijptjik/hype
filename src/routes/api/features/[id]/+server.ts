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
import { updateFeature, extractEntitiesToUpdate, rebuildFormData } from '$lib/db/services/feature';
import { projectRole } from '$lib/db/schema';
// ZOD
import { FeatureUpdateAPI } from '$lib/db/zod';
// TYPES
import type { Feature } from '$lib/types';

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
      {},
      userId,
      projectRole,
      false,
      4  // Depth is 4 for features (organisation -> project -> layer -> feature)
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
    const form = await superValidate(formData, zod(FeatureUpdateAPI)) as SuperValidated<Feature>;

    if (!form.valid) {
      return SuperFormResponse(form);
    }

    const { baseFeature } = extractEntitiesToUpdate(form.data as Feature);
    const updatedFeature = await updateFeature(db, baseFeature, params[PUBLIC_IDENTIFIER] as string);

    const updatedForm = await rebuildFormData(updatedFeature);
    return SuperFormResponse(updatedForm, false, false, RESOURCE_PATH, 200);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};
