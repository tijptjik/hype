<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/custom'
import type { LayerPropertyCardWrapperProps } from '../layerPropertyCard.types'

type Props = LayerPropertyCardWrapperProps & { children?: Snippet }

let {
  class: className = '',
  isAnimated = false,
  flipDisabled = false,
  children,
}: Props = $props()
</script>

<Card.Wrapper
  class={`bits-form__layer-card-wrapper ${className}`}
  {isAnimated}
  {flipDisabled}
>
  {@render children?.()}
</Card.Wrapper>
