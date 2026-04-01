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

<ImageProvider {model}> {@render children?.()} </ImageProvider>
