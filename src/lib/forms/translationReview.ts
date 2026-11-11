/** A mounted multilingual tab owns its missing-field calculation and existing UI. */
export interface TranslationReviewSection {
  fingerprint(): string
  missing(): boolean
  open(): void
}
type Review = {
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
        return
      }
      const next = [...state.sections].find(
        item => item.missing() && state.skipped.get(item) !== item.fingerprint(),
      )
      if (!next) return
      event.preventDefault()
      event.stopImmediatePropagation()
      state.pending = true
      state.submitter = event.submitter
      next.open()
    }
    form.addEventListener('submit', state.listener, true)
    reviews.set(form, state)
    review = state
  }
  review.sections.add(section)
  const state = review
  return () => {
    state.sections.delete(section)
    state.skipped.delete(section)
    if (!state.sections.size) {
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
  const next = [...review.sections].find(
    item => item.missing() && review.skipped.get(item) !== item.fingerprint(),
  )
  if (next) {
    next.open()
    return
  }
  review.pending = false
  review.bypass = true
  const submitter = review.submitter
  form.requestSubmit(submitter?.isConnected ? submitter : undefined)
}
