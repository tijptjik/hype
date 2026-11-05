<script lang="ts">
// SVELTE
import { setContext, untrack } from 'svelte'
// CONTEXT
import { ADMINCTX_KEY, type AdminCtx } from '#lib/context/admin.svelte.js'
import { setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setSurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
// TYPES
import type { HeaderLayoutRegionConfig } from '#lib/bits/patterns/layout/header/header.types.js'

let {
  adminCtx,
  region,
}: {
  adminCtx: AdminCtx
  region: HeaderLayoutRegionConfig
} = $props()

// Header-mounted filters must retain the scoped index owner, including nested sort controls.
const owner = untrack(() => adminCtx)
setContext(ADMINCTX_KEY, owner)
setSurfaceCtx(owner.view)
setSurfaceNavigation(owner.navigation)
</script>

{#if region.component}
  {@const Controls = region.component}
  <Controls {...region.props} />
{/if}
