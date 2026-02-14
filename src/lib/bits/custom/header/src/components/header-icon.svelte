<script lang="ts">
import type { HeaderIconProps } from '../types.js'

let {
  icon: IconComponent,
  href,
  class: className = '',
  children,
  ...restProps
}: HeaderIconProps = $props()
</script>

{#if href}
  <a href={href} class={className} {...restProps}>
    {#if IconComponent}
      <IconComponent class="bits-header__icon" />
    {:else}
      {@render children?.()}
    {/if}
  </a>
{:else}
  <span class={className} {...restProps}>
    {#if IconComponent}
      <IconComponent class="bits-header__icon" />
    {:else}
      {@render children?.()}
    {/if}
  </span>
{/if}
