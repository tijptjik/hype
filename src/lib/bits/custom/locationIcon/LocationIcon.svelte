<script lang="ts">
// ICONS
import InfrastructureIcon from 'virtual:icons/lucide/brick-wall'
import PartIcon from 'virtual:icons/lucide/panels-top-left'
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
  built: BuildingIcon,
  structure: InfrastructureIcon,
  landform: NatureIcon,
  coastal_feature: NatureIcon,
  water_feature: NatureIcon,
  establishment: StoreIcon,
  service_point: PinIcon,
  building: BuildingIcon,
  building_part: PartIcon,
  premises: BuildingIcon,
  natural: NatureIcon,
  street: StreetIcon,
  infrastructure: InfrastructureIcon,
  address: AddressIcon,
  unknown: PinIcon,
}
const Icon = $derived(icons[kind ?? 'unknown'] ?? PinIcon)
</script>

{#if kind === 'premises'}
  <!-- A shared site with separate buildings and a courtyard distinguishes premises from one building. -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path
      d="M2 21h20M3 15V5h6v10M15 15V3h6v12M6 8v1m0 3v1m12-7v1m0 3v1M9 21v-2a3 3 0 0 1 6 0v2M4 21v-3m16 3v-3"
    />
    <path d="m2 18 2-3 2 3Zm16 0 2-3 2 3Z" />
  </svg>
{:else}
  <Icon aria-hidden="true" {...props} />
{/if}
