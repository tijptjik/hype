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
