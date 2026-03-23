<script lang="ts" generics="T extends Record<string, unknown>">
import { tick, untrack } from 'svelte'
import { slide } from 'svelte/transition'
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
  mountTransitionDuration = 0,
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
let rawResults = $state<T[]>([])
let isLoading = $state(false)
let requestId = $state(0)
let rootEl = $state<HTMLDivElement | null>(null)
let isOpen = $state(false)
let cachedEmptyQueryResults = $state<T[]>(initialResults)
let lastPrefetchKey = $state<unknown>(Symbol('search-prefetch-init'))
let lastVisibility = $state<boolean | null>(null)
let openEpoch = $state(0)
let localExcludedIds = $state<string[]>([])
let preserveEmptyStateWhileLoading = $state(false)
let previousExcludeIds = excludeIds
const emptyQueryResults = $derived(filterExcludedItems(cachedEmptyQueryResults))
const results = $derived(filterExcludedItems(rawResults))
const areResultsVisible = $derived(isOpen && results.length > 0)
const shouldShowEmptyState = $derived(
  isOpen && results.length === 0 && (!isLoading || preserveEmptyStateWhileLoading),
)

function toItemId(item: T): string {
  if (getItemId) return getItemId(item)
  const candidate = (item as { id?: unknown }).id
  return typeof candidate === 'string' ? candidate : ''
}

function getExcludedIds(): Set<string> {
  return new Set([...excludeIds, ...localExcludedIds])
}

function filterExcludedItems(items: T[]): T[] {
  const excludedIds = getExcludedIds()
  return items.filter(item => !excludedIds.has(toItemId(item)))
}

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
    rawResults = cachedEmptyQueryResults
    return
  }

  if (!options.force && trimmedQuery.length < minChars) {
    rawResults = []
    return
  }

  const currentRequestId = ++requestId
  preserveEmptyStateWhileLoading = results.length === 0
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
    if (trimmedQuery.length === 0) {
      cachedEmptyQueryResults = response
    }
    rawResults = response
  } catch {
    if (currentRequestId !== requestId) return
    rawResults = []
  } finally {
    if (currentRequestId === requestId) {
      isLoading = false
      preserveEmptyStateWhileLoading = false
    }
  }
}

function handleClear(): void {
  openResults()
  query = ''
  rawResults = cachedEmptyQueryResults
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
    rawResults = cachedEmptyQueryResults
    return
  }
  void handleQuery('', { force: true })
}

function handleRootFocusIn(event: FocusEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement && target.type === 'text') return
  openResults()
}

function handleIntroEnd(): void {
  if (!focusOnMount || mountTransitionDuration <= 0) return
  const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
  input?.focus()
}

function selectItem(item: T): void {
  if (isSearchResultDisabled(item, resultMap)) return
  const itemId = toItemId(item)
  if (itemId) {
    localExcludedIds = [...localExcludedIds, itemId]
  }
  onSelect(item)
  query = ''
  rawResults = []
  isOpen = false

  void tick().then(() => {
    const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
    input?.blur()
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
  cachedEmptyQueryResults = initialResults
  if (untrack(() => query.trim().length > 0)) return
  rawResults = initialResults
})

$effect(() => {
  const removedExcludeIds = previousExcludeIds.filter(id => !excludeIds.includes(id))
  if (removedExcludeIds.length > 0) {
    const removedExcludeIdSet = new Set(removedExcludeIds)
    localExcludedIds = localExcludedIds.filter(id => !removedExcludeIdSet.has(id))
  }
  previousExcludeIds = [...excludeIds]
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
  transition:slide={{ axis: 'y', duration: mountTransitionDuration }}
  class={`bits-search ${className}`}
  onfocusin={handleRootFocusIn}
  onintroend={handleIntroEnd}
>
  <SearchPrimitive.SearchBar
    bind:query
    {placeholder}
    focusOnMount={focusOnMount && mountTransitionDuration <= 0}
    {isLoading}
    onChange={handleQuery}
    onFocus={handleFocus}
    onInputKeydown={handleInputKeydown}
    onClear={handleClear}
  />

  {#if areResultsVisible}
    <SearchPrimitive.ResultWrapper class="bits-search__results mx-[5%]">
      <div class="rounded-lg bg-primary/70 px-1 py-1 shadow-sm">
        <div class="overflow-hidden rounded-md">
          <div
            class="bits-search__results-list max-h-80 overflow-y-auto overscroll-contain"
          >
            {#each results as item, index (index)}
              {#if resultMap.variant?.(item) === 'visual' || resultMap.previewImage?.(item)}
                <SearchPrimitive.VisualResultItem
                  title={resultMap.title(item)}
                  descriminator={resultMap.descriminator?.(item)}
                  description={resultMap.description?.(item)}
                  previewImage={resultMap.previewImage?.(item)}
                  disabled={isSearchResultDisabled(item, resultMap)}
                  disabledMeta={resultMap.disabledMeta?.(item)}
                  staggerIndex={index}
                  onSelect={() => selectItem(item)}
                />
              {:else}
                <SearchPrimitive.ResultItem
                  image={resultMap.image(item)}
                  title={resultMap.title(item)}
                  descriminator={resultMap.descriminator?.(item)}
                  disabled={isSearchResultDisabled(item, resultMap)}
                  disabledMeta={resultMap.disabledMeta?.(item)}
                  staggerIndex={index}
                  onSelect={() => selectItem(item)}
                />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </SearchPrimitive.ResultWrapper>
  {:else if shouldShowEmptyState}
    <SearchPrimitive.ResultWrapper class="bits-search__results mx-[5%]">
      <div class="rounded-lg bg-primary/70 px-1 py-1 shadow-sm">
        <div class="overflow-hidden rounded-md">
          <div
            class="bits-search__results-list max-h-80 overflow-y-auto overscroll-contain"
          >
            <div
              class="flex min-h-[60px] w-full items-center justify-center rounded-md bg-[#242424] px-3 py-3 text-center text-sm font-medium tracking-[0.08em] text-neutral-content/80"
              aria-live="polite"
            >
              {noResultsText}
            </div>
          </div>
        </div>
      </div>
    </SearchPrimitive.ResultWrapper>
  {/if}
</div>
