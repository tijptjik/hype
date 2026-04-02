<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// ENUMS
import { OmniCollection } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// ICONS
import Building from 'virtual:icons/lucide/landmark'
import MapIcon from 'virtual:icons/lucide/map'
import MapPin from 'virtual:icons/lucide/map-pin'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let { collectionType }: OmnibarSectionProps = $props()

const collectionIcons = {
  walk: MapIcon,
  neighbourhood: Building,
  feature: MapPin,
}

const collectionTitles: Record<OmniCollection, string> = {
  walk: m.omni__title_walks(),
  neighbourhood: m.omni__title_neighbourhoods(),
  feature: m.omni__title_features(),
}
</script>

<div class="flex items-center justify-between px-4 py-2">
  <span class="text-xs uppercase tracking-widest text-base-content/60">
    {collectionTitles[collectionType]}
  </span>
  <Icon
    src={collectionIcons[collectionType]}
    class="h-4 w-4 text-base-content/60"
    theme="solid"
  />
</div>
