<script lang="ts">
import type { Snippet } from 'svelte'
import ImageProvider from '$lib/providers/ImageProvider.svelte'
import type { ImageProviderModel } from '$lib/types'

let {
  model,
  children,
}: {
  model: ImageProviderModel
  children?: Snippet
} = $props()
</script>

<ImageProvider {model}>
  <!-- Clip the viewer media to the card's top viewer curve without affecting the outer decorative caps. -->
  <div
    class="pointer-events-auto relative overflow-hidden"
    style="border-top-left-radius: var(--feature-card-chrome-inner-radius, var(--feature-card-viewer-radius)); border-top-right-radius: var(--feature-card-chrome-inner-radius, var(--feature-card-viewer-radius));"
  >
    {@render children?.()}
  </div>
</ImageProvider>
