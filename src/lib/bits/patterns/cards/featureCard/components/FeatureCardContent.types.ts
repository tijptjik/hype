// THIRD PARTY
import type { LayoutCursor } from '@chenglou/pretext'

// TYPES
import type { FeatureCardPortalObstacle } from '$lib/types'
import type { PropertyLayoutResult } from '../featureCard.types'

export type RoutedDescriptionLayout = {
  lines: Array<{
    text: string
    top: number
    width: number
    start: LayoutCursor
    end: LayoutCursor
    appendEllipsis?: boolean
  }>
  hasMore: boolean
}

export type PortalGeometry = {
  obstacle: FeatureCardPortalObstacle
  visualDiameter: number
  visualLeft: number
  visualTop: number
  visualRight: number
  visualBottom: number
}

export type FeaturePropertyItem = {
  id: string
  label: string
  value: string
}

export type PropertyPlacement = {
  items: FeaturePropertyItem[]
  layout: PropertyLayoutResult | null
  top: number
  width: number
}

export type CollapsedContentPlan = {
  descriptionLayout: RoutedDescriptionLayout
  descriptionInteractiveHeight: number
  hasToggle: boolean
  adjacentPlacement: PropertyPlacement
  overflowPlacement: PropertyPlacement
  contentHeight: number
}
