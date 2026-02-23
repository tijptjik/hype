// SVELTE
import { error, json } from '@sveltejs/kit'
// I18n
import { m } from '$lib/i18n'
// DRIZZLE
import { eq } from 'drizzle-orm'
// FORMS
import { superValidate } from 'sveltekit-superforms'
// ZOD
import { zod4 as zod } from 'sveltekit-superforms/adapters'
import { ProjectUpdateAPI } from '$lib/db/zod'
// SCHEMA
import { project } from '$lib/db/schema/index'
// DB
import {
  getProject,
  updateProject,
  updateProjectWithRelated,
  toFormShape,
  toResponseShape,
} from '$lib/db/services/project'
// API
import {
  getDatabase,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  getPrisms,
  logZodError,
} from '$lib/api'
import {
  getProjectQueryContext,
  assertPermissionsToUpdateProject,
  projectEntityWithRelations,
  assertCodeUnique,
} from '$lib/api/services/project'
// TYPES
import type { RequestHandler } from '@sveltejs/kit'
import type { SuperValidated } from 'sveltekit-superforms/client'
import type {
  Project,
  ProjectDB,
  ProjectI18nDB,
  ProjectPartial,
  ProjectRoleDB,
  PropertyDBRaw,
  Code,
} from '$lib/types'

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'project'
const RESOURCE_PATH = 'projects'

/********************
 *  READ
 ************/

/**
 * Reads a project
 */
export const GET: RequestHandler = async ({
  params,
  url,
  locals,
  platform,
  request,
}) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  // CONTEXT : Get the query context
  const { conditions } = getProjectQueryContext(
    db,
    user,
    request,
    {},
    userRoles,
    getPrisms(url),
  )

  try {
    // CHECK : Query parameter for lookup by ID vs code
    const byId = url.searchParams.get('byId') === 'true'

    // Add condition for specific project code or id
    if (byId) {
      conditions.push(eq(project.id, params.code!))
    } else {
      conditions.push(eq(project.code, params.code!))
    }

    // DB : Get the project
    const result = await getProject(db, projectEntityWithRelations, conditions, {
      ...locals.hub,
      isSuperAdmin: user.superAdmin || false,
    })

    if (!result) {
      return error(404, m.resource_not_found({ resourceType: m.deft_mealy_ant_vent() }))
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result,
      result.i18n as unknown as ProjectI18nDB[],
      result.maintainerRoles as unknown as ProjectRoleDB[],
      result.properties as unknown as PropertyDBRaw[],
    )

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data)
  } catch (e) {
    // DB : Query Error
    logZodError(e, 'Zod read error:')
    return error(500, 'Dust Accumulation Critical')
  }
}

export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  try {
    // ASSERT : Valid form
    const formData: Project = await request.json()
    let form = (await superValidate(
      formData,
      // @ts-expect-error - FORM : Fix type error
      zod(ProjectUpdateAPI),
    )) as SuperValidated<Project>

    // ASSERT : Code has (1) not changed, or (2) changed to another unique value
    // Use URL param code for lookup, form code for comparison
    if ('code' in formData && formData.code !== params.code) {
      form = (await assertCodeUnique(db, form, formData)) as any
    }

    // RETURN : early if the form is not valid
    if (!form.valid) return SuperFormResponse<Project>(form)

    // ASSERT : Permissions to update project
    assertPermissionsToUpdateProject(user, request, formData, userRoles)

    // DB : Update the project
    const updatedProject = await updateProjectWithRelated(db, form.data, params.code)

    // RESPONSE : Convert to form shape and return
    const updatedForm = await toFormShape(
      updatedProject,
      updatedProject.i18n,
      updatedProject.maintainerRoles,
      updatedProject.properties || [],
    )

    // STATE : Determine if redirect is needed (only when code changes)
    const shouldRedirect = formData.code !== params.code

    // HTTP : 200 JSON or 400
    return SuperFormResponse<Project>(
      updatedForm,
      shouldRedirect,
      false, // Should always be false as only org members can update projects
      RESOURCE_PATH,
    )
  } catch (err) {
    logZodError(err, 'Update error:')
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update')
  }
}

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates a project - only the fields that are provided in the request body. This endpoint is used for updating fields that don't require a full form submission, such as the project publish or archive status.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  const { db, user, userRoles } = await getDatabase(locals, platform)
  try {
    // ASSERT : Valid form data
    const newData: ProjectPartial = await request.json()

    // Get the existing project to verify access
    const conditions = [eq(project.code, params.code as string)]
    const existing = (await getProject(db, {}, conditions, {
      ...locals.hub,
      isSuperAdmin: user!.superAdmin || false,
    })) as ProjectDB

    if (!existing)
      return error(404, m.resource_not_found({ resourceType: m.deft_mealy_ant_vent() }))

    // ASSERT : Code has (1) not changed, or (2) changed to another unique value
    // Use URL param code for lookup, form code for comparison
    if ('code' in newData && params.code !== newData.code) {
      // @ts-expect-error - FORM : Fix form type error
      form = await assertCodeUnique(db, form, newData)
    }

    // Use assertion functions for access control
    assertPermissionsToUpdateProject(user, request, existing, userRoles)

    // DB : Update only the basic project fields (no relations for PATCH)
    await updateProject(db, newData, params.code as string)

    // DB : Get the updated project with all relations for response
    const updatedWithRelations = await getProject(
      db,
      projectEntityWithRelations,
      [eq(project.code, params.code as string)],
      { ...locals.hub, isSuperAdmin: user.superAdmin || false },
    )

    if (!updatedWithRelations) {
      return error(500, 'Failed to retrieve updated project')
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      updatedWithRelations,
      updatedWithRelations.i18n as unknown as ProjectI18nDB[],
      updatedWithRelations.maintainerRoles as unknown as ProjectRoleDB[],
      updatedWithRelations.properties as unknown as PropertyDBRaw[],
    )

    return json({ type: 'success', data })
  } catch (err) {
    logZodError(err, 'Update error:')
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch')
  }
}
