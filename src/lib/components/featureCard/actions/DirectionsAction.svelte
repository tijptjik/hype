<script lang="ts">
import Button from '$lib/bits/core/button/Button.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import MapIcon from 'virtual:icons/lucide/map'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { Point } from 'geojson'
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'

// PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props()

// HANDLERS
function getDirections() {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${(feature.geometry as Point).coordinates[1]},${(feature.geometry as Point).coordinates[0]}`
  window.open(url, '_blank')
}
</script>

{#snippet directionsIcon()}
  <Icon src={MapIcon} class="h-6 w-6 stroke-2 font-bold text-primary" />
{/snippet}

<Button
  text={m.alive_large_hawk_hunt()}
  icon={directionsIcon}
  color="neutral"
  class="bits-feature-card__action-button bits-feature-card__action-button--show-label-sm"
  attrs={{ title: m.alive_large_hawk_hunt() }}
  onClick={getDirections}
/>
