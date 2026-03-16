<script lang="ts">
import { onDestroy } from 'svelte'
// ICONS
import Search from 'virtual:icons/lucide/search'
import X from 'virtual:icons/lucide/x'
// TYPES
import type { HeaderSearchProps } from './headerPrimitives.types'

let {
  isFilterable = false,
  query = $bindable(''),
  placeholder = 'Filter...',
  debounceMs = 150,
  onFilter,
  onFocusChange,
  onAdvanceFromSearch,
}: HeaderSearchProps = $props()
let inputQuery = $state(query)
let lastSyncedQuery = $state(query)
let filterTimeout = $state<ReturnType<typeof setTimeout> | null>(null)
let inputElement = $state<HTMLInputElement | null>(null)

function setInputQuery(nextQuery: string): void {
  inputQuery = nextQuery
}

function clearPendingFilter(): void {
  if (filterTimeout === null) return
  clearTimeout(filterTimeout)
  filterTimeout = null
}

function flushFilter(nextQuery: string): void {
  clearPendingFilter()
  query = nextQuery
  lastSyncedQuery = nextQuery
  onFilter?.(nextQuery)
}

function handleInput(event: Event): void {
  const target = event.currentTarget as HTMLInputElement
  const nextQuery = target.value

  setInputQuery(nextQuery)
  clearPendingFilter()
  filterTimeout = setTimeout(() => {
    filterTimeout = null
    flushFilter(nextQuery)
  }, debounceMs)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearSearch()
    event.preventDefault()
    return
  }

  if (
    event.key !== 'Tab' ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  flushFilter(inputQuery)
  onAdvanceFromSearch?.()
}

$effect(() => {
  const nextQuery = query ?? ''
  if (nextQuery === lastSyncedQuery) return
  inputQuery = nextQuery
  lastSyncedQuery = nextQuery
})

function clearSearch(): void {
  setInputQuery('')
  flushFilter('')
  inputElement?.focus()
}

function handleFocus(): void {
  onFocusChange?.(true)
}

function handleBlur(): void {
  onFocusChange?.(false)
}

onDestroy(() => {
  clearPendingFilter()
  onFocusChange?.(false)
})
</script>

{#if isFilterable}
  <label class="bits-pattern-header__search" aria-label="Filter">
    <input
      bind:this={inputElement}
      type="text"
      class="bits-pattern-header__search-input focus-override"
      value={inputQuery}
      {placeholder}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      onblur={handleBlur}
    >
    {#if inputQuery.trim() !== ''}
      <button
        type="button"
        class="bits-pattern-header__search-clear"
        aria-label="Clear filter"
        onclick={clearSearch}
      >
        <X class="bits-pattern-header__search-icon" aria-hidden="true" />
      </button>
    {:else}
      <Search class="bits-pattern-header__search-icon" aria-hidden="true" />
    {/if}
  </label>
{/if}
