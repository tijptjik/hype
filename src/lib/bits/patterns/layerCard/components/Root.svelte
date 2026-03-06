<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { LayerCardRootProps } from '../layerCard.types'

type Props = LayerCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<Card.Root class={`bits-form__layer-card-root ${className}`}>
  {@render children?.()}
</Card.Root>
