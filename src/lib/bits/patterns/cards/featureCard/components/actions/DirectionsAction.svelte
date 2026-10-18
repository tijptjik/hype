<script lang="ts">
// BITS
import { Icon } from '#lib/bits/index.js'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// ADAPTERS
import { getNavigationPanelModel } from '#lib/adapters/panels/useNavigationPanelModel.svelte.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// TYPES
import type { Point } from 'geojson'
import type {
  Feature,
  UserContributedFeature,
} from '#lib/db/zod/schema/feature.types.js'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

interface Props {
  feature: Feature | UserContributedFeature
  isIconOnly?: boolean
}

let { feature, isIconOnly }: Props = $props()
const navigation = getNavigationPanelModel()
const view = getSurfaceCtx()

/** Opens the public navigation flow for the card's point. @returns Nothing. */
function getDirections(): void {
  const [longitude, latitude] = (feature.geometry as Point).coordinates
  void navigation?.open({
    lon: longitude,
    lat: latitude,
    title: getI18n(feature, 'title', view.getUserPreferences(), 'Destination'),
  })
}
</script>

{#snippet directionsIcon()}
  <Icon src={MapIcon} class="h-6 w-6 stroke-2 font-bold text-primary" />
{/snippet}

<FeatureCardActionButton
  text={m.alive_large_hawk_hunt()}
  icon={directionsIcon}
  variant="primary"
  {isIconOnly}
  disabled={!navigation || feature.geometry?.type !== 'Point'}
  expandedClass="min-w-[11.5rem] max-w-[11.5rem]"
  onClick={getDirections}
/>
