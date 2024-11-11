import { zod } from 'sveltekit-superforms/adapters';
import { getContext, setContext } from 'svelte';
import { superForm } from 'sveltekit-superforms';
import { defaults } from 'sveltekit-superforms';
import { get } from 'svelte/store';
import { deserialize, enhance } from '$app/forms';
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
  FeatureUpdateAPI
} from '$lib/db/zod';
// TYPES
import type { Writable } from 'svelte/store';
import type { ActionResult } from '@sveltejs/kit';
import type Form from 'sveltekit-superforms';
import type {
  FormPath,
  InputConstraints,
  TaintedFields,
  FormPathLeaves,
  ValidateOptions,
  FormPathType,
  SuperValidated,
  ValidationErrors
} from 'sveltekit-superforms';
import type { SuperFormData } from 'sveltekit-superforms/client';
import type {
  Organisation,
  Project,
  Layer,
  Feature,
  ResourceType,
  FalsableRef,
  FalsableResourceType
} from '$lib/types';

class BaseForm<T extends Record<string, unknown>> {
  form!: SuperFormData<T>;
  enhance!: typeof enhance;
  constraints!: InputConstraints<T>;
  validate!: (
    path: FormPathLeaves<T>,
    opts?: ValidateOptions<FormPathType<T, FormPathLeaves<T>>, T, Record<string, unknown>>
  ) => Promise<string[] | undefined>;
  validateForm!: () => Promise<SuperValidated<Record<string, unknown>, string, Form>>;
  tainted!: Writable<TaintedFields<T> | undefined>;
  isTainted!: (path?: FormPath<T> | Record<string, unknown> | boolean | undefined) => boolean;
  submit!: (event: Event) => void;
  reset!: (options?: {
    keepMessage?: boolean;
    data?: Partial<T>;
    newState?: Partial<T>;
    id?: string;
  }) => void;
  errors!: Writable<ValidationErrors<T>>;
  message!: Writable<string | undefined>;
  posted!: Writable<boolean>;

  // ZodClient() works only with the same schema as the one used on the server.
  // If you need to switch schemas on the client, you need the full adapter (for example zod instead of zodClient).
  constructor(form: SuperValidated<T>, isNew: boolean, insertSchema: any, updateSchema: any) {
    const formConfig = superForm(defaults(form.data, zod(isNew ? insertSchema : updateSchema)), {
      dataType: 'json',
      SPA: true,
      validators: zod(isNew ? insertSchema : updateSchema),
      validationMethod: 'auto',
      resetForm: false,
      onSubmit: this.handleSubmit.bind(this)
    });
    Object.assign(this, formConfig);
  }

  async handleSubmit({ action, cancel }: { action: URL; cancel: () => void }) {
    const validatedForm = await this.validateForm();

    // LOCAL VALIDATION
    if (!validatedForm.valid) {
      this.errors.set(validatedForm.errors);

      cancel();
      // SERVER VALIDATION
    } else {
      const response = await fetch(this.#getFetchUrl(action), this.#getFetchConfig(action));
      const result = deserialize(await response.text()) as ActionResult;

      if (result.type === 'redirect') {
        // CREATE SUCCESS
        this.message.set('Created successfully');
        await goto(result.location);
      } else if (result.type === 'success') {
        // UPDATE SUCCESS
        this.message.set('Updated successfully');
        this.form.set(result.data?.data);
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
    apiUrl.pathname = apiUrl.pathname.replace('/admin/', '/api/');
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

class OrganisationForm extends BaseForm<Organisation> {
  constructor(form: SuperValidated<Organisation>, isNew: boolean) {
    super(form, isNew, OrganisationInsertAPI, OrganisationUpdateAPI);
  }
}

class ProjectForm extends BaseForm<Project> {
  constructor(form: SuperValidated<Project>, isNew: boolean) {
    super(form, isNew, ProjectInsertAPI, ProjectUpdateAPI);
  }
}

class LayerForm extends BaseForm<Layer> {
  constructor(form: SuperValidated<Layer>, isNew: boolean) {
    super(form, isNew, LayerInsertAPI, LayerUpdateAPI);
  }
}

class FeatureForm extends BaseForm<Feature> {
  constructor(form: SuperValidated<Feature>, isNew: boolean) {
    super(form, isNew, FeatureInsertAPI, FeatureUpdateAPI);
  }
}

const getContextRef = (resourceType: ResourceType, entity: Ref) => {
  return entity === 'new' ? `form-${resourceType}-new` : `form-${resourceType}-${entity}`;
};

export const setForm = <T extends Record<string, unknown>>(
  resourceType: FalsableResourceType,
  entity: Ref,
  form: SuperValidated<T>
) => {
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
  return setContext(getContextRef(resourceType, entity), new FormClass(form, entity === 'new'));
};

export const getForm = (
  resourceType: ResourceType,
  entity: FalsableRef
): ReturnType<typeof setForm> => getContext(getContextRef(resourceType, entity));
