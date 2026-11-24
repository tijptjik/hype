<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
// I18N
import { getLocale, m } from '#lib/i18n.js'
import { buildingNameLabel } from '#lib/locations/kinds.i18n.js'
// FIELD RESEARCH
import {
  groupResearchLocations,
  type LocationGrouping,
  type LocationSort,
} from '#lib/fieldResearch/locationStreets.js'
// API
import {
  getResearchLocations,
  addResearchLocation,
  removeResearchLocation,
} from '#lib/api/fieldResearchLocations.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import BuildingConstituents from '#lib/bits/patterns/forms/locationRelationships/BuildingConstituents.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import MapIcon from 'virtual:icons/lucide/map'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import LocationIcon from 'virtual:icons/proicons/location'
import PremisesIcon from 'virtual:icons/lucide/building'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import ConstituentIcon from 'virtual:icons/lucide/blocks'
import PartIcon from 'virtual:icons/lucide/door-open'
import PlusIcon from 'virtual:icons/lucide/plus'
import RelationshipsIcon from 'virtual:icons/lucide/network'
import TrashIcon from 'virtual:icons/lucide/trash-2'
import EstablishmentIcon from 'virtual:icons/lucide/store'
import OperationalIcon from 'virtual:icons/lucide/settings'
// COMPONENTS
import ResearchLocationPicker from './ResearchLocationPicker.svelte'
let {
  sessionId,
  organisationId,
  projectId,
  revision,
  disabled = false,
  onSaved,
}: {
  organisationId: string
  sessionId: string
  projectId: string
  revision: number
  disabled?: boolean
  onSaved: () => Promise<void>
} = $props()
let mode = $state<'search' | 'map'>('search')
let active = $state<'premises' | 'building' | 'building_part'>('premises')
let rows = $state<Awaited<ReturnType<typeof getResearchLocations>>>([])
const added = $derived(
  rows
    .map(row => ({
      ...row,
      name:
        row.kind === 'building'
          ? buildingNameLabel(row.names, row.confirmedUnnamed)
          : row.names.en?.trim() ||
            Object.values(row.names).find(name => name.trim()) ||
            row.address ||
            (row.kind === 'building_part'
              ? 'Unnamed building part'
              : 'Unnamed premises'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, getLocale())),
)
let grouping = $state<LocationGrouping>('street')
let sorting = $state<LocationSort>('number-asc')
let districtsReady = $state(false)
let districtFailure = $state('')
let loadVersion = 0
const groups = $derived(groupResearchLocations(added, grouping, sorting))
const groupIdPrefix = $props.id()
const collapsedGroups = new SvelteSet<string>()
let physicalId = $state<string | null>(null)
const physicalTarget = $derived(
  active === 'building'
    ? (rows.find(row => row.id === physicalId && row.canEditPhysicalBuilding) ?? null)
    : null,
)
let busy = $state(false)
let loaded = $state(false)
let failure = $state('')
const control = 'rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm'
const rowAction =
  'border-border/60 focus-visible:ring-ring inline-flex h-11 items-center justify-center rounded-lg border focus-visible:ring-2 disabled:opacity-50'
const kinds = [
  { id: 'premises', label: 'Premises', icon: PremisesIcon },
  { id: 'building', label: 'Buildings', icon: BuildingIcon },
  { id: 'building_part', label: 'Building parts', icon: PartIcon },
] as const
/** Load persisted vetted Locations. @returns Once the list is refreshed. */
async function load(): Promise<void> {
  const version = ++loadVersion
  const includeDistricts = grouping === 'district'
  const result = await refreshRemoteQuery(
    getResearchLocations({ sessionId, revision, includeDistricts }),
  )
  if (version !== loadVersion) return
  rows = result
  districtsReady = includeDistricts
  districtFailure = ''
  loaded = true
}

/** Load district memberships on first use while keeping street and flat views available.
 * @param next Selected grouping.
 * @returns Once any required district lookup has completed.
 */
async function changeGrouping(next: LocationGrouping): Promise<void> {
  grouping = next
  if (next !== 'district' || districtsReady) return
  districtFailure = ''
  try {
    await load()
  } catch (error) {
    districtFailure = error instanceof Error ? error.message : String(error)
  }
}
/** Persist a single vetted choice or a relationship expansion. @param locationId Selected Location. @param mode Expansion mode. @returns Once refreshed. */
async function add(
  locationId: string,
  mode: 'single' | 'buildings' | 'buildings_and_parts' | 'building_and_parts',
): Promise<void> {
  if (busy || disabled) return
  busy = true
  failure = ''
  try {
    const result = await addResearchLocation({ sessionId, revision, locationId, mode })
    if (!result.count) failure = 'No linked Locations were found for this choice.'
    else {
      await onSaved()
      await load()
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    busy = false
  }
}
/** Remove one selected Location. @param locationId Location identity. @returns Once refreshed. */
async function remove(locationId: string): Promise<void> {
  if (busy || disabled) return
  busy = true
  failure = ''
  try {
    await removeResearchLocation({ sessionId, revision, locationId })
    await onSaved()
    await load()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
onMount(() => void load().catch(error => (failure = String(error))))
</script>
<section aria-label="Vetted Locations" class="@container/locations">
  <SectionHeader
    class="relative z-10 h-auto! grid-cols-1! gap-y-2 py-3! shadow-sm @min-[44rem]/locations:grid-cols-[minmax(0,1fr)_auto]! [&>div:last-child]:[container-type:normal]"
    title="Locations for this session"
    icon={LocationIcon}
    description="Choose the Locations that can be used during recording."
  >
    {#snippet right()}
      <fieldset
        aria-label="Location view controls"
        class="flex w-full min-w-0 flex-wrap items-end gap-2 @min-[44rem]/locations:justify-end"
      >
        <label class="text-muted-foreground min-w-0 space-y-1 text-xs">
          <span>Group by</span>
          <select
            class="border-border bg-background text-foreground block h-9 w-full rounded-md border px-2 text-sm"
            value={grouping}
            onchange={event =>
              void changeGrouping(event.currentTarget.value as LocationGrouping)}
            disabled={!loaded}
          >
            <option value="street">Street</option>
            <option value="district">District</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="text-muted-foreground min-w-0 space-y-1 text-xs">
          <span>Sort by</span>
          <select
            class="border-border bg-background text-foreground block h-9 w-full rounded-md border px-2 text-sm"
            bind:value={sorting}
          >
            <option value="number-asc">Street number ↑</option>
            <option value="number-desc">Street number ↓</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
          </select>
        </label>
        <fieldset
          aria-label="Location selection method"
          class="border-border inline-flex rounded-lg border p-1"
        >
          {#each [
            { value: 'search', label: 'Search', icon: SearchIcon },
            { value: 'map', label: 'Map based', icon: MapIcon },
          ] as option}
            <button
              type="button"
              aria-label={option.label}
              title={option.label}
              aria-pressed={mode === option.value}
              class="text-muted-foreground hover:bg-muted aria-pressed:bg-background aria-pressed:text-primary rounded-md p-2 aria-pressed:shadow-sm"
              disabled={busy}
              onclick={() => (mode = option.value as 'search' | 'map')}
            >
              <option.icon class="size-5" />
            </button>
          {/each}
        </fieldset>
      </fieldset>
    {/snippet}
  </SectionHeader>
  <div class="grid items-start gap-6 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="min-w-0 space-y-4">
      <p class="text-muted-foreground text-sm">
        Related buildings and parts are added only when a current relationship exists.
      </p>
      {#if failure}
        <p role="alert" class="text-error text-sm">{failure}</p>
      {/if}
      <fieldset aria-label="Location type" class="flex flex-wrap gap-2">
        {#each kinds as item}
          <button
            type="button"
            aria-pressed={active === item.id}
            class={`${control} aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary`}
            disabled={busy}
            onclick={() => {
              active = item.id
              physicalId = null
            }}
          >
            <item.icon class="mr-1 inline size-4" />{item.label}
          </button>
        {/each}
        <button
          type="button"
          class={`${control} opacity-40`}
          disabled
          title="Coming later"
        >
          <EstablishmentIcon class="mr-1 inline size-4" />Establishments
        </button>
        <button
          type="button"
          class={`${control} opacity-40`}
          disabled
          title="Coming later"
        >
          <OperationalIcon class="mr-1 inline size-4" />Service Points
        </button>
      </fieldset>
      {#if loaded}
        {#key `${active}-${mode}-${physicalTarget?.id ?? ''}`}
          <ResearchLocationPicker
            {projectId}
            included={added}
            {mode}
            kind={active}
            disabled={busy || disabled}
            {physicalTarget}
            onPhysicalTarget={id => (physicalId = id)}
            onMembersChanged={load}
            onSelect={id => add(id, 'single')}
          />
        {/key}
      {:else}
        <div
          role="status"
          aria-label="Loading Locations"
          class="animate-pulse space-y-4"
        >
          <div class="bg-muted h-10 w-64 max-w-full rounded-lg"></div>
          {#if mode === 'search'}
            <div class="flex items-center gap-2">
              <div class="bg-muted h-5 w-12 rounded"></div>
              <div class="bg-muted h-10 w-28 rounded-lg"></div>
              <div class="bg-muted h-10 min-w-0 flex-1 rounded-lg"></div>
              <div class="bg-muted h-10 w-10 rounded-lg"></div>
              <div class="bg-muted h-10 w-20 rounded-lg"></div>
            </div>
            <div class="grid grid-cols-2 gap-6 py-10">
              {#each [1, 2] as column (column)}
                <div class="flex flex-col items-center gap-3">
                  <div class="bg-muted h-5 w-44 max-w-full rounded"></div>
                  <div class="bg-muted h-4 w-40 max-w-full rounded"></div>
                  <div class="bg-muted mt-3 h-4 w-28 max-w-full rounded"></div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="bg-muted h-5 w-full max-w-xl rounded"></div>
            <div class="bg-muted h-[28rem] rounded-lg"></div>
          {/if}
        </div>
      {/if}
    </div>
    <aside
      aria-label="Included Locations"
      class="border-border bg-panel text-foreground overflow-hidden rounded-xl border xl:sticky xl:top-4"
    >
      <header class="border-border flex items-center gap-2 border-b p-4">
        <LocationIcon class="size-5" />
        <h3 class="font-semibold">Included Locations</h3>
        {#if loaded}
          <span class="bg-muted ml-auto rounded-full px-2 py-0.5 text-xs tabular-nums"
            >{added.length}</span
          >
        {:else}
          <span class="bg-muted ml-auto h-5 w-6 animate-pulse rounded-full"></span>
        {/if}
      </header>
      {#if grouping === 'district' && districtFailure}
        <div role="alert" class="space-y-2 p-4 text-sm">
          <p>{districtFailure}</p>
          <button
            type="button"
            class={control}
            onclick={() => void changeGrouping('district')}
          >
            Retry
          </button>
        </div>
      {:else if !loaded || (grouping === 'district' && !districtsReady)}
        <div
          role="status"
          aria-label="Loading included Locations"
          class="space-y-3 p-4"
        >
          <div class="bg-muted h-5 w-32 animate-pulse rounded"></div>
          <div class="flex animate-pulse gap-3">
            <div class="bg-muted mt-1 size-5 shrink-0 rounded"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex h-6 items-center gap-1.5">
                <div class="bg-muted mr-auto h-3 w-20 rounded"></div>
                <div class="bg-muted size-2 rounded-full"></div>
                <div class="bg-muted size-2 rounded-full"></div>
              </div>
              <div class="bg-muted h-5 w-3/4 rounded"></div>
              <div class="bg-muted h-4 w-full rounded"></div>
            </div>
          </div>
          <div class="flex animate-pulse gap-2 pt-1">
            <div class="bg-muted h-10 w-48 rounded-lg"></div>
            <div class="bg-muted h-10 w-20 rounded-lg"></div>
          </div>
        </div>
      {:else if !added.length}
        <p class="text-muted-foreground p-4 text-sm">
          No Locations yet. Select a search result or a building on the map to add it.
        </p>
      {:else}
        {#each groups as group (group.key)}
          {@const heading =
            group.key ||
            (grouping === 'district' ? 'District unknown' : 'Street unknown')}
          {@const groupId = `${groupIdPrefix}-${grouping}-${encodeURIComponent(group.key)}`}
          {@const collapsed = collapsedGroups.has(groupId)}
          <section aria-label={grouping === 'none' ? undefined : heading}>
            {#if grouping !== 'none'}
              <h4 class="border-border bg-muted/50 border-y">
                <button
                  type="button"
                  class="hover:bg-muted focus-visible:outline-ring flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
                  aria-expanded={!collapsed}
                  aria-controls={groupId}
                  onclick={() => {
                    if (collapsed) collapsedGroups.delete(groupId)
                    else collapsedGroups.add(groupId)
                  }}
                >
                  <span class="min-w-0 break-words">{heading}</span>
                  <ChevronRightIcon
                    class={`text-muted-foreground size-4 shrink-0 ${collapsed ? '' : 'rotate-90'}`}
                    aria-hidden="true"
                  />
                </button>
              </h4>
            {/if}
            <ul id={groupId} hidden={collapsed} class="divide-border divide-y">
              {#each group.rows as { item, addresses } (item.id)}
                {@const type = kinds.find(kind => kind.id === item.kind)}
                {@const Icon = type?.icon ?? LocationIcon}
                {@const detailUrl =
                  '/admin/locations/' +
                  encodeURIComponent(item.id) +
                  '?organisation=' +
                  encodeURIComponent(organisationId)}
                {@const removeLabel = `Remove ${item.name} from session`}
                {@const exteriorStatus = item.hasExteriorMap
                  ? 'available'
                  : 'unavailable'}
                {@const interiorStatus = item.hasInteriorMap
                  ? 'available'
                  : 'unavailable'}
                <li class="space-y-3 p-4">
                  <div class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
                    <Icon class="text-primary mt-1 size-5" />
                    <div class="min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-muted-foreground text-xs">
                          {item.kind === 'building_part'
                            ? 'Building part'
                            : item.kind === 'premises'
                              ? 'Premises'
                              : item.members.length
                                ? 'Physical building'
                                : 'Building'}
                        </p>
                        <SimpleTooltip
                          triggerClass="focus-visible:outline-ring h-6 shrink-0 cursor-help items-center gap-1.5 rounded px-1 focus-visible:outline-2"
                          triggerProps={{
                            role: 'button',
                            'aria-label': `Interior map ${interiorStatus}, exterior map ${exteriorStatus}`,
                          }}
                          contentProps={{ align: 'end' }}
                        >
                          {#snippet trigger()}
                            {#each [
                              item.hasInteriorMap,
                              item.hasExteriorMap,
                            ] as available}
                              <span
                                aria-hidden="true"
                                class={`size-2 rounded-full border ${available ? 'border-success bg-success' : 'border-muted-foreground/60'}`}
                              ></span>
                            {/each}
                          {/snippet}
                          <p>Interior {interiorStatus}</p>
                          <p>Exterior {exteriorStatus}</p>
                        </SimpleTooltip>
                      </div>
                      <a
                        href={detailUrl}
                        class="font-semibold break-words whitespace-normal hover:underline"
                        >{item.name}</a
                      >
                      {#each item.kind === 'building' && item.address
                        ? [{ label: item.address }]
                        : addresses as { label } (label)}
                        {#if label && label !== item.name}
                          <p
                            class="text-muted-foreground mt-1 text-sm break-words whitespace-normal"
                          >
                            {label}
                          </p>
                        {/if}
                      {/each}
                      <BuildingConstituents members={item.members} {organisationId} />
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    {#if item.canEditPhysicalBuilding && !disabled}
                      <button
                        type="button"
                        class={`${rowAction} hover:bg-muted gap-1 px-3`}
                        aria-label="Add constituent building"
                        title="Add constituent building"
                        disabled={busy}
                        onclick={() => {
                          active = 'building'
                          physicalId = item.id
                        }}
                      >
                        <PlusIcon class="size-4" />
                        <ConstituentIcon class="size-5" />
                      </button>
                    {/if}
                    {#if item.kind === 'premises' || item.kind === 'building'}
                      {@const targets =
                        item.kind === 'premises'
                          ? 'related buildings and building parts'
                          : 'related building parts'}
                      {@const { included, total } = item.inclusion}
                      {@const complete = total > 0 && included === total}
                      {@const addLabel = complete
                        ? `All ${total} ${targets} included for ${item.name}`
                        : included
                          ? `Add remaining ${targets} for ${item.name} (${included} of ${total} included)`
                          : total
                            ? `Add ${targets} for ${item.name}`
                            : `No ${targets} for ${item.name}`}
                      <button
                        type="button"
                        class={`${rowAction} hover:bg-muted gap-1 px-3 ${included ? 'text-success' : ''}`}
                        aria-label={addLabel}
                        title={addLabel}
                        aria-disabled={complete || !total}
                        disabled={busy || disabled}
                        onclick={() =>
                          !complete &&
                          total > 0 &&
                          add(
                            item.id,
                            item.kind === 'premises'
                              ? 'buildings_and_parts'
                              : 'building_and_parts',
                          ).catch(() => {})}
                      >
                        {#if !included}
                          <PlusIcon class="size-4" aria-hidden="true" />
                        {/if}
                        {#if item.kind === 'premises'}
                          <BuildingIcon class="size-5" aria-hidden="true" />
                        {/if}
                        <PartIcon class="size-5" aria-hidden="true" />
                      </button>
                    {/if}
                    {#if item.kind === 'building' && !disabled}
                      {@const relationshipLabel = item.hasRelationships
                        ? m.location_relationships_recorded()
                        : m.location_record_relationships()}
                      <a
                        class={`${rowAction} hover:bg-muted w-11 ${item.hasRelationships ? 'text-success' : ''}`}
                        href={detailUrl + '&edit=true#relationships'}
                        title={relationshipLabel}
                      >
                        <RelationshipsIcon class="size-5" aria-hidden="true" />
                        <span class="sr-only">{relationshipLabel}</span>
                      </a>
                    {/if}
                    <button
                      type="button"
                      class={`${rowAction} text-muted-foreground hover:text-error ml-auto w-11`}
                      disabled={busy || disabled}
                      aria-label={removeLabel}
                      title={removeLabel}
                      onclick={() => remove(item.id)}
                    >
                      <TrashIcon class="size-5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </aside>
  </div>
</section>
