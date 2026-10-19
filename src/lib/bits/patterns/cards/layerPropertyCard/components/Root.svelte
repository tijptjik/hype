<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// TYPES
import type { LayerPropertyCardRootProps } from '../layerPropertyCard.types'

type Props = LayerPropertyCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<article class={`flex min-h-20 w-full items-center gap-4 py-3 ${className}`}>
  {@render children?.()}
</article>
