import { error } from '@sveltejs/kit';
// API
import { getDatabaseOrError, JSONResponseOrError } from '$lib/api';
// DB
import { hierarchicalEntityQuery } from '$lib/db';
import { projectRole } from '$lib/db/schema';
import {
  patchTask,
  customHierarchy,
  archiveImages,
  publishImages
} from '$lib/db/services/task';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { AccessStrategyOption } from '$lib/types';

const RESOURCE_TYPE = 'task';
const ACCESS_STRATEGY = 'EntityOwnChild' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'id';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const result = await hierarchicalEntityQuery(
      db,
      params[PUBLIC_IDENTIFIER]!,
      PUBLIC_IDENTIFIER,
      accessStrategy,
      {
        organisation: true,
        project: true,
        feature: {
          with: {
            properties: {
              with: {
                propertyValue: true,
                property: true
              }
            }
          }
        },
        images: true,
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
      3,
      customHierarchy
    );

    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database query error:', e);
    return error(500, 'Database Error');
  }
};

export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db, userId } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const data = await request.json();
    const taskId = params[PUBLIC_IDENTIFIER]!;

    // Infer reviewerId and isReviewed from reviewOutcome and active user
    data.isReviewed = data.reviewOutcome ? true : false;
    data.reviewerId = data.isReviewed ? userId : null;

    // Handle image operations based on reviewAction
    if (
      (data.type === 'newPhoto' || data.type === 'reportedMissing') &&
      data.reviewAction
    ) {
      switch (data.reviewAction) {
        case 'ignored':
          // Archive all images
          await archiveImages(db, taskId, false);
          break;
        case 'add-all-photos':
          // Publish all images
          await publishImages(db, taskId, false);
          break;
        case 'add-all-photos-with-intent':
          // Archive undefined images and publish defined ones
          await publishImages(db, taskId, true);
          await archiveImages(db, taskId, true);
          break;
      }
    }

    const result = await patchTask(db, taskId, data);
    return JSONResponseOrError(result);
  } catch (e) {
    console.error('Database error:', e);
    return error(500, 'Database Error');
  }
};
