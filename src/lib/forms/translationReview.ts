import { flushSync, untrack, tick } from 'svelte'
import { writable } from 'svelte/store'
import type { TranslationSourceMode } from './translationSource'

/** A mounted multilingual tab owns its missing-field calculation and existing UI. */
export interface TranslationReviewSection {
  generate?(mode: TranslationSourceMode): Promise<void>
  outstandingKeys?(): string[]
  close?(): void
  missingKeys?(): string[]
  acceptFilled?(): void
  fingerprint(): string
  missing(): boolean
  open(): void
}
type Review = {
  generating?: boolean
  generated?: Set<TranslationReviewSection>
  observer?: MutationObserver
  baseline: Map<TranslationReviewSection, Set<string>>
  elements: Map<TranslationReviewSection, HTMLElement>
  sections: Set<TranslationReviewSection>
  skipped: Map<TranslationReviewSection, string>
  pending: boolean
  bypass: boolean
  submitter: HTMLElement | null
  listener: (event: SubmitEvent) => void
}
/** Tab currently generating suggestions; cleared on completion or failure. */
export const translatingTab = writable<string | null>(null)

const reviews = new WeakMap<HTMLFormElement, Review>()

/** Register one tab with its owning form's save review sequence.
 * @param form Owning native form. @param section Existing multilingual editor callbacks.
 * @param element Editor anchor used to identify and navigate its containing tab.
 * @returns Cleanup callback; removing the final tab also removes the submit listener.
 */
export function registerTranslationReview(
  form: HTMLFormElement,
  section: TranslationReviewSection,
  element?: HTMLElement,
): () => void {
  let review = reviews.get(form)
  if (!review) {
    const state: Review = {
      elements: new Map(),
      baseline: new Map(),
      sections: new Set(),
      skipped: new Map(),
      pending: false,
      bypass: false,
      submitter: null,
      listener: () => {},
    }
    state.listener = event => {
      if (state.generating) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (state.bypass) {
        state.bypass = false
      }
      const next = orderedSections(state).find(
        item =>
          needsReview(form, state, item) ||
          (state.generated?.has(item) &&
            item.missing() &&
            state.skipped.get(item) !== item.fingerprint()),
      )
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
      openSection(state, next)
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
  if (element) review.elements.set(section, element)
  review.baseline.set(section, new Set(untrack(() => section.missingKeys?.() ?? [])))
  const state = review
  // Nested Fields members register in the same mount flush; capture once after they join.
  queueMicrotask(() => {
    if (state.sections.has(section))
      state.baseline.set(section, new Set(untrack(() => section.missingKeys?.() ?? [])))
  })
  return () => {
    state.elements.delete(section)
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
  if (!review.pending && !review.generated?.size) return
  const next = orderedSections(review).find(
    item =>
      needsReview(form, review, item) ||
      (review.generated?.has(item) &&
        item.missing() &&
        review.skipped.get(item) !== item.fingerprint()),
  )
  if (next) {
    openSection(review, next)
    return
  }
  review.generated = undefined
  if (!review.pending) return
  review.pending = false
  review.bypass = true
  const submitter = review.submitter
  form.requestSubmit(submitter?.isConnected ? submitter : undefined)
}

/** Accept available suggestions across the entire form and resume the original save.
 * @param form Owning form.
 * @returns Whether a registered form handled the action.
 * @remarks Untranslated or stale fields still require review; acceptance preserves provenance.
 */
export function acceptAllTranslationReview(
  form: HTMLFormElement | null | undefined,
): boolean {
  const review = form && reviews.get(form)
  if (!review || !form) return false
  if (review.generating) return true
  flushSync(() => {
    for (const section of review.sections) section.acceptFilled?.()
  })
  review.generated = undefined
  const remaining = orderedSections(review).find(section =>
    needsReview(form, review, section),
  )
  if (remaining) {
    openSection(review, remaining)
    return true
  }
  for (const section of review.sections) section.close?.()
  if (review.pending) {
    review.pending = false
    const submitter = review.submitter
    form.requestSubmit(submitter?.isConnected ? submitter : undefined)
  }
  return true
}

/** Generate suggestions across affected tabs, revealing each before work and retaining explicit review.
 * @param form Owning form. @param mode Source preference applied consistently across tabs.
 * @returns Completion of generation; this never accepts values or submits the form.
 */
export async function generateTranslationReview(
  form: HTMLFormElement | null | undefined,
  mode: TranslationSourceMode,
): Promise<void> {
  const review = form && reviews.get(form)
  if (!review || !form || review.generating) return
  const sections = orderedSections(review).filter(
    section => section.generate && needsReview(form, review, section),
  )
  review.generating = true
  review.generated = new Set([...(review.generated ?? []), ...sections])
  try {
    for (const section of sections) {
      if (!review.sections.has(section)) continue
      const anchor = review.elements
        .get(section)
        ?.closest<HTMLElement>('[data-facet-id], [data-translation-tab]')
      translatingTab.set(
        anchor?.dataset.facetId ?? anchor?.dataset.translationTab ?? 'core',
      )
      openSection(review, section)
      await tick()
      // Let the destination tab paint before even a cached translation completes.
      if (typeof requestAnimationFrame === 'function')
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      await section.generate?.(mode)
      await tick()
    }
  } finally {
    review.generating = false
    translatingTab.set(null)
    const first = orderedSections(review).find(
      section =>
        review.generated?.has(section) &&
        section.missing() &&
        review.skipped.get(section) !== section.fingerprint(),
    )
    if (first) openSection(review, first)
  }
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

/** One affected tab in the current form, counting localized fields awaiting review. */
export interface TranslationReviewTab {
  id: string
  count: number
  open(): void
}

/** Follow displayed navigation order, falling back to document order rather than mount timing.
 * @param review Owning form coordinator. @returns Sections in stable user-facing tab order.
 */
function orderedSections(review: Review): TranslationReviewSection[] {
  const tabs = [
    ...new Set(
      [...document.querySelectorAll<HTMLElement>('[data-facet-ref]')].map(
        node => node.dataset.facetRef,
      ),
    ),
  ]
  const tab = (section: TranslationReviewSection): string | undefined => {
    const data = review.elements
      .get(section)
      ?.closest<HTMLElement>('[data-facet-id], [data-translation-tab]')?.dataset
    return data?.facetId ?? data?.translationTab
  }
  return [...review.sections].sort((a, b) => {
    const aRank = tabs.indexOf(tab(a)),
      bRank = tabs.indexOf(tab(b))
    if (aRank !== bRank && aRank >= 0 && bRank >= 0) return aRank - bRank
    const first = review.elements.get(a),
      second = review.elements.get(b)
    if (!first || !second) return 0
    const position = first.compareDocumentPosition(second)
    if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0
    return position & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : position & Node.DOCUMENT_POSITION_PRECEDING
        ? 1
        : 0
  })
}

/** Open only one review dialogue while preserving each tab's pending suggestions.
 * @param review Owning form coordinator. @param section Destination section.
 * @returns Nothing.
 */
function openSection(review: Review, section: TranslationReviewSection): void {
  for (const item of review.sections) if (item !== section) item.close?.()
  const facet = review.elements.get(section)?.closest<HTMLElement>('[data-facet-id]')
    ?.dataset.facetId
  if (facet && typeof window !== 'undefined' && window.location.hash !== `#${facet}`)
    window.location.hash = facet
  section.open()
}

/** Read a reactive overview of all outstanding translations in this form.
 * @param form Owning form. @returns Affected tabs with navigation actions and field counts.
 */
export function translationReviewTabs(
  form: HTMLFormElement | null | undefined,
): TranslationReviewTab[] {
  const review = form && reviews.get(form)
  if (!review) return []
  const tabs = new Map<string, { keys: Set<string>; first: TranslationReviewSection }>()
  let index = 0
  for (const section of orderedSections(review)) {
    const keys =
      section.outstandingKeys?.() ??
      section.missingKeys?.() ??
      (section.missing() ? ['value'] : [])
    const element = review.elements.get(section)
    const id = element?.closest<HTMLElement>(
      '[data-translation-tab], [data-facet-id]',
    )?.dataset
    const tab = id?.translationTab ?? id?.facetId ?? 'core'
    const entry = tabs.get(tab) ?? { keys: new Set<string>(), first: section }
    if (keys.length) {
      for (const key of keys) entry.keys.add(`${index}:${key}`)
      tabs.set(tab, entry)
    }
    index += 1
  }
  return [...tabs].map(([id, entry]) => ({
    id,
    count: entry.keys.size,
    open: () => openSection(review, entry.first),
  }))
}
