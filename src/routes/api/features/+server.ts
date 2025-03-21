import { error, type RequestHandler } from '@sveltejs/kit';
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import {
  getDatabaseOrError,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  SuperFormResponse
} from '$lib/api';
// DB
import { hierarchicalResourceQuery } from '$lib/db';
import { feature, projectRole } from '$lib/db/schema';
import {
  createFeature,
  createTranslations,
  updateProperties,
  extractEntitiesToInsert,
  rebuildFormData
} from '$lib/db/services/feature';
// MAPS
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
// ZOD
import { FeatureInsertAPI } from '$lib/db/zod';
// TYPES
import type { NewFeature, Feature } from '$lib/types';

const RESOURCE_TYPE = 'feature';
const RESOURCE_PATH = 'features';
let ACCESS_STRATEGY = 'ResourceOwnGrandChildren';

// TODO Remove this once neighbourhoods and places are properly implemented as
// first-class entities.
function withExpandedNeighbourhoods(queryParams: Record<string, string | string[]>) {
  const params = { ...queryParams };
  const neighbourhoodKey = 'addressProperties.neighbourhood';

  if (neighbourhoodKey in params) {
    // Convert single value to array if necessary
    const neighbourhoods = Array.isArray(params[neighbourhoodKey])
      ? (params[neighbourhoodKey] as string[])
      : [params[neighbourhoodKey] as string];

    // Create a Set to avoid duplicates
    const expandedNeighbourhoods = new Set<string>();

    // For each provided neighbourhood
    neighbourhoods.forEach((hood) => {
      // Always add the original neighbourhood
      expandedNeighbourhoods.add(hood);

      // If it's a main district, also add all its sub-districts
      if (hood in subNeighbourhoods) {
        subNeighbourhoods[hood as keyof typeof subNeighbourhoods].forEach((n) =>
          expandedNeighbourhoods.add(n)
        );
      }
    });

    // Update the params with expanded array
    params[neighbourhoodKey] = Array.from(expandedNeighbourhoods);
  }
  return params;
}

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  // Features which are published are visible to all users
  if (url.searchParams.get('isPublished') === 'true') {
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
    const queryParams = isValidQueryParamsOrError(feature, url);

    // Expand neighbourhoods
    const expandedParams = withExpandedNeighbourhoods(queryParams);

    const result = await hierarchicalResourceQuery(
      db,
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
      false,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project'),
        layer: url.searchParams.getAll('layer')
      },
      4,
      expandedParams
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
    // Add contributor ID if not provided
    if (!formData.contributorId) {
      formData.contributorId = userId;
    }
    const form = (await superValidate(
      formData,
      zod(FeatureInsertAPI)
    )) as SuperValidated<Feature>;

    if (!form.valid) {
      return SuperFormResponse<Feature>(form);
    }

    const { baseFeature, formTranslations, formProperties } = extractEntitiesToInsert(
      form.data
    );
    const createdFeature = await createFeature(db, baseFeature);
    const createdTranslations = await createTranslations(
      db,
      formTranslations,
      createdFeature.id
    );
    const createdProperties = await updateProperties(
      db,
      formProperties,
      createdFeature.id
    );

    const updatedForm = await rebuildFormData(
      createdFeature as Feature,
      createdTranslations,
      createdProperties
    );
    return SuperFormResponse(updatedForm, true, false, RESOURCE_PATH, 201);
  } catch (err) {
    console.error(err);
    return error(500, 'Failed to create feature');
  }
};
