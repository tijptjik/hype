import type { IndexCardProps } from '#lib/bits/patterns/cards/indexCard/index.js'

export type ResourceRowProps = Pick<
  IndexCardProps,
  | 'title'
  | 'description'
  | 'imageSrc'
  | 'imageInset'
  | 'imageFallbackSrcs'
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
