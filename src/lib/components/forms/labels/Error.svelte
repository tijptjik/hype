<script lang="ts">
// TYPES
import type {
  FieldProps,
  FormProps,
  ErrorParams,
  FormFieldExtendedDefinition,
  Field,
  Resource,
  LanguageTag,
  Key
} from '$lib/types';
import type { ValidationErrors } from 'sveltekit-superforms';
import type { Writable } from 'svelte/store';

let fieldProps: FieldProps &
  FormProps & {
    languageTag: LanguageTag;
    field: FormFieldExtendedDefinition;
    fieldRoot: Field;
    fieldIndex: number;
    fieldKey: Key;
    errors: Writable<ValidationErrors<Resource>>;
  } = $props();
let { errors, field, languageTag, fieldRoot, fieldIndex, fieldKey } = fieldProps;

// UTILS
export const isError = ({
  field,
  languageTag,
  fieldRoot,
  fieldIndex,
  fieldKey
}: ErrorParams) =>
  (!field.isNested && languageTag === 'core' && $errors?.[fieldRoot]) ||
  (!field.isNested && languageTag === 'en' && $errors?.[fieldRoot]) ||
  (!field.isNested && $errors?.translations?.[languageTag]?.[fieldRoot]) ||
  (field.isNested &&
    languageTag === 'core' &&
    $errors?.[fieldRoot]?.[fieldIndex?.toString()]?.[fieldKey]) ||
  (field.isNested &&
    languageTag === 'en' &&
    $errors?.[fieldRoot]?.[fieldIndex?.toString()]?.[fieldKey]) ||
  (field.isNested && $errors?.[fieldRoot]?.[fieldIndex?.toString()]?.[fieldKey]);

export const getError = ({
  field,
  languageTag,
  fieldRoot,
  fieldIndex,
  fieldKey
}: ErrorParams) => {
  if (field.isNested) {
    if (field.isArray) {
      if (languageTag === 'core' || languageTag === 'en') {
        let arrayErrors = Object.values(
          $errors[fieldRoot][fieldIndex?.toString()][fieldKey]
        ).filter((error) => {
          return !('translations' in error);
        });
        return arrayErrors
          .map(
            (error) =>
              Object.keys(error).join(' & ') + ': ' + Object.values(error).join(', ')
          )
          .join('\n');
      } else {
        let arrayErrors = Object.values(
          $errors[fieldRoot][fieldIndex?.toString()][fieldKey]
        )
          .map((error) => error?.translations?.[languageTag])
          .filter(Boolean);
        // Loop through arrayErrors and recursively concat the path of each error , followed by a colon and the error message
        return arrayErrors
          .map(
            (error) =>
              Object.keys(error).join(' & ') + ': ' + Object.values(error).join(', ')
          )
          .join('<br>');
      }
    } else {
      if (languageTag === 'core' || languageTag === 'en') {
        return $errors[fieldRoot][fieldIndex?.toString()][fieldKey];
      } else {
        return $errors[fieldRoot][fieldIndex?.toString()][fieldKey].translations[
          languageTag
        ];
      }
    }
  } else {
    if (languageTag === 'core' || languageTag === 'en') {
      return $errors[fieldRoot];
    } else {
      return $errors.translations?.[languageTag]?.[fieldRoot];
    }
  }
};
</script>

{#if isError({ field, languageTag, fieldRoot, fieldIndex, fieldKey })}
  <div class="label">
    <span class="label-text-alt text-error"></span>
    <span class="label-text-alt text-error">
      {@html getError({ field, languageTag, fieldRoot, fieldIndex, fieldKey })}
    </span>
  </div>
{/if}
