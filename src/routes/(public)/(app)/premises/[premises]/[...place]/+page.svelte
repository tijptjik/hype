<script lang="ts">
// SVELTE
import { page } from '$app/state'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// DOMAIN
import { premisesLabel } from '#lib/indoor/premisesLabels.js'
import { stationLevelOptions } from '#lib/indoor/levels.js'
import { resolveTitle } from '#lib/navigation/title.js'
// TYPES
import type { PageData } from './$types'

// The public layout owns the premises surface and persistent omnibar.
let { data }: { data: PageData } = $props()
const station = getAppCtx().station
// Ignore outgoing scene details until the requested premises is active.
const current = $derived(station.metadata?.slug === page.params.premises)
const detail = $derived(
  current
    ? station.selected?.name.en ||
        (!station.exploded && station.data
          ? stationLevelOptions(station.data.level_polygon.features).find(
              level => level.value === station.floor,
            )?.label
          : '')
    : '',
)
const documentTitle = $derived(
  resolveTitle(
    [premisesLabel(data.premisesTitle, getLocale()), detail, 'HYPE.HK']
      .filter(Boolean)
      .join(' · '),
    page.data.titleEnvironmentLabel,
  ),
)
</script>
<svelte:head><title>{documentTitle}</title></svelte:head>
