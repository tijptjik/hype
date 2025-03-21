<script lang="ts">
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import SelectFieldComplex from '$lib/components/forms/fields/SelectComplex.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import InputField from '$lib/components/forms/fields/Input.svelte';
import { fade } from 'svelte/transition';
// TYPES
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields, fieldDiscriminator } = sectionProps;

// STATE : FORM
let { form } = sectionProps.form;
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container {fieldDiscriminator ==
  'classifier'
    ? 'basis-1/3'
    : 'basis-1/3'}">
  <Header {...sectionProps} />
  {#each Object.entries(fields) as [fieldRoot, field]}
    <div
      class="grid grid-cols-1 {fieldDiscriminator == 'classifier'
        ? '@xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-4 '
        : '@4xl:grid-cols-2'} gap-2 p-4">
      {#if field.isArray}
        {#each $form[fieldRoot] as item, index}
          {#if item?.property?.type === fieldDiscriminator}
            <div
              transition:fade
              class="flex items-center justify-between rounded-lg bg-base-100 p-4 shadow-lg">
              <div
                class="text-md {fieldDiscriminator == 'classifier'
                  ? 'w-20'
                  : 'w-32'} flex-grow-0">
                {item?.property?.label} <br />
                <small>{item?.property?.key}</small>
              </div>
              <div class="flex-grow">
                {#if item?.property?.component === 'SelectField'}
                  <SelectFieldComplex
                    {...sectionProps}
                    {fieldRoot}
                    {field}
                    fieldIndex={index}
                    fieldKey={'propertyValueId'} />
                {:else if item?.property?.component === 'RangeField'}
                  <RangeField
                    {...sectionProps}
                    {fieldRoot}
                    fieldIndex={index}
                    fieldKey={'value'}
                    min={item.property.min}
                    max={item.property.max}
                    step="1"
                    value={item.value} />
                {:else if item?.property?.component === 'ToggleField'}
                  <ToggleField
                    checked={item.value}
                    onChange={() => {
                      form.update(($form) => {
                        $form[fieldRoot][index][fieldKey] = !item[fieldKey];
                        return $form;
                      });
                    }} />
                {:else if item?.property?.component === 'InputField'}
                  <InputField
                    {...sectionProps}
                    {fieldRoot}
                    fieldIndex={index}
                    fieldKey={'value'}
                    {field} />
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/each}
</div>
