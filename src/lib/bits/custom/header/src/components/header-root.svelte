<script lang="ts">
import type { HeaderRootProps } from '../types.js'

let {
  ref = $bindable(null),
  class: className = '',
  style = '',
  children,
  ...restProps
}: HeaderRootProps = $props()
</script>

<div bind:this={ref} class={className} style={style} {...restProps}>
  {@render children?.()}
</div>
