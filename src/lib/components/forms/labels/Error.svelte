<script lang="ts">
// TYPES
import type {
  FieldProps,
  FormProps,
  ExtendedParams,
  FormFieldExtendedDefinition,
  Field,
  Resource,
  LocaleExtended,
  Key
} from '$lib/types';
import type { ValidationErrors } from 'sveltekit-superforms';
import type { Writable } from 'svelte/store';

let fieldProps: FieldProps &
  FormProps & {
    locale: LocaleExtended;
    field: FormFieldExtendedDefinition;
    fieldRoot: Field;
    fieldIndex: number;
    fieldKey: Key;
    errors: Writable<ValidationErrors<Resource>>;
  } = $props();
let { errors, field, locale, fieldRoot, fieldIndex, fieldKey } = fieldProps;

let isCore = $derived(locale === 'core');

// UTILS
export const isError = ({
  errorsValue,
  field,
  locale,
  fieldRoot,
  fieldIndex,
  fieldKey
}: ExtendedParams & { errorsValue: ValidationErrors<Resource> }) => {

  if (field.isNested) {
    const rootError = errorsValue?.[fieldRoot as keyof ValidationErrors<Resource>];
    if (!rootError || typeof rootError !== 'object') return false;

    const indexedError = (rootError as any)?.[fieldIndex?.toString()];
    if (!indexedError || typeof indexedError !== 'object') return false;

    const i18nBlock = (indexedError as any)?.i18n;
    if (i18nBlock && typeof i18nBlock === 'object') {
      if (locale && fieldKey && (i18nBlock as any)?.[locale]?.[fieldKey]) return true;
    }
    // Fallback check if i18n structure isn't as expected but error exists directly

  } else { // Non-nested
    if (isCore) { 
      if (errorsValue?.[fieldRoot as keyof ValidationErrors<Resource>]) return true;
    } else { 
      // For translated fields, look in the i18n structure using fieldRoot as the field name
      const i18nErrors = errorsValue?.i18n as any;
      if (locale && fieldRoot && i18nErrors?.[locale]?.[fieldRoot]) return true;
    }
  }
  return false;
};

export const getError = ({
  errorsValue,
  field,
  locale,
  fieldRoot,
  fieldIndex,
  fieldKey
}: ExtendedParams & { errorsValue: ValidationErrors<Resource> }) => {
  let messages: string[] = [];

  if (field.isNested) {
    const rootError = errorsValue?.[fieldRoot as keyof ValidationErrors<Resource>];
    const indexedError = (rootError as any)?.[fieldIndex?.toString()];
    
    if (indexedError && typeof indexedError === 'object') {
        const i18nBlock = (indexedError as any)?.i18n;
        if (i18nBlock && typeof i18nBlock === 'object') {
            const specificFieldError = locale && fieldKey ? (i18nBlock as any)?.[locale]?.[fieldKey] : null;
            if (specificFieldError) {
              if (Array.isArray(specificFieldError)) messages.push(...specificFieldError);
              else messages.push(String(specificFieldError));
            }
        }
         // Fallback for errors directly on the indexed item if fieldKey points to something non-i18n related
        if (! (indexedError as any)?.i18n && (indexedError as any)?.[fieldKey] && field.isTranslated === false && isCore) {
             // For core, non-translated, nested fields (e.g. properties[0].key)
            const directFieldError = (indexedError as any)?.[fieldKey];
            if (directFieldError) {
                if(Array.isArray(directFieldError)) messages.push(...directFieldError); else messages.push(String(directFieldError));
            }
        }
    }
    
  } else { // Non-nested
    if (isCore) {
      const directError = errorsValue?.[fieldRoot as keyof ValidationErrors<Resource>];
      if (directError) {
        if (Array.isArray(directError)) messages.push(...directError);
        else messages.push(String(directError));
      }
    } else { // Translated non-nested
      // For translated fields, look in the i18n structure using fieldRoot as the field name
      const i18nErrors = errorsValue?.i18n as any;
      if (i18nErrors && typeof i18nErrors === 'object') {
        const specificLocaleFieldError = locale && fieldRoot ? i18nErrors?.[locale]?.[fieldRoot] : null;
        if (specificLocaleFieldError) {
          if (Array.isArray(specificLocaleFieldError)) messages.push(...specificLocaleFieldError);
          else messages.push(String(specificLocaleFieldError));
        }
      }
    }
  }
  return [...new Set(messages.filter(m => m != null && m !== 'undefined'))].join('<br>');
};
</script>

{#if isError({ errorsValue: $errors, field, locale, fieldRoot, fieldIndex, fieldKey })}
  <div class="label">
    <span class="label-text-alt text-error"></span>
    <span class="label-text-alt text-error">
      {@html getError({ errorsValue: $errors, field, locale, fieldRoot, fieldIndex, fieldKey })}
    </span>
  </div>
{/if}
