<script lang="ts">
import type { EntityCardRootProps } from '../entityCard.types'

let {
  onclick,
  onkeydown,
  children,
  class: className = '',
}: EntityCardRootProps = $props()
</script>

<div
  draggable="false"
  role="article"
  tabindex="0"
  class={`bits-theme bits-entity-card ${className}`.trim()}
  {onclick}
  {onkeydown}
>
  {#if children}
    {@render children()}
  {/if}
</div>
