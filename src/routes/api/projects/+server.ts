// SVELTE
import { error } from '@sveltejs/kit';
// FORMS
import { superValidate } from 'sveltekit-superforms';
import {
  getDatabase,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  getPrisms,
  logZodError
} from '$lib/api';
// SERVICES
import { project } from '$lib/db/schema/index';
// DB
import {
  createProjectWithRelated,
  listProjects,
  toFormShape,
  toResponseShape
} from '$lib/db/services/project';
// API
import {
  getProjectQueryContext,
  assertPermissionsToCreateProject,
  projectCollectionWithRelations,
  assertCodeUnique
} from '$lib/api/services/project';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { ProjectInsertAPI } from '$lib/db/zod';
// TYPES
import type { RequestHandler } from '@sveltejs/kit';
import type { SuperValidated } from 'sveltekit-superforms';
import type { ProjectNew, Project } from '$lib/types';

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'project';
const RESOURCE_PATH = 'projects';

/********************
 *  LIST
 ************/

/**
 * Lists projects
 */
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  let queryParams = isValidQueryParamsOrError(project, url) as Record<
    string,
    string | string[]
  >;

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  let { conditions } = getProjectQueryContext(
    db,
    user,
    request,
    queryParams,
    userRoles,
    getPrisms(url)
  );

  try {
    // DB : List the projects
    const result = await listProjects(
      db,
      projectCollectionWithRelations,
      conditions,
      { ...locals.hub, isSuperAdmin: user.superAdmin || false }
    );

    // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async (project) => {
        return await toResponseShape(project, project.i18n, [], [], true);
      })
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data);
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Zod list error:');
    return error(500, 'Dust Accumulation Critical');
  }
};

/********************
 *  CREATE
 ************/

/**
 * Creates a new project
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform);

  try {
    // ASSERT : Valid form
    const formData: ProjectNew = await request.json();
    let form = (await superValidate(
      formData,
      // @ts-ignore - FORM : Fix type error
      zod(ProjectInsertAPI)
    )) as SuperValidated<ProjectNew>;

    // ASSERT : Code is unique
    form = await assertCodeUnique(db, form, formData);

    // RETURN : early if the form is not valid
    if (!form.valid) {
      return SuperFormResponse<ProjectNew>(form);
    }

    // ASSERT : Permissions to update project
    assertPermissionsToCreateProject(user, request, formData, userRoles);

    // DB : Create the project
    const createdProject = await createProjectWithRelated(db, form.data);

    // FORM : Rebuild the form data
    const updatedForm = await toFormShape(
      createdProject,
      createdProject.i18n,
      createdProject.maintainerRoles,
      createdProject.properties || []
    );

    // HTTP : 201 JSON or 400
    return SuperFormResponse<Project>(
      updatedForm,
      true,
      false, // Should always be false as only org members can create projects
      RESOURCE_PATH,
      201
    );
  } catch (err) {
    logZodError(err, 'Zod create error:');
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create');
  }
};
