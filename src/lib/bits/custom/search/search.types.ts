import type { Snippet } from 'svelte'
import type { UserSearchQueryOptions } from '$lib/db/zod/schema/user.types'

export interface SearchResultMap<T> {
  image: (item: T) => string | null | undefined
  title: (item: T) => string
  descriminator?: (item: T) => string | null | undefined
  description?: (item: T) => string | null | undefined
  previewImage?: (item: T) => string | null | undefined
  variant?: (item: T) => 'default' | 'visual'
  disabled?: (item: T) => boolean
  disabledMeta?: (item: T) => SearchResultDisabledMeta | null | undefined
}

export interface SearchProps<T> {
  placeholder?: string
  minChars?: number
  focusOnMount?: boolean
  mountTransitionDuration?: number
  prefetchOnMount?: boolean
  prefetchKey?: string | number | null
  initialResults?: T[]
  noResultsText?: string
  onInput?: (query: string) => Promise<T[]>
  userQueryParams?: UserSearchQueryOptions
  excludeIds?: string[]
  getItemId?: (item: T) => string
  onSelect: (item: T) => void
  onResultsVisibilityChange?: (isVisible: boolean) => void
  resultMap: SearchResultMap<T>
  class?: string
}

export interface LocalSearchProps<T> {
  options: T[]
  placeholder?: string
  focusOnMount?: boolean
  mountTransitionDuration?: number
  maxResults?: number
  noResultsText?: string
  excludeIds?: string[]
  getItemId?: (item: T) => string
  getSearchText?: (item: T) => string
  onSelect: (item: T) => void
  resultMap: SearchResultMap<T>
  resultItemClass?: string
  visualResultItemClass?: string
  visualPreviewClass?: string
  class?: string
}

export interface SearchBarProps {
  query?: string
  placeholder?: string
  focusOnMount?: boolean
  disabled?: boolean
  isLoading?: boolean
  onChange?: (value: string) => void
  onFocus?: () => void
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
  description?: string | null
  previewImage?: string | null
  disabled?: boolean
  disabledMeta?: SearchResultDisabledMeta | null
  staggerIndex?: number
  onSelect?: () => void
  class?: string
  previewClass?: string
}

export interface SearchResultDisabledMeta {
  label: string
  value?: string | null
}
