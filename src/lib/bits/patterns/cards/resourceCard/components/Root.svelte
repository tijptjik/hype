<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { ResourceCardRootProps } from '../resourceCard.types'

type Props = ResourceCardRootProps & { children?: Snippet }

let {
  class: className = '',
  isDraggable = false,
  reserveDragSpace = false,
  children,
}: Props = $props()
</script>

<Card.Root size="md" {isDraggable} {reserveDragSpace} class={className}>
  {@render children?.()}
</Card.Root>
