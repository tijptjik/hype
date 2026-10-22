<script lang="ts">
// ICONS
import StoreIcon from 'virtual:icons/lucide/store'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import NatureIcon from 'virtual:icons/lucide/mountain'
import StreetIcon from 'virtual:icons/lucide/road'
import AddressIcon from 'virtual:icons/lucide/map-pin-house'
import PinIcon from 'virtual:icons/lucide/map-pin'
// TYPES
import type { SVGAttributes } from 'svelte/elements'
import type { LocationKind } from '#lib/locations/kinds.js'

let {
  kind,
  ...props
}: SVGAttributes<SVGSVGElement> & {
  kind?: LocationKind | 'street' | 'address' | null
} = $props()

// Street and address previews can have icons without claiming a stored Location identity.
const icons = {
  establishment: StoreIcon,
  building: BuildingIcon,
  premises: BuildingIcon,
  natural: NatureIcon,
  street: StreetIcon,
  address: AddressIcon,
  unknown: PinIcon,
}
const Icon = $derived(icons[kind ?? 'unknown'] ?? PinIcon)
</script>

<Icon aria-hidden="true" {...props} />
