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
import { NEW_REF, ADMIN_PATH } from '$lib';
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
// TYPES
import type { Writable } from 'svelte/store';
import type { ActionResult } from '@sveltejs/kit';
import type Form from 'sveltekit-superforms';

import type { SuperFormData, SuperValidated } from 'sveltekit-superforms/client';
import type {
  Organisation,
  Project,
  Layer,
  Feature,
  ResourceType,
  FalsableResourceType,
  Ref,
  EntityRouter,
  SuperFormResult
} from '$lib/types';

class BaseForm<T extends Record<string, unknown>> {
  protected formResult: SuperFormResult<T>;
  constructor(
    form: SuperValidated<T>,
    isNew: boolean,
    insertSchema: any,
    updateSchema: any
  ) {
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
      console.error(validatedForm.errors);
      console.error(validatedForm.data);

      cancel();
      // SERVER VALIDATION
    } else {
      const response = await fetch(
        this.#getFetchUrl(action),
        this.#getFetchConfig(action)
      );
      const result = deserialize(await response.text()) as ActionResult;

      if (result.type === 'redirect') {
        // CREATE SUCCESS
        this.message.set('Created successfully');
        await goto(i18n.resolveRoute(result.location));
      } else if (result.type === 'success') {
        // UPDATE SUCCESS
        this.message.set('Updated successfully');
        this.reset({
          data: result.data?.data,
          newState: result.data?.data
        });
      } else {
        // FAILURE / ERROR
        if (result.type === 'failure') {
          this.message.set('Submission failed');
          this.errors.set(result.data?.errors);
          this.form.set(result.data?.data);
        } else {
          this.message.set('Unexpected error');
        }
        cancel();
      }
    }
  }

  #getFetchUrl(action: URL) {
    const apiUrl = new URL(action.href);
    apiUrl.pathname = apiUrl.pathname.replace('{ADMIN_PATH}/', '/api/');
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
  constructor(form: SuperValidated<Organisation>, isNew: boolean) {
    super(form, isNew, OrganisationInsertAPI, OrganisationUpdateAPI);
  }
}

export class ProjectForm extends BaseForm<Project> {
  constructor(form: SuperValidated<Project>, isNew: boolean) {
    super(form, isNew, ProjectInsertAPI, ProjectUpdateAPI);
  }
}

export class LayerForm extends BaseForm<Layer> {
  constructor(form: SuperValidated<Layer>, isNew: boolean) {
    super(form, isNew, LayerInsertAPI, LayerUpdateAPI);
  }
}

export class FeatureForm extends BaseForm<Feature> {
  constructor(form: SuperValidated<Feature>, isNew: boolean) {
    super(form, isNew, FeatureInsertAPI, FeatureUpdateAPI);
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
  form: SuperValidated<T>
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
  const instance = new FormClass(form, entity === NEW_REF);
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
