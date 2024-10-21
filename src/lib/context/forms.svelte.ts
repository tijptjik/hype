import { zod } from 'sveltekit-superforms/adapters';
import { getContext, setContext } from 'svelte';
import { OrganisationReqBody, NewOrganisationReqBody } from '$lib/db/zod';
import { superForm, superValidate } from 'sveltekit-superforms';
import { defaults } from 'sveltekit-superforms';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
class OrganisationForm {
  form;
  enhance;
  constraints;
  validate;
  validateForm;
  tainted;
  isTainted;
  submit;
  reset;
  errors;
  message;
  posted;

  constructor(data, isNew: boolean) {
    // ZodClient() works only with the same schema as the one used on the server.
    // If you need to switch schemas on the client, you need the full adapter (for example zod instead of zodClient).
    const formConfig = superForm(
      defaults(data.form.data, zod(isNew ? NewOrganisationReqBody : OrganisationReqBody)),
      {
        dataType: 'json',
        SPA: true,
        validators: zod(isNew ? NewOrganisationReqBody : OrganisationReqBody),
        validationMethod: 'auto',
        onSubmit: this.handleSubmit.bind(this),
        onResult: this.handleResult.bind(this)
      }
    );

    Object.assign(this, formConfig);
  }

  async handleSubmit({ action, formElement, controller, submitter, cancel }) {
    const result = await this.validateForm();
    const currentJsonData = get(this.form); // Get the current value of the form data
    const apiUrl = new URL(action.href);
    apiUrl.pathname = apiUrl.pathname.replace('/admin/', '/api/');
    const isNew = apiUrl.pathname.endsWith('/new/');
    const httpMethod = isNew ? 'POST' : 'PUT';

    if (isNew) {
      apiUrl.pathname = apiUrl.pathname.replace('/new/', '');
    }

    const response = await fetch(apiUrl, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(currentJsonData)
    });

    const formValidationResult = await superValidate(result.form, zod(OrganisationReqBody));
    Object.assign(this, formValidationResult);

    if (isNew) {
      // TODO verify redirect works
      console.log('formValidationResult', formValidationResult);
      console.log('redirecting to', `/admin/organisations/${formValidationResult.data.code}`);
      redirect(302, `/admin/organisations/${formValidationResult.data.code}`);
    }
  }

  async handleResult({ result }) {
    if (result.status !== 200) {
      console.error(result);
    }
  }
}

const getEntitySymbol = (entity: string) => {
  return `form-${entity}`;
};

export const setForm = (data, entity: string) =>
  setContext(getEntitySymbol(entity), new OrganisationForm(data, entity === 'new'));
export const getForm = (entity: string | false): ReturnType<typeof setForm> => 
  getContext(getEntitySymbol(entity ? entity : 'new'));
