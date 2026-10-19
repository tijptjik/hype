// BITS
import { cx } from '#lib/bits/utils.js'
import {
  formSelectionSectionStyles,
  formSectionDividerStyles,
} from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'

type FeatureEditorLayoutState = {
  showsVisualSection: boolean
  isVisualSectionCollapsed: boolean
}

export const FEATURE_EDITOR_ROOT_CLASS = 'px-0 pt-0 pb-6'

export const FEATURE_EDITOR_FORM_CLASS = '[&>:not([hidden])~:not([hidden])]:mt-0'

export const FEATURE_EDITOR_CONTENT_PAD_CLASS = cx(
  'flex flex-col items-stretch pt-8 [&>*]:w-full',
  String.raw`[&_.bits-feature-section-header]:h-[68px] [&_.bits-feature-section-header]:min-h-[68px] [&_.bits-feature-section-header]:px-6 [&_.bits-feature-section-header]:py-3 [&_.bits-feature-section-header]:grid-cols-[auto_minmax(0,1fr)_auto] [&_.bits-feature-section-header]:bg-[var(--admin-form-heading,color-mix(in_oklab,var(--color-primary)_12%,var(--form-workspace)))] [&_.bits-feature-section-header]:border-b [&_.bits-feature-section-header]:border-primary/25 [&_.bits-feature-section-header>div:nth-child(2)]:items-start`,
  String.raw`[&_.bits-feature-section-header\_\_title]:text-xl [&_.bits-feature-section-header\_\_title]:font-semibold [&_.bits-feature-section-header\_\_title]:normal-case [&_.bits-feature-section-header\_\_title]:tracking-tight [&_.bits-feature-section-header\_\_subtitle]:text-xs [&_.bits-feature-section-header\_\_subtitle]:text-left`,
  String.raw`[&_.bits-feature-parent-section\_\_grid]:gap-0 [&_.bits-feature-parent-section\_\_grid]:grid-cols-1 @min-[900px]:[&_.bits-feature-parent-section\_\_grid]:grid-cols-3 [&_.bits-form\_\_parent-resource-header_.bits-header\_\_title]:capitalize!`,
)

export const FEATURE_EDITOR_CONTENT_SECTION_CLASS = 'pb-6'

export const FEATURE_EDITOR_COLLECTIONS_SECTION_CLASS = cx(
  formSelectionSectionStyles,
  formSectionDividerStyles,
  'h-auto',
)

export const FEATURE_EDITOR_PLACEHOLDER_CLASS = cx(
  'flex min-h-72 flex-col items-center justify-center gap-8 p-8 text-center',
  'text-[color:color-mix(in_oklab,var(--color-base-content)_68%,transparent)]',
)

/**
 * Positions the active workspace beneath the expanded or collapsed preview.
 * @param state - Current preview visibility and expansion state.
 * @returns Theme-independent facet positioning classes.
 */
export function getFeatureEditorFacetClass({
  showsVisualSection,
  isVisualSectionCollapsed,
}: FeatureEditorLayoutState): string {
  return cx(
    'left-0! right-0! bottom-6 transition-[top] duration-180',
    !showsVisualSection && 'top-0',
    showsVisualSection && isVisualSectionCollapsed && 'top-16',
    showsVisualSection && !isVisualSectionCollapsed && 'top-[520px]',
  )
}
