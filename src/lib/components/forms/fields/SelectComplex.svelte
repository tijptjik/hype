<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n'
// LIB
import { getValues, updateFeaturePropertyValue } from '$lib/index'
// COMPONENTS
import Select from '$lib/components/forms/elements/Select.svelte'
// TYPES
import type { FieldPropsExtended, PropertyValue } from '$lib/types'

// STATE : PROPS
let {
  locale,
  fieldRoot,
  fieldIndex = 0,
  fieldDiscriminator,
  fieldKey,
  field,
  ...fieldProps
}: FieldPropsExtended = $props()

// STATE : CONTEXT :: FORM
let { form } = fieldProps.form

// STATE : INTERMEDIATE
let values: { readonly value: string; readonly id: string }[] = $derived(
  ($form as any)[fieldRoot][fieldIndex]['property']?.values.map((v: PropertyValue) => ({
    value: v.i18n?.[getLocale()]?.value || '',
    id: v.id,
  })) || [],
)
let id = $derived(($form as any)[fieldRoot][fieldIndex]['propertyId'])
let fieldValues = $derived(
  getValues($form as any, field, locale!, fieldRoot, fieldIndex, fieldKey),
)
</script>

<Select
  {id}
  {values}
  bind:value={fieldValues!.value}
  isComplex={true}
  {...field}
  onchange={(e: Event) => {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    const newValue = target.value;
    updateFeaturePropertyValue(form as any, fieldRoot, fieldIndex, newValue, fieldKey);
  }}
/>
