<script lang="ts">
// BITS
import { Icon } from '#lib/bits/index.js'
// ENUMS
import { OmniCollection } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import Building from 'virtual:icons/proicons/bank'
import MapIcon from 'virtual:icons/proicons/map'
import MapPin from 'virtual:icons/proicons/location'
// TYPES
import type { OmnibarSectionHeaderProps } from './omnibarPrimitives.types'

let { collectionType, totalCount, loading, onclick }: OmnibarSectionHeaderProps =
  $props()

const collectionIcons = {
  walk: MapIcon,
  neighbourhood: Building,
  feature: MapPin,
}

const collectionTitles: Record<OmniCollection, string> = {
  walk: m.omni__title_walks(),
  neighbourhood: m.filters__divisions(),
  feature: m.omni__title_features(),
}
</script>

<button
  type="button"
  class="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-base-content/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
  disabled={loading}
  aria-busy={loading}
  {onclick}
>
  <span class="text-xs uppercase tracking-widest text-base-content/60">
    {collectionTitles[collectionType]}{totalCount == null ? '' : ` (${totalCount})`}
  </span>
  <Icon
    src={collectionIcons[collectionType]}
    class="h-4 w-4 text-base-content/60"
    theme="solid"
  />
</button>
