<script lang="ts">
import { getRowRootClass, rowShellClass } from '../row.styles'
import type { RowRootProps } from '../row.types'

let {
  index,
  entityId,
  isSelected = false,
  selectionState = null,
  isFocusable = true,
  variant,
  onclick,
  onkeydown,
  class: className = '',
  children,
}: RowRootProps = $props()
</script>

<div class={rowShellClass}>
  <!-- biome-ignore lint/a11y/useSemanticElements: composite rows contain nested clickable descendants, so this cannot be a native button. -->
  <div
    {onclick}
    {onkeydown}
    tabindex={isFocusable ? 0 : -1}
    role="button"
    data-entity-index={index}
    data-entity-id={entityId}
    class={getRowRootClass({ variant, isSelected, selectionState, className })}
  >
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
