import type { Snippet } from 'svelte'

export type FormFeatureVisualSectionContributor = {
  id?: string | null
  name?: string | null
  attribution?: string | null
  image?: string | null
}

export type FormFeatureVisualSectionProps = {
  class?: string
  hasPresentedCanonicalImageSizing?: boolean
  isCanonicalImagePending?: boolean
  imageAspectRatio?: number | null
  isCollapsed?: boolean
  isNewFeature?: boolean
  contributorUser?: FormFeatureVisualSectionContributor | null
  contributorId?: string | null
  createdAt?: string | null
  isEditing?: boolean
  isIntangible?: boolean
  isVisitable?: boolean
  hasPrevious?: boolean
  hasNext?: boolean
  onIntangibleChange?: (value: boolean) => void
  onVisitableChange?: (value: boolean) => void
  onExpand?: () => void
  onCollapse?: () => void
  onNavigatePrevious?: () => void
  onNavigateNext?: () => void
  map?: Snippet
  image?: Snippet
}
