<script lang="ts">
// COMPONENTS
import FormI18nInlineRow from '../../formI18nSection/components/FormI18nInlineRow.svelte'
// TYPES
import type { FormIssueLike } from '#lib/client/services/form.types.js'

let {
  value,
  gen,
  label,
  prefix,
  locale,
  attrs,
  issues,
  required,
  isEditing,
  onValue,
  onGen,
}: {
  value: string
  gen: boolean
  label: string
  prefix: string
  locale: string
  attrs: Record<string, unknown>
  issues?: FormIssueLike[]
  required: boolean
  isEditing: boolean
  onValue: (value: string) => void
  onGen: (value: boolean) => void
} = $props()
let beforeEdit: { value: string; gen: boolean } | undefined

/** Record manual edits without changing another locale or field.
 * @param event Native input event. @returns Nothing.
 */
function input(event: Event): void {
  if (typeof attrs.oninput === 'function') attrs.oninput(event)
  onValue((event.currentTarget as HTMLInputElement).value)
  if (gen) onGen(false)
}
</script>

<FormI18nInlineRow
  {value}
  {label}
  {prefix}
  {required}
  editable={isEditing}
  isGenAI={gen}
  issues={issues as import('$app/server').RemoteFormIssue[] | undefined}
  attrs={{ ...attrs, lang: locale, oninput: input }}
  onStart={() => {
    beforeEdit = { value, gen }
  }}
  onCancel={() => {
    if (beforeEdit) {
      onValue(beforeEdit.value)
      onGen(beforeEdit.gen)
    }
  }}
  onClear={() => {
    onValue('')
    onGen(false)
  }}
  onToggle={() => onGen(!gen)}
/>
