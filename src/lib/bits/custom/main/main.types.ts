import type { Snippet } from 'svelte'

export interface MainRootProps {
  children?: Snippet
  class?: string
}

export interface MainSectionProps {
  children?: Snippet
  class?: string
  isVisible?: boolean
  transition?: 'none' | 'fade'
  attrs?: Record<string, unknown>
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
