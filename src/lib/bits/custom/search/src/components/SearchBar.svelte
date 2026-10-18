<script lang="ts">
import { tick } from 'svelte'
import SearchIcon from 'virtual:icons/proicons/search'
import XIcon from 'virtual:icons/proicons/cancel'
import LoaderCircleIcon from 'virtual:icons/proicons/spinner'
import type { SearchBarProps } from '../../search.types'

let {
  query = $bindable(''),
  placeholder = 'Search',
  focusOnMount = false,
  disabled = false,
  isLoading = false,
  onChange,
  onFocus,
  onInputKeydown,
  onClear,
  class: className = '',
}: SearchBarProps = $props()

let inputEl = $state<HTMLInputElement | null>(null)
let hasFocusedOnMount = $state(false)
const showLoadingIndicator = $derived(isLoading && query.trim().length > 0)

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

function handleFocus(): void {
  onFocus?.()
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
    class="h-12 w-full rounded-lg border border-[var(--form-control-border)] bg-[var(--search-control-fill)] px-4 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground"
    autocomplete="off"
    oninput={handleInput}
    onfocus={handleFocus}
    onkeydown={handleKeydown}
  >
  <div
    class="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center"
  >
    {#if query}
      <button
        type="button"
        class="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md leading-none hover:bg-base-300/60"
        onclick={clear}
        tabindex="-1"
        aria-label="Clear search"
      >
        {#if showLoadingIndicator}
          <LoaderCircleIcon
            class="bits-search-bar__icon bits-search-bar__icon--loading"
          />
        {:else}
          <XIcon class="bits-search-bar__icon" />
        {/if}
      </button>
    {:else}
      {#if showLoadingIndicator}
        <LoaderCircleIcon
          class="bits-search-bar__icon bits-search-bar__icon--loading bits-search-bar__icon--muted"
        />
      {:else}
        <SearchIcon class="bits-search-bar__icon bits-search-bar__icon--muted" />
      {/if}
    {/if}
  </div>
</div>
