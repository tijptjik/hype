import { error, json } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// ZOD
import { TaskUpdate } from '$lib/db/zod/schemas/task';
// API
import {
  getDatabase,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  logZodError,
  SuperFormErrorResponse
} from '$lib/api';
// SERVICES
import {
  toResponseShape,
  getTaskEntityQueryContext,
  taskEntityWithRelations,
  assertPermissionsToUpdateTask,
  assertPermissionsToDeleteTask
} from '$lib/api/services/task';
// SCHEMA
import { task } from '$lib/db/schema';
// SERVICES
import {
  getTask,
  updateTask,
  archiveImages,
  publishImages,
  deleteTask
} from '$lib/db/services/task';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { Id, QueryParams, TaskDBPartial, TaskDBRaw } from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'task';

/********************
 *  READ
 ************/

/**
 * Reads a single task
 * Tasks are second-class resources with restricted access based on project roles.
 */
export const GET: RequestHandler = async ({
  params,
  url,
  locals,
  platform,
  request
}) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  let queryParams = isValidQueryParamsOrError(task, url);

  // CONTEXT : Get the query context
  let { conditions } = getTaskEntityQueryContext(
    db,
    session,
    request,
    queryParams as QueryParams,
    userRoles
  );

  // Add condition for specific task ID
  conditions.push(eq(task.id, params.id!));

  try {

    // DB : Get the task with full relations
    const data = await getTask(db, taskEntityWithRelations, conditions, { ...locals.hub, isSuperAdmin: session.user.superAdmin || false }) as TaskDBRaw;

    if (!data) {
      return error(404, 'Task not found');
    }

    const result = await toResponseShape(data, false);

    return JSONResponseOrError(result);
  } catch (e) {
    logZodError(e, 'Task read error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  UPDATE
 ************/

/**
 * Updates a task, including special handling for review actions that affect images.
 * Tasks have complex business logic for image operations based on review outcomes.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userId, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid submitted data
    const data: TaskDBPartial = await request.json();

    // Get existing task data for permission checks
    const existingTask = await getTask(db, {}, [eq(task.id, params.id!)], { ...locals.hub, isSuperAdmin: session.user.superAdmin || false });
    if (!existingTask) {
      return error(404, 'Task not found');
    }

    // ASSERT : User has permission to update task
    await assertPermissionsToUpdateTask(
      db,
      session,
      request,
      params as QueryParams,
      userRoles,
      params.id as Id,
      existingTask
    );

    // BUSINESS LOGIC : Set review metadata
    if (data.reviewOutcome) {
      data.isReviewed = true;
      data.reviewerId = userId;
    } else if (data.isReviewed === false) {
      data.reviewerId = null;
    }

    // BUSINESS LOGIC : Handle image operations based on review actions
    const taskId = params.id!;
    if (
      (existingTask.type === 'newPhoto' || existingTask.type === 'reportedMissing') &&
      data.reviewAction
    ) {
      switch (data.reviewAction) {
        case 'ignored':
          // Archive all images
          await archiveImages(db, taskId, false);
          break;
        case 'added-all-photos':
          // Publish all images
          await publishImages(db, taskId, false);
          break;
        case 'added-all-photos-with-intent':
          // Archive undefined images and publish defined ones
          await publishImages(db, taskId, true);
          await archiveImages(db, taskId, true);
          break;
      }
    }

    // VALIDATION : Validate update data
    const validatedData = TaskUpdate.parse(data);

    // DB : Update the task
    const updatedTask = await updateTask(db, validatedData, params.id as Id);

    return JSONResponseOrError(updatedTask);
  } catch (err) {
    logZodError(err, 'Task update error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update');
  }
};

/********************
 *  DELETE
 ************/

/**
 * Deletes a task
 * Note: Task deletion should be rare and may have implications for associated images and features.
 */
export const DELETE: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  try {
    // Get existing task data for permission checks
    const existingTask = await getTask(db, {}, [eq(task.id, params.id!)], { ...locals.hub, isSuperAdmin: session.user.superAdmin || false });
    if (!existingTask) {
      return error(404, 'Task not found');
    }

    // ASSERT : User has permission to delete task
    await assertPermissionsToDeleteTask(
      db,
      session,
      request,
      params as QueryParams,
      userRoles,
      existingTask.id as Id,
      existingTask
    );

    // DB : Delete the task (cascading deletes will handle relations)
    await deleteTask(db, params.id as Id);

    return json({ type: 'success', message: 'Task deleted successfully' });
  } catch (err) {
    logZodError(err, 'Task delete error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'delete');
  }
};