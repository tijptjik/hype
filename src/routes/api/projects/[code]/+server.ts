import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { projectRole, projectI18n, organisationRole } from '$lib/db/schema';
import {
  getDatabaseOrError,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  type AccessStrategyOption
} from '$lib/api';
import { hierarchicalEntityQuery } from '$lib/db';
// DB
import {
  updateProject,
  updateTranslations,
  updateMaintainerRoles,
  rebuildFormData,
  extractEntitiesToUpdate,
  mergeOrganisationRoles,
  patchProject
} from '$lib/db/services/project';
import { updateRelatedProperties } from '$lib/db/services/property';
import { isFieldUnique, isFieldChanged } from '$lib/db';
// ZOD
import { ProjectPatch, ProjectUpdateAPI } from '$lib/db/zod';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms/client';
import type { OrganisationRole, Project, ProjectDB, ProjectPartialUpdate } from '$lib/types';
import { and, eq } from 'drizzle-orm';
import { patchFeature } from '$lib/db/services/feature';

const RESOURCE_TYPE = 'project';
const RESOURCE_PATH = 'projects';
const ACCESS_STRATEGY = 'EntityOwn' as AccessStrategyOption;
const PUBLIC_IDENTIFIER = 'code';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  if (params.code !== 'new') {
    try {
      // DB : Build & Execute Query
      const result = await hierarchicalEntityQuery(
        db,
        params[PUBLIC_IDENTIFIER] as string,
        PUBLIC_IDENTIFIER,
        accessStrategy,
        {
          maintainerRoles: {
            with: {
              user: {
                columns: {
                  email: false,
                  emailVerified: false,
                  createdAt: false,
                  modifiedAt: false
                }
              }
            }
          },
          translations: true,
          properties: {
            with: {
              translations: true,
              values: {
                with: {
                  translations: true
                }
              }
            }
          }
        },
        userId,
        projectRole,
        projectI18n,
        2
      );

      // Process result to include organization roles
      let processedResult = await mergeOrganisationRoles(db, result);
      processedResult.properties.reverse();


      // HTTP : 200 JSON or 404
      return JSONResponseOrError(processedResult);
    } catch (e) {
      // DB : Query Error
      console.error('Database query error:', e);
      // HTTP : 500 Error
      return error(500, 'Dust Accumulation Critical');
    }
  } else {
    return error(500, 'The Old Shall Never Be New Again');
  }
};

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // AUTH : Pass or Fail
  const { db, userId, accessStrategy } = await getDatabaseOrError(
    locals,
    platform,
    ACCESS_STRATEGY,
    RESOURCE_TYPE
  );
  let redirect = false;

  try {
    const formData: Project = await request.json();
    const form = (await superValidate(formData, zod(ProjectUpdateAPI))) as SuperValidated<Project>;

    // Check if the current user will lose access on membership changes
    const userLosesAccess =
      !form.data.maintainerRoles.map((userRole) => userRole.userId).includes(userId) &&
      accessStrategy !== 'SuperAdmin';
    const codeChanged = await isFieldChanged<ProjectDB>(
      db,
      formData.id as string,
      formData.code as string,
      RESOURCE_TYPE,
      'code'
    );

    if (codeChanged) {
      const codeUnique = await isFieldUnique<Project>(db, formData, RESOURCE_TYPE, 'code');
      if (!codeUnique) {
        form.valid = false;
        form.errors.code = ['Code already exists'];
      }
    }

    if (!form.valid) {
      // If validation fails, return form with the errors
      return SuperFormResponse<Project>(form);
    }

    const { baseProject, formTranslations, formMaintainerRoles, formProperties } = extractEntitiesToUpdate(
      form.data as Project
    );
    const updatedProject = await updateProject(db, baseProject, params.code as string);
    const updatedTranslations = await updateTranslations(db, formTranslations, updatedProject.id);
    const updatedMaintainerRoles = await updateMaintainerRoles(
      db,
      formMaintainerRoles,
      updatedProject.id,
      updatedProject.organisationId
    );
    const updatedProperties = await updateRelatedProperties(db, formProperties, updatedProject.id);

    const updatedForm = await rebuildFormData(
      db,
      updatedProject,
      updatedTranslations,
      updatedMaintainerRoles,
      updatedProperties
    );


    if (userLosesAccess || codeChanged) {
      redirect = true;
    }

    return SuperFormResponse<Project>(updatedForm, redirect, userLosesAccess, RESOURCE_PATH);
  } catch (err) {
    console.error(err);
    return SuperFormErrorResponse(RESOURCE_TYPE);
  }
};


export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db } = await getDatabaseOrError(locals, platform, ACCESS_STRATEGY, RESOURCE_TYPE);
  
  try {
    const formData: ProjectPartialUpdate = await request.json();
    const form = await superValidate(formData, zod(ProjectPatch));

    if (!form.valid) {
      return json(form, { status: 400 });
    }

    const updated = await patchProject(db, params.code as string, form.data);
    return json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Failed to update layer' }, { status: 500 });
  }
};
