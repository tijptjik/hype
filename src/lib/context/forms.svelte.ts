// SVELTE
import { getContext, setContext } from 'svelte';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
// SUPERFORMS
import { get } from 'svelte/store';
import { defaults, superForm } from 'sveltekit-superforms';
import { deserialize, enhance } from '$app/forms';
// NAVIGATION
import { goto } from '$app/navigation';
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib';
// I18N
import { i18n } from '$lib/i18n';
// ZOD
import {
  OrganisationInsertAPI,
  OrganisationUpdateAPI,
  ProjectInsertAPI,
  ProjectUpdateAPI,
  LayerInsertAPI,
  LayerUpdateAPI,
  FeatureInsertAPI,
  FeatureUpdateAPI
} from '$lib/db/zod';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { Writable } from 'svelte/store';
import type { ActionResult } from '@sveltejs/kit';
import type { ResourceState } from './resources.svelte';
import type { SuperValidated } from 'sveltekit-superforms/client';
import type {
  Organisation,
  Project,
  Layer,
  Feature,
  ResourceType,
  FalsableResourceType,
  Ref,
  SuperFormResult
} from '$lib/types';
import { navigate } from '$lib/navigation';

class BaseForm<T extends Record<string, unknown>> {
  protected formResult: SuperFormResult<T>;
  protected resourceState: ResourceState;
  protected resourceType: FalsableResourceType;
  protected flash: Writable<App.PageData['flash']>;

  constructor(
    form: SuperValidated<T>,
    isNew: boolean,
    insertSchema: any,
    updateSchema: any,
    resourceState: ResourceState,
    resourceType: FalsableResourceType,
    flash: Writable<App.PageData['flash']>
  ) {
    this.resourceState = resourceState;
    this.resourceType = resourceType;
    const formOptions = {
      dataType: 'json',
      SPA: true,
      validators: zod(isNew ? insertSchema : updateSchema),
      validationMethod: 'auto',
      resetForm: false,
      onSubmit: this.handleSubmit.bind(this)
    };
    const schema = zod(isNew ? insertSchema : updateSchema);
    this.formResult = superForm(defaults(form.data, schema), formOptions);
    this.flash = flash;
  }

  get form() {
    return this.formResult.form;
  }
  get enhance() {
    return this.formResult.enhance;
  }
  get constraints() {
    return this.formResult.constraints;
  }
  get validate() {
    return this.formResult.validate;
  }
  get validateForm() {
    return this.formResult.validateForm;
  }
  get tainted() {
    return this.formResult.tainted;
  }
  get isTainted() {
    return this.formResult.isTainted;
  }
  get submit() {
    return this.formResult.submit;
  }
  get reset() {
    return this.formResult.reset;
  }
  get errors() {
    return this.formResult.errors;
  }
  get message() {
    return this.formResult.message;
  }
  get posted() {
    return this.formResult.posted;
  }

  async handleSubmit({ action, cancel }: { action: URL; cancel: () => void }) {
    const validatedForm = await this.validateForm();

    // LOCAL VALIDATION
    if (!validatedForm.valid) {
      this.errors.set(validatedForm.errors);
      this.flash.set({ type: 'error', message: 'Validation failed' });
      cancel();
      return;
      // SERVER VALIDATION
    } else {
      const response = await fetch(
        this.#getFetchUrl(action),
        this.#getFetchConfig(action)
      );
      const result = deserialize(await response.text()) as ActionResult;
      if (result.type === 'redirect') {
        // Invalidate cache for the resource type; refresh resources
        this.resourceState.invalidateAndRefresh(
          this.resourceType as HierarchicalResource
        );
        // TODO Replace with method that invalidates the user session and refetches
        // the userRoles -- as currently the userRoles are not updated on the client
        // side when the user is redirected to the new resource / index of resources
        // causing it to not show up / still show up.

        const url = new URL(window.location.href);
        url.pathname = result.location;
        url.searchParams.delete('parentId');
        url.searchParams.delete('parentRef');
        // goto(url.toString());
        this.flash.set({
          type: 'success',
          message: 'Created successfully',
          options: { clearOnNavigate: false, clearAfterMs: 5000 }
        });
        window.location.href = url.toString();
      } else if (result.type === 'success') {
        this.flash.set({ type: 'success', message: 'Updated successfully' });
        // Invalidate cache for the resource type; refresh resources
        this.resourceState.invalidateAndRefresh(
          this.resourceType as HierarchicalResource
        );
        this.reset({
          data: result.data?.data,
          newState: result.data?.data
        });
      } else {
        // FAILURE / ERROR
        if (result.type === 'failure') {
          this.flash.set({ type: 'error', message: 'Submission failed' });
          console.log('failure', result.data?.errors);
          // this.form.set(result.data?.data);
          this.errors.set(result.data?.errors);
        } else {
          this.flash.set({ type: 'error', message: 'Unexpected error' });
        }
        cancel();
      }
    }
  }

  #getFetchUrl(action: URL) {
    const apiUrl = new URL(action.href);
    apiUrl.pathname = apiUrl.pathname.replace(`${ADMIN_PATH}/`, `${API_PATH}/`);
    if (action.pathname.endsWith('/new')) {
      apiUrl.pathname = apiUrl.pathname.replace('/new', '');
    }
    return apiUrl;
  }

  #getFetchConfig(action: URL) {
    // DATA
    const body = JSON.stringify(get(this.form));
    // METHOD
    const method = action.pathname.endsWith('/new') ? 'POST' : 'PUT';
    // HEADERS
    const headers = {
      'Content-Type': 'application/json'
    };
    return { method, headers, body };
  }
}

export class OrganisationForm extends BaseForm<Organisation> {
  constructor(
    form: SuperValidated<Organisation>,
    isNew: boolean,
    resourceState: ResourceState,
    flash: Writable<App.PageData['flash']>
  ) {
    super(
      form,
      isNew,
      OrganisationInsertAPI,
      OrganisationUpdateAPI,
      resourceState,
      HierarchicalResource.organisation,
      flash
    );
  }
}

export class ProjectForm extends BaseForm<Project> {
  constructor(
    form: SuperValidated<Project>,
    isNew: boolean,
    resourceState: ResourceState,
    flash: Writable<App.PageData['flash']>
  ) {
    super(
      form,
      isNew,
      ProjectInsertAPI,
      ProjectUpdateAPI,
      resourceState,
      HierarchicalResource.project,
      flash
    );
  }
}

export class LayerForm extends BaseForm<Layer> {
  constructor(
    form: SuperValidated<Layer>,
    isNew: boolean,
    resourceState: ResourceState,
    flash: Writable<App.PageData['flash']>
  ) {
    super(
      form,
      isNew,
      LayerInsertAPI,
      LayerUpdateAPI,
      resourceState,
      HierarchicalResource.layer,
      flash
    );
  }
}

export class FeatureForm extends BaseForm<Feature> {
  constructor(
    form: SuperValidated<Feature>,
    isNew: boolean,
    resourceState: ResourceState,
    flash: Writable<App.PageData['flash']>
  ) {
    super(
      form,
      isNew,
      FeatureInsertAPI,
      FeatureUpdateAPI,
      resourceState,
      HierarchicalResource.feature,
      flash
    );
  }
}

export const getContextRef = (resourceType: ResourceType, entity: Ref) => {
  return entity === NEW_REF
    ? `form-${resourceType}-new`
    : `form-${resourceType}-${entity}`;
};

export function setForm<T extends Organisation | Project | Layer | Feature>(
  resourceType: FalsableResourceType,
  entity: Ref,
  form: SuperValidated<T>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): SuperFormResult<T> {
  if (!entity) {
    console.trace();
    throw new Error('Entity is required');
  }
  let FormClass;
  switch (resourceType) {
    case 'organisation':
      FormClass = OrganisationForm;
      break;
    case 'project':
      FormClass = ProjectForm;
      break;
    case 'layer':
      FormClass = LayerForm;
      break;
    case 'feature':
      FormClass = FeatureForm;
      break;
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
  const instance = new FormClass(form, entity === NEW_REF, resourceState, flash);
  return setContext(
    getContextRef(resourceType, entity),
    instance
  ) as SuperFormResult<T>;
}

export function getForm<T extends Organisation | Project | Layer | Feature>(
  resource: ResourceType,
  entity: Ref
): SuperFormResult<T> {
  return getContext<SuperFormResult<T>>(getContextRef(resource, entity));
}
