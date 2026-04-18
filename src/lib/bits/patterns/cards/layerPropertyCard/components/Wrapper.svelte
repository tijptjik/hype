<script lang="ts">
import type { Snippet } from 'svelte'
import type { LayerPropertyCardWrapperProps } from '../layerPropertyCard.types'

type Props = LayerPropertyCardWrapperProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<div class={`bits-form__layer-card-wrapper ${className}`}>{@render children?.()}</div>
