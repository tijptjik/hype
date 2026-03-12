<script lang="ts">
// ANIMATION
import { fly } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
import Select from '$lib/bits/core/select/Select.svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import ArrowDownIcon from 'virtual:icons/lucide/arrow-down'
import ArrowUpDownIcon from 'virtual:icons/lucide/arrow-up-down'
import ArrowUpIcon from 'virtual:icons/lucide/arrow-up'
// TYPES
import type { ResourceSortControlProps } from './resourceSortControl.types'

let {
  resource,
  sortables,
  onOpenChange,
  isOpen = $bindable(false),
}: ResourceSortControlProps = $props()

const adminCtx = getAdminCtx()

let isOpening = $state(false)
let openingTimeout: ReturnType<typeof setTimeout> | null = null
let lastReportedOpenState = $state(isOpen)

let sorting = $derived(adminCtx.appCtx.state.viewSorting[resource])
let sortDirectionIcon = $derived(
  sorting.sortOrder === 'desc' ? ArrowDownIcon : ArrowUpIcon,
)
let sortDirectionLabel = $derived(sorting.sortOrder === 'desc' ? 'desc' : 'asc')

const OPEN_REVEAL_DURATION_MS = 320

function notifyOpenChange(nextIsOpen: boolean): void {
  void onOpenChange?.(nextIsOpen)
}

function clearOpeningTimeout(): void {
  if (!openingTimeout) return
  clearTimeout(openingTimeout)
  openingTimeout = null
}

function markOpenSettled(): void {
  clearOpeningTimeout()
  openingTimeout = setTimeout(() => {
    isOpening = false
    openingTimeout = null
  }, OPEN_REVEAL_DURATION_MS)
}

function toggleMenu(): void {
  if (isOpening) return

  isOpen = !isOpen
  if (isOpen) {
    isOpening = true
    markOpenSettled()
    return
  }

  clearOpeningTimeout()
  isOpening = false
}

function handleSortByChange(sortBy: string): void {
  void adminCtx.setViewSorting(resource, { sortBy })
}

function handleSortOrderToggle(): void {
  void adminCtx.setViewSorting(resource, {
    sortOrder: sorting.sortOrder === 'desc' ? 'asc' : 'desc',
  })
}

$effect(() => {
  if (lastReportedOpenState !== isOpen) {
    lastReportedOpenState = isOpen
    notifyOpenChange(isOpen)
  }
})

$effect(() => {
  if (!isOpen) {
    clearOpeningTimeout()
    isOpening = false
  }
})

$effect(() => {
  return () => {
    clearOpeningTimeout()
  }
})
</script>

<div class="bits-theme bits-resource-sort">
  <Button
    text={isOpen || isOpening ? m.sort__sort_by() : m.sort__sort()}
    iconComponent={ArrowUpDownIcon}
    style="outline"
    color="light"
    size="sm"
    class="bits-resource-sort__trigger opacity-70 transition-opacity duration-300 hover:opacity-100"
    attrs={{
      title: m.sort__sort_by(),
    }}
    onClick={toggleMenu}
  />

  {#if isOpen}
    <div
      class="bits-resource-sort__controls"
      in:fly={{ x: 24, duration: 220 }}
      out:fly={{ x: -24, duration: 160 }}
    >
      <Select
        value={sorting.sortBy}
        items={sortables.items}
        placeholder="Field"
        variant="default"
        class="bits-resource-sort__select text-sm"
        triggerClass="bits-resource-sort__select-trigger h-9 px-2 text-sm"
        contentClass="bits-resource-sort__select-content"
        onValueChange={handleSortByChange}
      />
      <Button
        text={sortDirectionLabel}
        iconComponent={sortDirectionIcon}
        hideLabel={true}
        style="ghost"
        color="dark"
        size="sm"
        modifier="square"
        class="bits-resource-sort__direction opacity-80 transition-opacity duration-300 hover:opacity-100"
        attrs={{
          title: sortDirectionLabel,
        }}
        onClick={handleSortOrderToggle}
      />
    </div>
  {/if}
</div>
