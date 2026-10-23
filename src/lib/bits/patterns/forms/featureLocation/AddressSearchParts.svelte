<script lang="ts">
// API
import { getAddressDivisionLabel } from '#lib/api/division.remote.js'
// DOMAIN
import { addressDivisionName, SUBJECTIVE_DIVISIONS } from '#lib/addresses/divisions.js'
import { divisionIcons } from '#lib/divisions/icons.js'
// ADDRESS
import { addressSearchParts, addressLocalityIds } from '#lib/addresses/searchParts.js'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/building-2'
import PremisesIcon from 'virtual:icons/lucide/warehouse'
import StreetIcon from 'virtual:icons/lucide/route'
import LocalityIcon from 'virtual:icons/hype-divisions/neighbourhood'
import UnitIcon from 'virtual:icons/lucide/door-open'
import FloorIcon from 'virtual:icons/lucide/layers'
import PinIcon from 'virtual:icons/lucide/map-pin'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

let { address }: { address: FeatureAddress } = $props()
// Remote queries are cached by source ID, so neighbouring results share label reads.
const divisions = $derived(
  addressLocalityIds(address).map(id => getAddressDivisionLabel({ id })),
)
const parts = $derived(addressSearchParts(address, getLocaleKey()))
const localities = $derived(
  divisions
    .flatMap(query => (query.current ? [query.current] : []))
    .filter(
      division =>
        Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === division.class) &&
        !parts.some(
          part => part.text === addressDivisionName(division, getLocaleKey()),
        ),
    ),
)
const icons = {
  building: BuildingIcon,
  premises: PremisesIcon,
  block: BuildingIcon,
  phase: BuildingIcon,
  unit: UnitIcon,
  floor: FloorIcon,
  street: StreetIcon,
  locality: LocalityIcon,
  address: PinIcon,
}
</script>

<span class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
  {#each parts as part (part.text)}
    {@const PartIcon = icons[part.kind]}
    <span
      class="inline-flex min-w-0 items-center gap-1.5"
      data-address-part={part.kind}
    >
      <PartIcon class="size-4 shrink-0" aria-hidden="true" />
      <span>{part.text}</span>
    </span>
  {/each}
  {#each localities as division (division.id)}
    {@const Locality =
      divisionIcons[division.class as keyof typeof divisionIcons] ?? LocalityIcon}
    <span class="inline-flex min-w-0 items-center gap-1.5" data-address-part="locality">
      <Locality class="size-4 shrink-0" aria-hidden="true" />
      <span>{addressDivisionName(division, getLocaleKey())}</span>
    </span>
  {/each}
</span>
