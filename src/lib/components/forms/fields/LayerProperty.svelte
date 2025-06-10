<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { FieldProps } from '$lib/types';
// ICON
import { Eye, Pencil } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

// CONTEXT
let appCtx = getAppCtx();

// STATE : PROPS
let fieldProps: FieldProps = $props();
let { fieldDiscriminator, fieldRoot } = fieldProps;

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
          class="flex flex-row items-stretch justify-between gap-3 rounded-lg bg-base-100 shadow-lg">
          <div class="text-md flex flex-col p-4 pr-0">
            {getI18n(item.property, 'label', appCtx.getUserPreferences())}
            <br /><small>{item?.property?.key}</small>
          </div>

          <!-- Published Toggle -->
          <div class="text-md flex flex-col gap-2 rounded-r-lg bg-base-300 p-3">
            <label class="flex cursor-pointer items-center justify-between gap-2">
              <span class="flex flex-row items-center gap-2 font-mono text-sm font-light tracking-tighter">
                <Icon src={Eye} class="size-4" />Published
              </span>
              <input
                name={`${item?.property?.id}_isVisible`}
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                checked={item?.isVisible}
                onchange={() => {
                  form.update(($form: any) => {
                    if (
                      ($form as any)[fieldRoot] &&
                      Array.isArray(($form as any)[fieldRoot])
                    ) {
                      const currentProperty = ($form as any)[fieldRoot][index] as any;
                      const updatedProperty = {
                        ...currentProperty,
                        isVisible: !item?.isVisible
                      };

                      // Preserve the existing property structure
                      if (item?.property) {
                        updatedProperty.property = item.property;
                      }

                      (($form as any)[fieldRoot][index] as any) = updatedProperty;
                    }
                    return $form;
                  });
                }} />
            </label>

            <!-- User Contributable Toggle -->
            <label class="flex cursor-pointer items-center justify-between gap-2">
              <span class="flex flex-row items-center gap-2 font-mono text-sm font-light tracking-tighter">
                <Icon src={Pencil} class="size-4" /> Admin Only
              </span>
              <input
                name={`${item?.property?.id}_isUserContributed`}
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                checked={!item?.isUserContributed}
                onchange={() => {
                  form.update(($form: any) => {
                    if (
                      ($form as any)[fieldRoot] &&
                      Array.isArray(($form as any)[fieldRoot])
                    ) {
                      const currentProperty = ($form as any)[fieldRoot][index] as any;
                      const updatedProperty = {
                        ...currentProperty,
                        isUserContributed: !item?.isUserContributed
                      };

                      // Preserve the existing property structure
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
        </div>
      {/if}
    {/each}
  {:else}
    <div class="p-4 text-gray-500">
      {m.bland_sad_goat_gasp()}
    </div>
  {/if}
</div>
