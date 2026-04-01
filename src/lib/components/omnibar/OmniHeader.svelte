<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import { Icon } from '$lib/bits'
// ICONS
import MapIcon from 'virtual:icons/lucide/map'
import Building from 'virtual:icons/lucide/landmark'
import MapPin from 'virtual:icons/lucide/map-pin'
// ENUMS
import { OmniCollection } from '$lib/enums'

// PROPS

let { collectionType }: { collectionType: OmniCollection } = $props()

const icons = {
  walk: MapIcon,
  neighbourhood: Building,
  feature: MapPin,
}

const displayTitle: Record<OmniCollection, string> = {
  walk: m.omni__title_walks(),
  neighbourhood: m.omni__title_neighbourhoods(),
  feature: m.omni__title_features(),
}
</script>

<div class="flex items-center justify-between px-4 py-2">
  <span class="text-xs uppercase tracking-widest text-base-content/60"
    >{displayTitle[collectionType]}</span
  >
  <Icon
    src={icons[collectionType]}
    class="h-4 w-4 text-base-content/60"
    theme="solid"
  />
</div>
