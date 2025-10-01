// SVELTE
import { error } from '@sveltejs/kit';
// API
import {
  getDatabase,
  isValidQueryParamsOrError,
  getPrisms,
  logZodError,
  JSONResponseOrError
} from '$lib/api';
import {
  getPropertyQueryContext,
  propertyCollectionWithRelations
} from '$lib/api/services/property';
// SCHEMA
import { property, project as projectTable } from '$lib/db/schema/index';
// SERVICES
import {
  listProperties,
  toResponseShape,
  createSingleProperty
} from '$lib/db/services/property';
// DRIZZLE
import { inArray, eq } from 'drizzle-orm';
// ZOD
import { PropertyInsertAPI } from '$lib/db/zod';
import { z } from 'zod';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { QueryParams, PropertyNew } from '$lib/types';

/********************
 *  LIST
 ************/

/**
 * Lists properties with their i18n and values
 * This endpoint supports prism-based filtering by organisation/project
 */
export const GET: RequestHandler = async ({ locals, platform, url, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  const queryParams = isValidQueryParamsOrError(property, url);

  // CONTEXT : Get the query context
  const { conditions } = getPropertyQueryContext(
    user,
    request,
    queryParams as QueryParams,
    userRoles
  );

  // PRISMS : Apply organisation/project filtering for properties
  const prisms = getPrisms(url);
  const additionalConditions = [...conditions];

  if (prisms.project.length > 0) {
    additionalConditions.push(inArray(property.projectId, prisms.project));
  } else if (prisms.organisation.length > 0) {
    // If no project prisms but organisation prisms, get all projects for those organisations
    // and filter properties by those projects
    const projectsInOrgs = await db.query.project.findMany({
      where: inArray(projectTable.organisationId, prisms.organisation),
      columns: { id: true }
    });
    const projectIds = projectsInOrgs.map((p) => p.id);
    if (projectIds.length > 0) {
      additionalConditions.push(inArray(property.projectId, projectIds));
    }
  }

  try {
    // DB : List the properties with relations
    const result = await listProperties(
      db,
      propertyCollectionWithRelations,
      additionalConditions
    );

    // RESPONSE : Transform each property to proper response shape
    const data = result.map((property) =>
      toResponseShape(
        property,
        property.i18n,
        property.values || [],
        property.values?.flatMap((v) => v.i18n || []) || []
      )
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Property list error:');
    return error(500, 'Property retrieval failed');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Creates a new property with all related data (i18n, values, value i18n)
 */
export const POST: RequestHandler = async ({ locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user } = await getDatabase(locals, platform);

  try {
    // PARSE : Request body
    const body = await request.json();

    // VALIDATE : Property data
    const validationResult = PropertyInsertAPI.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      logZodError(validationResult.error, 'Property validation error:');
      return error(400, 'Invalid property data');
    }

    const propertyData = validationResult.data as PropertyNew;

    // ASSERT : Project ID is provided
    if (!propertyData.projectId) {
      console.error('No project ID provided');
      return error(400, 'Project ID is required');
    }

    // FETCH : Get existing properties for the project
    const existingProperties = await listProperties(
      db,
      propertyCollectionWithRelations,
      [eq(property.projectId, propertyData.projectId)]
    );

    // CHECK : If property already exists by key, return it instead of creating duplicate
    const existingPropertyByKey = existingProperties.find(
      (p) => p.key === propertyData.key
    );
    if (existingPropertyByKey) {
      // RESPONSE : Return the existing property in response shape
      const responseData = toResponseShape(
        existingPropertyByKey,
        (existingPropertyByKey.i18n || []) as any,
        (existingPropertyByKey.values || []) as any,
        (existingPropertyByKey.values?.flatMap((v) => v.i18n || []) || []) as any
      );

      return JSONResponseOrError(responseData);
    }

    // CALCULATE : Appropriate rank for the new property
    // Properties are ranked by type (classifier first, then specifier) and then by rank within type
    const propertiesOfSameType = existingProperties.filter(
      (p) => p.type === propertyData.type
    );
    const maxRankForType =
      propertiesOfSameType.length > 0
        ? Math.max(...propertiesOfSameType.map((p) => p.rank))
        : -1;

    const newRank = maxRankForType + 1;

    // SET : The rank for the new property
    const propertyDataWithRank = {
      ...propertyData,
      rank: newRank
    };

    // CREATE : Single new property without affecting existing ones
    const createdProperty = await createSingleProperty(
      db,
      propertyDataWithRank as PropertyNew
    );

    if (!createdProperty) {
      console.error('Property was not created');
      return error(500, 'Failed to create property');
    }

    // RESPONSE : Return the created property in response shape
    const responseData = toResponseShape(
      createdProperty,
      createdProperty.i18n || [],
      createdProperty.values || [],
      createdProperty.values?.flatMap((v) => v.i18n || []) || []
    );

    return JSONResponseOrError(responseData);
  } catch (e) {
    console.error('Property creation error:', e);
    logZodError(e, 'Property creation error:');
    return error(500, 'Property creation failed');
  }
};
