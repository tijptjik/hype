<script lang="ts">
// Components
import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
// Types
import type { FormField, ResourceType } from '$lib/types';
// Context
import { getForm } from '$lib/context/forms.svelte';

// TYPES
type Props = {
  title: string;
  fields: FormField;
  entity: string;
  resourceType: ResourceType;
};

// STATE : PROPS
let {
  title,
  fields,
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(entity, resourceType);
</script>

<div
  class="basis-1/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <FormSectionHeader {title} {entity} {resourceType} />
  <div class="flex flex-row flex-wrap items-baseline gap-4 p-4">
    <div class="group flex flex-grow flex-col gap-4">
      {#each Object.entries(fields) as [fieldId, field]}
        {@const SpecificationComponent = field.component}
        <div class="rounded-xl bg-base-100 px-6 py-2 pb-6 pt-4">
          <SpecificationComponent {fieldId} {field} {form} {constraints} {errors} {entity} {resourceType} />
        </div>
      {/each}
    </div>
  </div>
</div>
