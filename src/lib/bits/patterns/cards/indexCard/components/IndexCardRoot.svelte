<script lang="ts">
import type { IndexCardRootProps } from '../indexCard.types'

let {
  onclick,
  onkeydown,
  children,
  class: className = '',
}: IndexCardRootProps = $props()
</script>

<div
  draggable="false"
  role="article"
  tabindex="0"
  class={`bits-theme bits-index-card ${className}`.trim()}
  {onclick}
  {onkeydown}
>
  {#if children}
    {@render children()}
  {/if}
</div>
