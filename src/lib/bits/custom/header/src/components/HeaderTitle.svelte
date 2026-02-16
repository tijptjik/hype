<script lang="ts">
import { fly } from 'svelte/transition'
import type { HeaderTitleProps } from '../types.js'

let { text, class: className = '', children, ...restProps }: HeaderTitleProps = $props()
</script>

<p
  class={className}
  in:fly={{ x: 10, delay: 180, duration: 180, opacity: 0.15 }}
  out:fly={{ x: -10, duration: 180, opacity: 0.15 }}
  {...restProps}>
  {#if text}
    {text}
  {:else}
    {@render children?.()}
  {/if}
</p>
