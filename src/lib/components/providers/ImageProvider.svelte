<script lang="ts">
import { getImageContext, setImageContext } from '$lib/context/image.svelte';
// TYPES
import type { ImageProviderProps } from '$lib/types';

// STATE
let lastSet: string | null = $state(null);

// PROPS
let { children, ...settings }: ImageProviderProps = $props();

// CONTEXT
setImageContext(
  settings.mode,
  settings.isAdminMode,
  settings.ctxType,
  settings.ctxId,
  settings.organisation,
  settings.project,
  settings.image,
  settings.ctxTypeSecondary,
  settings.ctxIdSecondary,
  settings.highlightedIds
);

let imageCtx = getImageContext();

// EFFECTS
$effect(() => {
  if (lastSet !== settings.ctxId) {
    imageCtx.setContext(settings);
    lastSet = settings.ctxId;
  }
});
</script>

{@render children()}
