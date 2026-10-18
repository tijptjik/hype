<script lang="ts">
import type { HeaderIconProps } from '../headerPrimitive.types.js'

let {
  icon: IconComponent,
  href,
  class: className = '',
  children,
  ...restProps
}: HeaderIconProps = $props()
</script>

{#if href}
  <a {href} class={className} {...restProps}>
    {#if IconComponent}
      <IconComponent class="w-full h-full block" />
    {:else}
      {@render children?.()}
    {/if}
  </a>
{:else}
  <span class={className} {...restProps}>
    {#if IconComponent}
      <IconComponent class="w-full h-full block" />
    {:else}
      {@render children?.()}
    {/if}
  </span>
{/if}
