<script lang="ts">
// I18N
import { getI18n, getFPI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// SERVICES
import { getFeatureCardDisplayProperties } from '$lib/client/services/property'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'
// Types

// STATE : PROPS
let { feature }: { feature: Feature } = $props()

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences())

// FUNCTIONS
// Get display properties for the feature
const featureProperties = $derived(
  getFeatureCardDisplayProperties(appCtx, feature.layerId, feature).filter(
    p =>
      p.property?.key !== 'grade' &&
      getFPI18n(p, userPreferences) !== '-' &&
      getFPI18n(p, userPreferences) !== m.great_crazy_squid_promise(),
  ),
)
</script>

<div
  class="justify-flex-start dir-rtl pointer-events-auto flex h-48 flex-wrap items-start gap-2 overflow-y-auto overscroll-contain pl-3 pr-0 w-100:pl-6 w-120:gap-4"
>
  {#each featureProperties as property (property.propertyId)}
    <div
      class="dir-ltr flex max-h-48 flex-[0_0_calc(50%-4px)] flex-col justify-evenly w-120:flex-[0_0_calc(50%-16px)]"
    >
      <span class="font-mono text-xs font-normal uppercase tracking-wide text-gray-400">
        {getI18n(property.property as any, 'label', userPreferences)}
      </span>
      <span class="overflow-y-auto overscroll-contain font-medium">
        {getFPI18n(property, userPreferences)}
      </span>
    </div>
  {/each}
</div>
