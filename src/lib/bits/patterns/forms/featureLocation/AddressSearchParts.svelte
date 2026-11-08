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

let {
  address,
  numberSummary,
  primaryName,
  collapsed = false,
  establishmentTitle,
  taxonomyLabel,
}: {
  address: FeatureAddress
  numberSummary?: string
  primaryName?: string
  collapsed?: boolean
  establishmentTitle?: string
  taxonomyLabel?: string
} = $props()
// Remote queries are cached by source ID, so neighbouring results share label reads.
const divisions = $derived(
  addressLocalityIds(address).map(id => getAddressDivisionLabel({ id })),
)
const parts = $derived.by(() => {
  const all = addressSearchParts(address, getLocaleKey(), numberSummary)
  if (primaryName)
    return [
      { kind: 'building' as const, text: primaryName },
      ...all.filter(
        part =>
          part.kind !== 'building' &&
          part.text.toLocaleLowerCase() !== primaryName.toLocaleLowerCase(),
      ),
    ]
  if (collapsed && all.some(part => part.kind === 'premises'))
    return all.filter(part => !['phase', 'block', 'building'].includes(part.kind))
  return all
})
const localities = $derived(
  divisions
    .flatMap(query => (query.current ? [query.current] : []))
    .sort(
      (a, b) =>
        (b.level ?? 0) - (a.level ?? 0) ||
        localityRank(b.class) - localityRank(a.class),
    )
    .filter(
      division =>
        Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === division.class) &&
        !parts.some(
          part => part.text === addressDivisionName(division, getLocaleKey()),
        ),
    ),
)
/** Rank source locality classes from broadest to most specific. @param kind Published class. @returns Relative specificity. */
function localityRank(kind: string): number {
  return [
    'town',
    'rural_area',
    'macrohood',
    'neighbourhood',
    'village',
    'microhood',
    'hamlet',
  ].indexOf(kind)
}
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

<span class="relative block min-w-0">
  <span
    class="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
    data-address-components
  >
    {#if establishmentTitle}
      <span class="text-foreground font-semibold">{establishmentTitle}</span>
    {/if}
    {#each parts as part (part.text)}
      {@const PartIcon = icons[part.kind]}
      <span
        class="inline-flex min-w-0 items-center gap-1.5"
        class:font-semibold={Boolean(primaryName) && part.kind === 'building'}
        class:text-foreground={Boolean(primaryName) && part.kind === 'building'}
        data-tooltip={part.text}
        data-address-part={part.kind}
        data-division-class={part.localityClass}
      >
        {#if !(primaryName && part.kind === 'building')}
          <PartIcon class="size-4 shrink-0" aria-hidden="true" />
        {/if}
        <span>{part.text}</span>
      </span>
    {/each}
    {#each localities as division (division.id)}
      {@const Locality =
        divisionIcons[division.class as keyof typeof divisionIcons] ?? LocalityIcon}
      <span
        class="inline-flex min-w-0 items-center gap-1.5"
        data-division-class={division.class}
        data-address-part="locality"
      >
        <Locality class="size-4 shrink-0" aria-hidden="true" />
        <span>{addressDivisionName(division, getLocaleKey())}</span>
      </span>
    {/each}
  </span>
  {#if establishmentTitle && taxonomyLabel}
    <span
      class="text-muted-foreground mt-1 block overflow-hidden text-xs text-ellipsis whitespace-nowrap"
      data-result-taxonomy
      >{taxonomyLabel}</span
    >
  {/if}
</span>
