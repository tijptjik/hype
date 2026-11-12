import { flushSync, untrack } from 'svelte'

/** A mounted multilingual tab owns its missing-field calculation and existing UI. */
export interface TranslationReviewSection {
  missingKeys?(): string[]
  acceptFilled?(): void
  fingerprint(): string
  missing(): boolean
  open(): void
}
type Review = {
  observer?: MutationObserver
  baseline: Map<TranslationReviewSection, Set<string>>
  sections: Set<TranslationReviewSection>
  skipped: Map<TranslationReviewSection, string>
  pending: boolean
  bypass: boolean
  submitter: HTMLElement | null
  listener: (event: SubmitEvent) => void
}
const reviews = new WeakMap<HTMLFormElement, Review>()

/** Register one tab with its owning form's save review sequence.
 * @param form Owning native form. @param section Existing multilingual editor callbacks.
 * @returns Cleanup callback; removing the final tab also removes the submit listener.
 */
export function registerTranslationReview(
  form: HTMLFormElement,
  section: TranslationReviewSection,
): () => void {
  let review = reviews.get(form)
  if (!review) {
    const state: Review = {
      baseline: new Map(),
      sections: new Set(),
      skipped: new Map(),
      pending: false,
      bypass: false,
      submitter: null,
      listener: () => {},
    }
    state.listener = event => {
      if (state.bypass) {
        state.bypass = false
      }
      const next = [...state.sections].find(item => needsReview(form, state, item))
      if (!next) {
        // Publish provided suggestions before the form serialises, preserving AI provenance.
        flushSync(() => {
          for (const section of state.sections) {
            if (state.skipped.get(section) !== section.fingerprint())
              section.acceptFilled?.()
          }
        })
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      state.pending = true
      state.submitter = event.submitter
      next.open()
    }
    // A successful save hydrates a new committed revision; future clears compare against it.
    state.observer = new MutationObserver(() => {
      for (const section of state.sections)
        state.baseline.set(section, new Set(section.missingKeys?.() ?? []))
      state.skipped.clear()
    })
    state.observer.observe(form, {
      attributes: true,
      attributeFilter: ['data-translation-baseline-modified'],
    })
    form.addEventListener('submit', state.listener, true)
    reviews.set(form, state)
    review = state
  }
  review.sections.add(section)
  review.baseline.set(section, new Set(untrack(() => section.missingKeys?.() ?? [])))
  const state = review
  // Nested Fields members register in the same mount flush; capture once after they join.
  queueMicrotask(() => {
    if (state.sections.has(section))
      state.baseline.set(section, new Set(untrack(() => section.missingKeys?.() ?? [])))
  })
  return () => {
    state.baseline.delete(section)
    state.sections.delete(section)
    state.skipped.delete(section)
    if (!state.sections.size) {
      state.observer?.disconnect()
      form.removeEventListener('submit', state.listener, true)
      reviews.delete(form)
    }
  }
}

/** Resolve this tab and visit the next missing tab, resuming the original save at the end.
 * @param form Owning form. @param section Tab explicitly accepted or left undefined.
 * @returns Nothing.
 */
export function completeTranslationReview(
  form: HTMLFormElement,
  section: TranslationReviewSection,
): void {
  const review = reviews.get(form)
  if (!review) return
  review.skipped.set(section, section.fingerprint())
  if (!review.pending) return
  const next = [...review.sections].find(item => needsReview(form, review, item))
  if (next) {
    next.open()
    return
  }
  review.pending = false
  review.bypass = true
  const submitter = review.submitter
  form.requestSubmit(submitter?.isConnected ? submitter : undefined)
}

/** Decide whether unchanged baseline gaps have already had their first save opportunity.
 * @param since Organisation setting activation time. @param modified Last committed record revision.
 * @param baseline Missing cells when editing began. @param proposed Missing cells now.
 * @returns Whether any current gap needs a prompt.
 */
export function shouldPromptMissingTranslations(
  since: string | undefined,
  modified: string | undefined,
  baseline: ReadonlySet<string>,
  proposed: readonly string[],
): boolean {
  if (!proposed.length) return false
  const activation = Date.parse(since ?? '')
  const saved = Date.parse(modified ?? '')
  if (!Number.isFinite(activation) || !Number.isFinite(saved) || saved < activation)
    return true
  return proposed.some(key => !baseline.has(key))
}

/** Apply the organisation policy without changing tab acceptance or submission semantics.
 * @param form Owning form. @param review Mounted sequence. @param section Candidate tab.
 * @returns Whether the tab still requires review.
 */
function needsReview(
  form: HTMLFormElement,
  review: Review,
  section: TranslationReviewSection,
): boolean {
  if (!section.missing() || review.skipped.get(section) === section.fingerprint())
    return false
  if (!section.missingKeys) return true
  return shouldPromptMissingTranslations(
    form.dataset.translationPromptOnceSince,
    form.dataset.translationBaselineModified,
    review.baseline.get(section) ?? new Set(),
    section.missingKeys(),
  )
}

/** Build form-owned policy attributes from committed data, never unsaved settings.
 * @param settings Owning organisation settings. @param modified Committed record timestamp.
 * @returns Attributes consumed by the common save review coordinator.
 */
export function translationPromptAttributes(
  settings: unknown,
  modified: string | undefined,
): Record<string, string | undefined> {
  const value = settings as {
    translationPromptOnce?: boolean
    translationPromptOnceSince?: string
  } | null
  return {
    'data-translation-prompt-once-since':
      value?.translationPromptOnce === true
        ? value.translationPromptOnceSince
        : undefined,
    'data-translation-baseline-modified': modified,
  }
}
