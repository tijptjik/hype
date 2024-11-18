import type { RequestEvent } from '@sveltejs/kit';
import { derived, type Writable } from 'svelte/store';
import { page } from '$app/stores';
import { browser } from '$app/environment';
import deepEquals from 'fast-deep-equal';
import InputField from '$lib/components/forms/fields/Input.svelte';
import SelectField from '$lib/components/forms/fields/Select.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import TextareaField from '$lib/components/forms/fields/Textarea.svelte';
import UsersField from '$lib/components/forms/fields/Users.svelte';
import CustomField from '$lib/components/forms/fields/Properties.svelte';
import ListField from '$lib/components/forms/fields/List.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import type {
  Field,
  FieldComponenFormField,
  tType,
  Lang,
  LanguageTag,
  ResourceuageTag,
  FormField,
  Resource,
  FormFieldDefinition,
  FieldDiscriminator,
  FieldComponentType
} from './types';

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
    InputField: InputField,
    SelectField: SelectField,
    RangeField: RangeField,
    TextareaField: TextareaField,
    UsersField: UsersField,
    CustomField: CustomField,
    ListField: ListField,
    ToggleField: ToggleField
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

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-HK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export const isPrimaryLang = (languageTag: LanguageTag) => {
  return languageTag === 'core' || languageTag === 'en' || languageTag == undefined;
};

export const genField = (fieldRoot: string) => `${fieldRoot}Gen` as keyof Resource;

export const getValues = (
  form: Writable<Resource>,
  field: FormField,
  languageTag: LanguageTag,
  fieldRoot: string,
  fieldIndex: number,
  fieldKey: string
) => {
  // Default languageTag to core if field is not translated
  if (!field.isTranslated) {
    languageTag = 'core';
  }
  // Get reference to the field
  let ref: Record<string, string | boolean>;
  let key: string;
  // FIELD : ROOT | NESTED
  // if (!field.isNested && fieldDiscriminator !== 'specifier') {
  if (!field.isArray && !field.isNested) {
    ref = form;
    key = fieldRoot;
  } else if (field.isArray && !field.isNested) {
    ref = form[fieldRoot][fieldIndex];
    key = fieldKey;
  } else if (field.isNested) {
    ref = form[fieldRoot][fieldIndex];
    key = fieldKey;
  } else {
    console.error('NO FIELD REFERENCE FOUND', field);
  }
  // FIELD : PRIMARY | TRANSLATED
  if (!isPrimaryLang(languageTag)) {
    ref = ref.translations[languageTag];
  }
  // FIELD : GET VALUE
  const value = ref[key] as string;
  const isGenAI = ref[genField(key)] || false as boolean;

  return { value, isGenAI };
};

export const updateForm = (
  form: Writable<Resource>,
  field: FormField,
  languageTag: LanguageTag,
  fieldRoot: string,
  fieldIndex: number,
  fieldKey: string,
  value: string,
  isGenAI: boolean
) => {
  form.update(($form) => {
    let ref: Record<string, string | boolean>;
    let key: string;
    // FIELD : ROOT | NESTED
    // if (!field.isNested && fieldDiscriminator !== 'specifier') {
    if (!field.isArray && !field.isNested) {
      ref = $form;
      key = fieldRoot;
    } else if (field.isArray && !field.isNested) {
      ref = $form[fieldRoot][fieldIndex];
      key = fieldKey;
    } else if (field.isNested) {
      ref = $form[fieldRoot][fieldIndex];
      key = fieldKey;
    } else {
      console.error('NO FIELD REFERENCE FOUND', field);
    }
    // FIELD : PRIMARY | TRANSLATED
    if (!isPrimaryLang(languageTag)) {
      ref = ref.translations[languageTag];
    }
    // FIELD : SET VALUE
    ref[key] = value;
    if (isGenAI !== undefined) {
      ref[genField(key)] = isGenAI;
    }
    return $form;
  });
};

export const getId = (
  field: FormFieldDefinition,
  fieldRoot: Field,
  fieldIndex: number,
  fieldDiscriminator: FieldDiscriminator,
  fieldKey: string,
  languageTag: LanguageTag
) => {
  if (field.isNested) {
    return `${fieldRoot}_${fieldDiscriminator}_${fieldIndex}_${fieldKey}_${languageTag}`;
  } else if (fieldDiscriminator === 'specifier') {
    return `${fieldRoot}_${fieldIndex}_${fieldKey}_${languageTag}`;
  } else {
    return `${fieldRoot}_${languageTag}`;
  }
};

// CONFIG
const sourceLanguageTag = 'en';
export const languageTags: LanguageTag[] = [sourceLanguageTag, 'zh-hant', 'zh-hans'];
