<script lang="ts">
import type { HeaderIconProps } from '../types.js'

let {
  icon: IconComponent,
  class: className = '',
  children,
  ...restProps
}: HeaderIconProps = $props()
</script>

<span class={className} {...restProps}>
  {#if IconComponent}
    <IconComponent class="bits-header__icon" />
  {:else}
    {@render children?.()}
  {/if}
</span>
