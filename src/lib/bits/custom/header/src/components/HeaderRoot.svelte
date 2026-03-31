<script lang="ts">
import type { HeaderRootProps } from '../headerPrimitive.types.js'

let {
  ref = $bindable(null),
  class: className = '',
  style = '',
  children,
  ...restProps
}: HeaderRootProps = $props()
</script>

<div bind:this={ref} class={className} {style} {...restProps}>
  {@render children?.()}
</div>
