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
  createPropertiesWithRelated
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
  console.log('POST /api/properties - Starting property creation');

  // ASSERT : User Logged in
  const { db, user } = await getDatabase(locals, platform);
  console.log('User authenticated:', user.id);

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

    const propertyData = validationResult.data as PropertyNew;
    console.log('Validated property data:', JSON.stringify(propertyData, null, 2));

    // ASSERT : Project ID is provided
    if (!propertyData.projectId) {
      console.error('No project ID provided');
      return error(400, 'Project ID is required');
    }

    // FETCH : Get existing properties for the project
    console.log('Fetching existing properties for project:', propertyData.projectId);
    const existingProperties = await listProperties(
      db,
      propertyCollectionWithRelations,
      [eq(property.projectId, propertyData.projectId)]
    );

    console.log('Found existing properties:', existingProperties.length);

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
    console.log(
      `Assigning rank ${newRank} for ${propertyData.type} property (${propertiesOfSameType.length} existing ${propertyData.type} properties)`
    );

    // SET : The rank for the new property
    const propertyDataWithRank = {
      ...propertyData,
      rank: newRank
    };

    // PREPARE : All properties for the project (existing + new)
    const allProjectProperties = [
      ...existingProperties.map((p) => {
        // Transform i18n array to object with locale keys
        const i18nObject: Record<string, any> = {};
        if (p.i18n && Array.isArray(p.i18n)) {
          p.i18n.forEach((i18nItem) => {
            if (i18nItem.locale) {
              i18nObject[i18nItem.locale] = i18nItem;
            }
          });
        }

        // Transform property values i18n arrays to objects
        const transformedValues =
          p.values?.map((value) => {
            const valueI18nObject: Record<string, any> = {};
            if (value.i18n && Array.isArray(value.i18n)) {
              value.i18n.forEach((i18nItem) => {
                if (i18nItem.locale) {
                  valueI18nObject[i18nItem.locale] = i18nItem;
                }
              });
            }
            return {
              ...value,
              i18n: valueI18nObject
            };
          }) || [];

        return {
          ...p,
          // Convert existing property to PropertyNew format for upsert
          i18n: i18nObject,
          values: transformedValues
        };
      }),
      propertyDataWithRank
    ];

    console.log('Transformed existing properties for upsert:');
    console.log('Sample property i18n structure:', allProjectProperties[0]?.i18n);
    console.log(
      'Sample property values structure:',
      allProjectProperties[0]?.values?.[0]?.i18n
    );

    // VALIDATE : Check that all properties match expected format before submission
    console.log(
      'Validating transformed properties against PropertyInsertAPI schema...'
    );
    allProjectProperties.forEach((prop, index) => {
      try {
        PropertyInsertAPI.parse(prop);
        console.log(`Property ${index} (${prop.key}) validation passed`);
      } catch (validationError) {
        console.error(
          `Property ${index} (${prop.key}) validation failed:`,
          validationError
        );
        if (validationError instanceof z.ZodError) {
          validationError.issues.forEach((issue) => {
            console.error(`  - ${issue.message} at path: ${issue.path.join('.')}`);
          });
        }
      }
    });

    console.log(
      'Creating property collection with',
      allProjectProperties.length,
      'total properties'
    );

    // CREATE : Property with all related data using the full collection
    const createdProperties = await createPropertiesWithRelated(
      db,
      allProjectProperties as PropertyNew[],
      propertyData.projectId
    );

    if (!createdProperties || createdProperties.length === 0) {
      console.error('No properties were created');
      return error(500, 'Failed to create property');
    }

    // FIND : The newly created property (it should be the one with the key we just created)
    const createdProperty = createdProperties.find((p) => p.key === propertyData.key);

    if (!createdProperty) {
      console.error('Could not find the newly created property in the result set');
      console.error('Looking for property with key:', propertyData.key);
      console.error(
        'Available properties:',
        createdProperties.map((p) => ({ id: p.id, key: p.key }))
      );
      return error(500, 'Failed to locate created property');
    }
    console.log('Property created successfully:', {
      id: createdProperty.id,
      key: createdProperty.key,
      type: createdProperty.type,
      component: createdProperty.component
    });

    // RESPONSE : Return the created property in response shape
    const responseData = toResponseShape(
      createdProperty,
      createdProperty.i18n || [],
      createdProperty.values || [],
      createdProperty.values?.flatMap((v) => v.i18n || []) || []
    );

    console.log('Returning response data');
    return JSONResponseOrError(responseData);
  } catch (e) {
    console.error('Property creation error:', e);
    logZodError(e, 'Property creation error:');
    return error(500, 'Property creation failed');
  }
};
