<script lang="ts">
// SVELTE
import { getContext } from 'svelte'
// HUB TRANSLATION REVIEW
import { hubTranslationReviewKey } from '#lib/forms/translationSource.js'
import TranslationSuggestion from '../../translationReview/TranslationSuggestion.svelte'
const inheritedHubReview =
  getContext<boolean | undefined>(hubTranslationReviewKey) ?? false
import { unverifiedAcceptance } from '#lib/i18n/automaticSchema.js'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FormI18nInlineRow from '../../formI18nSection/components/FormI18nInlineRow.svelte'
// TYPES
import type { FormIssueLike } from '#lib/client/services/form.types.js'

let {
  hubReview = inheritedHubReview,
  missing = false,
  acceptedTranslation,
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
  onReject,
}: {
  hubReview?: boolean
  acceptedTranslation?: unknown
  missing?: boolean
  proposal?: string
  onProposal?: (value: string) => void
  onAccept?: (edited?: boolean) => void
  onReject?: () => void
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

<div class="min-w-0" data-missing-translation={missing || undefined}>
  {#if hubReview && proposal !== undefined}
    <TranslationSuggestion
      value={proposal}
      {label}
      {prefix}
      onChange={text => onProposal?.(text)}
      onAccept={edited => onAccept?.(edited)}
      onReject={() => onReject?.()}
    />
    <input {...attrs} type="hidden" {value}>
  {:else}
    <FormI18nInlineRow
      value={proposal ?? value}
      {label}
      {prefix}
      {required}
      editable={isEditing}
      isGenAI={proposal !== undefined ||
        gen ||
        unverifiedAcceptance(acceptedTranslation, value)}
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
      <button
        type="button"
        class="text-primary mt-1 text-xs"
        onclick={() => onAccept?.(false)}
      >
        {m.translation_review_accept()}
      </button>
    {/if}
  {/if}
</div>
