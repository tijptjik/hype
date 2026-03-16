<script lang="ts">
// CONTEXT
import { setImageCtx } from '$lib/context/image.svelte'
// TYPES
import type { ImageProviderProps } from '$lib/types'

let { children, model }: ImageProviderProps = $props()

// Context is created once from the adapter's initial snapshot.
// svelte-ignore state_referenced_locally
const imageCtx = setImageCtx(model.getInitialOptions())

$effect.pre(() => {
  model.sync(imageCtx)
})
</script>

{@render children()}
