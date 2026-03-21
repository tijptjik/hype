<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'

import type { MapStyleCardRootProps } from '../mapStyleCard.types'

let {
  class: className = '',
  children,
}: MapStyleCardRootProps & { children?: Snippet } = $props()
</script>

<Card.Root size="xl" class={`bits-map-style-card ${className}`}>
  {@render children?.()}
</Card.Root>
