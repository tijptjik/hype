<script lang="ts">
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
import Select from '$lib/bits/core/select/Select.svelte'
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
import ListChecksIcon from 'virtual:icons/lucide/list-checks'
import ShuffleIcon from 'virtual:icons/lucide/shuffle'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { ResourceBulkEditControlProps } from './components/resourceControlBarPrimitives.types'

let {
  config,
  onOpenChange,
  isOpen = $bindable(false),
}: ResourceBulkEditControlProps = $props()

let isOpening = $state(false)
let openingTimeout: ReturnType<typeof setTimeout> | null = null
let lastReportedOpenState = $state(isOpen)

const OPEN_REVEAL_DURATION_MS = 320

const progressLabel = $derived.by(() => {
  const progress = config.progress
  if (!progress) return ''
  return `${progress.completed} / ${progress.total}`
})

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

function openMenu(): void {
  isOpen = true
  isOpening = true
  markOpenSettled()
}

function toggleMenu(): void {
  if (isOpening) return

  if (!config.isActive) {
    config.onToggleMode()
    openMenu()
    return
  }

  isOpen = !isOpen
  if (isOpen) {
    isOpening = true
    markOpenSettled()
    return
  }

  clearOpeningTimeout()
  isOpening = false
}

function handleCancel(): void {
  config.onToggleMode()
  isOpen = false
  clearOpeningTimeout()
  isOpening = false
}

function handleApply(): void {
  void config.onApply()
}

$effect(() => {
  if (lastReportedOpenState !== isOpen) {
    lastReportedOpenState = isOpen
    notifyOpenChange(isOpen)
  }
})

$effect(() => {
  if (!config.isActive) {
    isOpen = false
    clearOpeningTimeout()
    isOpening = false
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

<div class="bits-theme bits-resource-bulk-edit">
  <Button
    text={config.isActive
      ? `Bulk edit (${config.selectedCount})`
      : 'Bulk edit'}
    iconComponent={ListChecksIcon}
    style="outline"
    color="light"
    size="sm"
    class="bits-resource-bulk-edit__trigger opacity-70 transition-opacity duration-300 hover:opacity-100"
    attrs={{
      title: 'Bulk edit selected rows',
    }}
    onClick={toggleMenu}
  />

  <div
    class={`bits-resource-bulk-edit__controls-wrap ${isOpen ? 'bits-resource-bulk-edit__controls-wrap--open' : ''}`.trim()}
  >
    <div class="bits-resource-bulk-edit__controls">
      {#if config.progress}
        <div class="bits-resource-bulk-edit__progress" aria-live="polite">
          {progressLabel}
        </div>
      {:else}
        <Button
          text="Invert selection"
          iconComponent={ShuffleIcon}
          hideLabel={true}
          style="ghost"
          color="dark"
          size="sm"
          modifier="square"
          class="bits-resource-bulk-edit__invert opacity-70 transition-opacity duration-300 hover:opacity-100"
          attrs={{
            title: 'Invert selection',
          }}
          onClick={config.onInvertSelection}
        />
        <Select
          value={config.selectedOptionValue}
          items={config.options}
          placeholder="Action"
          variant="default"
          class="bits-resource-bulk-edit__select text-sm"
          triggerClass="bits-resource-bulk-edit__select-trigger h-9 px-2 text-sm"
          contentClass="bits-resource-bulk-edit__select-content text-white"
          onValueChange={config.onOptionChange}
        />
        <Button
          text="Apply"
          iconComponent={CheckIcon}
          style="ghost"
          color="dark"
          size="sm"
          class="bits-resource-bulk-edit__apply opacity-80 transition-opacity duration-300 hover:opacity-100 py-2 ml-2"
          iconClasses="-pl-0"
          disabled={config.applyDisabled}
          onClick={handleApply}
        />
        <Button
          text="Cancel"
          iconComponent={XIcon}
          hideLabel={true}
          style="ghost"
          color="dark"
          size="sm"
          modifier="square"
          class="bits-resource-bulk-edit__cancel opacity-70 transition-opacity duration-300 hover:opacity-100"
          onClick={handleCancel}
        />
      {/if}
    </div>
  </div>
</div>
