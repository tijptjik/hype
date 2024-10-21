import { zod } from "sveltekit-superforms/adapters";
import { getContext, setContext } from 'svelte';
import { OrganisationReqBody } from '$lib/db/zod';
import { superForm, superValidate } from 'sveltekit-superforms';
import { defaults } from 'sveltekit-superforms';
import { get } from "svelte/store";

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

  constructor(data) {
    // ZodClient() works only with the same schema as the one used on the server. 
    // If you need to switch schemas on the client, you need the full adapter (for example zod instead of zodClient).
    const formConfig = superForm(defaults(data.form.data, zod(OrganisationReqBody)), {
      dataType: 'json',
      SPA: true,
      validators: zod(OrganisationReqBody),
      validationMethod: 'auto',
      onSubmit: this.handleSubmit.bind(this),
      onResult: this.handleResult.bind(this)
    });

    Object.assign(this, formConfig);
  }

  async handleSubmit({ action, formElement, controller, submitter, cancel }) {
    const result = await this.validateForm();
    const currentJsonData = get(this.form); // Get the current value of the form data
    const apiUrl = new URL(action.href);

    apiUrl.pathname = apiUrl.pathname.replace('/admin/', '/api/');
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(currentJsonData)
    });

    const formValidationResult = await superValidate(result.form, zod(OrganisationReqBody));
    Object.assign(this, formValidationResult);

    if (!response.ok) {
      console.error('Form submission failed');
    }
  }

  async handleResult({result}) {
    if (result.status !== 200) {
      console.error(result);
    } else if (result.status === 200) {
      console.log('Form submission successful');
    }
  }
}

const FORM_STATE_KEY = Symbol('form');

export const setForm = (data) => setContext(FORM_STATE_KEY, new OrganisationForm(data));
export const getForm = (): ReturnType<typeof setForm> => getContext(FORM_STATE_KEY);
