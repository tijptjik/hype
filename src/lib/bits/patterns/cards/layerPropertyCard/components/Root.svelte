<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { LayerPropertyCardRootProps } from '../layerPropertyCard.types'

type Props = LayerPropertyCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<Card.Root size="lg" class={`bits-form__layer-card-root ${className}`}>
  {@render children?.()}
</Card.Root>
