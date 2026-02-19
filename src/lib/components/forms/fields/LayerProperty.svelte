<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { FieldProps } from '$lib/types'
// ICON
import { Eye, Pencil } from '@steeze-ui/heroicons'
import Icon from '$lib/components/common/Icon.svelte'

// CONTEXT
let appCtx = getAppCtx()

// STATE : PROPS
let fieldProps: FieldProps = $props()
let { fieldDiscriminator, fieldRoot } = fieldProps

// STATE : FORM
let { form } = fieldProps.form
</script>

<div
  class="grid grid-cols-1 gap-2 py-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 4xl:grid-cols-3"
>
  {#if ($form as any)[fieldRoot] && Array.isArray(($form as any)[fieldRoot])}
    {#each ($form as any)[fieldRoot] as item, index}
      {@const property = appCtx.cache.property.get(item?.propertyId)}
      {#if property?.type === fieldDiscriminator}
        <div
          transition:fade
          class="bg-grain flex flex-row items-stretch justify-between gap-3 rounded-lg bg-glass-100 shadow-lg"
        >
          <div class="text-md flex flex-grow basis-2/5 flex-col p-4 pr-0">
            <h4 class="text-[1rem]">
              {getI18n(property, 'label', appCtx.getUserPreferences())}
            </h4>
            <small class="text-base-content/7 font-mono text-[0.7rem] uppercase"
              >{property?.key}</small
            >
          </div>

          <div
            class="text-md flex flex-grow basis-3/5 flex-col justify-center gap-1.5 rounded-r-lg bg-glass-result p-3"
          >
            <!-- Published Toggle -->
            <label class="flex cursor-pointer items-center justify-between gap-2">
              <span
                class="flex flex-row items-center gap-2 text-[0.8rem] font-light tracking-tighter"
              >
                <Icon src={Eye} class="size-4" />{m.published()}
              </span>
              <input
                name={`${property?.id}_isVisible`}
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
                      (($form as any)[fieldRoot][index] as any) = updatedProperty;
                    }
                    return $form;
                  });
                }}
              >
            </label>

            <!-- User Contributable Toggle -->
            <label class="flex cursor-pointer items-center justify-between gap-2">
              <span
                class="flex flex-row items-center gap-2 text-[0.8rem] font-light tracking-tighter"
              >
                <Icon src={Pencil} class="size-4" />{m.grand_such_bullock_play()}
              </span>
              <input
                name={`${property?.id}_isUserContributed`}
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

                      (($form as any)[fieldRoot][index] as any) = updatedProperty;
                    }
                    return $form;
                  });
                }}
              >
            </label>
          </div>
        </div>
      {/if}
    {/each}
  {:else}
    <div class="p-4 text-gray-500">{m.bland_sad_goat_gasp()}</div>
  {/if}
</div>
