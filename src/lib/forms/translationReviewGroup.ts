import type { TranslationSourceMode } from './translationSource'
import type { TranslationReviewSection } from './translationReview'

/** The existing Fields tab coordinates all mounted property editors as one review step. */
export const translationReviewGroupKey = Symbol('translation-review-group')
export interface TranslationReviewGroupMember extends TranslationReviewSection {
  generate(
    mode?: TranslationSourceMode,
    onProgress?: (fallback?: boolean) => void,
  ): Promise<void>
  remaining?(): number
  details?(): string[]
  englishAvailable?(): boolean
  finish(accept: boolean): Promise<void>
  ready?(): boolean
  pending(): boolean
}
export interface TranslationReviewGroup {
  open(): void
  register(member: TranslationReviewGroupMember): () => void
}
