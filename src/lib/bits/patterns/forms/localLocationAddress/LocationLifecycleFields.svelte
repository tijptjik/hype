<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SelectField, TextInput } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  BUILDING_STATUSES,
  OPERATING_STATUSES,
  lifecycleStatus,
} from '#lib/locations/lifecycle.js'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
// TYPES
import type {
  LocationLifecycleSummary,
  OperatingStatus,
  BuildingStatus,
} from '#lib/locations/lifecycle.js'
import type { LocationKind } from '#lib/locations/kinds.js'
let {
  value,
  successorLocationId,
  kind,
  isEditing = false,
  disabled = false,
  onChange,
  onSuccessorChange,
}: {
  value?: LocationLifecycleSummary
  successorLocationId?: string | null
  kind: LocationKind
  isEditing?: boolean
  disabled?: boolean
  onChange?: (value: LocationLifecycleSummary) => void
  onSuccessorChange?: (value: string | null) => void
} = $props()
const uid = $props.id()
const supported = $derived(kind === 'building' || kind === 'establishment')
const items = $derived(
  ['unknown', ...(kind === 'building' ? BUILDING_STATUSES : OPERATING_STATUSES)].map(
    value => ({
      value,
      label: lifecycleLabel(value as ReturnType<typeof lifecycleStatus>),
    }),
  ),
)
/** Stage status without deriving the Feature's existence or visitability from its Location.
 * @param status Selected status, including an explicit unknown choice. @returns Nothing.
 */
function update(status: string): void {
  onChange?.(
    kind === 'building'
      ? {
          operatingStatus: null,
          buildingStatus: status === 'unknown' ? null : (status as BuildingStatus),
        }
      : {
          operatingStatus: status === 'unknown' ? null : (status as OperatingStatus),
          buildingStatus: null,
        },
  )
}
</script>

{#if supported}
  <section
    class="border-border space-y-4 border-b pb-6"
    aria-label={m.location_lifecycle_title()}
  >
    <h2 class="text-lg font-semibold">{m.location_lifecycle_title()}</h2>
    {#if isEditing}
      <fieldset {disabled} class="min-w-0 space-y-4">
        <SelectField
          id={`${uid}-status`}
          label={m.location_lifecycle_status()}
          placeholder={m.location_lifecycle_status()}
          value={lifecycleStatus(value)}
          {items}
          onValueChange={update}
        />
        <p class="text-muted-foreground text-sm">{m.location_lifecycle_help()}</p>
        <TextInput
          id={`${uid}-successor`}
          name=""
          label={m.location_successor_id()}
          value={successorLocationId ?? ''}
          isEditing={true}
          onValueChange={text => onSuccessorChange?.(text.trim() || null)}
        />
      </fieldset>
    {:else}
      <p class="font-medium">{lifecycleLabel(lifecycleStatus(value))}</p>
      {#if successorLocationId}
        <a
          class="text-primary underline"
          href={`/admin/locations/${encodeURIComponent(successorLocationId)}`}
          >{m.location_successor_id()}: {successorLocationId}</a
        >
      {/if}
    {/if}
  </section>
{/if}
