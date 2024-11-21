<script lang="ts">
import { fade } from 'svelte/transition';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FieldProps, FacetRouter } from '$lib/types';

// STATE : PROPS
let fieldProps: FieldProps & { propertyJoinStateKey: string } = $props();
let { propertyJoinStateKey, fieldDiscriminator, fieldRoot } = fieldProps;

// STATE : FORM
let { form } = fieldProps.form;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as FacetRouter;

</script>

<div
  class="grid grid-cols-1 gap-2 p-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
  {#if $form[fieldRoot] && Array.isArray($form[fieldRoot])}
    {#each $form[fieldRoot] as item, index}
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
                  $form[fieldRoot][index][propertyJoinStateKey] = !item[propertyJoinStateKey];
                  return $form;
                });
              }} />
          </label>
        </div>
      {/if}
    {/each}
  {/if}
</div>
