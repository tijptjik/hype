<script lang="ts">
import FormTextArea from '$lib/components/forms/elements/Textarea.svelte'
import ErrorLabel from '$lib/components/forms/labels/Error.svelte'
import FieldLabel from '$lib/components/forms/labels/Field.svelte'
import { getValues, updateForm, getId } from '$lib/index'
// TYPES
import type { FieldPropsExtended, FieldDiscriminator, Locale } from '$lib/types'

// STATE : PROPS
let {
  locale,
  fieldRoot,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  field,
  ...fieldProps
}: FieldPropsExtended & { fieldDiscriminator: FieldDiscriminator } = $props()

// STATE : CONTEXT :: FORM
let { form, constraints, errors } = fieldProps.form

let fieldValues = $derived(
  getValues($form, field, locale, fieldRoot, fieldIndex, fieldKey) || {
    value: '',
    isGenAI: false,
  },
)

// STATE : LOCAL
let isGenAI = $derived(fieldValues.isGenAI)

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, locale),
)

function syncToForm(isGenAI: boolean) {
  updateForm(
    form,
    field,
    locale as Locale,
    fieldRoot,
    fieldIndex,
    fieldKey,
    fieldValues.value as string,
    isGenAI,
  )
}
// HANDLERS
function handleChange(e: Event) {
  syncToForm(false)
}

function handleToggleGenAI(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  syncToForm(!isGenAI)
  isGenAI = !isGenAI
}
</script>

{#if !field.isTranslated && locale !== 'core' && locale !== 'en'}
  <!-- SPACER -->
  <div class="h-[74px] w-full rounded-lg bg-glass-100 bg-opacity-10"></div>
{:else}
  <label class="form-control w-full">
    <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
    <div
      class="caret-prite relative rounded-lg border-none bg-glass-100 pl-0 pr-3 focus-within:outline-neutral-500 focus-within:ring-2 focus-within:ring-primary"
    >
      <FormTextArea
        bind:value={fieldValues.value as string}
        {isGenAI}
        {id}
        {locale}
        {...field}
        onToggleGenAI={handleToggleGenAI}
        onchange={handleChange}
      />
    </div>
    <ErrorLabel {errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} />
  </label>
{/if}
