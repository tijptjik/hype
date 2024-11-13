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
</script>

<input
  type="range"
  class="range range-primary"
  min={$form[fieldId][fieldIndex].property.min}
  max={$form[fieldId][fieldIndex].property.max}
  step="1"
  bind:value={$form[fieldId][fieldIndex][fieldKey]}
 />
 <div class="flex w-full justify-between px-2 text-xs">
  <span>{$form[fieldId][fieldIndex].property.min}</span>
  <span>❘</span>
  <span>|</span>
  <span>❘</span>
  <span>{$form[fieldId][fieldIndex].property.max}</span>
</div>
<!-- <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} /> -->
