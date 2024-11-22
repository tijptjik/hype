import { error, type RequestHandler } from '@sveltejs/kit';
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { getDatabaseOrError, isValidQueryParamsOrError, JSONResponseOrError, SuperFormResponse } from '$lib/api';
// DB
import { hierarchicalResourceQuery } from '$lib/db';
import { feature, projectRole } from '$lib/db/schema';
import { createFeature, extractEntitiesToInsert, rebuildFormData } from '$lib/db/services/feature';
// ZOD
import { FeatureInsertAPI } from '$lib/db/zod';
// TYPES
import type { NewFeature, Feature } from '$lib/types';

const RESOURCE_TYPE = 'feature';
const RESOURCE_PATH = 'features';
const ACCESS_STRATEGY = 'ResourceOwnGrandChildren';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // Validate query parameters, or return 400
    const queryParams = isValidQueryParamsOrError(feature, url);

    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        translations: true
      },
      userId,
      projectRole,
      false,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project'),
        layer: url.searchParams.getAll('layer')
      },
      4,
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
    const formData: NewFeature = await request.json();
    const form = (await superValidate(formData, zod(FeatureInsertAPI))) as SuperValidated<Feature>;

    if (!form.valid) {
      return SuperFormResponse<Feature>(form);
    }

    const { baseFeature } = extractEntitiesToInsert(form.data);
    const createdFeature = await createFeature(db, baseFeature);

    const updatedForm = await rebuildFormData(createdFeature);
    return SuperFormResponse(updatedForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to create feature');
  }
};
