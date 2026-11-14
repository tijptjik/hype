<script lang="ts">
import { isCanonicalLocationDraft } from '#lib/locations/canonicalDraft.js'
// SVELTE
import { goto } from '$app/navigation'
// BITS
import { Row } from '#lib/bits/custom/index.js'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// DOMAIN
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
import { lifecycleStatus } from '#lib/locations/lifecycle.js'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// TYPES
import type { LocationResource } from '#lib/locations/resource.js'

let {
  entity,
  index,
  organisationId,
}: {
  entity: LocationResource
  index: number
  organisationId: string
} = $props()
const locale = $derived(getLocale())
const name = $derived(
  entity.facts?.names[locale] ||
    entity.facts?.names.en ||
    Object.values(entity.facts?.names ?? {}).find(Boolean) ||
    entity.id,
)
const address = $derived(entity.facts?.location.address.fallbackDisplay)
const description = $derived(
  address?.[locale] ||
    address?.en ||
    Object.values(address ?? {}).find(Boolean) ||
    entity.id,
)
const owner = $derived(
  entity.ownerOrganisationNames?.[locale] ||
    entity.ownerOrganisationNames?.en ||
    entity.ownerOrganisationId,
)
const state = $derived(
  isCanonicalLocationDraft(entity)
    ? 'Upstream draft'
    : entity.state === 'manual'
      ? m.location_state_private()
      : entity.state === 'linked'
        ? m.location_state_matched()
        : entity.state === 'redirect'
          ? m.location_state_redirect()
          : m.location_state_unmatched(),
)
const source = $derived(
  entity.sourceAvailability === 'missing'
    ? m.location_source_missing()
    : entity.sourceAvailability === 'review'
      ? m.location_source_review()
      : '',
)
const href = $derived(
  `/admin/locations/${encodeURIComponent(entity.id)}${organisationId ? '?organisation=' + encodeURIComponent(organisationId) : ''}`,
)

/** Open the stable Location identity with its authorized organisation context.
 * @returns Nothing.
 */
function open(): void {
  void goto(href)
}
</script>

<Row
  {index}
  entityId={entity.id}
  variant="resource"
  class="h-[72px] grid-cols-1"
  onclick={open}
  onkeydown={event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }}
>
  <div class="flex min-w-0 flex-1 items-center gap-4 px-4">
    <LocationIcon kind={entity.kind} class="text-muted-foreground size-7 shrink-0" />
    <div class="min-w-0 flex-1">
      <a
        {href}
        class="block truncate font-semibold"
        data-tooltip={name}
        onclick={event => event.stopPropagation()}
        >{name}</a
      >
      <p class="text-muted-foreground truncate text-sm" data-tooltip={description}>
        {description}
      </p>
    </div>
    <div
      class="text-muted-foreground hidden max-w-48 min-w-0 flex-col text-right text-xs @min-[800px]/grid:flex"
      data-tooltip={owner ?? state}
    >
      <span class="truncate">{owner || state}</span>
      {#if source}
        <span>{source}</span>
      {/if}
    </div>
    <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
      <span>{locationKindLabel(entity.kind)}</span>
      <span class="bg-muted text-muted-foreground rounded-full px-2 py-0.5"
        >{lifecycleLabel(lifecycleStatus(entity.facts))}</span
      >
    </div>
  </div>
</Row>
