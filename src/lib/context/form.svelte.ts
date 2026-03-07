// MESSAGES
import { m } from '$lib/i18n'
// SVELTE
import { getContext, setContext } from 'svelte'
// ZOD
import { zod4 as zod } from 'sveltekit-superforms/adapters'
// SUPERFORMS
import { get } from 'svelte/store'
import { defaults, superForm } from 'sveltekit-superforms'
import { deserialize } from '$app/forms'
// TOAST
import { toast } from 'svelte-sonner'
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib'
import { goto } from '$app/navigation'
// ZOD
import {
  OrganisationInsertAPI,
  OrganisationUpdateAPI,
  ProjectInsertAPI,
  ProjectUpdateAPI,
  FeatureInsertAPI,
  FeatureUpdateAPI,
  HubInsertAPI,
  HubUpdateAPI,
} from '$lib/db/zod'
import { LayerInsertAPI, LayerUpdateAPI } from '$lib/db/zod/schema/deprecated/layer'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { ActionResult } from '@sveltejs/kit'
import type { AdminCtx } from './admin.svelte'
import type { SuperValidated } from 'sveltekit-superforms/client'
import type {
  Code,
  FalsableResourceType,
  Feature,
  Hub,
  HubNew,
  Id,
  Layer,
  LayerNew,
  Organisation,
  OrganisationNew,
  Project,
  ProjectNew,
  Ref,
  ResourceType,
  SuperFormResult,
} from '$lib/types'

class BaseForm<T extends Record<string, unknown>> {
  protected formResult: SuperFormResult<T>
  protected adminCtx: AdminCtx
  protected resourceType: FalsableResourceType

  clientErrors: Record<string, string> = $state({})

  constructor(
    form: SuperValidated<T>,
    isNew: boolean,
    insertSchema: any,
    updateSchema: any,
    adminCtx: AdminCtx,
    resourceType: FalsableResourceType,
  ) {
    this.adminCtx = adminCtx
    this.resourceType = resourceType

    const formOptions = {
      dataType: 'json',
      SPA: true,
      validators: zod(isNew ? insertSchema : updateSchema),
      validationMethod: 'auto',
      resetForm: false,
      onSubmit: this.handleSubmit.bind(this),
    }
    const schema = zod(isNew ? insertSchema : updateSchema)

    // Check if we have nested data that defaults() might strip out
    const hasNestedProperties = (form.data as any).properties?.some?.(
      (prop: any) => prop.property,
    )
    const hasUserRoles = (form.data as any).userRoles?.length > 0
    const hasProjectUserRoles = (form.data as any).userRoles?.length > 0
    const hasOrganisations = (form.data as any).organisations?.length > 0
    const hasImage = (form.data as any).image != null

    let formData: unknown
    // TODO: This is a hack to preserve nested data. We should find a better way to do this.
    if (
      hasNestedProperties ||
      hasUserRoles ||
      hasProjectUserRoles ||
      hasOrganisations ||
      hasImage
    ) {
      // Skip defaults() if we have nested data to preserve it
      formData = form.data
    } else {
      // Apply defaults for new forms or forms without nested data
      formData = defaults(form.data, schema)
    }

    // @ts-expect-error
    this.formResult = superForm(formData, formOptions)
  }

  get form() {
    const formValue = this.formResult.form
    return formValue
  }
  get enhance() {
    return this.formResult.enhance
  }
  get constraints() {
    return this.formResult.constraints
  }
  get validate() {
    return this.formResult.validate
  }
  get validateForm() {
    return this.formResult.validateForm
  }
  get tainted() {
    return this.formResult.tainted
  }
  get isTainted() {
    return this.formResult.isTainted
  }
  get submit() {
    return this.formResult.submit
  }
  get reset() {
    return this.formResult.reset
  }
  get errors() {
    return this.formResult.errors
  }
  get message() {
    return this.formResult.message
  }
  get posted() {
    return this.formResult.posted
  }

  get hasClientErrors() {
    return Object.keys(this.clientErrors).length > 0
  }

  async handleSubmit({ action, cancel }: { action: URL; cancel: () => void }) {
    const validatedForm = await this.validateForm()

    // LOCAL VALIDATION
    if (!validatedForm.valid || this.hasClientErrors) {
      this.errors.set(validatedForm.errors)
      toast.error('Validation failed')
      cancel()
      return
      // SERVER VALIDATION
    } else {
      const response = await fetch(
        this.#getFetchUrl(action),
        this.#getFetchConfig(action),
      )
      const result = deserialize(await response.text()) as ActionResult

      // Determine if this is a create or update operation
      const isCreateOperation = action.pathname.endsWith('/new')

      if (result.type === 'redirect') {
        // Wait for cache invalidation to complete before navigating
        await this.adminCtx.invalidateAndRefresh(
          this.resourceType as FirstClassResource,
        )

        const url = new URL(window.location.href)
        url.pathname = result.location
        url.searchParams.delete('parentId')
        url.searchParams.delete('parentRef')

        const flashMessage = isCreateOperation
          ? m.gaudy_heavy_puma_adore()
          : m.tidy_game_jellyfish_pop()
        toast.success(flashMessage)

        this.adminCtx.setResourceRef(result.location.split('/').pop() as Id | Code)

        await goto(url.toString())
      } else if (result.type === 'success') {
        toast.success(m.tidy_game_jellyfish_pop())
        // Invalidate cache for the resource type; refresh resources
        this.adminCtx.invalidateAndRefresh(this.resourceType as FirstClassResource)

        this.reset({
          data: result.data?.data,
          newState: result.data?.data,
        })
      } else {
        // FAILURE / ERROR
        if (result.type === 'failure') {
          toast.error(m.long_crazy_peacock_care())
          console.error('[FORM CONTEXT]', result.data?.errors)
          // this.form.set(result.data?.data);
          this.errors.set(result.data?.errors)
        } else if (result.type === 'error') {
          // Extract the actual error message from SvelteKit error responses (403, 404, etc.)
          const statusLabel = `${result.status} Error`
          const errorMessage =
            (result as { error?: { message?: string } })?.error?.message || statusLabel
          toast.error(errorMessage)
          console.error('[FORM CONTEXT] HTTP Error:', result)
        } else {
          toast.error(m.round_pretty_lark_drip())
        }
        cancel()
      }
    }
  }

  #getFetchUrl(action: URL) {
    const apiUrl = new URL(action.href)
    apiUrl.pathname = apiUrl.pathname.replace(`${ADMIN_PATH}/`, `${API_PATH}/`)
    if (action.pathname.endsWith('/new')) {
      apiUrl.pathname = apiUrl.pathname.replace('/new', '')
    }
    return apiUrl
  }

  #getFetchConfig(action: URL) {
    // DATA
    const body = JSON.stringify(get(this.form))
    // METHOD
    const method = action.pathname.endsWith('/new') ? 'POST' : 'PUT'
    // HEADERS
    const headers = {
      'Content-Type': 'application/json',
    }
    return { method, headers, body }
  }

  setClientError(field: string, error: string) {
    this.clientErrors[field] = error
  }

  clearClientError(field: string) {
    delete this.clientErrors[field]
  }

  clearAllClientErrors() {
    this.clientErrors = {}
  }
}

export class OrganisationForm extends BaseForm<Organisation> {
  constructor(form: SuperValidated<Organisation>, isNew: boolean, adminCtx: AdminCtx) {
    super(
      form,
      isNew,
      OrganisationInsertAPI,
      OrganisationUpdateAPI,
      adminCtx,
      FirstClassResource.organisation,
    )
  }
}

export class ProjectForm extends BaseForm<Project> {
  constructor(form: SuperValidated<Project>, isNew: boolean, adminCtx: AdminCtx) {
    super(
      form,
      isNew,
      ProjectInsertAPI,
      ProjectUpdateAPI,
      adminCtx,
      FirstClassResource.project,
    )
  }
}

export class LayerForm extends BaseForm<Layer> {
  constructor(form: SuperValidated<Layer>, isNew: boolean, adminCtx: AdminCtx) {
    super(
      form,
      isNew,
      LayerInsertAPI,
      LayerUpdateAPI,
      adminCtx,
      FirstClassResource.layer,
    )
  }
}

export class FeatureForm extends BaseForm<Feature> {
  constructor(form: SuperValidated<Feature>, isNew: boolean, adminCtx: AdminCtx) {
    super(
      form,
      isNew,
      FeatureInsertAPI,
      FeatureUpdateAPI,
      adminCtx,
      FirstClassResource.feature,
    )
  }
}

export class HubForm extends BaseForm<Hub> {
  constructor(form: SuperValidated<Hub>, isNew: boolean, adminCtx: AdminCtx) {
    super(form, isNew, HubInsertAPI, HubUpdateAPI, adminCtx, FirstClassResource.hub)
  }
}

export const getContextRef = (resourceType: ResourceType, entity: Ref) => {
  return entity === NEW_REF
    ? `form-${resourceType}-new`
    : `form-${resourceType}-${entity}`
}

export function setForm(
  resourceType: 'organisation',
  entity: Ref,
  form: SuperValidated<OrganisationNew | Organisation>,
  adminCtx: AdminCtx,
): OrganisationForm

export function setForm(
  resourceType: 'project',
  entity: Ref,
  form: SuperValidated<ProjectNew | Project>,
  adminCtx: AdminCtx,
): ProjectForm

export function setForm(
  resourceType: 'layer',
  entity: Ref,
  form: SuperValidated<LayerNew | Layer>,
  adminCtx: AdminCtx,
): LayerForm

export function setForm(
  resourceType: 'feature',
  entity: Ref,
  form: SuperValidated<Feature>,
  adminCtx: AdminCtx,
): FeatureForm

export function setForm(
  resourceType: 'hub',
  entity: Ref,
  form: SuperValidated<HubNew | Hub>,
  adminCtx: AdminCtx,
): HubForm

export function setForm<T extends Organisation | Project | Layer | Feature | Hub>(
  resourceType: FalsableResourceType,
  entity: Ref,
  form: SuperValidated<T>,
  adminCtx: AdminCtx,
): OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm {
  if (!entity) {
    console.trace()
    throw new Error('Entity is required')
  }

  switch (resourceType) {
    case 'organisation': {
      const instance = new OrganisationForm(
        form as SuperValidated<Organisation>,
        entity === NEW_REF,
        adminCtx,
      )
      return setContext(getContextRef(resourceType, entity), instance)
    }
    case 'project': {
      const instance = new ProjectForm(
        form as SuperValidated<Project>,
        entity === NEW_REF,
        adminCtx,
      )
      return setContext(getContextRef(resourceType, entity), instance)
    }
    case 'layer': {
      const instance = new LayerForm(
        form as SuperValidated<Layer>,
        entity === NEW_REF,
        adminCtx,
      )
      return setContext(getContextRef(resourceType, entity), instance)
    }
    case 'feature': {
      const instance = new FeatureForm(
        form as SuperValidated<Feature>,
        entity === NEW_REF,
        adminCtx,
      )
      return setContext(getContextRef(resourceType, entity), instance)
    }
    case 'hub': {
      const instance = new HubForm(
        form as SuperValidated<Hub>,
        entity === NEW_REF,
        adminCtx,
      )
      return setContext(getContextRef(resourceType, entity), instance)
    }
    default:
      throw new Error(`Unknown resource type: ${resourceType}`)
  }
}

export function getForm(resource: 'organisation', entity: Ref): OrganisationForm

export function getForm(resource: 'project', entity: Ref): ProjectForm

export function getForm(resource: 'layer', entity: Ref): LayerForm

export function getForm(resource: 'feature', entity: Ref): FeatureForm

export function getForm(resource: 'hub', entity: Ref): HubForm

export function getForm<T extends Organisation | Project | Layer | Feature | Hub>(
  resource: ResourceType,
  entity: Ref,
): OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm {
  const ctx = getContext<
    OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm | undefined
  >(getContextRef(resource, entity))
  if (!ctx) {
    throw new Error(
      `Form context is missing for resource '${resource}' and entity '${entity}'. Ensure setForm() is called before using getForm().`,
    )
  }
  return ctx
}
