<script lang="ts">
import type { HeaderSubtitleProps } from '../types.js'

let {
  text,
  class: className = '',
  children,
  ...restProps
}: HeaderSubtitleProps = $props()
</script>

<p class={className} {...restProps}>
  {#if text}
    {text}
  {:else}
    {@render children?.()}
  {/if}
</p>
