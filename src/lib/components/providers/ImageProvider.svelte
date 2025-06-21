<script lang="ts">
import { getImageContext, setImageContext } from '$lib/context/image.svelte';
// TYPES
import type { ImageProviderProps } from '$lib/types';

// STATE
let lastSet: string | undefined = $state();

// PROPS
let { children, ...options }: ImageProviderProps = $props();

// CONTEXT
setImageContext(options);

let imageCtx = getImageContext();

// EFFECTS
$effect(() => {
  const contextId = options.context?.ctxId;
  if (lastSet !== contextId) {
    imageCtx.setContext(options);
    lastSet = contextId;
  }
});
</script>

{@render children()}
