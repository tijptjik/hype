<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { Snippet } from 'svelte'

let {
  controlBar,
}: {
  controlBar?: Snippet
} = $props()

// CONTEXT
const adminCtx = getAdminCtx()

let controlMode = $derived(
  adminCtx.activeResourceType
    ? adminCtx.appCtx.state.ui.controlMode[adminCtx.activeResourceType]
    : null,
)
</script>

<!-- Control Bar (slides down when controlMode is active) -->
{#if controlMode === 'filter'}
  <div transition:slide>
    {#if controlBar}
      {@render controlBar()}
    {/if}
  </div>
{/if}
