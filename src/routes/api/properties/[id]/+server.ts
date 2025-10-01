// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit';
// MESSAGES
import { m } from '$lib/i18n';
// DB
import { eq } from 'drizzle-orm';
// LIB
import { getDatabase, JSONResponseOrError, logZodError } from '$lib/api';
import {
  getPropertyQueryContext,
  propertyEntityWithRelations
} from '$lib/api/services/property';
import {
  getProperty,
  toResponseShape,
  updateSingleProperty
} from '$lib/db/services/property';
// SCHEMA
import { property } from '$lib/db/schema/index';
// ZOD
import { PropertyInsertAPI } from '$lib/db/zod';
// TYPES
import type { PropertyValueI18nDB, Property as PropertyType } from '$lib/types';

export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);
  try {
    // GET : Context for property query
    const { params: queryParams, conditions } = getPropertyQueryContext(
      user,
      request,
      {},
      userRoles
    );

    // EXTEND : Add GET identifier (id)
    if (params.id) {
      conditions.push(eq(property.id, params.id));
    }

    // DB : Get the property
    const result = await getProperty(db, propertyEntityWithRelations, conditions);

    if (!result) {
      return error(404, m.brief_jumpy_firefox_bump({ key: 'Property' }));
    }

    // RESPONSE : Build the response shape
    const data = toResponseShape(
      result,
      result.i18n,
      result.values,
      result.values
        ?.flatMap((v) => v.i18n || [])
        .filter((item): item is PropertyValueI18nDB => item != null) || []
    );

    return JSONResponseOrError(data);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Dust Accumulation Critical');
  }
};

export const PUT: RequestHandler = async ({ params, locals, platform, request }) => {
  console.log('PUT /api/properties/[id] - Starting property update');

  // ASSERT : User Logged in
  const { db, user } = await getDatabase(locals, platform);

  try {
    // PARSE : Request body
    const body = await request.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));

    // VALIDATE : Property data
    const validationResult = PropertyInsertAPI.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      logZodError(validationResult.error, 'Property validation error:');
      return error(400, 'Invalid property data');
    }

    const propertyData = validationResult.data as PropertyType;
    console.log('Validated property data:', JSON.stringify(propertyData, null, 2));

    // ASSERT : Property ID matches
    if (propertyData.id !== params.id) {
      console.error('Property ID mismatch:', propertyData.id, params.id);
      return error(400, 'Property ID mismatch');
    }

    // ASSERT : Project ID is provided
    if (!propertyData.projectId) {
      console.error('No project ID provided');
      return error(400, 'Project ID is required');
    }

    console.log('Updating single property:', params.id);

    // UPDATE : Single property without affecting other properties in the project
    const updatedProperty = await updateSingleProperty(db, propertyData);

    if (!updatedProperty) {
      console.error('Property was not updated');
      return error(500, 'Failed to update property');
    }

    console.log('Property updated successfully:', {
      id: updatedProperty.id,
      key: updatedProperty.key,
      valuesCount: updatedProperty.values?.length || 0
    });

    // RESPONSE : Return the updated property in response shape
    const responseData = toResponseShape(
      updatedProperty,
      updatedProperty.i18n || [],
      updatedProperty.values || [],
      updatedProperty.values?.flatMap((v) => v.i18n || []) || []
    );

    console.log('Returning response data');
    return JSONResponseOrError(responseData);
  } catch (e) {
    console.error('Property update error:', e);
    logZodError(e, 'Property update error:');
    return error(500, 'Property update failed');
  }
};
