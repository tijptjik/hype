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
import { listProperties, toResponseShape } from '$lib/db/services/property';
// DRIZZLE
import { inArray } from 'drizzle-orm';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { QueryParams } from '$lib/types';

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
    const projectIds = projectsInOrgs.map(p => p.id);
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
    const data = result.map(property => 
      toResponseShape(
        property,
        property.i18n,
        property.values || [],
        property.values?.flatMap(v => v.i18n || []) || []
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