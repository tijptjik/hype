<script lang="ts">
// Components
import Header from '$lib/components/forms/FormHeader.svelte';
// Types
import type { FormField, ResourceType, FalsableRef } from '$lib/types';
// Context
import { getForm } from '$lib/context/forms.svelte';

// TYPES
type Props = {
  title: string;
  fields: FormField;
  facet: string;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let {
  title,
  fields,
  facet,
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);
</script>

<div
  class="basis-1/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header {title} {entity} {resourceType} />
  <div class="flex flex-wrap items-baseline gap-4 p-4">
    <div class="group flex flex-grow flex-col gap-4">
      {#each Object.entries(fields) as [fieldId, field]}
        <div class="rounded-xl bg-base-100 px-6 py-2 pb-6 pt-4">
          <field.component {fieldId} {field} {form} {constraints} {errors} {entity} {resourceType} />
        </div>
      {/each}
    </div>
  </div>
</div>
