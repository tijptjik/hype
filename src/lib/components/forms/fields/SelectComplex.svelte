<script lang="ts">
import { getValues, updateForm } from '$lib/index';
// COMPONENTS
import Select from '$lib/components/forms/elements/Select.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { Property, FieldPropsExtended, Id, Organisation, Project, Feature } from '$lib/types';

// STATE : PROPS
let {
  resource,
  entity,
  languageTag,
  fieldRoot,
  fieldIndex = 0,
  fieldDiscriminator,
  fieldKey,
  field
}: FieldPropsExtended = $props();

// STATE : CONTEXT
let { form } = getForm<Organisation | Project | Feature>(resource, entity);

// STATE : INTERMEDIATE
let value = $state('');
let valuesToIds = $state<{ value: string; id: string }[]>([]);
let loading = $state(true);

// EFFECTS
$effect(() => {
  ({ value } = getValues($form, field, languageTag, fieldRoot, fieldIndex, fieldKey));
  fetchPropertyValues();
});

// UTILS
async function fetchPropertyValues() {
  let propertyId = $form[fieldRoot][fieldIndex]['propertyId'] as Id;
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
</script>

{#if loading}
  <div class="loading loading-spinner justify-end"></div>
{:else}
  <Select
    id={$form[fieldRoot][fieldIndex]['propertyId']}
    bind:value
    values={valuesToIds}
    isComplex={true}
    {...field}
    onchange={() =>
      updateForm(form, field, languageTag, fieldRoot, fieldIndex, fieldKey, value)} />
{/if}
