import type { Snippet } from 'svelte'
import type { UserSearchQueryOptions } from '$lib/types'

export interface SearchResultMap<T> {
  image: (item: T) => string | null | undefined
  title: (item: T) => string
  descriminator?: (item: T) => string | null | undefined
  disabled?: (item: T) => boolean
}

export interface SearchProps<T> {
  placeholder?: string
  minChars?: number
  focusOnMount?: boolean
  onInput?: (query: string) => Promise<T[]>
  userQueryParams?: UserSearchQueryOptions
  excludeIds?: string[]
  getItemId?: (item: T) => string
  onSelect: (item: T) => void
  resultMap: SearchResultMap<T>
  class?: string
}

export interface LocalSearchProps<T> {
  options: T[]
  placeholder?: string
  focusOnMount?: boolean
  maxResults?: number
  excludeIds?: string[]
  getItemId?: (item: T) => string
  getSearchText?: (item: T) => string
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
  disabled?: boolean
  onSelect?: () => void
  class?: string
}
