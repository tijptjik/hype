<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// TYPES
import type { FieldProps } from '$lib/types';

// CONTEXT
let mapCtx = getMapCtx();

// STATE : PROPS
let fieldProps: FieldProps & { propertyJoinStateKey: string } = $props();
let { propertyJoinStateKey, fieldDiscriminator, fieldRoot } = fieldProps;

// STATE : FORM
let { form } = fieldProps.form;
</script>

<div
  class="grid grid-cols-1 gap-2 p-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
  {#if ($form as any)[fieldRoot] && Array.isArray(($form as any)[fieldRoot])}
    {#each ($form as any)[fieldRoot] as item, index}
      {#if item?.property?.type === fieldDiscriminator}
        <div
          transition:fade
          class="flex items-center justify-between rounded-lg bg-base-100 p-4 shadow-lg">
          <span class="text-md">
            {#await getI18n(item.property.i18n, 'label', mapCtx.getUserPreferences()) then label}
              {label} <br /><small>{item?.property?.key}</small>
            {/await}
          </span>
          <label class="label cursor-pointer">
            <input
              name={item?.property?.id}
              type="checkbox"
              class="toggle toggle-primary toggle-lg"
              checked={item?.[propertyJoinStateKey]}
              onchange={() => {
                form.update(($form : any) => {
                  if (
                    ($form as any)[fieldRoot] &&
                    Array.isArray(($form as any)[fieldRoot])
                  ) {
                    // Preserve the existing property structure while updating isVisible
                    const currentProperty = ($form as any)[fieldRoot][index] as any;
                    const updatedProperty = {
                      ...currentProperty,
                      [propertyJoinStateKey]: !item?.[propertyJoinStateKey]
                    };

                    // If the original item had a nested property object, preserve it
                    if (item?.property) {
                      updatedProperty.property = item.property;
                    }

                    (($form as any)[fieldRoot][index] as any) = updatedProperty;
                  }
                  return $form;
                });
              }} />
          </label>
        </div>
      {/if}
    {/each}
  {:else}
    <div class="p-4 text-gray-500">
      No properties found or properties is not an array
    </div>
  {/if}
</div>
