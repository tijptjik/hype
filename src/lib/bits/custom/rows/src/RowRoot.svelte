<script lang="ts">
import { getRowRootClass, rowShellClass } from '../row.styles'
import type { RowRootProps } from '../row.types'

let {
  index,
  entityId,
  isSelected = false,
  selectionState = null,
  isFocusable = true,
  interactive = true,
  variant,
  onclick,
  onkeydown,
  class: className = '',
  children,
}: RowRootProps = $props()
</script>

<div class={rowShellClass}>
  <!-- biome-ignore lint/a11y/useSemanticElements: composite rows contain nested clickable descendants, so this cannot be a native button. -->
  <!-- biome-ignore lint/a11y/noStaticElementInteractions: the button role and both event handlers are enabled together; skeleton rows have neither. -->
  <div
    onclick={interactive ? onclick : undefined}
    onkeydown={interactive ? onkeydown : undefined}
    tabindex={interactive ? (isFocusable ? 0 : -1) : undefined}
    role={interactive ? 'button' : undefined}
    data-entity-index={index}
    data-entity-id={entityId}
    class={getRowRootClass({
      variant,
      isSelected,
      selectionState,
      className,
      interactive,
    })}
  >
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
