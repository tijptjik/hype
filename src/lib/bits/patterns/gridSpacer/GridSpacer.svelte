<script lang="ts">
import type { GridSpacerProps } from './gridSpacer.types'

let {
  class: className = '',
  cols = 3,
  leftCols = 2,
  rightCols = 1,
  gap = 'calc(var(--spacing) * 3)',
  left,
  right,
}: GridSpacerProps = $props()

const resolvedCols = $derived(Math.max(1, Math.floor(cols)))
const resolvedLeftCols = $derived(
  Math.min(resolvedCols, Math.max(1, Math.floor(leftCols))),
)
const resolvedRightCols = $derived(
  Math.min(resolvedCols, Math.max(1, Math.floor(rightCols))),
)

const rootClass = $derived(
  ['bits-form__grid-spacer', className].filter(Boolean).join(' '),
)
</script>

<div
  class={rootClass}
  style={`--bits-form-grid-spacer-cols: ${resolvedCols}; --bits-form-grid-spacer-left-cols: ${resolvedLeftCols}; --bits-form-grid-spacer-right-cols: ${resolvedRightCols}; --bits-form-grid-spacer-gap: ${gap};`}
>
  <div class="bits-form__grid-spacer-left">
    {#if left}
      {@render left()}
    {/if}
  </div>

  <div class="bits-form__grid-spacer-right">
    {#if right}
      {@render right()}
    {/if}
  </div>
</div>
