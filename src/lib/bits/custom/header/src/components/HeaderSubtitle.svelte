<script lang="ts">
import { fly } from 'svelte/transition'
import type { HeaderSubtitleProps } from '../headerPrimitive.types.js'

let {
  text,
  class: className = '',
  children,
  ...restProps
}: HeaderSubtitleProps = $props()
</script>

<p
  class={className}
  in:fly={{ x: 10, delay: 180, duration: 180, opacity: 0.15 }}
  out:fly={{ x: -10, duration: 180, opacity: 0.15 }}
  {...restProps}
>
  {#if text}
    {@html text}
  {:else}
    {@render children?.()}
  {/if}
</p>
