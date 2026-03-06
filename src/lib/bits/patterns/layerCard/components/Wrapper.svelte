<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { LayerCardWrapperProps } from '../layerCard.types'

type Props = LayerCardWrapperProps & { children?: Snippet }

let { class: className = '', isAnimated = false, children }: Props = $props()
</script>

<Card.Wrapper class={`bits-form__layer-card-wrapper ${className}`} {isAnimated}>
  {@render children?.()}
</Card.Wrapper>
