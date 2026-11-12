<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// COMPONENTS
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'

type TitleFields = {
  title: {
    as(type: 'hidden', value: string): Record<string, unknown>
    issues(): import('$app/server').RemoteFormIssue[] | undefined
  }
  titleGen: { as(type: 'hidden', value: string): Record<string, unknown> }
}

let {
  preview,
  value,
  override,
  generated,
  label,
  prefix = '',
  editable,
  fields,
  baseName,
  required,
  onChange,
  onEditStart,
}: {
  preview?: Snippet
  value: string
  override?: string
  generated: boolean
  label: string
  prefix?: string
  editable: boolean
  fields: object
  baseName: string
  required: boolean
  onChange: (value: string | undefined, generated: boolean) => void
  onEditStart: () => void
} = $props()
const controls = $derived(fields as TitleFields)
let beforeEdit: { override: string | undefined; generated: boolean } | undefined
</script>

<!-- Submit the authored base separately: the visible title is the naming rule's result. -->
<input {...controls.title.as('hidden', baseName)}>
<input {...controls.titleGen.as('hidden', generated ? 'true' : 'false')}>
<FormI18nInlineRow
  {preview}
  {value}
  {label}
  {prefix}
  {editable}
  {required}
  isGenAI={generated}
  issues={controls.title.issues()}
  attrs={{
    value,
    'aria-label': label,
    oninput: (event: Event) => {
      onChange((event.currentTarget as HTMLInputElement).value, false)
      onEditStart()
    },
  }}
  onStart={() => {
    beforeEdit = { override, generated }
    onEditStart()
  }}
  onCancel={() => {
    if (beforeEdit) onChange(beforeEdit.override, beforeEdit.generated)
  }}
  onClear={() => {
    onChange('', false)
    onEditStart()
  }}
  onToggle={() => onChange(override, !generated)}
/>
