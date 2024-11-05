<script lang="ts">
import type { ValidationErrors } from 'sveltekit-superforms';
import type { FormFieldExtendedDefinition, Key, LanguageTag } from '$lib/types';

// TYPES
type Props = {
  errors: ValidationErrors<Record<string, string>> | undefined;
  field: FormFieldExtendedDefinition;
  languageTag: LanguageTag;
  fieldId: Key;
  fieldIndex?: number;
  fieldKey?: Key;
};

let { errors, field, languageTag, fieldId, fieldIndex, fieldKey }: Props = $props();

// UTILS
export const isError = (
  errors: ValidationErrors<Record<string, string>>,
  field: FormFieldExtendedDefinition,
  languageTag: LanguageTag,
  fieldId: Key,
  fieldIndex?: number,
  fieldKey?: Key
) =>
  (!field.isNested && languageTag === 'core' && errors?.[fieldId]) ||
  (!field.isNested && languageTag === 'en' && errors?.[fieldId]) ||
  (!field.isNested && errors?.translations?.[languageTag]?.[fieldId]) ||
  (field.isNested &&
    languageTag === 'core' &&
    errors?.[fieldId]?.[fieldIndex?.toString()]?.[fieldKey]) ||
  (field.isNested &&
    languageTag === 'en' &&
    errors?.[fieldId]?.[fieldIndex?.toString()]?.[fieldKey]) ||
  (field.isNested && errors?.[fieldId]?.[fieldIndex?.toString()]?.[fieldKey]);

export const getError = (
  errors: ValidationErrors<Record<string, string>>,
  field: FormFieldExtendedDefinition,
  languageTag: LanguageTag,
  fieldId: string,
  fieldIndex?: number,
  fieldKey?: string
) => {
  if (field.isNested) {
    if (field.isArray) {
      if (languageTag === 'core' || languageTag === 'en') {
        let arrayErrors = Object.values(errors[fieldId][fieldIndex?.toString()][fieldKey]).filter(error => {
          return !('translations' in error);
        });
        return arrayErrors
          .map((error) => Object.keys(error).join(' & ') + ': ' + Object.values(error).join(', '))
        .join('\n');
      } else {
        let arrayErrors = Object.values(errors[fieldId][fieldIndex?.toString()][fieldKey]).map(
          (error) => error?.translations?.[languageTag]
        ).filter(Boolean);
        // Loop through arrayErrors and recursively concat the path of each error , followed by a colon and the error message
        return arrayErrors.map(error => Object.keys(error).join(' & ') + ': ' + Object.values(error).join(', ')).join('<br>');
      }
    } else {
      if (languageTag === 'core' || languageTag === 'en') {
        return errors[fieldId][fieldIndex?.toString()][fieldKey];
      } else {
      return errors[fieldId][fieldIndex?.toString()][fieldKey].translations[languageTag];
      }
    }
  } else {
    if (languageTag === 'core' || languageTag === 'en') {
      return errors[fieldId];
    } else {
      return errors.translations?.[languageTag]?.[fieldId];
    }
  }
};
</script>

{#if isError(errors, field, languageTag, fieldId, fieldIndex, fieldKey)}
  <div class="label">
    <span class="label-text-alt text-error"></span>
    <span class="label-text-alt text-error"
      >{@html getError(errors, field, languageTag, fieldId, fieldIndex, fieldKey)}</span>
  </div>
{/if}
