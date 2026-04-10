<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { Point } from 'geojson'
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
// ICONS
import MapIcon from 'virtual:icons/lucide/map'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

function getDirections(): void {
  const [longitude, latitude] = (feature.geometry as Point).coordinates
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  window.open(url, '_blank')
}
</script>

{#snippet directionsIcon()}
  <Icon src={MapIcon} class="h-6 w-6 stroke-2 font-bold text-primary" />
{/snippet}

<FeatureCardActionButton
  text={m.alive_large_hawk_hunt()}
  icon={directionsIcon}
  variant="primary"
  hideLabelBelow={256}
  expandedClass="min-w-[11.5rem] max-w-[11.5rem]"
  onClick={getDirections}
/>
