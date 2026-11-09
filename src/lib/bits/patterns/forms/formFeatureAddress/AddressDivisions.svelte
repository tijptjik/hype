<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import InfoIcon from 'virtual:icons/proicons/info'
import PanelRightIcon from 'virtual:icons/lucide/panel-right'
import { divisionClassLabel } from '#lib/divisions/classes.js'
import { divisionIcons } from '#lib/divisions/icons.js'
// BITS
import { reverseTabStop } from '#lib/bits/custom/form/reverseTabStop.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// COMPONENTS
import AddressLocalityEditor from './AddressLocalityEditor.svelte'
// API
import { getAddressDivisionContext } from '#lib/api/division.remote.js'
// DOMAIN
import {
  SUBJECTIVE_DIVISIONS,
  authoredDivisionOverrides,
  addressDivisionName,
  effectiveAddressDivisions,
  groupAddressDivisions,
  localityPathOverrides,
} from '#lib/addresses/divisions.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type {
  AddressDivisionContext,
  AddressDivision,
} from '#lib/addresses/divisions.js'

let {
  address,
  coordinates,
  isEditing = false,
  onChange,
  onResolved,
  stacked = true,
  compact = false,
  sidebar = false,
  onToggle,
  class: className = '',
}: {
  class?: string
  stacked?: boolean
  compact?: boolean
  sidebar?: boolean
  onToggle?: () => void
  address: FeatureAddress
  coordinates: number[]
  isEditing?: boolean
  onChange: (address: FeatureAddress) => void
  onResolved?: (value: { coordinates: number[]; divisions: AddressDivision[] }) => void
} = $props()
let result = $state<{ key: string; context: AddressDivisionContext } | null>(null)
let loading = $state(false)
let failed = $state(false)
let retry = $state(0)
const key = $derived(JSON.stringify(coordinates.slice(0, 2)))
// Retain the last resolved projection while the next marker lookup is pending.
const context = $derived(result?.context ?? null)
const stale = $derived(result !== null && result.key !== key)
const overrides = $derived({
  ...authoredDivisionOverrides(address.source.authored),
  ...address.source.divisionOverrides,
  ...address.divisionOverrides,
})
const divisions = $derived(context ? effectiveAddressDivisions(context, overrides) : [])
$effect(() => {
  if (context?.available && !stale)
    onResolved?.({ coordinates: JSON.parse(key), divisions })
})
const groups = $derived(groupAddressDivisions(divisions))
const groupLabels = $derived({
  administrative: m.address_divisions_administration(),
  locality: m.address_divisions_localities(),
  landform: m.address_divisions_landforms(),
})
const availableGroups = $derived(
  isEditing && !groups.some(group => group.key === 'locality')
    ? [
        ...groups.filter(group => group.key === 'administrative'),
        { key: 'locality' as const, paths: [] },
        ...groups.filter(group => group.key === 'landform'),
      ]
    : groups,
)
// Present specific geography first without changing the stored ancestry order.
const displayedGroups = $derived(
  ['locality', 'landform', 'administrative'].flatMap(key =>
    availableGroups.filter(group => group.key === key),
  ),
)
const labels = $derived<Record<string, string>>({
  country: m.address_division_country(),
  sar: m.address_division_sar(),
  area: m.address_division_area(),
  district: m.address_division_district(),
  major_island: m.address_division_island(),
  minor_island: m.address_division_island(),
  islet: m.address_division_islet(),
  island_group: m.address_division_island_group(),
  town: m.address_division_town(),
  rural_area: m.address_division_rural_area(),
  macrohood: m.address_division_macrohood(),
  neighbourhood: m.address_division_neighbourhood(),
  village: m.address_division_village(),
  microhood: m.address_division_microhood(),
  hamlet: m.address_division_hamlet(),
})
$effect(() => {
  const requestKey = key
  const refresh = retry
  // Depend on the coordinate value, so ordinary draft edits cannot restart lookup and unmount the picker.
  const point = JSON.parse(requestKey) as [number, number]
  let cancelled = false
  loading = true
  failed = false
  const request = getAddressDivisionContext({
    coordinates: point,
  })
  Promise.resolve(refresh ? request.refresh().then(() => request) : request)
    .then(value => {
      if (cancelled) return
      // Unavailable is not an empty successful result; retain the last usable projection.
      if (!value.available) {
        failed = true
        return
      }
      result = { key: requestKey, context: value }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})

/** Save one existing neighbourhood ancestry path without changing division definitions.
 * @param paths The selected source path or an empty selection. @returns Nothing; persistence stays with the owning form.
 */
function changePaths(paths: AddressDivision[][]): void {
  if (stale) return
  onChange({
    ...address,
    divisionOverrides: {
      ...address.divisionOverrides,
      ...localityPathOverrides(paths),
    },
  })
}

/** Restore dynamic marker membership, including when a Location has inherited authored paths.
 * @returns Nothing; a null path supersedes inherited corrections.
 */
function resetPaths(): void {
  if (stale) return
  localityEditor?.close()
  onChange({
    ...address,
    divisionOverrides: {
      ...address.divisionOverrides,
      localityPath: null,
    },
  })
}
let localityEditor: AddressLocalityEditor | undefined = $state()
</script>

{#snippet divisionNode(division: AddressDivision)}
  {@const name = addressDivisionName(division, getLocaleKey())}
  {@const Icon =
    divisionIcons[division.class as keyof typeof divisionIcons] ?? divisionIcons.area}
  {@const factual = !Object.values(SUBJECTIVE_DIVISIONS).some(
    kind => kind === division.class,
  )}
  <div
    class="group/division flex min-w-0 items-start gap-2 py-1.5"
    data-tooltip={factual
      ? m.address_divisions_factual()
      : m.address_divisions_subjective()}
  >
    <Icon class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <div
      class="flex min-w-0 flex-1 {compact
        ? 'flex-col items-start gap-0'
        : 'items-baseline justify-between gap-2'}"
    >
      <span class="block text-sm leading-5 font-medium [overflow-wrap:anywhere]">
        {division.class === 'district' ? name.replace(/\s+District$/, '') : name}
      </span>
      <span class="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
        {labels[division.class] ?? divisionClassLabel(division.class)}
        {#if factual && isEditing}
          <LockIcon
            class="size-2.5 opacity-0 transition-opacity group-focus-within/division:opacity-100 group-hover/division:opacity-100"
            aria-label={m.address_divisions_factual()}
          />
        {/if}
      </span>
    </div>
  </div>
{/snippet}

<section
  class={`border-border space-y-1 border-t pt-5 ${className}`}
  aria-label={m.feature_address_divisions()}
  data-address-divisions
  aria-busy={loading}
>
  <div class="flex min-h-10 items-center justify-between gap-3">
    <h2 class="text-lg font-semibold">{m.feature_address_divisions()}</h2>
    <div class="flex items-center gap-1">
      <SimpleTooltip contentProps={{ role: 'tooltip' }}>
        {#snippet trigger()}
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-full transition"
            aria-label={m.address_divisions_about()}
          >
            <InfoIcon class="size-4" aria-hidden="true" />
          </button>
        {/snippet}
        <span class="block max-w-xs text-sm leading-5"
          >{m.address_divisions_policy()}</span
        >
      </SimpleTooltip>
      {#if onToggle}
        <button
          type="button"
          aria-label={m.address_divisions_hide()}
          data-tooltip={m.address_divisions_hide()}
          aria-expanded="true"
          class="text-muted-foreground hover:text-primary flex size-7 items-center justify-center rounded"
          onclick={onToggle}
        >
          <PanelRightIcon class="size-4" />
        </button>
      {/if}
    </div>
  </div>
  {#if loading}
    <p role="status" class={context ? 'sr-only' : 'text-muted-foreground text-sm'}>
      {m.feature_address_divisions_loading()}
    </p>
  {/if}
  {#if failed}
    <div role="alert" class="text-destructive text-sm">
      {m.feature_address_divisions_failed()}
      <button type="button" class="underline" onclick={() => retry++}>
        {m.address_divisions_retry()}
      </button>
    </div>
  {/if}
  {#if (!context && !loading && !failed) ||
    (context && !context.available && !isEditing)}
    <p role="status" class="text-muted-foreground text-sm">
      {m.feature_address_divisions_unloaded()}
    </p>
  {:else if context}
    <!-- Share one cell with the empty message while outgoing geography rows slide away. -->
    <div
      class="grid grid-cols-[minmax(0,1fr)] {sidebar
        ? ''
        : 'border-border/70 bg-background/40 rounded-xl border px-4'}"
    >
      <div class="divide-border/60 col-start-1 row-start-1 min-w-0 divide-y">
        {#each displayedGroups as group, groupIndex (group.key)}
          <section
            class="group/division-row grid gap-2 py-3 {sidebar && groupIndex === 0
              ? 'pt-1'
              : ''} {stacked ? '' : 'grid-cols-[6rem_minmax(0,1fr)] gap-x-3'}"
            aria-label={groupLabels[group.key]}
            data-division-group={group.key}
            transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
          >
            <div class="flex items-center justify-between gap-2">
              <h3
                class="text-muted-foreground pt-1.5 text-xs font-medium tracking-wide"
              >
                {groupLabels[group.key]}
              </h3>
              {#if isEditing && group.key === 'locality'}
                <button
                  type="button"
                  disabled={stale}
                  use:reverseTabStop
                  aria-label={m.address_divisions_from_marker()}
                  data-tooltip={m.address_divisions_from_marker()}
                  class="text-muted-foreground hover:bg-muted mt-1 flex size-7 items-center justify-center rounded-md opacity-0 transition-opacity group-focus-within/division-row:opacity-100 group-hover/division-row:opacity-100 focus-visible:opacity-100"
                  onclick={resetPaths}
                >
                  <ResetIcon class="size-3.5" aria-hidden="true" />
                </button>
              {/if}
            </div>
            <div
              class="min-w-0 space-y-2"
              class:opacity-50={stale}
              data-division-values-stale={stale}
            >
              {#if isEditing && group.key === 'locality' && context}
                <div inert={stale} aria-disabled={stale}>
                  <AddressLocalityEditor
                    bind:this={localityEditor}
                    paths={group.paths}
                    options={context.options}
                    node={divisionNode}
                    {labels}
                    onChange={changePaths}
                  />
                </div>
              {:else}
                {#each group.paths as path, pathIndex (pathIndex)}
                  <ol
                    class="flex flex-col items-stretch"
                    transition:slide={{
                      duration: prefersReducedMotion.current ? 0 : 200,
                    }}
                    aria-label={`${groupLabels[group.key]} ${pathIndex + 1}`}
                  >
                    {#each path as division, index (division.id)}
                      <li
                        class="relative min-w-0"
                        style:margin-left={`${index * 16}px`}
                        transition:slide={{
                          duration: prefersReducedMotion.current ? 0 : 180,
                        }}
                      >
                        {@render divisionNode(division)}
                        {#if index < path.length - 1}
                          <span
                            class="border-muted-foreground/35 pointer-events-none absolute top-7 -bottom-4 left-[7px] w-2 rounded-bl border-b border-l"
                            aria-hidden="true"
                          ></span>
                        {/if}
                      </li>
                    {/each}
                  </ol>
                {/each}
              {/if}
            </div>
          </section>
        {/each}
      </div>
      {#if displayedGroups.length === 0}
        <p class="text-muted-foreground col-start-1 row-start-1 py-4 text-sm">
          {m.feature_address_divisions_empty()}
        </p>
      {/if}
    </div>
  {/if}
</section>
