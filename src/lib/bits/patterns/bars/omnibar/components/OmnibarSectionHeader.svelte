<script lang="ts">
// BITS
import { Icon } from '#lib/bits/index.js'
// ENUMS
import type { OmniSearchCollection } from '#lib/context/omni.types.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import Layers from 'virtual:icons/proicons/layers'
import Grid from 'virtual:icons/proicons/grid'
import Users from 'virtual:icons/proicons/person-multiple'
import Building from 'virtual:icons/proicons/bank'
import MapIcon from 'virtual:icons/proicons/map'
import MapPin from 'virtual:icons/proicons/location'
// TYPES
import type { OmnibarSectionHeaderProps } from './omnibarPrimitives.types'

let { collectionType, totalCount, loading, onclick }: OmnibarSectionHeaderProps =
  $props()

const collectionIcons = {
  layer: Layers,
  project: Grid,
  organisation: Users,
  walk: MapIcon,
  neighbourhood: Building,
  feature: MapPin,
  station: Building,
  mall: Building,
}

const collectionTitles: Record<OmniSearchCollection, string> = {
  layer: m.maps__layers(),
  project: m.maps__projects(),
  organisation: m.maps__organisations(),
  walk: m.omni__title_walks(),
  neighbourhood: m.filters__divisions(),
  feature: m.omni__title_features(),
  station: 'MTR stations',
  mall: 'Malls',
}
</script>

<button
  type="button"
  class="group flex w-full items-center justify-between px-4 py-2 text-left focus-visible:outline-none disabled:opacity-50"
  disabled={loading}
  aria-busy={loading}
  {onclick}
>
  <span
    class="text-base-content/60 group-hover:text-primary group-focus-visible:text-primary text-xs tracking-widest uppercase"
  >
    {collectionTitles[collectionType]}{totalCount == null ? '' : ` (${totalCount})`}
  </span>
  <Icon
    src={collectionIcons[collectionType]}
    class="text-base-content/60 h-4 w-4"
    theme="solid"
  />
</button>
