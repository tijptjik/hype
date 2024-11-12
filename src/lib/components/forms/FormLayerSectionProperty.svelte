<script lang="ts">
// Components
import Header from '$lib/components/forms/FormHeader.svelte';
import LayerPropertyField from '$lib/components/forms/FormFieldLayerProperty.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FormField, ResourceType, FalsableRef, FalsableFacetType } from '$lib/types';

type Props = {
  title: string;
  subtitle: string;
  fields: FormField;
  fieldDiscriminator: string;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, subtitle, fields, fieldDiscriminator, entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header {title} {subtitle} {fields} {resourceType} {errors} {entity} />
  {#each Object.entries(fields) as [fieldId, field]}
    <LayerPropertyField
      {fieldId}
      {fieldDiscriminator}
      {form}
      {constraints}
      {errors}
      propertyJoinStateKey="isVisible"
      {entity}
      {resourceType} />
  {/each}
</div>
