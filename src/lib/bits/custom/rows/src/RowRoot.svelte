<script lang="ts">
import type { RowRootProps } from '../row.types'

let {
  index,
  isSelected = false,
  variant,
  onclick,
  onkeydown,
  children,
}: RowRootProps = $props()
</script>

<div class={`bits-resource-row-shell bits-resource-row-shell--${variant}`.trim()}>
  <div
    {onclick}
    {onkeydown}
    tabindex="0"
    role="button"
    data-entity-index={index}
    class={`bits-theme bits-resource-row bits-resource-row--${variant}`.trim()}
    class:bits-resource-row--selected={isSelected}
  >
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
