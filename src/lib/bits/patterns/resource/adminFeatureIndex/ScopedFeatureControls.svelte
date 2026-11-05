<script lang="ts">
// BITS COMPONENTS
import ScopedFeatureControlsContext from './ScopedFeatureControlsContext.svelte'
// TYPES
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { HeaderLayoutRegionConfig } from '#lib/bits/patterns/layout/header/header.types.js'

let {
  adminCtx,
  region,
}: {
  adminCtx: AdminCtx
  region: HeaderLayoutRegionConfig
} = $props()
</script>

{#key adminCtx}
  <ScopedFeatureControlsContext {adminCtx} {region} />
{/key}
