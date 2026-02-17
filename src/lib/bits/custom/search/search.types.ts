import type { Snippet } from 'svelte'

export interface SearchResultMap<T> {
  image: (item: T) => string | null | undefined
  title: (item: T) => string
  descriminator?: (item: T) => string | null | undefined
}

export interface SearchProps<T> {
  placeholder?: string
  minChars?: number
  focusOnMount?: boolean
  onInput: (query: string) => Promise<T[]>
  onSelect: (item: T) => void
  resultMap: SearchResultMap<T>
  class?: string
}

export interface SearchBarProps {
  query?: string
  placeholder?: string
  focusOnMount?: boolean
  disabled?: boolean
  isLoading?: boolean
  onChange?: (value: string) => void
  onInputKeydown?: (event: KeyboardEvent) => void
  onClear?: () => void
  class?: string
}

export interface SearchResultWrapperProps {
  class?: string
  children?: Snippet
}

export interface SearchResultItemProps {
  image?: string | null
  title: string
  descriminator?: string | null
  onSelect?: () => void
  class?: string
}
