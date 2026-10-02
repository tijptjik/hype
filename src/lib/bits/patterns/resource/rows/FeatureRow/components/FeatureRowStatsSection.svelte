<script lang="ts">
import FeatureRowStats from './FeatureRowStats.svelte'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

let {
  feature,
  appCtx,
  grapheme,
}: {
  feature: Feature
  appCtx: AdminCtx['appCtx']
  grapheme: string
} = $props()
</script>

<div class="flex items-center justify-center min-w-0">
  <FeatureRowStats {feature} {appCtx} {grapheme} />
</div>
