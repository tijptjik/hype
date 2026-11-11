<script lang="ts">
// BITS COMPONENTS
import { Select } from '#lib/bits/core/index.js'
// TYPES
import type { SelectItem } from '#lib/bits/core/select/select.types.js'
// ICONS
import IndicatorIcon from 'virtual:icons/proicons/arrow-up-down'

let {
  value,
  items,
  label,
  isEditing,
  disabled = false,
  onValueChange,
}: {
  value: string
  items: SelectItem[]
  label: string
  isEditing: boolean
  disabled?: boolean
  onValueChange: (value: string) => void
} = $props()
const selectedLabel = $derived(items.find(item => item.value === value)?.label ?? label)
</script>

<div class="grid min-w-0 grid-cols-[minmax(0,1fr)]">
  <!-- Reserve every option's width in both modes, including border, padding and indicator. -->
  {#each items as item (item.value)}
    <div
      aria-hidden="true"
      class="invisible col-start-1 row-start-1 flex h-12 items-center gap-2 border border-transparent px-3 text-[15px] leading-[22px] font-normal"
    >
      <span class="pl-1.5 whitespace-nowrap">{item.label}</span>
      <span class="ml-auto size-4 shrink-0"></span>
    </div>
  {/each}
  {#if isEditing}
    <Select
      class="col-start-1 row-start-1 min-w-0!"
      triggerClass="relative cursor-pointer gap-2 bg-background/50! border-[var(--form-control-border)]!"
      placeholder={label}
      {value}
      {items}
      {disabled}
      triggerAttrs={{ 'aria-label': label }}
      {onValueChange}
    />
  {:else}
    <p
      class="col-start-1 row-start-1 flex h-12 min-w-0 items-center gap-2 border border-transparent px-3 text-[15px] leading-[22px] font-normal"
    >
      <span class="min-w-0 pl-1.5 whitespace-nowrap">{selectedLabel}</span>
      <IndicatorIcon class="invisible ml-auto size-4 shrink-0" aria-hidden="true" />
    </p>
  {/if}
</div>
