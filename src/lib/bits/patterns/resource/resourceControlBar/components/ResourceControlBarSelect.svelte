<script lang="ts">
// BITS
import { Select, SimpleTooltip } from '$lib/bits'
import { cx } from '$lib/bits/utils'
// TYPES
import type { ResourceControlBarSelectProps } from './resourceControlBarPrimitives.types'

let {
  label,
  tooltip,
  value = '',
  placeholder = 'Select',
  allowDeselect = true,
  items,
  onValueChange,
  class: className = '',
}: ResourceControlBarSelectProps = $props()
</script>

<div class={cx('flex items-center gap-3', className)}>
  <div class="flex min-h-10 items-center">
    <SimpleTooltip disabled={!tooltip}>
      {#snippet trigger()}
        <div class="text-sm font-medium leading-none text-white/72">{label}</div>
      {/snippet}

      {#snippet children()}
        <span>{tooltip}</span>
      {/snippet}
    </SimpleTooltip>
  </div>
  <div class="bits-theme min-w-[12rem]">
    <Select
      {value}
      {allowDeselect}
      {items}
      {placeholder}
      triggerClass="h-10 w-full rounded-full border border-white/10 bg-base-300/95 px-4 text-sm text-white shadow-none"
      contentClass="border border-white/10 bg-base-300 text-white"
      onValueChange={nextValue => onValueChange?.(nextValue)}
    />
  </div>
</div>
