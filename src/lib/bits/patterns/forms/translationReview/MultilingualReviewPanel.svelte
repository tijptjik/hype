<script lang="ts">
// TRANSLATION REVIEW
import {
  registerTranslationReview,
  generateTranslationReview,
} from '#lib/forms/translationReview.js'
import type { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import TranslationReviewDialog from './TranslationReviewDialog.svelte'
let { review }: { review: MultilingualReview } = $props()
let anchor = $state<HTMLSpanElement>()
$effect(() => {
  const form = anchor?.closest('form')
  review.form = form ?? null
  review.element = anchor
  if (form) return registerTranslationReview(form, review.section, anchor)
})
</script>
<span bind:this={anchor}></span>
{#if review.error}
  <p role="alert" class="text-error text-sm">{review.error}</p>
{/if}
{#if review.open}
  <TranslationReviewDialog
    form={review.form}
    busy={review.busy}
    completed={review.completed}
    total={review.total}
    sourceFallback={review.fallback}
    pending={review.missing.some(cell => review.current(cell.key))}
    allReady={review.missing.every(cell => review.current(cell.key))}
    onGenerate={mode => void generateTranslationReview(review.form, mode)}
    onAccept={() => void review.finish(true)}
    onSkip={() => void review.finish(false)}
    onClose={() => {
      review.open = false
    }}
  />
{/if}
