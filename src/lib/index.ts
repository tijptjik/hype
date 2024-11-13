// place files you want to import through the `$lib` alias in this folder.
import type { RequestEvent } from '@sveltejs/kit';
import { derived } from 'svelte/store';
import { page } from '$app/stores';
import { browser } from '$app/environment';
import deepEquals from 'fast-deep-equal';
import { redirect } from '@sveltejs/kit';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import SelectField from '$lib/components/forms/FormFieldSelect.svelte';
import TagsField from '$lib/components/forms/FormFieldTags.svelte';
import RangeField from '$lib/components/forms/FormFieldRange.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import UsersField from '$lib/components/forms/FormFieldUsers.svelte';
import CustomField from '$lib/components/forms/FormFieldProperties.svelte';
import ComplexField from '$lib/components/forms/FormFieldComplex.svelte';
import type { FieldComponentType } from './types';

/**
 * Check whether the code is being run by a Cloudflare worker
 */
export const on_cloudflare = (event: RequestEvent) => {
  return event.platform?.env.CF_PAGES === 'true';
};

let oldState: App.PageState = {};

export const pageState = derived<typeof page, App.PageState>(
  page,
  (_, set) => {
    if (!browser) return;
    setTimeout(() => {
      const newState = history.state['sveltekit:states'] ?? {};
      if (!deepEquals(oldState, newState)) {
        oldState = newState;
        set(newState);
      }
    });
  },
  {}
);


export function toTitleCase(str: string) {
  return str.replace(
    /\w\S*/g,
    (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
}

export const getFieldComponent = (componentType?: FieldComponentType) => {
  if (!componentType) return undefined;
  return {
    "InputField": InputField,
    "SelectField": SelectField, 
    "TagsField": TagsField,
    "RangeField": RangeField,
    "TextareaField": TextareaField,
    "UsersField": UsersField,
    "CustomField": CustomField,
    "ComplexField": ComplexField
  }[componentType];
};


export function loadScript(src: string) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;

    document.body.appendChild(script);

    script.addEventListener('load', () => resolve(script));
    script.addEventListener('error', () => reject(script));
  });
}