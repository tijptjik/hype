<script lang="ts">
// BITS
import { SimpleTooltip } from '#lib/bits/core/tooltip/index.js'
// BITS CUSTOM
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// TYPES
import type { ResourceControlBarTriStateToggleProps } from './resourceControlBarPrimitives.types'

let {
  label,
  alwaysShowLabels = false,
  falseColor,
  trueColor,
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
  style={`${offsetStyle}${falseColor ? `--color-error: ${falseColor};` : ''}${trueColor ? `--color-success: ${trueColor};` : ''}`}
>
  <div class="bits-theme bits-resource-filter-bar__tri-toggle-control">
    <button
      type="button"
      class={`bits-resource-filter-bar__tri-toggle-side-label bits-resource-filter-bar__tri-toggle-side-label--left ${alwaysShowLabels ? 'text-base-content/70! flex items-center gap-1.5' : ''}`}
      onclick={handleFalseClick}
    >
      {#if falseColor}
        <span
          class="size-2.5 rounded-full border border-slate-400"
          style:background={falseColor}
        ></span>
      {/if}
      {falseLabel}
    </button>
    <div class="relative flex items-center">
      <SimpleTooltip disabled={!tooltip || tooltip === label}>
        {#snippet trigger()}
          <div class="bits-resource-filter-bar__tri-toggle-label">{label}</div>
        {/snippet}

        {#snippet children()}
          <span>{tooltip}</span>
        {/snippet}
      </SimpleTooltip>
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
    </div>
    <button
      type="button"
      class={`bits-resource-filter-bar__tri-toggle-side-label bits-resource-filter-bar__tri-toggle-side-label--right ${alwaysShowLabels ? 'text-base-content/70! flex items-center gap-1.5' : ''}`}
      onclick={handleTrueClick}
    >
      {#if trueColor}
        <span
          class="size-2.5 rounded-full border border-slate-400"
          style:background={trueColor}
        ></span>
      {/if}
      {trueLabel}
    </button>
  </div>
</div>
