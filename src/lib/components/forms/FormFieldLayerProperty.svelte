<script lang="ts">
import { fade } from 'svelte/transition';
// TYPES
import type { FormField } from '$lib/types';

// TYPES
type Props = {
  fieldId: string;
  fieldDiscriminator: string;
  field: FormField;
  form: any;
  constraints: any;
  errors: any;
  propertyJoinStateKey: string;
  entity: string | false;
  resourceType: string;
};

// STATE : PROPS
let { propertyJoinStateKey, form, fieldId, fieldDiscriminator, errors}: Props = $props();

</script>

<div
  class="grid grid-cols-1 gap-2 p-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
  {#if $form[fieldId] && Array.isArray($form[fieldId])}
    {#each $form[fieldId] as item, index}
      {#if item?.property?.type === fieldDiscriminator}
        <div
          transition:fade
          class="flex items-center justify-between rounded-lg bg-base-100 p-4 shadow-lg">
          <span class="text-md"
            >{item?.property?.label} <br /><small>{item?.property?.key}</small></span>
          <label class="label cursor-pointer">
            <input
              type="checkbox"
              name={item?.property?.id}
              class="toggle toggle-primary toggle-lg"
              checked={item[propertyJoinStateKey]}
              onchange={() => {
                form.update(($form) => {
                  $form[fieldId][index][propertyJoinStateKey] = !item[propertyJoinStateKey];
                  return $form;
                });
              }} />
          </label>
        </div>
      {/if}
    {/each}
  {/if}
</div>
