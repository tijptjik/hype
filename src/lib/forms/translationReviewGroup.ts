import type { TranslationReviewSection } from './translationReview'

/** The existing Fields tab coordinates all mounted property editors as one review step. */
export const translationReviewGroupKey = Symbol('translation-review-group')
export interface TranslationReviewGroupMember extends TranslationReviewSection {
  generate(): Promise<void>
  finish(accept: boolean): Promise<void>
  pending(): boolean
}
export interface TranslationReviewGroup {
  open(): void
  register(member: TranslationReviewGroupMember): () => void
}
