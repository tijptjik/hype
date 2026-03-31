<script lang="ts">
import { getRowRootClass, rowShellClass } from '../row.styles'
import type { RowRootProps } from '../row.types'

let {
  index,
  entityId,
  isSelected = false,
  variant,
  onclick,
  onkeydown,
  class: className = '',
  children,
}: RowRootProps = $props()
</script>

<div class={rowShellClass}>
  <div
    {onclick}
    {onkeydown}
    tabindex="0"
    role="button"
    data-entity-index={index}
    data-entity-id={entityId}
    class={getRowRootClass({ variant, isSelected, className })}
  >
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
