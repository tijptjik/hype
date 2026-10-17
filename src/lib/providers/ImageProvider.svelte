<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { setImageCtx } from '#lib/context/image.svelte.js'
// TYPES
import type { Snippet } from 'svelte'
import type { ImageProviderModel } from '#lib/context/imageProvider.types.js'

// PROVIDERS

type ImageProviderProps = {
  children: Snippet
  model: ImageProviderModel
}

// TYPES

let { children, model }: ImageProviderProps = $props()

// Context is created once from the adapter's initial snapshot.
// svelte-ignore state_referenced_locally
const imageCtx = setImageCtx(model.getInitialOptions())
onDestroy(() => imageCtx.dispose())

$effect.pre(() => {
  model.sync(imageCtx)
})
</script>

{@render children()}
