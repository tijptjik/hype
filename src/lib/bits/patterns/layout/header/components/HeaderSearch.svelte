<script lang="ts">
// ICONS
import Search from 'virtual:icons/lucide/search'
// TYPES
import type { HeaderSearchProps } from './headerPrimitives.types'

let {
  isFilterable = false,
  query = $bindable(''),
  placeholder = 'Filter...',
  onFilter,
}: HeaderSearchProps = $props()

function handleInput(event: Event): void {
  const target = event.currentTarget as HTMLInputElement
  query = target.value
  onFilter?.(query)
}

function focusFirstResourceItem(): void {
  const firstItem = document.querySelector(
    '[data-entity-index="0"][tabindex], svelte-virtual-list-row [tabindex="0"], svelte-virtual-list-row [tabindex]',
  ) as HTMLElement | null

  firstItem?.focus()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    query = ''
    onFilter?.('')
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

  const firstItem = document.querySelector(
    '[data-entity-index="0"][tabindex], svelte-virtual-list-row [tabindex="0"], svelte-virtual-list-row [tabindex]',
  ) as HTMLElement | null

  if (!firstItem) return

  event.preventDefault()
  focusFirstResourceItem()
}
</script>

{#if isFilterable}
  <label class="bits-pattern-header__search" aria-label="Filter">
    <input
      type="text"
      class="bits-pattern-header__search-input focus-override"
      value={query}
      placeholder=""
      oninput={handleInput}
      onkeydown={handleKeydown}
    >
    <Search class="bits-pattern-header__search-icon" aria-hidden="true" />
  </label>
{/if}
