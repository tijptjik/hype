<script lang="ts" generics="T extends Record<string, unknown>">
import { tick } from 'svelte'
import { slide } from 'svelte/transition'
import { m } from '$lib/i18n'
import type { LocalSearchProps } from './search.types'
import { getFirstEnabledResultButton, isSearchResultDisabled } from './search.utils'
import * as SearchPrimitive from './src/components'

let {
  options = [],
  placeholder = m.forms__search_placeholder(),
  focusOnMount = false,
  mountTransitionDuration = 0,
  maxResults = 5,
  noResultsText = m.omni__no_results(),
  excludeIds = [],
  getItemId,
  getSearchText,
  onSelect,
  resultMap,
  resultItemClass = '',
  visualResultItemClass = '',
  visualPreviewClass = '',
  class: className = '',
}: LocalSearchProps<T> = $props()

let query = $state('')
let isOpen = $state(false)
let rootEl = $state<HTMLDivElement | null>(null)
let localExcludedIds = $state<string[]>([])
let previousExcludeIds: string[] = []
const resolvedOptions = $derived(Array.isArray(options) ? options : [])
const resolvedExcludeIds = $derived(Array.isArray(excludeIds) ? excludeIds : [])
const results = $derived(isOpen ? resolveResults(query) : [])
const shouldShowEmptyState = $derived(isOpen && results.length === 0)

function toItemId(item: T): string {
  if (getItemId) return getItemId(item)
  const candidate = (item as { id?: unknown }).id
  return typeof candidate === 'string' ? candidate : ''
}

function toSearchText(item: T): string {
  if (getSearchText) return getSearchText(item)
  return `${resultMap.title(item)} ${resultMap.descriminator?.(item) ?? ''}`
}

function getExcludedIds(): Set<string> {
  return new Set([...resolvedExcludeIds, ...localExcludedIds])
}

function resolveResults(nextQuery: string): T[] {
  const needle = nextQuery.trim().toLowerCase()
  const excludedIds = getExcludedIds()
  const filtered = resolvedOptions.filter(item => {
    if (excludedIds.has(toItemId(item))) return false
    if (needle.length === 0) return true
    return toSearchText(item).toLowerCase().includes(needle)
  })
  return filtered.slice(0, Math.max(1, maxResults))
}

function openResults(): void {
  if (!isOpen) {
    isOpen = true
  }
}

function handleQuery(nextQuery: string): void {
  query = nextQuery
  openResults()
}

function handleClear(): void {
  query = ''
  openResults()
}

function handleFocusIn(): void {
  openResults()
}

function handleIntroEnd(): void {
  if (!focusOnMount || mountTransitionDuration <= 0) return
  const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
  input?.focus()
}

function handleFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && rootEl?.contains(nextTarget)) return
  isOpen = false
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

function selectItem(item: T): void {
  if (isSearchResultDisabled(item, resultMap)) return
  const itemId = toItemId(item)
  if (itemId) {
    localExcludedIds = [...localExcludedIds, itemId]
  }
  onSelect(item)
  query = ''
  isOpen = false

  void tick().then(() => {
    const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
    input?.blur()
  })
}

$effect(() => {
  const removedExcludeIds = previousExcludeIds.filter(
    id => !resolvedExcludeIds.includes(id),
  )
  if (removedExcludeIds.length > 0) {
    const removedExcludeIdSet = new Set(removedExcludeIds)
    localExcludedIds = localExcludedIds.filter(id => !removedExcludeIdSet.has(id))
  }
  const excludeIdsChanged =
    previousExcludeIds.length !== resolvedExcludeIds.length ||
    previousExcludeIds.some((id, index) => id !== resolvedExcludeIds[index])

  if (excludeIdsChanged) {
    previousExcludeIds = [...resolvedExcludeIds]
  }
})
</script>

<div
  bind:this={rootEl}
  transition:slide={{ axis: 'y', duration: mountTransitionDuration }}
  class={`bits-search ${className}`}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
  onintroend={handleIntroEnd}
>
  <SearchPrimitive.SearchBar
    bind:query
    {placeholder}
    focusOnMount={focusOnMount && mountTransitionDuration <= 0}
    isLoading={false}
    onChange={handleQuery}
    onInputKeydown={handleInputKeydown}
    onClear={handleClear}
  />

  {#if isOpen && results.length > 0}
    <SearchPrimitive.ResultWrapper class="bits-search__results mx-3 mt-1">
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
                  class={visualResultItemClass}
                  previewClass={visualPreviewClass}
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
                  class={resultItemClass}
                  onSelect={() => selectItem(item)}
                />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </SearchPrimitive.ResultWrapper>
  {:else if shouldShowEmptyState}
    <SearchPrimitive.ResultWrapper class="bits-search__results mx-3 mt-1">
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
