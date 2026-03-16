<script lang="ts" generics="T extends Record<string, unknown>">
import { tick, untrack } from 'svelte'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { SearchProps } from './search.types'
// UTILS
import { getFirstEnabledResultButton, isSearchResultDisabled } from './search.utils'
// COMPONENTS
import * as SearchPrimitive from './src/components'
// API
import { searchUsers as searchUsersRemote } from '$lib/api/server/user.remote'

let {
  placeholder = 'Search',
  minChars = 1,
  focusOnMount = false,
  prefetchOnMount = false,
  prefetchKey = null,
  initialResults = [],
  noResultsText = m.omni__no_results(),
  onInput,
  userQueryParams,
  excludeIds = [],
  getItemId,
  onSelect,
  onResultsVisibilityChange,
  resultMap,
  class: className = '',
}: SearchProps<T> = $props()

let query = $state('')
let results = $state<T[]>([])
let isLoading = $state(false)
let requestId = $state(0)
let rootEl = $state<HTMLDivElement | null>(null)
let isOpen = $state(false)
let emptyQueryResults = $state<T[]>(initialResults)
let lastPrefetchKey = $state<unknown>(Symbol('search-prefetch-init'))
let lastVisibility = $state<boolean | null>(null)
let openEpoch = $state(0)
const areResultsVisible = $derived(isOpen && results.length > 0)
const shouldShowEmptyState = $derived(isOpen && !isLoading && results.length === 0)

function openResults(): void {
  isOpen = true
  openEpoch = Date.now()
}

async function handleQuery(
  nextQuery: string,
  options: { force?: boolean } = {},
): Promise<void> {
  openResults()
  query = nextQuery
  const trimmedQuery = nextQuery.trim()

  if (trimmedQuery.length === 0 && !options.force) {
    requestId += 1
    isLoading = false
    results = emptyQueryResults
    return
  }

  if (!options.force && trimmedQuery.length < minChars) {
    results = []
    return
  }

  const currentRequestId = ++requestId
  isLoading = true
  try {
    const response = onInput
      ? await onInput(trimmedQuery)
      : ((
          await searchUsersRemote(
            userQueryParams
              ? {
                  ...userQueryParams,
                  q: trimmedQuery,
                }
              : { q: trimmedQuery },
          )
        ).data as T[])
    if (currentRequestId !== requestId) return
    const toId =
      getItemId ??
      ((item: T) => {
        const candidate = (item as { id?: unknown }).id
        return typeof candidate === 'string' ? candidate : ''
      })
    const excluded = new Set(excludeIds)
    const nextResults = response.filter(item => !excluded.has(toId(item)))
    if (trimmedQuery.length === 0) {
      emptyQueryResults = nextResults
    }
    results = nextResults
  } catch {
    if (currentRequestId !== requestId) return
    results = []
  } finally {
    if (currentRequestId === requestId) isLoading = false
  }
}

function handleClear(): void {
  openResults()
  query = ''
  results = emptyQueryResults
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (query.trim().length > 0) {
      event.preventDefault()
      event.stopPropagation()
      handleClear()
    }
    return
  }

  if (event.key !== 'Tab' || event.shiftKey || results.length === 0) return
  event.preventDefault()
  const firstResult = getFirstEnabledResultButton(rootEl)
  firstResult?.focus()
}

function handleFocus(): void {
  openResults()
  if (query.trim().length > 0) return
  if (emptyQueryResults.length > 0) {
    results = emptyQueryResults
    return
  }
  void handleQuery('', { force: true })
}

function handleRootFocusIn(): void {
  openResults()
}

function selectItem(item: T): void {
  if (isSearchResultDisabled(item, resultMap)) return
  onSelect(item)
  query = ''
  results = []

  void tick().then(() => {
    const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
    input?.focus()
  })
}

$effect(() => {
  if (!prefetchOnMount) return
  if (lastPrefetchKey === prefetchKey) return
  lastPrefetchKey = prefetchKey
  untrack(() => {
    void handleQuery('', { force: true })
  })
})

$effect(() => {
  initialResults
  emptyQueryResults = initialResults
  if (untrack(() => query.trim().length > 0)) return
  results = initialResults
})

$effect(() => {
  if (lastVisibility === areResultsVisible) return
  lastVisibility = areResultsVisible
  onResultsVisibilityChange?.(areResultsVisible)
})

$effect(() => {
  if (!isOpen) return

  const handleDocumentClick = (event: MouseEvent): void => {
    const root = rootEl
    if (!root) return
    if (Date.now() - openEpoch < 16) return

    const target = event.target
    if (target instanceof Node && root.contains(target)) return
    isOpen = false
  }

  document.addEventListener('click', handleDocumentClick, true)
  return () => {
    document.removeEventListener('click', handleDocumentClick, true)
  }
})
</script>

<div
  bind:this={rootEl}
  class={`bits-search ${className}`}
  onfocusin={handleRootFocusIn}
>
  <SearchPrimitive.SearchBar
    bind:query
    {placeholder}
    {focusOnMount}
    {isLoading}
    onChange={handleQuery}
    onFocus={handleFocus}
    onInputKeydown={handleInputKeydown}
    onClear={handleClear}
  />

  {#if areResultsVisible}
    <SearchPrimitive.ResultWrapper class="bits-search__results">
      <div class="bits-search__results-list">
        {#each results as item, index (index)}
          <SearchPrimitive.ResultItem
            image={resultMap.image(item)}
            title={resultMap.title(item)}
            descriminator={resultMap.descriminator?.(item)}
            disabled={isSearchResultDisabled(item, resultMap)}
            disabledMeta={resultMap.disabledMeta?.(item)}
            onSelect={() => selectItem(item)}
          />
        {/each}
      </div>
    </SearchPrimitive.ResultWrapper>
  {:else if shouldShowEmptyState}
    <SearchPrimitive.ResultWrapper class="bits-search__results">
      <div class="bits-search__results-list">
        <div class="bits-search__empty" aria-live="polite">{noResultsText}</div>
      </div>
    </SearchPrimitive.ResultWrapper>
  {/if}
</div>
