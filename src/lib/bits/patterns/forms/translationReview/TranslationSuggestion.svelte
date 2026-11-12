<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
import XIcon from 'virtual:icons/lucide/x'
let {
  value,
  label,
  prefix = '',
  markdown = false,
  multiline = markdown,
  onChange,
  onAccept,
  onReject,
}: {
  value: string
  label: string
  prefix?: string
  multiline?: boolean
  markdown?: boolean
  onChange: (value: string) => void
  onAccept: (edited?: boolean) => void
  onReject: () => void
} = $props()
let editing = $state(false)
let cancelled = false
let editorFocused = false
let original = ''
/** Commit the reviewed value when the user leaves its existing editor.
 * @param event Focus movement from the field.
 * @returns Completion after the final input update.
 */
async function finish(event: FocusEvent): Promise<void> {
  if (
    !editing ||
    !editorFocused ||
    (event.currentTarget instanceof HTMLElement &&
      event.currentTarget.contains(event.relatedTarget as Node))
  )
    return
  // Save can remove this suggestion during the flush; retain the edited text before it does.
  const retainedValue = value
  const edited = retainedValue !== original
  await tick()
  editing = false
  if (!cancelled && retainedValue.trim()) onAccept(edited)
}
</script>
<div
  data-translation-suggestion
  onfocusin={event => {
    if (
      event.target instanceof HTMLElement &&
      event.target.matches('input, textarea, [contenteditable=true]')
    )
      editorFocused = true
  }}
  onfocusout={finish}
>
  <FormI18nInlineRow
    {value}
    {label}
    {prefix}
    {markdown}
    {multiline}
    editable
    showVerification
    isGenAI
    required={false}
    issues={undefined}
    attrs={{
      oninput: (event: Event) => onChange((event.target as HTMLInputElement).value),
    }}
    onStart={() => {
      original = value
      editing = true
      editorFocused = false
      cancelled = false
    }}
    onCancel={() => {
      cancelled = true
    }}
    onClear={() => onChange('')}
  >
    {#snippet reviewActions()}
      <button
        type="button"
        aria-label={m.translation_hub_accept()}
        title={m.translation_hub_accept()}
        class="text-primary hover:bg-primary/10 flex size-8 items-center justify-center rounded"
        onpointerdown={event => event.preventDefault()}
        onclick={event => {
          event.stopPropagation()
          onAccept(false)
        }}
      >
        <CheckIcon class="size-4" />
      </button>
      <button
        type="button"
        aria-label={m.translation_hub_reject()}
        title={m.translation_hub_reject()}
        class="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded"
        onpointerdown={event => event.preventDefault()}
        onclick={event => {
          event.stopPropagation()
          onReject()
        }}
      >
        <XIcon class="size-4" />
      </button>
    {/snippet}
  </FormI18nInlineRow>
</div>
