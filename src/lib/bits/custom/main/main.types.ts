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
