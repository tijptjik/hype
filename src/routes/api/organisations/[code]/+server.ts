// SVELTE
import { json } from '@sveltejs/kit'
import { error } from '@sveltejs/kit'
// I18N
import { m } from '$lib/i18n'
// DRIZZLE
import { eq } from 'drizzle-orm'
// FORMS
import { superValidate } from 'sveltekit-superforms'
// ZOD
import { zod } from 'sveltekit-superforms/adapters'
// SCHEMA
import { organisation } from '$lib/db/schema/index'
// DB
import {
  getOrganisation,
  toFormShape,
  updateOrganisation,
  updateOrganisationWithRelated,
  toResponseShape,
} from '$lib/db/services/organisation'
// API
import {
  getDatabase,
  isAdminRequest,
  JSONResponseOrError,
  SuperFormErrorResponse,
  SuperFormResponse,
} from '$lib/api'
import {
  assertPermissionsToUpdateOrganisation,
  getOrganisationQueryContext,
  isAccessLostUponSuccess,
  organisationWithRelations,
  assertCodeUnique,
} from '$lib/api/services/organisation'
// TYPES
import type { RequestHandler } from '@sveltejs/kit'
import type { SuperValidated } from 'sveltekit-superforms/client'
import type {
  Organisation,
  OrganisationDB,
  OrganisationPartial,
  Code,
} from '$lib/types'
import { OrganisationInsertAPI, OrganisationInsertSuperAdminAPI } from '$lib/db/zod'

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'organisation'
const RESOURCE_PATH = 'organisations'

/********************
 *  READ
 ************/

/**
 * Reads an organisation
 */
export const GET: RequestHandler = async ({
  params,
  locals,
  platform,
  request,
  url,
}) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  try {
    // GET : Context for organisation query
    const { params: queryParams, conditions } = getOrganisationQueryContext(
      user!,
      isAdminRequest(request),
      {},
      userRoles,
    )

    // CHECK : Query parameter for lookup by ID vs code
    const byId = url.searchParams.get('byId') === 'true'

    // EXTEND : Add GET identifier (code or id)
    if (params.code) {
      if (byId) {
        conditions.push(eq(organisation.id, params.code))
      } else {
        conditions.push(eq(organisation.code, params.code))
      }
    }

    const result = await getOrganisation(
      db,
      organisationWithRelations,
      conditions,
      locals.hub,
    )

    if (!result) {
      return error(404, m.brief_jumpy_firefox_bump({ key: 'Organisation' }))
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      result,
      false, // isCollection
      user.superAdmin || false, // isSuperAdmin
    )

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data)
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e)
    // HTTP : 500 Error
    return error(500, 'Dust Accumulation Critical')
  }
}

/********************
 *  UPDATE :: PUT
 ************/

/**
 * Replaces an organisation
 */
export const PUT: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  // ASSERT : Valid form data
  const formData: Organisation = await request.json()

  // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
  const updateSchema = user.superAdmin
    ? OrganisationInsertSuperAdminAPI
    : OrganisationInsertAPI

  let form = (await superValidate(
    formData,
    // @ts-expect-error - FORM : Fix SuperForm type error
    zod(updateSchema),
  )) as SuperValidated<Organisation>

  // ASSERT : Code has (1) not changed, or (2) changed to another unique value
  // Use URL param code for lookup, form code for comparison
  if (params.code !== formData.code) {
    // @ts-expect-error - FORM : Fix form type error
    form = await assertCodeUnique(db, form, formData)
  }

  // RETURN : early if the form is not valid
  if (!form.valid) return SuperFormResponse<Organisation>(form)

  // ASSERT : Organisation Exists
  const existingForPermCheck = (await getOrganisation(
    db,
    {},
    [eq(organisation.code, params.code!)],
    locals.hub,
  )) as OrganisationDB

  if (!existingForPermCheck)
    return error(404, m.resource_not_found({ resourceType: m.any_small_midge_aim() }))

  // ACCESS CONTROL : Check permissions
  assertPermissionsToUpdateOrganisation(user, request, existingForPermCheck, userRoles)

  try {
    // DB : Update the organisation
    const updatedOrganisation = await updateOrganisationWithRelated(
      db,
      form.data,
      params.code,
    )

    // RESPONSE : Convert to form shape
    const updatedForm = await toFormShape(updatedOrganisation, user.superAdmin || false)

    // ACCESS : Check for user access loss after code change
    const isAccessLost = isAccessLostUponSuccess(user, formData, userRoles)

    // STATE : Determine if redirect is needed (only when code changes or access is lost)
    const shouldRedirect = isAccessLost || params.code !== formData.code

    // HTTP : 200 JSON or 400
    // @ts-expect-error - FORM : Fix SuperForm type error
    return SuperFormResponse<Organisation>(
      updatedForm,
      shouldRedirect,
      isAccessLost,
      RESOURCE_PATH,
    )
  } catch (err) {
    // DB : Query Error
    console.error('Database query error:', err)
    // HTTP : 500 Error
    return SuperFormErrorResponse(RESOURCE_TYPE, 'update')
  }
}

/********************
 *  UPDATE :: PATCH
 ************/

/**
 * Partially updates an organisation - only the fields that are provided in the request body.
 * This endpoint is used for updating fields that don't require a full form submission,
 * such as the organisation publish or archive status.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  // ASSERT : Valid form data
  const newData: OrganisationPartial = await request.json()

  // ASSERT : Organisation Exists
  const existing = (await getOrganisation(
    db,
    {},
    [eq(organisation.code, params.code!)],
    locals.hub,
  )) as OrganisationDB

  if (!existing)
    return error(404, m.resource_not_found({ resourceType: m.any_small_midge_aim() }))

  // ASSERT : Code has (1) not changed, or (2) changed to another unique value
  // Use URL param code for lookup, form code for comparison
  if ('code' in newData && params.code !== newData.code) {
    // @ts-expect-error - FORM : Fix form type error
    form = await assertCodeUnique(db, form, newData)
  }

  // Use assertion functions for access control
  assertPermissionsToUpdateOrganisation(user, request, existing, userRoles)

  try {
    // DB : Update only the basic organisation fields (no relations for PATCH)
    await updateOrganisation(db, newData, params.code as Code)

    // DB : Get the updated organisation with all relations for response
    const updatedWithRelations = await getOrganisation(
      db,
      organisationWithRelations,
      [eq(organisation.code, params.code as Code)],
      locals.hub,
    )

    if (!updatedWithRelations) {
      return error(500, 'Failed to retrieve updated organisation')
    }

    // RESPONSE : Build the response shape
    const data = await toResponseShape(
      updatedWithRelations,
      false, // isCollection
      user!.superAdmin || false, // isSuperAdmin
    )

    return json({ type: 'success', data })
  } catch (err) {
    // DB : Query Error
    console.error('Database query error:', err)
    // HTTP : 500 Error
    return SuperFormErrorResponse(RESOURCE_TYPE, 'patch')
  }
}
