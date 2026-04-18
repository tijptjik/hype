<script lang="ts">
import FeatureRowStats from './FeatureRowStats.svelte'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

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

<div class="bits-resource-row__stats">
  <FeatureRowStats {feature} {appCtx} {grapheme} />
</div>
