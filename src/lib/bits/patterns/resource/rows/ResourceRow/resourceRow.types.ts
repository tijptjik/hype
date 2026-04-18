import type { IndexCardProps } from '$lib/bits/patterns/cards/indexCard'

export type ResourceRowProps = Pick<
  IndexCardProps,
  | 'title'
  | 'description'
  | 'imageSrc'
  | 'imageAlt'
  | 'footerStatus'
  | 'breadcrumbs'
  | 'onNavigate'
  | 'onImageClick'
> & {
  index: number
  isSelected?: boolean
  breadcrumbColumnCount?: number
  breadcrumbVariant?: 'default' | 'stats'
}
