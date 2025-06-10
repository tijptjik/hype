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
import type { SectionProps, Field } from '$lib/types';

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

// Type-safe form access
const getFormField = (fieldRoot: string) => {
  const formValue = $form as any;
  return formValue[fieldRoot];
};

// Type guard for property items
const isPropertyItem = (item: unknown): item is { property: any; id: string } => {
  return (
    typeof item === 'object' && item !== null && 'property' in item && 'id' in item
  );
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
    {@const formField = getFormField(fieldRoot_)}
    <div
      class="grid grid-cols-1 {fieldDiscriminator == 'classifier'
        ? '@xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-4 '
        : '@4xl:grid-cols-2'} gap-2 p-4">
      {#if field.isArray && Array.isArray(formField)}
        {#each formField as item, index}
          {#if isPropertyItem(item)}
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
                        fieldRoot={fieldRoot_ as Field}
                        {field}
                        fieldIndex={index}
                        fieldKey={'propertyValueId' as Field} />
                    {:else if item?.property?.component === 'RangeField'}
                      <RangeField
                        {...sectionProps}
                        fieldRoot={fieldRoot_ as Field}
                        {field}
                        fieldIndex={index}
                        fieldKey="value" />
                    {:else if item?.property?.component === 'ToggleField'}
                      <ToggleField
                        label={item?.property?.i18n?.[getLocale()]?.label || 'Toggle'}
                        checked={!!getPropertyValue(item, 'value')}
                        onChange={(e) => {
                          e.preventDefault();
                          form.update(($form: any) => {
                            if (
                              Array.isArray($form[fieldRoot_]) &&
                              $form[fieldRoot_][index]
                            ) {
                              $form[fieldRoot_][index]['value'] = !getPropertyValue(
                                item,
                                'value'
                              );
                            }
                            return $form;
                          });
                        }} />
                    {:else if item?.property?.component === 'InputField'}
                      <InputField
                        {...sectionProps}
                        fieldDiscriminator={fieldDiscriminator!}
                        {locale}
                        fieldRoot={fieldRoot_ as Field}
                        {field}
                        fieldIndex={index}
                        fieldKey="value" />
                    {:else if item?.property?.component === 'TextareaField'}
                      <TextareaField
                        {...sectionProps}
                        fieldDiscriminator={fieldDiscriminator!}
                        {locale}
                        fieldRoot={fieldRoot_ as Field}
                        {field}
                        fieldIndex={index}
                        fieldKey="value" />
                    {/if}
                  </div>
                </div>
              {/if}
            {/key}
          {/if}
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
