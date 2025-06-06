<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import SelectFieldComplex from '$lib/components/forms/fields/SelectComplex.svelte';
import RangeField from '$lib/components/forms/fields/Range.svelte';
import ToggleField from '$lib/components/forms/fields/Toggle.svelte';
import InputField from '$lib/components/forms/fields/Input.svelte';
import TextareaField from '$lib/components/forms/fields/Textarea.svelte';
import { fade } from 'svelte/transition';
// TYPES
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields, fieldDiscriminator } = sectionProps;

// STATE : FORM
let { form } = sectionProps.form;

let locale = $derived(getLocale());

// Helper function to get property value safely
const getPropertyValue = (item: any, key: string) => {
  return item?.[key] ?? item?.value ?? '';
};

// Helper function to check if property should be visible
const isPropertyVisible = (item: any) => {
  return item?.property?.type === fieldDiscriminator && item?.property;
};
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container {sectionProps.cols ==
  2
    ? 'basis-1/2-gap-6 2xl:basis-1/2-gap-6'
    : sectionProps.cols == 3
      ? '2xl:basis-1/4-gap-6 basis-1/3-gap-6'
      : 'basis-1/2-gap-6 2xl:basis-1/3-gap-6'}">
  <Header {...sectionProps} />
  {#each Object.entries(fields) as [fieldRoot_, field]}
    {@const fieldRoot = fieldRoot_ as keyof typeof $form}
    <div
      class="grid grid-cols-1 {fieldDiscriminator == 'classifier'
        ? '@xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-4 '
        : '@4xl:grid-cols-2'} gap-2 p-4">
      {#if field.isArray && $form[fieldRoot as keyof typeof FeatureForm]}
        {#each $form[fieldRoot] as item, index}
          {#key item.id}
            {#if isPropertyVisible(item)}
              <div
                transition:fade
                class="flex items-start justify-between gap-2 rounded-lg bg-base-100 p-4 shadow-lg">
                <div class="text-md w-24 flex-grow-0">
                  {item?.property?.i18n?.[getLocale()]?.label ||
                    m.red_arable_herring_trust()}
                  <br />
                  <small class="text-xs text-neutral-content/50"
                    >{item?.property?.key || ''}</small>
                </div>
                <div class="flex-grow">
                  {#if item?.property?.component === 'SelectField'}
                    <SelectFieldComplex
                      {...sectionProps}
                      {locale}
                      {fieldRoot}
                      {field}
                      fieldIndex={index}
                      fieldKey="propertyValueId" />
                  {:else if item?.property?.component === 'RangeField'}
                    <RangeField
                      {...sectionProps}
                      {fieldRoot}
                      {field}
                      fieldIndex={index}
                      fieldKey="value" />
                  {:else if item?.property?.component === 'ToggleField'}
                    <ToggleField
                      label={item?.property?.i18n?.[getLocale()]?.label || 'Toggle'}
                      checked={!!getPropertyValue(item, 'value')}
                      onChange={(e) => {
                        e.preventDefault();
                        form.update(($form) => {
                          $form[fieldRoot][index]['value'] = !getPropertyValue(
                            item,
                            'value'
                          );
                          return $form;
                        });
                      }} />
                  {:else if item?.property?.component === 'InputField'}
                    <InputField
                      {...sectionProps}
                      {locale}
                      {fieldRoot}
                      {field}
                      fieldIndex={index}
                      fieldKey="value" />
                  {:else if item?.property?.component === 'TextareaField'}
                    <TextareaField
                      {...sectionProps}
                      {locale}
                      {fieldRoot}
                      {field}
                      fieldIndex={index}
                      fieldKey="value" />
                  {:else}
                    <!-- Fallback for unknown component types -->
                    <div class="text-sm text-neutral-content">
                      <span class="font-mono">
                        {getPropertyValue(item, 'value') || 'No value set'}
                      </span>
                      <br />
                      <small class="text-xs opacity-50">
                        Component: {item?.property?.component || 'Unknown'}
                      </small>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/key}
        {/each}
      {:else if field.isArray}
        <!-- Show message when no properties are available -->
        <div class="col-span-full py-8 text-center text-neutral-content/50">
          No {fieldDiscriminator} properties available
        </div>
      {/if}
    </div>
  {/each}
</div>
