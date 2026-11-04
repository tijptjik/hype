<script lang="ts">
// COMPONENTS
import FormI18nInlineRow from './FormI18nInlineRow.svelte'
import FieldError from '#lib/bits/custom/form/src/label/components/Error.svelte'

let {
  label,
  control,
  isEditing = false,
  required = false,
  multiline = false,
  onChange = () => {},
}: {
  label: string
  control: {
    as: (type: 'text') => Record<string, unknown>
    set: (value: string) => unknown
    issues: () => import('$app/server').RemoteFormIssue[] | undefined
  }
  isEditing?: boolean
  required?: boolean
  multiline?: boolean
  onChange?: () => void
} = $props()
const attrs = $derived(control.as('text'))
const value = $derived(String(attrs.value ?? ''))
let beforeEdit = ''
</script>

<section class="min-w-0" data-inline-field={label}>
  <h3 class="flex min-h-7 items-center gap-1 text-sm font-semibold">
    {label}
    {#if required}
      <span class="text-error" aria-hidden="true">*</span>
    {/if}
  </h3>
  <div class="mt-3">
    <FormI18nInlineRow
      {value}
      {label}
      {required}
      {multiline}
      renderHtml={false}
      editable={isEditing}
      showVerification={false}
      issues={undefined}
      attrs={{
        ...attrs,
        oninput: (event: Event) => {
          if (typeof attrs.oninput === 'function') attrs.oninput(event)
          onChange()
        },
      }}
      onStart={() => {
        beforeEdit = value
      }}
      onCancel={() => {
        control.set(beforeEdit)
        onChange()
      }}
      onClear={() => {
        control.set('')
        onChange()
      }}
    />
  </div>
  <FieldError issues={control.issues()} />
</section>
