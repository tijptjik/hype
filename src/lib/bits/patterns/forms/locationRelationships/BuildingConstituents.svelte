<script lang="ts">
// ICONS
import ConstituentIcon from 'virtual:icons/lucide/blocks'
// DOMAIN
import { buildingSourceHref } from '#lib/locations/buildingSource.js'
// TYPES
import type { PhysicalBuildingMember } from '#lib/locations/physicalBuilding.js'

let {
  members,
  organisationId,
}: {
  members: Array<{
    locationId?: string
    source: PhysicalBuildingMember['source']
    addresses: Array<{ streets?: Record<string, { name: string; number: string }> }>
  }>
  organisationId?: string
} = $props()
</script>

{#if members.length}
  <ul aria-label="Constituent buildings" class="mt-2 flex flex-wrap items-center gap-2">
    {#each members as member (member.source.id)}
      {@const numbers = [
        ...new Set(
          member.addresses.flatMap(address =>
            Object.values(address.streets ?? {})
              .map(street => street.number?.trim())
              .filter(Boolean),
          ),
        ),
      ].join(', ')}
      <li>
        <a
          href={member.locationId
            ? `/admin/locations/${encodeURIComponent(member.locationId)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`
            : buildingSourceHref(member.source)}
          aria-label={numbers
            ? `Constituent building ${numbers}`
            : 'Constituent building'}
          title={numbers ? `Constituent building ${numbers}` : 'Constituent building'}
          class="text-success hover:bg-muted inline-flex min-h-11 items-center gap-1 rounded-md px-2"
        >
          {#if numbers}
            <span>{numbers}</span>
          {/if}
          <ConstituentIcon class="size-5" />
        </a>
      </li>
    {/each}
  </ul>
{/if}
