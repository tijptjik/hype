// SVELTE
import { error } from '@sveltejs/kit'
// FORMS
import { superValidate, type SuperValidated } from 'sveltekit-superforms'
import {
  getDatabase,
  getPaginationOpts,
  isAdminRequest,
  isValidQueryParamsOrError,
  JSONResponseOrError,
  SuperFormResponse,
  SuperFormErrorResponse,
  logZodError,
} from '$lib/api'
// SERVICES
import { organisation } from '$lib/db/schema/index'
import {
  createOrganisationWithRelated,
  listOrganisations,
  toFormShape,
  toResponseShape,
} from '$lib/db/services/organisation'
import {
  getOrganisationQueryContext,
  assertPermissionsToCreateOrganisation,
  organisationWithRelations,
  assertCodeUnique,
} from '$lib/api/services/organisation'
// ZOD
import { zod } from 'sveltekit-superforms/adapters'
import { OrganisationInsertAPI, OrganisationInsertSuperAdminAPI } from '$lib/db/zod'
// TYPES
import type { RequestHandler } from '@sveltejs/kit'
import type { OrganisationNew, Organisation } from '$lib/types'

/********************
 *  COMMON
 ************/

const RESOURCE_TYPE = 'organisation'
const RESOURCE_PATH = 'organisations'

/********************
 *  LIST
 ************/

/**
 * Lists organisations
 */
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  const queryParams = isValidQueryParamsOrError(organisation, url) as Record<
    string,
    string | string[]
  >
  const searchParam = url.searchParams.get('q') || undefined
  const pagination = getPaginationOpts(url)

  // CONTEXT : Get the query context - this applies filters based on the user's permissions and the query parameters.
  const { conditions } = getOrganisationQueryContext(
    user,
    isAdminRequest(request),
    queryParams,
    userRoles,
  )

  try {
    // DB : List organisations, optionally applying search and pagination.
    const result = await listOrganisations(
      db,
      organisationWithRelations,
      conditions,
      locals.hub,
      pagination,
      {
        q: searchParam,
      },
    )

    // RESPONSE : Build the response shape
    const data = await Promise.all(
      result.map(async organisation => {
        return await toResponseShape(
          organisation,
          organisation.i18n,
          [],
          true, // isCollection
          user?.superAdmin || false, // isSuperAdmin
        )
      }),
    )

    // HTTP : 200 JSON or 404
    return JSONResponseOrError(data)
  } catch (e) {
    // DB : Query Error
    console.error('Database query error:', e)
    return error(500, 'Dust Accumulation Critical')
  }
}

/********************
 *  CREATE
 ************/

/**
 * Creates a new organisation
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  // ASSERT : User logged in
  const { db, session, user, userRoles } = await getDatabase(locals, platform)

  try {
    // ASSERT : Valid form
    const formData: OrganisationNew = await request.json()

    // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
    const insertSchema = user.superAdmin
      ? OrganisationInsertSuperAdminAPI
      : OrganisationInsertAPI

    let form = (await superValidate(
      formData,
      // @ts-expect-error - FORM : Fix type error
      zod(insertSchema),
    )) as SuperValidated<OrganisationNew>

    // ASSERT : Code is unique
    form = await assertCodeUnique(db, form, formData)

    // RETURN : early if the form is not valid
    if (!form.valid) {
      return SuperFormResponse<OrganisationNew>(form)
    }

    // ASSERT : Permissions to update organisation
    assertPermissionsToCreateOrganisation(user, request)

    // DB : Create the organisation
    const createdOrganisation = await createOrganisationWithRelated(
      db,
      form.data as OrganisationNew,
    )

    // FORM : Rebuild the form data
    const updatedForm = await toFormShape(
      createdOrganisation,
      createdOrganisation.i18n,
      createdOrganisation.userRoles,
      user.superAdmin || false,
    )

    // HTTP : 201 JSON or 400
    return SuperFormResponse<Organisation>(
      updatedForm,
      true,
      false, // Should always be false as only superAdmins can create organisations
      RESOURCE_PATH,
      201,
    )
  } catch (err) {
    logZodError(err, 'Organisation creation error:')
    return SuperFormErrorResponse(RESOURCE_TYPE, 'create')
  }
}
