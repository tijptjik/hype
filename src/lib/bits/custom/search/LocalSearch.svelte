<script lang="ts" generics="T extends Record<string, unknown>">
import { tick } from 'svelte'
import { m } from '$lib/i18n'
import type { LocalSearchProps } from './search.types'
import { getFirstEnabledResultButton, isSearchResultDisabled } from './search.utils'
import * as SearchPrimitive from './src/components'

let {
  options,
  placeholder = m.forms__search_placeholder(),
  focusOnMount = false,
  maxResults = 5,
  excludeIds = [],
  getItemId,
  getSearchText,
  onSelect,
  resultMap,
  class: className = '',
}: LocalSearchProps<T> = $props()

let query = $state('')
let results = $state<T[]>([])
let isOpen = $state(false)
let rootEl = $state<HTMLDivElement | null>(null)
let localExcludedIds = $state<string[]>([])
let previousExcludeIds = excludeIds

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
  return new Set([...excludeIds, ...localExcludedIds])
}

function resolveResults(nextQuery: string): T[] {
  const needle = nextQuery.trim().toLowerCase()
  const excludedIds = getExcludedIds()
  const filtered = options.filter(item => {
    if (excludedIds.has(toItemId(item))) return false
    if (needle.length === 0) return true
    return toSearchText(item).toLowerCase().includes(needle)
  })
  return filtered.slice(0, Math.max(1, maxResults))
}

function openResults(nextQuery: string): void {
  results = resolveResults(nextQuery)
  isOpen = true
}

function handleQuery(nextQuery: string): void {
  query = nextQuery
  openResults(nextQuery)
}

function handleClear(): void {
  query = ''
  openResults('')
}

function handleFocusIn(): void {
  openResults(query)
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
  results = []
  isOpen = false

  void tick().then(() => {
    const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
    input?.blur()
  })
}

$effect(() => {
  if (!isOpen) return
  results = resolveResults(query)
})

$effect(() => {
  const removedExcludeIds = previousExcludeIds.filter(id => !excludeIds.includes(id))
  if (removedExcludeIds.length > 0) {
    const removedExcludeIdSet = new Set(removedExcludeIds)
    localExcludedIds = localExcludedIds.filter(id => !removedExcludeIdSet.has(id))
  }
  previousExcludeIds = [...excludeIds]
})
</script>

<div
  bind:this={rootEl}
  class={`bits-search ${className}`}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <SearchPrimitive.SearchBar
    bind:query
    {placeholder}
    {focusOnMount}
    isLoading={false}
    onChange={handleQuery}
    onInputKeydown={handleInputKeydown}
    onClear={handleClear}
  />

  {#if isOpen && results.length > 0}
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
  {/if}
</div>
