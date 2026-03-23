import type { Snippet } from 'svelte'
import type { FormFacetNavAction } from '$lib/bits/patterns/forms/formFacetNav'

export interface MainRootProps {
  children?: Snippet
  class?: string
}

export interface MainFacetProps {
  children?: Snippet
  class?: string
  isVisible?: boolean
  transition?: 'none' | 'fade'
  attrs?: Record<string, unknown>
  previousAction?: FormFacetNavAction | null
  nextAction?: FormFacetNavAction | null
  fillHeight?: boolean
  navMode?: 'centered' | 'footer'
  contentClass?: string
}

export interface MainFormProps {
  children?: Snippet
  class?: string
  attrs?: Record<string, unknown>
  formEl?: HTMLFormElement
  isReady?: boolean
}

export interface MainFixedSectionProps {
  children?: Snippet
  class?: string
  mode?: 'default' | 'collapsed' | 'fullscreen'
}

export interface MainDualSectionProps {
  class?: string
  isContentVisible?: boolean
  isContentFull?: boolean
  fixed?: Snippet
  content?: Snippet
}

export interface MainVisualSectionProps {
  class?: string
  isCollapsed?: boolean
  expandedHeight?: number
  collapsedHeight?: number
  imageAspectRatio?: number | null
  leftControls?: Snippet
  centerControls?: Snippet
  rightControls?: Snippet
  map?: Snippet
  image?: Snippet
  onToggleCollapsed?: (next: boolean) => void
}

export interface MainVisualSectionPaneProps {
  children?: Snippet
  class?: string
}

export interface MainVisualSectionImageProps {
  class?: string
  href?: string
  src?: string | null
  alt: string
  isPending?: boolean
  isCollapsed?: boolean
  emptyText?: string
  onImageLoad?: (size: { width: number; height: number }) => void
}
