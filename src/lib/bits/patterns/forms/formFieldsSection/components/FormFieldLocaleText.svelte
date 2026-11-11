<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
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
  proposal,
  onProposal,
  onAccept,
}: {
  proposal?: string
  onProposal?: (value: string) => void
  onAccept?: () => void
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
  if (proposal !== undefined) {
    onProposal?.((event.currentTarget as HTMLInputElement).value)
    return
  }
  if (typeof attrs.oninput === 'function') attrs.oninput(event)
  onValue((event.currentTarget as HTMLInputElement).value)
  if (gen) onGen(false)
}
</script>

<FormI18nInlineRow
  value={proposal ?? value}
  {label}
  {prefix}
  {required}
  editable={isEditing}
  isGenAI={proposal !== undefined || gen}
  showVerification={proposal === undefined}
  issues={issues as import('$app/server').RemoteFormIssue[] | undefined}
  attrs={proposal !== undefined
    ? { lang: locale, oninput: input }
    : { ...attrs, lang: locale, oninput: input }}
  onStart={() => {
    beforeEdit = { value, gen }
  }}
  onCancel={() => {
    if (proposal !== undefined) return
    if (beforeEdit) {
      onValue(beforeEdit.value)
      onGen(beforeEdit.gen)
    }
  }}
  onClear={() => {
    if (proposal !== undefined) {
      onProposal?.('')
      return
    }
    onValue('')
    onGen(false)
  }}
  onToggle={() => onGen(!gen)}
/>

{#if proposal !== undefined}
  <input {...attrs} type="hidden" {value}>
  <button type="button" class="text-primary mt-1 text-xs" onclick={onAccept}>
    {m.translation_review_accept()}
  </button>
{/if}
