// SVELTE
import { derived, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { page } from '$app/state';
// UTILITIES
// COMPONENTS
import InputField from '$lib/components/forms/fields/Input.svelte';
import SelectField from '$lib/components/forms/fields/Select.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import TextareaField from '$lib/components/forms/fields/Textarea.svelte';
import UsersField from '$lib/components/forms/fields/Users.svelte';
import CustomField from '$lib/components/forms/fields/Property.svelte';
import ListField from '$lib/components/forms/fields/List.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import DisplayField from '$lib/components/forms/fields/Display.svelte';
// TYPES
import type { RequestEvent } from '@sveltejs/kit';
import type {
  Field,
  Locale,
  LocaleExtended,
  Resource,
  FormFieldDefinition,
  FieldDiscriminator,
  FieldComponentType,
  Form,
  FeatureForm
} from './types';
import type { Task } from 'maplibre-gl';

/**
 * Convenience functions to prevent event handlers from being called multiple times
 */

export function once(fn: (event: Event) => void) {
  let handler: ((event: Event) => void) | undefined = fn;
  return function (this: unknown, event: Event) {
    if (handler) {
      handler.call(this, event);
      handler = undefined;
    }
  };
}

export function preventDefault(fn: (event: Event) => void) {
  return function (this: unknown, event: Event) {
    event.preventDefault();
    fn.call(this, event);
  };
}

export function stopPropagation(fn: (event: Event) => void) {
  return function (this: unknown, event: Event) {
    event.stopPropagation();
    fn.call(this, event);
  };
}

/**
 * Check whether the code is being run by a Cloudflare worker
 */
export const on_cloudflare = (event: RequestEvent) => {
  return event.platform?.env.CF_PAGES === 'true';
};

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
    ToggleField: ToggleField,
    DisplayField: DisplayField
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

export const isNotLocale = (maybeLocale: LocaleExtended) => {
  return maybeLocale === 'core' || maybeLocale == undefined;
};

export const genField = (fieldRoot: Field) => `${fieldRoot}Gen` as Field;

export const getValues = (
  form: Form['form'],
  field: FormFieldDefinition,
  locale: LocaleExtended,
  fieldRoot: Field,
  fieldIndex: number,
  fieldKey: Field
) => {
  // Get reference to the field
  let ref: any;
  let key: Field;

  if (!field.isArray && !field.isNested && !field.isTranslated) {
    ref = form;
    key = fieldRoot;
  } else if (field.isArray && !field.isNested) {
    ref = (form as any)[fieldRoot][fieldIndex];
    key = fieldKey;
  } else if (field.isNested && !field.isTranslated) {
    ref = (form as any)[fieldRoot][fieldIndex];
    key = fieldKey;
  } else if (field.isNested && field.isTranslated) {
    const baseRef = (form as any)[fieldRoot][fieldIndex];
    // Initialize i18n structure if it doesn't exist
    if (!baseRef.i18n) {
      baseRef.i18n = {};
    }
    if (!baseRef.i18n[locale as Locale]) {
      baseRef.i18n[locale as Locale] = {
        locale: locale as Locale // Ensure locale field is set
      };
    }
    ref = baseRef.i18n[locale as Locale];
    key = fieldKey;
  } else if (field.isTranslated) {
    // Initialize i18n structure if it doesn't exist
    if (!(form as any).i18n) {
      (form as any).i18n = {};
    }
    if (!(form as any).i18n[locale as Locale]) {
      (form as any).i18n[locale as Locale] = {
        locale: locale as Locale // Ensure locale field is set
      };
    }
    ref = (form as any).i18n[locale as Locale];
    key = fieldRoot;
  } else {
    console.error('NO FIELD REFERENCE FOUND', field);
  }
  // FIELD : GET VALUE
  if (!ref) {
    console.error('NO FIELD REFERENCE FOUND', field);
  }
  if (key!) {
    const value = ref?.[key] ?? ('' as string);
    const isGenAI = ref?.[genField(key)] ?? (false as boolean);
    return { value, isGenAI };
  }
};

export const updateFeaturePropertyValue = (
  form: FeatureForm['form'],
  fieldRoot: Field,
  fieldIndex: number,
  value: string | null,
  fieldKey: string = 'value'
) => {
  form.update(($form: any) => {
    $form[fieldRoot][fieldIndex][fieldKey] = value;
    return $form;
  });
};

export const getFeaturePropertyComplexValue = (
  form: FeatureForm['form'],
  fieldRoot: Field,
  fieldIndex: number,
  value: string | null,
  fieldKey: string = 'value'
) => {
  form.update(($form: any) => {
    $form[fieldRoot][fieldIndex][fieldKey] = value;
    return $form;
  });
};

export const updateForm = (
  form: Writable<Exclude<Resource, Task>>,
  field: FormFieldDefinition,
  locale: Locale,
  fieldRoot: string,
  fieldIndex: number,
  fieldKey: string,
  value: string,
  isGenAI?: boolean
) => {
  form.update(($form) => {
    let baseObject: any;
    let propertyKey: string;

    if (!field.isArray && !field.isNested) {
      baseObject = $form;
      propertyKey = fieldRoot;
    } else if (field.isArray || field.isNested) {
      const array = ($form as any)[fieldRoot] as any[];
      if (!array || array[fieldIndex] === undefined) {
        return $form;
      }
      baseObject = array[fieldIndex];
      propertyKey = fieldKey;
    } else {
      return $form;
    }

    if (baseObject === undefined) {
      return $form;
    }

    let targetObject: any;
    if (field.isTranslated) {
      if (isNotLocale(locale)) {
        return $form;
      }

      if (!baseObject.i18n) {
        baseObject.i18n = {};
      }
      if (!baseObject.i18n[locale as Locale]) {
        baseObject.i18n[locale as Locale] = {
          locale: locale as Locale // Ensure locale field is set
        };
      }
      targetObject = baseObject.i18n[locale as Locale];
    } else {
      targetObject = baseObject;
    }

    if (targetObject === undefined) {
      return $form;
    }

    targetObject[propertyKey] = value;
    if (isGenAI !== undefined) {
      targetObject[genField(propertyKey as Field)] = isGenAI;
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
  maybeLocale: LocaleExtended
) => {
  if (field.isNested) {
    return `${fieldRoot}_${fieldDiscriminator}_${fieldIndex}_${fieldKey}_${maybeLocale}`;
  } else if (fieldDiscriminator === 'specifier') {
    return `${fieldRoot}_${fieldIndex}_${fieldKey}_${maybeLocale}`;
  } else {
    return `${fieldRoot}_${maybeLocale}`;
  }
};

// CONFIG
export const targetLanguageTags: Locale[] = ['zh-hant', 'zh-hans'];
export const NEW_TITLE = 'New';
export const NEW_REF = NEW_TITLE.toLowerCase();
export const ADMIN_PATH = '/admin';
export const API_PATH = '/api';

export const ADMIN_MIN_WIDTH = 1200;
export const MOBILE_MAX_WIDTH = 920;

export const capitalizeFirstLetter = (text: string | null) => {
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const fetchOrThrow = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Network response was not ok');
  return (await response.json()) as T;
};
