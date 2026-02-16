<script lang="ts">
import { fade } from 'svelte/transition'
import type { HeaderTitleProps } from '../types.js'

let { text, class: className = '', children, ...restProps }: HeaderTitleProps = $props()
</script>

<p
  class={className}
  in:fade={{ delay: 180, duration: 180 }}
  out:fade={{ duration: 180 }}
  {...restProps}>
  {#if text}
    {text}
  {:else}
    {@render children?.()}
  {/if}
</p>
