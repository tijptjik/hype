// SVELTE
import { error } from '@sveltejs/kit';
// API
import {
  getDatabaseOrError,
  isValidQueryParamsOrError,
  JSONResponseOrError
} from '$lib/api';
// DB
import db, { hierarchicalResourceQuery } from '$lib/db';
import { projectRole, task, taskImage } from '$lib/db/schema';
import { createTask, customHierarchy } from '$lib/db/services/task';
import { createTaskImagesFromImageIds } from '$lib/db/services/image';
import { getProjectForFeatureId } from '$lib/db/services/project';
import { getOrganisationForProjectId } from '$lib/db/services/organisation';
import { setImageContext, getImageContext } from '$lib/context/images.svelte';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type {
  AccessStrategyOption,
  GetImageAPI,
  OrganisationDB,
  ProjectDB
} from '$lib/types';
import { uploadAndProcessImage } from '$lib/services/images.svelte';

const RESOURCE_TYPE = 'task';
const ACCESS_STRATEGY = 'ResourceOwnChildren' as AccessStrategyOption;

export const GET: RequestHandler = async ({ url, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const queryParams = isValidQueryParamsOrError(task, url);
    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        organisation: true,
        project: true,
        feature: true,
        images: {
          with: {
            image: true
          }
        },
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

export const POST: RequestHandler = async ({ request, locals, platform, fetch }) => {
  const { db, userId } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // Check if the request is multipart/form-data (contains files)
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle form data with files
      const formData = await request.formData();
      const taskDataJson = formData.get('taskData');

      if (!taskDataJson || typeof taskDataJson !== 'string') {
        return error(400, 'Missing task data');
      }

      const taskData = JSON.parse(taskDataJson);

      // Add contributor ID if not provided
      if (!taskData.contributorId) {
        taskData.contributorId = userId;
      }

      // Create the task
      const createdTask = await createTask(db, {
        ...taskData,
        contributorId: taskData.contributorId || userId
      });

      // Process uploaded photos
      const photoEntries = Array.from(formData.entries()).filter(([key]) =>
        key.startsWith('photo_')
      );

      const uploadedImages: GetImageAPI[] = [];

      for (const [_, fileValue] of photoEntries) {
        const project: ProjectDB | undefined = await getProjectForFeatureId(
          db,
          taskData.featureId
        );
        const organisation: OrganisationDB | undefined =
          await getOrganisationForProjectId(db, project!.id);

        if (fileValue instanceof File) {
          const image = await uploadAndProcessImage(
            fileValue,
            {
              resource: 'feature',
              entity: taskData.featureId,
              organisation,
              project
            },
            {
              isPublished: false,
              intent: 'evidence'
            },
            fetch
          );

          if (image) {
            uploadedImages.push(image);
          }
        }
      }

      const imageIds = uploadedImages.map((image) => image.id);
      // Link the image to the task as evidence
      await createTaskImagesFromImageIds(db, createdTask.id, imageIds);

      return JSONResponseOrError({
        ...createdTask
      });
    } else {
      // Handle regular JSON request
      const data = await request.json();
      const taskData = {
        ...data,
        contributorId: data.contributorId || userId
      };

      const result = await createTask(db, taskData);

      // Handle taskImages if provided
      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        const taskImageValues = data.images.map((imageId: string, index: number) => ({
          taskId: result.id,
          imageId
        }));

        await db.insert(taskImage).values(taskImageValues);
      }

      return JSONResponseOrError(result);
    }
  } catch (e) {
    console.error('Database error:', e);
    return error(500, 'Database Error');
  }
};
