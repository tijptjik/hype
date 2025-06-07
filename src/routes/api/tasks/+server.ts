// SVELTE
import { error } from '@sveltejs/kit';
// FORMS
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { TaskInsertAPI } from '$lib/db/zod';
// API
import {
  getDatabase,
  isValidQueryParamsOrError,
  getPrisms,
  logZodError,
  SuperFormResponse,
  SuperFormErrorResponse,
  JSONResponseOrError
} from '$lib/api';
import {
  toResponseShape,
  getTaskQueryContext,
  taskCollectionWithRelations,
  assertPermissionsToCreateTask
} from '$lib/api/services/task';
// SCHEMA
import { task } from '$lib/db/schema';
// SERVICES
import {
  listTasks,
  createTaskWithDependencies,
  getImagesFromFormData
} from '$lib/db/services/task';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type {
  TaskNew,
  QueryParams,
  TaskCreation,
  TaskDBRaw,
  TaskCollection,
  Task
} from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'task';

/********************
 *  LIST
 ************/

/**
 * Lists tasks
 * Tasks are second-class resources associated with features and projects.
 * Access is controlled by project membership and admin privileges.
 */
export const GET: RequestHandler = async ({ locals, platform, url, request }) => {
  // ASSERT : User Logged in
  const { db, session, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  let queryParams = isValidQueryParamsOrError(task, url);

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  let { conditions } = getTaskQueryContext(
    db,
    session,
    request,
    queryParams as QueryParams,
    userRoles,
    getPrisms(url)
  );

  try {
    // DB : List the tasks
    const result = (await listTasks(
      db,
      taskCollectionWithRelations,
      conditions,
      { ...locals.hub, isSuperAdmin: session.user.superAdmin || false }
    )) as TaskDBRaw[];

        // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async (task) => {
        return await toResponseShape(
          task,
          true
        );
      })
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Task list error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Handles the creation of a new task from multipart/form-data or JSON request.
 * Missing Reports, New Photos, and New Features all require images, so they will
 * all have multipart/form-data content type.
 */
export const POST: RequestHandler = async ({ request, locals, platform, fetch }) => {
  // ASSERT : User logged in
  const { db, session, userId, userRoles } = await getDatabase(locals, platform);

  // CONTEXT : Content type and extract data accordingly
  const contentType = request.headers.get('content-type') || '';
  let taskData: TaskCreation;
  let images: File[] = [];

  try {
    // SWITCH : MULTIPART
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data (with images)
      const formData = await request.formData();
      
      // Extract task data from form data
      const taskDataJson = formData.get('taskData');
      if (!taskDataJson || typeof taskDataJson !== 'string') {
        return error(400, 'Missing task data');
      }

      taskData = JSON.parse(taskDataJson);
      images = getImagesFromFormData(formData);
    }
    // SWITCH : JSON
    else {
      // Handle JSON data (no images)
      taskData = await request.json();
    }

    // ASSERT : Valid form data
    const form = (await superValidate(
      taskData,
      // @ts-ignore - FORM : Fix type error
      zod(TaskInsertAPI)
    )) as SuperValidated<TaskNew>;

    if (!form.valid) {
      logZodError(form.errors, '[TASK CREATE] Validation failed:');
      return SuperFormResponse<any>(form);
    }

    // ASSERT : User has permission to create task
    await assertPermissionsToCreateTask(
      db,
      session,
      request,
      form.data as TaskNew,
      userRoles
    );

    // DB : Create task with all dependencies (feature, images, etc.)
    const createdTask = await createTaskWithDependencies(
      db,
      taskData,
      images,
      userId,
      fetch
    );

    // Return the created task as JSON
    return JSONResponseOrError(createdTask);
  } catch (err) {
    console.error('[TASK CREATE] Error:', err);
    logZodError(err, 'Task create error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create');
  }
};
