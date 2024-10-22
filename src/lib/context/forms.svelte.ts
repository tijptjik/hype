import { zod } from 'sveltekit-superforms/adapters';
import { getContext, setContext } from 'svelte';
import { superForm } from 'sveltekit-superforms';
import { defaults } from 'sveltekit-superforms';
import { get, type Writable } from 'svelte/store';
import { deserialize, enhance } from '$app/forms';
// ZOD
import { OrganisationInsertAPI, OrganisationUpdateAPI } from '$lib/db/zod';
// TYPES
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
import type { Organisation } from '$lib/types';
import { goto } from '$app/navigation';

class OrganisationForm {
  form!: SuperFormData<Organisation>;
  enhance!: typeof enhance;
  constraints!: InputConstraints<Organisation>;
  validate!: (
    path: FormPathLeaves<Organisation>,
    opts?: ValidateOptions<
      FormPathType<Organisation, FormPathLeaves<Organisation>>,
      Organisation,
      Record<string, unknown>
    >
  ) => Promise<string[] | undefined>;
  validateForm!: () => Promise<SuperValidated<Record<string, unknown>, string, Form>>;
  tainted!: Writable<TaintedFields<Organisation> | undefined>;
  isTainted!: (
    path?: FormPath<Organisation> | Record<string, unknown> | boolean | undefined
  ) => boolean;
  submit!: (event: Event) => void;
  reset!: (options?: {
    keepMessage?: boolean;
    data?: Partial<Organisation>;
    newState?: Partial<Organisation>;
    id?: string;
  }) => void;
  errors!: Writable<ValidationErrors<Organisation>>;
  message!: Writable<string | undefined>;
  posted!: Writable<boolean>;

  constructor(form: SuperValidated<Organisation>, isNew: boolean) {
    // ZodClient() works only with the same schema as the one used on the server.
    // If you need to switch schemas on the client, you need the full adapter (for example zod instead of zodClient).
    const formConfig = superForm(
      defaults(form.data, zod(isNew ? OrganisationInsertAPI : OrganisationUpdateAPI)),
      {
        dataType: 'json',
        SPA: true,
        validators: zod(isNew ? OrganisationInsertAPI : OrganisationUpdateAPI),
        validationMethod: 'auto',
        resetForm: false,
        onSubmit: this.handleSubmit.bind(this)
      }
    );
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
    if (action.pathname.endsWith('/new/')) {
      apiUrl.pathname = apiUrl.pathname.replace('/new/', '');
    }
    return apiUrl;
  }

  #getFetchConfig(action: URL) {
    // DATA
    const body = JSON.stringify(get(this.form));
    // METHOD
    const method = action.pathname.endsWith('/new/') ? 'POST' : 'PUT';
    // HEADERS
    const headers = {
      'Content-Type': 'application/json'
    };
    return { method, headers, body };
  }
}

const getEntitySymbol = (entity: string) => {
  return `form-${entity}`;
};

export const setForm = (form: SuperValidated<Organisation>, entity: string) =>
  setContext(getEntitySymbol(entity), new OrganisationForm(form, entity === 'new'));
export const getForm = (entity: string | false): ReturnType<typeof setForm> =>
  getContext(getEntitySymbol(entity ? entity : 'new'));
