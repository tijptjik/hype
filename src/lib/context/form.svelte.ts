// MESSAGES
import { m } from '$lib/i18n';
// SVELTE
import { getContext, setContext } from 'svelte';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
// SUPERFORMS
import { get } from 'svelte/store';
import { defaults, superForm } from 'sveltekit-superforms';
import { deserialize } from '$app/forms';
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib';
import { goto } from '$app/navigation';
// ZOD
import {
  OrganisationInsertAPI,
  OrganisationUpdateAPI,
  ProjectInsertAPI,
  ProjectUpdateAPI,
  LayerInsertAPI,
  LayerUpdateAPI,
  FeatureInsertAPI,
  FeatureUpdateAPI,
  HubInsertAPI,
  HubUpdateAPI,
} from '$lib/db/zod';
// ENUMS
import { FirstClassResource, HierarchicalResource } from '$lib/enums';
// TYPES
import type { Writable } from 'svelte/store';
import type { ActionResult } from '@sveltejs/kit';
import type { ResourceState } from './resource.svelte';
import type { SuperValidated } from 'sveltekit-superforms/client';
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
} from '$lib/types';

class BaseForm<T extends Record<string, unknown>> {
  protected formResult: SuperFormResult<T>;
  protected resourceState: ResourceState;
  protected resourceType: FalsableResourceType;
  protected flash: Writable<App.PageData['flash']>;

  clientErrors: Record<string, string> = $state({});

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
    
    // // Check if we have nested data that defaults() might strip out
    // const hasNestedProperties = (form.data as any).properties?.some?.((prop: any) => prop.property);
    
    // let formData;
    // if (hasNestedProperties) {
    //   // Skip defaults() if we have nested property data to preserve it
    //   formData = form.data;
    // } else {
    //   // Apply defaults for new forms or forms without nested data
    //   formData = defaults(form.data, schema);
    // }
    
    // @ts-ignore
    this.formResult = superForm(defaults(form.data, schema), formOptions);

    // this.formResult = superForm(formData, formOptions);
    
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

  get hasClientErrors() {
    return Object.keys(this.clientErrors).length > 0;
  }

  async handleSubmit({ action, cancel }: { action: URL; cancel: () => void }) {
    const validatedForm = await this.validateForm();

    // LOCAL VALIDATION
    if (!validatedForm.valid || this.hasClientErrors) {
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

      // Determine if this is a create or update operation
      const isCreateOperation = action.pathname.endsWith('/new');

      if (result.type === 'redirect') {
        // Wait for cache invalidation to complete before navigating
        await this.resourceState.invalidateAndRefresh(
          this.resourceType as HierarchicalResource
        );

        // Refresh session to update user roles for the new resource
        await this.refreshSession();

        const url = new URL(window.location.href);
        url.pathname = result.location;
        url.searchParams.delete('parentId');
        url.searchParams.delete('parentRef');

        const flashMessage = isCreateOperation ? m.gaudy_heavy_puma_adore() : m.tidy_game_jellyfish_pop();
        this.flash.set({
          type: 'success',
          message: flashMessage,
          options: { clearOnNavigate: false, clearAfterMs: 5000 }
        });

        this.resourceState.setEntity(result.location.split('/').pop() as Id | Code);

        await goto(url.toString());
      } else if (result.type === 'success') {
        this.flash.set({ type: 'success', message: m.tidy_game_jellyfish_pop() });
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
          this.flash.set({ type: 'error', message: m.long_crazy_peacock_care() });
          console.error('[FORM CONTEXT]', result.data?.errors);
          // this.form.set(result.data?.data);
          this.errors.set(result.data?.errors);
        } else {
          this.flash.set({ type: 'error', message: m.round_pretty_lark_drip() });
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

  setClientError(field: string, error: string) {
    this.clientErrors[field] = error;
  }

  clearClientError(field: string) {
    delete this.clientErrors[field];
  }

  clearAllClientErrors() {
    this.clientErrors = {};
  }

  // Refresh session to update user roles after creating new resources
  async refreshSession() {
    try {
      // First refresh the resource data
      await this.resourceState.invalidateAndRefresh(
        this.resourceType as HierarchicalResource
      );
      // Then refresh user roles from the database
      await this.resourceState.refreshUserRoles();
    } catch (error) {
      console.warn('Failed to refresh user roles:', error);
    }
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
      FirstClassResource.organisation,
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
      FirstClassResource.project,
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
      FirstClassResource.layer,
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
      FirstClassResource.feature,
      flash
    );
  }
}

export class HubForm extends BaseForm<Hub> {
  constructor(
    form: SuperValidated<Hub>,
    isNew: boolean,
    resourceState: ResourceState,
    flash: Writable<App.PageData['flash']>
  ) {
    super(
      form,
      isNew,
      HubInsertAPI,
      HubUpdateAPI,
      resourceState,
      FirstClassResource.hub,
      flash
    );
  }
}

export const getContextRef = (resourceType: ResourceType, entity: Ref) => {
  return entity === NEW_REF
    ? `form-${resourceType}-new`
    : `form-${resourceType}-${entity}`;
};

export function setForm(
  resourceType: 'organisation',
  entity: Ref,
  form: SuperValidated<OrganisationNew | Organisation>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): OrganisationForm;

export function setForm(
  resourceType: 'project',
  entity: Ref,
  form: SuperValidated<ProjectNew | Project>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): ProjectForm;

export function setForm(
  resourceType: 'layer',
  entity: Ref,
  form: SuperValidated<LayerNew | Layer>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): LayerForm;

export function setForm(
  resourceType: 'feature',
  entity: Ref,
  form: SuperValidated<Feature>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): FeatureForm;

export function setForm(
  resourceType: 'hub',
  entity: Ref,
  form: SuperValidated<HubNew | Hub>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): HubForm;

export function setForm<T extends OrganisationNew | Project | Layer | Feature | Hub>(
  resourceType: FalsableResourceType,
  entity: Ref,
  form: SuperValidated<T>,
  resourceState: ResourceState,
  flash: Writable<App.PageData['flash']>
): OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm {
  if (!entity) {
    console.trace();
    throw new Error('Entity is required');
  }
  
  switch (resourceType) {
    case 'organisation': {
      const instance = new OrganisationForm(
        form as SuperValidated<Organisation>, 
        entity === NEW_REF, 
        resourceState, 
        flash
      );
      return setContext(getContextRef(resourceType, entity), instance);
    }
    case 'project': {
      const instance = new ProjectForm(
        form as SuperValidated<Project>, 
        entity === NEW_REF, 
        resourceState, 
        flash
      );
      return setContext(getContextRef(resourceType, entity), instance);
    }
    case 'layer': {
      const instance = new LayerForm(
        form as SuperValidated<Layer>, 
        entity === NEW_REF, 
        resourceState, 
        flash
      );
      return setContext(getContextRef(resourceType, entity), instance);
    }
    case 'feature': {
      const instance = new FeatureForm(
        form as SuperValidated<Feature>, 
        entity === NEW_REF, 
        resourceState, 
        flash
      );
      return setContext(getContextRef(resourceType, entity), instance);
    }
    case 'hub': {
      const instance = new HubForm(
        form as SuperValidated<Hub>, 
        entity === NEW_REF, 
        resourceState, 
        flash
      );
      return setContext(getContextRef(resourceType, entity), instance);
    }
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}

export function getForm(
  resource: 'organisation',
  entity: Ref
): OrganisationForm;

export function getForm(
  resource: 'project',
  entity: Ref
): ProjectForm;

export function getForm(
  resource: 'layer',
  entity: Ref
): LayerForm;

export function getForm(
  resource: 'feature',
  entity: Ref
): FeatureForm;

export function getForm(
  resource: 'hub',
  entity: Ref
): HubForm;

export function getForm<T extends OrganisationNew | Project | Layer | Feature | Hub>(
  resource: ResourceType,
  entity: Ref
): OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm {
  return getContext<OrganisationForm | ProjectForm | LayerForm | FeatureForm | HubForm>(
    getContextRef(resource, entity)
  );
}
