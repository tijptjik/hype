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
      <IconComponent class="block h-full w-full" />
    {:else}
      {@render children?.()}
    {/if}
  </a>
{:else}
  <span class={className} {...restProps}>
    {#if IconComponent}
      <IconComponent class="block h-full w-full" />
    {:else}
      {@render children?.()}
    {/if}
  </span>
{/if}
