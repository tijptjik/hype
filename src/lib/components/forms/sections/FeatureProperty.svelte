<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte'
import FeatureInputField from '$lib/components/forms/fields/FeatureInput.svelte'
import FeatureTextareaField from '$lib/components/forms/fields/FeatureTextarea.svelte'
import FeatureRangeField from '$lib/components/forms/fields/FeatureRange.svelte'
import FeatureToggleField from '$lib/components/forms/fields/FeatureToggle.svelte'
import FeatureSelect from '$lib/components/forms/fields/FeatureSelect.svelte'
import { fade } from 'svelte/transition'
// TYPES
import type { SectionProps } from '$lib/types'

// STATE : PROPS
let sectionProps: SectionProps = $props()
let { fields, fieldDiscriminator } = sectionProps

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : FORM
let { form } = sectionProps.form

let locale = $derived(getLocale())

// Helper function to get property value safely
const getPropertyValue = (item: any, key: string) => {
  return item?.[key] ?? item?.value ?? ''
}

// Helper function to get current form value for a property
const getCurrentFormValue = (item: any, propertyId: string): string => {
  // For form editing, we get the value from the form item directly
  if (item?.i18n?.[locale]?.value) {
    return item.i18n[locale].value
  }
  return item?.value || ''
}

// Helper function to check if property should be visible
const isPropertyVisible = (item: any, property: any) => {
  const result = property?.type === fieldDiscriminator && property
  return result
}

// Type-safe form access
const getFormField = (fieldRoot: string) => {
  const formValue = $form as any
  return formValue[fieldRoot]
}

// Type guard for property items
const isPropertyItem = (
  item: unknown,
): item is {
  propertyId: string
  featureId: string
  propertyValueId?: string
  value?: string
  i18n?: any
  property?: any
} => {
  return (
    typeof item === 'object' &&
    item !== null &&
    'propertyId' in item &&
    'featureId' in item
  )
}

// Helper function to update form value for specifier properties
const updateFormSpecifierValue = (
  fieldRoot: string,
  index: number,
  newValue: string,
  property: any,
) => {
  form.update(($form: any) => {
    if (Array.isArray($form[fieldRoot]) && $form[fieldRoot][index]) {
      if (property.isTranslatable) {
        // Update i18n value for translatable properties
        if (!$form[fieldRoot][index].i18n) {
          $form[fieldRoot][index].i18n = {}
        }
        $form[fieldRoot][index].i18n[locale] = {
          locale,
          value: newValue,
          valueGen: false,
        }
      } else {
        // Update universal value for non-translatable properties
        $form[fieldRoot][index].value = newValue
      }
    }
    return $form
  })
}
</script>

<div
  class="z-10 basis-1-2-gap-4 rounded-2xl p-0 @container {sectionProps.cols == 3
    ? 'basis-1-2-gap-4 2xl:basis-1-3-gap-4'
    : '2xl:basis-1/4-gap-4 basis-1-2-gap-4 '}"
>
  <Header {...sectionProps} />
  {#each Object.entries(fields) as [ fieldRoot_, field ]}
    {@const formField = getFormField(fieldRoot_)}
    <div
      class="grid grid-cols-1 {fieldDiscriminator == 'classifier'
        ? '@xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-4 '
        : '@4xl:grid-cols-2'} gap-4 pt-2"
    >
      {#if field.isArray && Array.isArray(formField)}
        {#each formField as item, index}
          {#if isPropertyItem(item)}
            {@const property =
              item.property || appCtx.cache.property.get(item.propertyId)}
            {#key `${item.featureId}-${item.propertyId}`}
              {#if isPropertyVisible(item, property)}
                <div
                  transition:fade
                  class="bg-grain flex items-start justify-between gap-2 rounded-lg border-3 border-primary bg-glass-300 p-4 shadow-lg"
                >
                  <div class="text-md w-24 flex-grow-0">
                    {getI18n(property, 'label', appCtx.getUserPreferences()) ||
                      m.red_arable_herring_trust()}
                    <br>
                    <small class="text-xs text-neutral-content/50"
                      >{property?.key || ''}</small
                    >
                  </div>
                  <div class="flex-grow">
                    {#if property?.component === 'SelectField'}
                      <FeatureSelect
                        {property}
                        value={item.propertyValueId || ''}
                        userPreferences={appCtx.getUserPreferences()}
                        {appCtx}
                        propertyId={item.propertyId}
                        onChange={(newValue) => {
                          form.update(($form: any) => {
                            if (
                              Array.isArray($form[fieldRoot_]) &&
                              $form[fieldRoot_][index]
                            ) {
                              $form[fieldRoot_][index].propertyValueId = newValue;
                            }
                            return $form;
                          });
                        }}
                      />
                    {:else if property?.component === 'RangeField'}
                      <FeatureRangeField
                        {property}
                        value={getPropertyValue(item, 'value')}
                        onChange={(newValue) => {
                          updateFormSpecifierValue(
                            fieldRoot_,
                            index,
                            newValue,
                            property
                          );
                        }}
                      />
                    {:else if property?.component === 'ToggleField'}
                      <FeatureToggleField
                        {property}
                        checked={!!getPropertyValue(item, 'value')}
                        userPreferences={appCtx.getUserPreferences()}
                        onChange={(checked) => {
                          updateFormSpecifierValue(
                            fieldRoot_,
                            index,
                            checked.toString(),
                            property
                          );
                        }}
                      />
                    {:else if property?.component === 'InputField'}
                      <FeatureInputField
                        {property}
                        value={getCurrentFormValue(item, item.propertyId)}
                        userPreferences={appCtx.getUserPreferences()}
                        onChange={(newValue) => {
                          updateFormSpecifierValue(
                            fieldRoot_,
                            index,
                            newValue,
                            property
                          );
                        }}
                      />
                    {:else if property?.component === 'TextareaField'}
                      <FeatureTextareaField
                        {property}
                        value={getCurrentFormValue(item, item.propertyId)}
                        userPreferences={appCtx.getUserPreferences()}
                        onChange={(newValue) => {
                          updateFormSpecifierValue(
                            fieldRoot_,
                            index,
                            newValue,
                            property
                          );
                        }}
                      />
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
          {m.known_civil_tapir_swim({ fieldDiscriminator })}
        </div>
      {/if}
    </div>
  {/each}
</div>
