<script lang="ts">
// BITS
import { SimpleTooltip } from '$lib/bits/core/tooltip'
// BITS CUSTOM
import Switch from '$lib/bits/custom/switch/Switch.svelte'
// TYPES
import type { ResourceControlBarTriStateToggleProps } from './resourceControlBarPrimitives.types'

let {
  label,
  tooltip,
  currentValue = null,
  falseLabel = '',
  trueLabel = '',
  idx = 0,
  transformOffset = 16,
  onCheckedChange,
  class: className = '',
}: ResourceControlBarTriStateToggleProps = $props()

const offsetStyle = $derived(
  `--bits-resource-filter-bar-tri-toggle-offset: ${-transformOffset * idx}px;`,
)

function handleCheckedChange(nextChecked: boolean | null): void {
  onCheckedChange?.(nextChecked)
}

function handleFalseClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onCheckedChange?.(currentValue === false ? null : false)
}

function handleTrueClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onCheckedChange?.(currentValue === true ? null : true)
}
</script>

<div
  class={`bits-resource-filter-bar__tri-toggle ${className}`.trim()}
  style={offsetStyle}
>
  <SimpleTooltip disabled={!tooltip}>
    {#snippet trigger()}
      <div class="bits-resource-filter-bar__tri-toggle-label">{label}</div>
    {/snippet}

    {#snippet children()}
      <span>{tooltip}</span>
    {/snippet}
  </SimpleTooltip>
  <div class="bits-theme bits-resource-filter-bar__tri-toggle-control">
    <button
      type="button"
      class="bits-resource-filter-bar__tri-toggle-side-label bits-resource-filter-bar__tri-toggle-side-label--left"
      onclick={handleFalseClick}
    >
      {falseLabel}
    </button>
    <Switch
      checked={currentValue}
      states={3}
      size="sm"
      color="neutral"
      leftColor="error"
      rightColor="success"
      midColor="neutral"
      class="bits-resource-filter-bar__tri-toggle-switch"
      onCheckedChange={handleCheckedChange}
    />
    <button
      type="button"
      class="bits-resource-filter-bar__tri-toggle-side-label bits-resource-filter-bar__tri-toggle-side-label--right"
      onclick={handleTrueClick}
    >
      {trueLabel}
    </button>
  </div>
</div>
