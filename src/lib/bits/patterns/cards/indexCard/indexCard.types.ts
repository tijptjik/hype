import type { Component, Snippet } from 'svelte'

export type IndexCardFooterStatus = {
  icon?: Component<Record<string, unknown>> | null
  label?: string
  tooltip?: string
  tone?: 'published' | 'draft' | null
}

export type IndexCardFooterBreadcrumb = {
  label: string
  icon?: Component<Record<string, unknown>> | null
  tooltip?: string
  iconClass?: string
}

export type IndexCardProps = {
  title: string
  description: string
  imageSrc: string
  imageAlt: string
  imageLayout?: 'cover' | 'contain'
  cardWidth?: number
  footerStatus?: IndexCardFooterStatus | null
  breadcrumbs?: IndexCardFooterBreadcrumb[]
  onNavigate?: (event: MouseEvent | KeyboardEvent) => void
  header?: Snippet
  content?: Snippet
  actions?: Snippet
  footer?: Snippet
  onImageClick?: () => void
}

export type IndexCardRootProps = {
  onclick?: (event: MouseEvent | KeyboardEvent) => void
  onkeydown?: (event: KeyboardEvent) => void
  children?: Snippet
  class?: string
}

export type IndexCardHeaderProps = {
  imageSrc: string
  imageAlt: string
  imageLayout: 'cover' | 'contain'
  onImageClick?: (event: MouseEvent) => void
}

export type IndexCardBodyProps = {
  title: string
  description: string
  actions?: Snippet
}

export type IndexCardFooterProps = {
  status?: IndexCardFooterStatus | null
  breadcrumbs?: IndexCardFooterBreadcrumb[]
  cardWidth?: number
}
