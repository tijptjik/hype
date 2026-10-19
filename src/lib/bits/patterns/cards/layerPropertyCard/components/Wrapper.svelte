<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// TYPES
import type { LayerPropertyCardWrapperProps } from '../layerPropertyCard.types'

type Props = LayerPropertyCardWrapperProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<div class={`flex flex-col divide-y divide-border/50 px-6 ${className}`}>
  {@render children?.()}
</div>
