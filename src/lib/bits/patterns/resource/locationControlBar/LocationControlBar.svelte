<script lang="ts">
// BITS
import * as ControlBar from '#lib/bits/patterns/resource/resourceControlBar/components/index.js'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import { Button } from '#lib/bits/core/index.js'
import ResourceSortControl from '#lib/bits/patterns/resource/resourceSortControl/ResourceSortControl.svelte'
// DOMAIN
import { lifecycleStatusesForKind } from '#lib/locations/lifecycle.js'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
import { LOCATION_KINDS, type LocationKind } from '#lib/locations/kinds.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// I18N
import { m } from '#lib/i18n.js'

let {
  sorting = { sortBy: 'name', sortOrder: 'asc' },
  onSortingChange,
  buildingsLoading = false,
  buildingsFailed = false,
  onRetryBuildings,
  buildingId = '',
  buildings = [],
  onBuildingChange,
  onBuildingSearch,
  onMoreBuildings,
  hasMoreBuildings = false,
  publication = 'published',
  showPublication = false,
  onPublicationChange,
  count,
  countLoading = false,
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
  sorting?: { sortBy: string; sortOrder: 'asc' | 'desc' }
  onSortingChange?: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
  buildingsLoading?: boolean
  buildingsFailed?: boolean
  onRetryBuildings?: () => void
  buildingId?: string
  buildings?: { value: string; label: string }[]
  onBuildingChange?: (value: string) => void
  onBuildingSearch?: (value: string) => void
  onMoreBuildings?: () => void
  hasMoreBuildings?: boolean
  publication?: 'all' | 'published' | 'draft'
  showPublication?: boolean
  onPublicationChange?: (value: string) => void
  kind: LocationKind | ''
  onKindChange: (value: string) => void
  count: number | null
  countLoading?: boolean
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

<div class="bits-theme bg-base-200 flex h-16 w-full min-w-0 items-center gap-4 px-4">
  <section class="min-w-0 flex-1 overflow-x-auto" aria-label={m.filters__filter_by()}>
    <div class="flex h-16 w-max items-center gap-6">
      <ControlBar.FilterSelect
        label={m.field_organisation()}
        class="max-2xl:flex-col max-2xl:items-start max-2xl:gap-0 max-2xl:[&>div:first-child]:min-h-4 [&>div:last-child]:w-44 [&>div:last-child]:min-w-0"
        tooltip={m.location_directory_help()}
        value={organisationId}
        placeholder={m.location_directory_shared()}
        items={organisations}
        onValueChange={onOrganisationChange}
      />
      <ControlBar.FilterSelect
        label={m.filters__type()}
        class="max-2xl:flex-col max-2xl:items-start max-2xl:gap-0 max-2xl:[&>div:first-child]:min-h-4 [&>div:last-child]:w-28 [&>div:last-child]:min-w-0"
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
        class="max-2xl:flex-col max-2xl:items-start max-2xl:gap-0 max-2xl:[&>div:first-child]:min-h-4 [&>div:last-child]:w-36 [&>div:last-child]:min-w-0"
        value={lifecycleStatus}
        placeholder={m.location_lifecycle_all()}
        items={lifecycleStatusesForKind(kind).map(value => ({
          value,
          label: lifecycleLabel(value),
        }))}
        onValueChange={onLifecycleChange}
      />
      {#if kind === 'building_part'}
        <div class="w-60 min-w-0">
          <SearchSelect
            disabled={buildingsLoading && buildings.length === 0}
            label={locationKindLabel('building')}
            items={buildings}
            value={buildingId}
            onSelect={value => onBuildingChange?.(value)}
            onSearch={onBuildingSearch}
          />
        </div>
        {#if buildingsFailed}
          <Button text={m.resource_action_failed()} onClick={onRetryBuildings} />
        {/if}
        {#if hasMoreBuildings}
          <Button
            text={m.resource_load_more()}
            disabled={buildingsLoading}
            onClick={onMoreBuildings}
          />
        {/if}
      {/if}
      {#if showPublication}
        <ControlBar.TriStateToggle
          class="min-w-44 shrink-0"
          label={m.location_publication_filter()}
          falseLabel={m.location_publication_draft()}
          trueLabel={m.published()}
          currentValue={publication === 'all'
            ? null
            : publication === 'published' &&
              sorting.sortBy === 'name' &&
              sorting.sortOrder === 'asc'}
          onCheckedChange={value =>
            onPublicationChange?.(
              value === null ? 'all' : value ? 'published' : 'draft',
            )}
        />
      {/if}
      <ResourceSortControl
        {sorting}
        {onSortingChange}
        sortables={{
          items: [
            { value: 'name', label: m.field_name() },
            { value: 'address', label: m.feature_model_field_address() },
            { value: 'kind', label: m.filters__type() },
            { value: 'lifecycle', label: m.location_lifecycle_filter() },
            { value: 'publication', label: m.location_publication_filter() },
            { value: 'created', label: m.location_record_created() },
            { value: 'updated', label: m.sort__updated() },
            { value: 'id', label: 'ID' },
          ],
        }}
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
  </section>
  <div class="flex shrink-0 items-center gap-4">
    <ControlBar.ResultCount {count} {countLoading} />
    <ControlBar.FilterReset
      disabled={!organisationId &&
        !kind &&
        !buildingId &&
        !lifecycleStatus &&
        publication === 'published'}
      onClick={onReset}
    />
  </div>
</div>
