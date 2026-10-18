<script lang="ts">
import type { IndexCardRootProps } from '../indexCard.types'

let {
  onclick,
  onkeydown,
  children,
  class: className = '',
}: IndexCardRootProps = $props()
</script>

<article
  draggable="false"
  class={`bits-theme bits-index-card ${className}`.trim()}
  {onclick}
  {onkeydown}
>
  {#if children}
    {@render children()}
  {/if}
</article>
