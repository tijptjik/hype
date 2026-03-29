// BITS
import { cx } from '$lib/bits/utils'

type FeatureEditorLayoutState = {
  showsVisualSection: boolean
  isVisualSectionCollapsed: boolean
}

export const FEATURE_EDITOR_ROOT_CLASS = 'px-0 pt-0 pb-6'

export const FEATURE_EDITOR_FORM_CLASS = '[&>:not([hidden])~:not([hidden])]:mt-0'

export const FEATURE_EDITOR_CONTENT_PAD_CLASS =
  'flex flex-col items-stretch px-6 [&>*]:w-full'

export const FEATURE_EDITOR_CONTENT_SECTION_CLASS = 'pb-12'

export const FEATURE_EDITOR_COLLECTIONS_SECTION_CLASS = 'pb-6'

export const FEATURE_EDITOR_PLACEHOLDER_CLASS = cx(
  'flex min-h-72 items-center justify-center p-8 text-center',
  'text-[color:color-mix(in_oklab,var(--color-base-content)_68%,transparent)]',
  'bg-[radial-gradient(circle_at_top_left,rgba(240,77,127,0.16),transparent_40%),color-mix(in_oklab,var(--color-glass-base)_72%,transparent)]',
)

export function getFeatureEditorFacetClass({
  showsVisualSection,
  isVisualSectionCollapsed,
}: FeatureEditorLayoutState): string {
  return cx(
    'bottom-6 transition-[top] duration-180',
    !showsVisualSection && 'top-0',
    showsVisualSection && isVisualSectionCollapsed && 'top-16',
    showsVisualSection && !isVisualSectionCollapsed && 'top-[520px]',
  )
}
