<script lang="ts">
// COMPONENTS
import Header from '$lib/components/forms/FormHeader.svelte';
import SelectFieldComplex from '$lib/components/forms/FormFieldSelectComplex.svelte';
import RangeField from '$lib/components/forms/FormFieldRange.svelte';
import ToggleField from '$lib/components/forms/FormFieldCheckbox.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FormField, ResourceType, FalsableRef, FalsableFacetType } from '$lib/types';

type Props = {
  title: string;
  subtitle: string;
  fields: FormField;
  fieldDiscriminator: string;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, subtitle, fields, fieldDiscriminator, entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);
</script>

<div
  class="overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 {fieldDiscriminator ==
  'classifier'
    ? 'basis-2/3'
    : 'basis-1/3'}">
  <Header {title} {subtitle} {fields} {resourceType} {errors} {entity} />
  {#each Object.entries(fields) as [fieldId, field]}
    <div
      class="grid grid-cols-1 gap-2 p-4 {fieldDiscriminator == 'classifier'
        ? 'xl:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 ' : '4xl:grid-cols-2'}">
      {#if $form[fieldId] && Array.isArray($form[fieldId])}
        {#each $form[fieldId] as item, index}
          {#if item?.property?.type === fieldDiscriminator}
            <div
              transition:fade
              class="flex items-center justify-between rounded-lg bg-base-100 p-4 shadow-lg">
              <div class="text-md {fieldDiscriminator == 'classifier' ? 'w-20' : 'w-32'} flex-grow-0">
                {item?.property?.label} <br />
                <small>{item?.property?.key}</small>
              </div>
              <div class="flex-grow">
                {#if item?.property?.component === 'SelectField'}
                  <SelectFieldComplex
                    {fieldId}
                    {field}
                    {form}
                    {errors}
                    {fieldDiscriminator}
                    fieldIndex={index}
                    fieldKey={'propertyValueId'} />
                {:else if item?.property?.component === 'RangeField'}
                  <RangeField
                    {fieldId}
                    fieldIndex={index}
                    fieldKey={'value'}
                    {form}
                    min={item.property.min}
                    max={item.property.max}
                    step="1"
                    value={item.value} />
                {:else if item?.property?.component === 'ToggleField'}
                  <ToggleField
                    checked={item.value}
                    onChange={() => {
                      form.update(($form) => {
                        $form[fieldId][index][fieldKey] = !item[fieldKey];
                        return $form;
                      });
                    }} />
                {:else if item?.property?.component === 'InputField'}
                  <InputField
                    {fieldId}
                    fieldIndex={index}
                    {fieldDiscriminator}
                    fieldKey={'value'} 
                    {field}
                    {form}
                    {errors}
                    {constraints}
                    />
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/each}
</div>
