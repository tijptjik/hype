<script module>
const name = 'FieldRange';
</script>

<script lang="ts">
import ErrorLabel from './FormErrorLabel.svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { ResourceType, FalsableRef, FalsableFacetType, FieldDiscriminator } from '$lib/types';
import type { Writable } from 'svelte/store';
import type { LanguageTag, Key, FormFieldExtendedDefinition } from '$lib/types';

type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldExtendedDefinition;
  fieldIndex: number;
  fieldDiscriminator?: FieldDiscriminator;
  fieldKey?: Key;
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
};

let {
  fieldId,
  fieldIndex,
  fieldKey,
  form
}: Props = $props();

console.log($form[fieldId][fieldIndex][fieldKey])
</script>

<input
  type="range"
  min={$form[fieldId][fieldIndex].property.min}
  max={$form[fieldId][fieldIndex].property.max}
  step="1"
  bind:value={$form[fieldId][fieldIndex][fieldKey]}
 />
<!-- <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} /> -->
