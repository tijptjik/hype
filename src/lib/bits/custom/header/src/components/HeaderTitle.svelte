<script lang="ts">
import type { HeaderTitleProps } from '../types.js'

let { text, class: className = '', children, ...restProps }: HeaderTitleProps = $props()
</script>

<p class={className} {...restProps}>
  {#if text}
    {text}
  {:else}
    {@render children?.()}
  {/if}
</p>
