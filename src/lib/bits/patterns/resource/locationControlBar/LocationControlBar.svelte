<script lang="ts">
// BITS
import * as ControlBar from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
import { Button } from '#lib/bits/core/index.js'
// DOMAIN
import { lifecycleStatusesForKind } from '#lib/locations/lifecycle.js'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
import { LOCATION_KINDS, type LocationKind } from '#lib/locations/kinds.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import FunnelIcon from 'virtual:icons/proicons/filter'

let {
  count,
  kind,
  onKindChange,
  organisationId,
  lifecycleStatus,
  organisations,
  onOrganisationChange,
  onLifecycleChange,
  onReset,
  hasMoreOrganisations,
  loadingOrganisations,
  organisationError,
  onMoreOrganisations,
  onRetryOrganisations,
}: {
  kind: LocationKind | ''
  onKindChange: (value: string) => void
  count: number
  organisationId: string
  lifecycleStatus: string
  organisations: { value: string; label: string }[]
  onOrganisationChange: (value: string) => void
  onLifecycleChange: (value: string) => void
  onReset: () => void
  hasMoreOrganisations: boolean
  loadingOrganisations: boolean
  organisationError: boolean
  onMoreOrganisations: () => void
  onRetryOrganisations: () => void
} = $props()
</script>

<ControlBar.Root
  filterLabel={m.filters__filter_by()}
  filterIcon={FunnelIcon}
  hasActiveSection
  disableMenuToggle
  showSort={false}
  {count}
  resetDisabled={!organisationId && !kind && !lifecycleStatus}
  {onReset}
>
  {#snippet filterActiveContent()}
    <div class="flex h-16 items-center gap-4">
      <ControlBar.FilterSelect
        label={m.field_organisation()}
        class="[&>div:last-child]:min-w-0 [&>div:last-child]:w-52"
        tooltip={m.location_directory_help()}
        value={organisationId}
        placeholder={m.location_directory_shared()}
        items={organisations}
        onValueChange={onOrganisationChange}
      />
      <ControlBar.FilterSelect
        label={m.filters__type()}
        class="[&>div:last-child]:min-w-0 [&>div:last-child]:w-40"
        value={kind}
        placeholder={m.filters__all()}
        items={LOCATION_KINDS.map(value => ({
          value,
          label: locationKindLabel(value),
        }))}
        onValueChange={onKindChange}
      />
      <ControlBar.FilterSelect
        label={m.location_lifecycle_filter()}
        class="[&>div:last-child]:min-w-0 [&>div:last-child]:w-44"
        value={lifecycleStatus}
        placeholder={m.location_lifecycle_all()}
        items={lifecycleStatusesForKind(kind).map(value => ({
          value,
          label: lifecycleLabel(value),
        }))}
        onValueChange={onLifecycleChange}
      />
      {#if hasMoreOrganisations}
        <Button
          text={m.location_directory_more_organisations()}
          disabled={loadingOrganisations}
          onClick={onMoreOrganisations}
        />
      {/if}
      {#if organisationError}
        <Button text={m.resource_action_failed()} onClick={onRetryOrganisations} />
      {/if}
    </div>
  {/snippet}
</ControlBar.Root>
