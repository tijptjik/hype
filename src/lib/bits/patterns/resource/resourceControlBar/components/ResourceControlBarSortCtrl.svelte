<script lang="ts">
// TYPES
import type { ResourceControlBarSortCtrlProps } from './resourceControlBarPrimitives.types'

let {
  rootElement = $bindable(),
  children,
  class: className = '',
}: ResourceControlBarSortCtrlProps = $props()
</script>

<div
  class={`bits-resource-filter-bar__sort ${className}`.trim()}
  bind:this={rootElement}
>
  {#if children}
    {@render children()}
  {/if}
</div>
