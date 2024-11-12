<script module>
const name = 'FieldSelectComplex';
</script>

<script lang="ts">
// COMPONENTS
import Select from '$lib/components/forms/FormSelect.svelte';
import { onMount } from 'svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { FormFieldExtendedDefinition } from '$lib/types';
import type { ResourceType, FalsableRef, FalsableFacetType, FieldDiscriminator } from '$lib/types';
import type { Writable } from 'svelte/store';
import type { LanguageTag, Key } from '$lib/types';
import type { Property } from '$lib/types';

// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldExtendedDefinition;
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
  fieldDiscriminator?: FieldDiscriminator;
  customProperty?: string;
  values: string[];
  fieldIndex: number;
  fieldKey?: Key;
};

// STATE : PROPS
let {
  languageTag = 'core',
  fieldId,
  form,
  fieldIndex = 0,
  fieldKey
}: Props = $props();

let valuesToIds: { value: string; id: string }[] = $state([]);
let loading = $state(true);

// UTILS
async function fetchPropertyValues() {
  let propertyId = $form[fieldId][fieldIndex]['propertyId'] as string;
  try {
    const response = await fetch(`/api/properties/${propertyId}`);
    if (!response.ok) throw new Error('Failed to fetch property values');
    const data: Property = await response.json();
    valuesToIds = data.values.map((v: any) => ({ value: v.value, id: v.id }));
  } catch (error) {
    console.error('Error fetching property values:', error);
    valuesToIds = [];
  } finally {
    loading = false;
  }
}

$effect(() => {
  fetchPropertyValues();
});
</script>

{#if loading}
  <div class="loading loading-spinner justify-end"></div>
{:else}
  <Select
    id={$form[fieldId][fieldIndex]['propertyId']}
    class="w-full px-12"
    bind:value={$form[fieldId][fieldIndex][fieldKey]}
    values={valuesToIds}
    {languageTag}
    isComplex={true} />
{/if}
