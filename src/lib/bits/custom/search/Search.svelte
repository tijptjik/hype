<script lang="ts" generics="T extends Record<string, unknown>">
import { tick } from 'svelte'
import type { SearchProps } from './search.types'
import * as SearchPrimitive from './src/components'
import { searchUsers as searchUsersRemote } from '$lib/api/server/user.remote'

let {
  placeholder = 'Search',
  minChars = 2,
  focusOnMount = false,
  onInput,
  userQueryParams,
  excludeIds = [],
  getItemId,
  onSelect,
  resultMap,
  class: className = '',
}: SearchProps<T> = $props()

let query = $state('')
let results = $state<T[]>([])
let isLoading = $state(false)
let requestId = $state(0)
let rootEl = $state<HTMLDivElement | null>(null)

async function handleQuery(nextQuery: string): Promise<void> {
  query = nextQuery

  if (nextQuery.trim().length < minChars) {
    results = []
    return
  }

  const currentRequestId = ++requestId
  isLoading = true
  try {
    const response = onInput
      ? await onInput(nextQuery.trim())
      : ((
          await searchUsersRemote(
            userQueryParams
              ? {
                  ...userQueryParams,
                  q: nextQuery.trim(),
                }
              : { q: nextQuery.trim() },
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
    results = response.filter(item => !excluded.has(toId(item)))
  } catch {
    if (currentRequestId !== requestId) return
    results = []
  } finally {
    if (currentRequestId === requestId) isLoading = false
  }
}

function handleClear(): void {
  query = ''
  results = []
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
  const firstResult = rootEl?.querySelector<HTMLButtonElement>(
    '[data-search-result-item="true"]',
  )
  firstResult?.focus()
}

function selectItem(item: T): void {
  onSelect(item)
  query = ''
  results = []

  void tick().then(() => {
    const input = rootEl?.querySelector<HTMLInputElement>('input[type="text"]')
    input?.focus()
  })
}
</script>

<div bind:this={rootEl} class={`bits-search ${className}`}>
  <SearchPrimitive.SearchBar
    bind:query
    {placeholder}
    {focusOnMount}
    {isLoading}
    onChange={handleQuery}
    onInputKeydown={handleInputKeydown}
    onClear={handleClear}
  />

  {#if results.length > 0}
    <SearchPrimitive.ResultWrapper class="bits-search__results">
      <div class="bits-search__results-list">
        {#each results as item, index (index)}
          <SearchPrimitive.ResultItem
            image={resultMap.image(item)}
            title={resultMap.title(item)}
            descriminator={resultMap.descriminator?.(item)}
            onSelect={() => selectItem(item)}
          />
        {/each}
      </div>
    </SearchPrimitive.ResultWrapper>
  {/if}
</div>
