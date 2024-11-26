import { error} from '@sveltejs/kit';
// API
import {
    getDatabaseOrError,
    isValidQueryParamsOrError,
    JSONResponseOrError,
} from '$lib/api';
// DB
import { hierarchicalResourceQuery } from '$lib/db';
import { projectRole, task } from '$lib/db/schema';
import { createTask, customHierarchy } from '$lib/db/services/task';

  // TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { AccessStrategyOption } from '$lib/types';

const RESOURCE_TYPE = 'task';
const ACCESS_STRATEGY = 'ResourceOwnChildren' as AccessStrategyOption;

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  const isReviewed = url.searchParams.get('isReviewed');
  
  try {
    const queryParams = isValidQueryParamsOrError(task, url);
    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        organisation: true,
        project: true,
        feature: true,
        image: true,
        contributor: {
          columns: {
            email: false,
            emailVerified: false,
            createdAt: false,
            modifiedAt: false
          }
        }
      },
      userId,
      projectRole,
      false,
      {
        organisation: url.searchParams.getAll('organisation'),
        project: url.searchParams.getAll('project')
      },
      3,
      queryParams,
      customHierarchy
    );

    return JSONResponseOrError(result);
  } catch (e) {
    return error(500, 'Database Error');
  }
};

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  const { db, userId } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const data = await request.json();
    const taskData = {
      ...data,
      contributorId: data.contributorId || userId
    };

    const result = await createTask(db, taskData);
    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database error:', e);
    return error(500, 'Database Error');
  }
};