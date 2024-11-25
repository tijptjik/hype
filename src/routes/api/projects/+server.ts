import { error, type RequestHandler } from '@sveltejs/kit';
import { actionResult, superValidate, type SuperValidated } from 'sveltekit-superforms';
// DB
import { getDatabaseOrError, isValidQueryParamsOrError, JSONResponseOrError, SuperFormResponse } from '$lib/api';
import { hierarchicalResourceQuery } from '$lib/db';
import { createRelatedProperties } from '$lib/db/services/property';
import { projectRole, projectI18n, project } from '$lib/db/schema';
import {
  createProject,
  createTranslations,
  createMaintainerRoles,
  rebuildFormData,
  extractEntitiesToInsert
} from '$lib/db/services/project';
import { isFieldUnique } from '$lib/db';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { ProjectInsertAPI } from '$lib/db/zod';
// TYPES
import type { NewProject, Project, Property } from '$lib/types';

const RESOURCE_TYPE = 'project';
const RESOURCE_PATH = 'projects';
const ACCESS_STRATEGY = 'ResourceOwn';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    // Validate query parameters, or return 400
    const queryParams = isValidQueryParamsOrError(project, url);

    const result = await hierarchicalResourceQuery(
      db,
      accessStrategy,
      {
        maintainerRoles: true,
        translations: true,
        image: true
      },
      userId,
      projectRole,
      projectI18n,
      {
        organisation: url.searchParams.getAll('organisation')
      },
      2,
      queryParams
    );

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(result);
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e);
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical');
  }
};

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );

  try {
    const formData: NewProject = await request.json();
    const form = (await superValidate(
      formData,
      zod(ProjectInsertAPI)
    )) as SuperValidated<Project>;

    // Check if the current user will lose access on membership changes
    const userLosesAccess = !Object.keys(form.data.maintainerRoles).includes(userId) && accessStrategy !== 'SuperAdmin'; 
    const codeUnique = await isFieldUnique<Project>(db, formData as Project, RESOURCE_TYPE, 'code');

    if (!codeUnique) {
      form.valid = false;
      form.errors.code = ['Code already exists'];
    }

    if (!form.valid) {
      return SuperFormResponse<Project>(form);
    }

    const { baseProject, formTranslations, formMaintainerRoles, formProperties } = extractEntitiesToInsert(
      form.data as NewProject
    );
    const createdProject = await createProject(db, baseProject);
    const createdTranslations = await createTranslations(
      db,
      formTranslations,
      createdProject.id
    );
    const createdMaintainerRoles = await createMaintainerRoles(db, formMaintainerRoles, createdProject.id);
    const createdProperties = await createRelatedProperties(db, formProperties, createdProject.id);
    const updatedForm = await rebuildFormData(
      db,
      createdProject,
      createdTranslations,
      createdMaintainerRoles,
      createdProperties
    );
    return SuperFormResponse<Project>(updatedForm, true, userLosesAccess, RESOURCE_PATH, 201);
  } catch (err) {
    console.error(err);
    return actionResult('error', 'Failed to create project', { status: 500 });
  }
}
