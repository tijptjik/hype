<script lang="ts">
import { tick } from 'svelte'
import SearchIcon from 'virtual:icons/lucide/search'
import XIcon from 'virtual:icons/lucide/x'
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import type { SearchBarProps } from '../../search.types'

let {
  query = $bindable(''),
  placeholder = 'Search',
  focusOnMount = false,
  disabled = false,
  isLoading = false,
  onChange,
  onInputKeydown,
  onClear,
  class: className = '',
}: SearchBarProps = $props()

let inputEl = $state<HTMLInputElement | null>(null)
let hasFocusedOnMount = $state(false)

function handleInput(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).value
  query = value
  onChange?.(value)
}

function clear(): void {
  query = ''
  onChange?.('')
  onClear?.()
}

function handleKeydown(event: KeyboardEvent): void {
  onInputKeydown?.(event)
}

$effect(() => {
  if (!focusOnMount || disabled || hasFocusedOnMount) return

  void tick().then(() => {
    inputEl?.focus()
    hasFocusedOnMount = true
  })
})
</script>

<div class={`bits-search-bar ${className}`}>
  <input
    bind:this={inputEl}
    type="text"
    value={query}
    {placeholder}
    {disabled}
    class="bits-search-bar__input"
    autocomplete="off"
    oninput={handleInput}
    onkeydown={handleKeydown}
  >
  <div class="bits-search-bar__icons">
    {#if query}
      <button
        type="button"
        class="bits-search-bar__clear"
        onclick={clear}
        tabindex="-1"
        aria-label="Clear search"
      >
        {#if isLoading}
          <LoaderCircleIcon
            class="bits-search-bar__icon bits-search-bar__icon--loading"
          />
        {:else}
          <XIcon class="bits-search-bar__icon" />
        {/if}
      </button>
    {:else}
      {#if isLoading}
        <LoaderCircleIcon
          class="bits-search-bar__icon bits-search-bar__icon--loading bits-search-bar__icon--muted"
        />
      {:else}
        <SearchIcon class="bits-search-bar__icon bits-search-bar__icon--muted" />
      {/if}
    {/if}
  </div>
</div>
