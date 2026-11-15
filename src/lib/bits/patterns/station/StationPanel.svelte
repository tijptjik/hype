<script lang="ts">
// SVELTE
import { onMount, tick, untrack } from 'svelte'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import { getLocale } from '#lib/i18n.js'
import { premisesLabel } from '#lib/indoor/premisesLabels.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { Checkbox } from '#lib/bits/custom/checkbox/index.js'
import { Select } from '#lib/bits/core/select/index.js'
import FilterBar from '#lib/bits/patterns/panels/components/common/FilterBar.svelte'
import CloseIcon from 'virtual:icons/proicons/cancel-circle'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import LocationIcon from 'virtual:icons/proicons/location'
import LayersIcon from 'virtual:icons/proicons/layers'
import LinkIcon from 'virtual:icons/proicons/link'
import ShareIcon from 'virtual:icons/proicons/share'
import CheckIcon from 'virtual:icons/proicons/checkmark'
import StationLevelLabel from './StationLevelLabel.svelte'
import { stationLevelOptions } from '#lib/indoor/levels.js'
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
// DATA
import { matches, value, type Place } from '#lib/indoor/model.js'
import {
  connectionCandidates,
  isConnector,
  isCirculation,
} from '#lib/indoor/spatial.js'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'
let { model }: { model: ResourcePanelModel } = $props()
const app = getAppCtx(),
  station = app.station
let canShare = $state(false)
let shareStatus = $state('')
let shareError = $state('')
let succeeded = $state({ copy: false, share: false })
const feedbackTimers: Partial<Record<'copy' | 'share', ReturnType<typeof setTimeout>>> =
  {}
onMount(() => {
  canShare = typeof navigator.share === 'function'
  return () => {
    for (const timer of Object.values(feedbackTimers)) clearTimeout(timer)
  }
})
/** Copy the current link or open the native share sheet.
 * @param copy Whether to copy instead of opening native sharing.
 * @returns Resolves after the browser action finishes.
 * @remarks Cancellation is silent; unsupported browsers only offer copying.
 */
async function share(copy = false): Promise<void> {
  const url = window.location.href
  const action = copy ? 'copy' : 'share'
  shareError = ''
  shareStatus = ''
  clearTimeout(feedbackTimers[action])
  succeeded[action] = false
  try {
    if (copy) await navigator.clipboard.writeText(url)
    else await navigator.share({ title: station.selected?.name.en, url })
    // Keep success feedback in the activated button, then restore its original icon.
    succeeded[action] = true
    shareStatus = copy ? 'Link copied' : 'Link shared'
    feedbackTimers[action] = setTimeout(() => {
      succeeded[action] = false
    }, 2000)
  } catch (error) {
    shareError =
      error instanceof Error && error.name === 'AbortError'
        ? ''
        : 'Could not share the link. Copy it from the address bar.'
  }
}
let query = $state('')
let showCirculation = $state(false)
let showAmenities = $state(true)
let indexOpen = $state(true)
let levelsOpen = $state(true)
/** Use the shared facility terminology while preserving shop spelling. @param place Directory entry. @returns Display name. */
function displayName(place: Place): string {
  return place.name.en
}
const levels = $derived(
  station.data?.level_polygon.features.toSorted(
    (a, b) => Number(b.properties.level_ordinal) - Number(a.properties.level_ordinal),
  ) ?? [],
)
const levelName = (id: string) =>
  value(
    levels.find(f => f.properties.level_id === id)?.properties ?? {},
    'level_name_en',
  )
const levelOptions = $derived(
  stationLevelOptions(levels).filter(option => option.value !== 'all'),
)
const entries = $derived(
  station.entries.filter(
    p =>
      !/^railway tracks?$/i.test(p.name.en.trim()) &&
      (p.id === station.selected?.id ||
        (matches(p, query) &&
          (p.kind !== 'shop' && isCirculation(p.category)
            ? showCirculation
            : showAmenities))),
  ),
)
const connections = $derived(
  station.data
    ? connectionCandidates(station.data).filter(
        c => station.showInferred || c.evidence !== 'aligned-footprints',
      )
    : [],
)
const selected = $derived(station.selected)
const placement = $derived(
  selected?.feature.properties.display_address as Record<string, string> | undefined,
)
const targets = $derived.by(() => {
  const unit = selected?.feature.properties.unit_id
  return connections
    .filter(c => c.from === unit || c.to === unit)
    .flatMap(c => {
      const target = c.from === unit ? c.to : c.from
      const place = station.entries.find(
        p => p.kind === 'facility' && p.feature.properties.unit_id === target,
      )
      return place ? [{ place, direction: c.from === unit ? '↑ Up' : '↓ Down' }] : []
    })
})
/** Expand a directory entry without closing its panel. @param place Selected place. @returns Nothing. */
function select(place: Place): void {
  station.select(place)
}
let listViewport: HTMLDivElement | undefined = $state()
let listContent: HTMLDivElement | undefined = $state()
let listHeight = $state(0)
// Reveal selected map anchors even when the directory was collapsed or filtered.
$effect(() => {
  if (selected?.id) indexOpen = true
})
$effect(() => {
  const id = selected?.id
  const viewport = listViewport
  const content = listContent
  if (!id || !viewport || !content || !model.open || model.panel.isNarrow) return
  let disposed = false
  const center = (): void => {
    const row = [...content.querySelectorAll<HTMLElement>('[data-place-row]')].find(
      element => element.dataset.placeRow === id,
    )
    if (!row || disposed) return
    const box = row.getBoundingClientRect()
    const outer = viewport.getBoundingClientRect()
    viewport.scrollTo({
      top:
        viewport.scrollTop +
        box.top -
        outer.top +
        box.height / 2 -
        viewport.clientHeight / 2,
      behavior: prefersReducedMotion.current ? 'instant' : 'smooth',
    })
  }
  const observer = new ResizeObserver(center)
  void tick().then(() => {
    if (disposed) return
    observer.observe(content, { box: 'border-box' })
    observer.observe(viewport)
    untrack(center)
  })
  return () => {
    disposed = true
    observer.disconnect()
  }
})
</script>
{#snippet itemLabel(id: string)}
  {@const option = levelOptions.find(option => option.value === id)}
  {#if option}
    <StationLevelLabel {option} />
  {:else}
    <span>Choose a level</span>
  {/if}
{/snippet}
{#snippet itemPreview(id: string)}
  {@const option = levelOptions.find(option => option.value === id)}
  <span class="text-muted-foreground whitespace-nowrap">
    {[option?.exit ? `Exit ${option.exit}` : '', option?.line]
      .filter(Boolean)
      .join(' · ')}
  </span>
{/snippet}
<PanelRoot
  {...model.panel}
  isOpen={model.open}
  preserveContentWidth={!model.panel.isNarrow}
>
  <section
    class="bg-panel text-base-content flex h-full min-h-0 flex-col"
    aria-label="Station layout panel"
  >
    <header
      class="border-border flex h-18 shrink-0 items-center gap-3 border-b px-2 {model
        .panel.isNarrow
        ? 'justify-center'
        : 'justify-between px-4'}"
    >
      {#if !model.panel.isNarrow}
        <h2 class="text-primary text-lg font-medium tracking-widest uppercase">
          {premisesLabel(station.metadata, getLocale())}
        </h2>
      {/if}
      <button
        type="button"
        data-sidebar-toggle
        class="text-base-content hover:bg-surface focus-visible:outline-focus shrink-0 rounded-full p-2 focus-visible:outline-2"
        aria-label={model.panel.isNarrow
          ? 'Expand station panel'
          : 'Close station panel'}
        aria-expanded={!model.panel.isNarrow}
        aria-controls="left-panel"
        onclick={model.onClose}
      >
        <CloseIcon class="size-8" aria-hidden="true" />
      </button>
    </header>
    {#if !model.panel.isNarrow}
      <div class="flex min-h-0 flex-1 flex-col">
        {#if station.loading}
          <div
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
            role="status"
            aria-label="Loading indoor panel"
            aria-busy="true"
          >
            <div class="border-border shrink-0 border-b">
              <div class="flex h-14 items-center gap-5 px-5">
                <Skeleton class="size-5" />
                <Skeleton class="h-4 w-20" />
                <Skeleton class="ml-auto size-4" />
              </div>
              <div class="px-4 pb-4"><Skeleton class="h-10 w-full" /></div>
            </div>
            <div class="flex h-14 shrink-0 items-center gap-5 px-5">
              <Skeleton class="size-5" />
              <Skeleton class="h-4 w-36" />
              <Skeleton class="ml-auto size-4" />
            </div>
            <div class="px-4 pb-4"><Skeleton class="h-11 w-full" /></div>
            <div class="grid gap-1 overflow-hidden px-4 pb-4">
              {#each Array(8) as _, index (index)}
                <div class="space-y-2 px-3 py-3">
                  <Skeleton class={index % 2 ? 'h-4 w-2/3' : 'h-4 w-1/2'} />
                  <Skeleton class="h-3 w-1/3" />
                </div>
              {/each}
            </div>
          </div>
        {:else if station.data}
          <section class="border-border shrink-0 border-b" aria-label="Levels">
            <div class="flex items-center gap-3 px-5">
              <button
                type="button"
                class="text-primary focus-visible:outline-focus flex h-14 min-w-0 flex-1 items-center gap-5 text-left text-sm tracking-[0.1em] uppercase"
                aria-expanded={levelsOpen}
                aria-controls="station-level-selector"
                onclick={() => (levelsOpen = !levelsOpen)}
              >
                <LayersIcon class="size-5" aria-hidden="true" />
                <span class="flex-1">Levels</span>
                <ChevronDown
                  class="size-4 transition-transform {levelsOpen ? '' : '-rotate-90'}"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="text-primary focus-visible:outline-focus shrink-0 rounded px-2 py-1 text-xs underline underline-offset-4"
                onclick={() => station.selectLevel('all')}
              >
                Show All
              </button>
            </div>
            {#if levelsOpen}
              <div id="station-level-selector">
                <div class="px-4 pb-4">
                  <Select
                    triggerAttrs={{
                      'aria-label': station.isBuilding
                        ? 'Venue level'
                        : 'Station level',
                    }}
                    value={station.exploded ? '' : station.floor}
                    placeholder="Choose a level"
                    contentClass="max-h-[var(--bits-select-content-available-height)]!"
                    items={levelOptions}
                    {itemLabel}
                    {itemPreview}
                    onValueChange={next => station.selectLevel(next)}
                  />
                </div>
              </div>
            {/if}
          </section>
          <button
            type="button"
            class="text-primary focus-visible:outline-focus flex h-14 shrink-0 items-center gap-5 px-5 text-left text-sm tracking-[0.1em] uppercase"
            aria-expanded={indexOpen}
            aria-controls="station-location-index"
            onclick={() => (indexOpen = !indexOpen)}
          >
            <LocationIcon class="size-5" aria-hidden="true" />
            <span class="flex-1">Places</span>
            <ChevronDown
              class="size-4 transition-transform {indexOpen ? '' : '-rotate-90'}"
              aria-hidden="true"
            />
          </button>
          {#if indexOpen}
            <div id="station-location-index" class="flex min-h-0 flex-1 flex-col">
              <FilterBar bind:searchTerm={query} label="Search places" />
              <div
                bind:this={listViewport}
                bind:clientHeight={listHeight}
                data-place-scroll
                class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4"
              >
                {#if station.data.coordinateSpace === 'image-pixels'}
                  <p class="text-muted-foreground text-xs">
                    Schematic floor directory. Vector shops and facilities follow the
                    official plan. Use Map settings → Original plan opacity to compare;
                    distances and walking routes are unavailable.
                  </p>
                {/if}
                <section
                  bind:this={listContent}
                  class="grid shrink-0 gap-1 transition-[padding] duration-240 motion-reduce:transition-none"
                  style:padding-block={selected ? `${listHeight / 2}px` : '0px'}
                  aria-label="Places"
                >
                  {#each entries as place (place.id)}
                    <div data-place-row={place.id} class="grid">
                      {#if selected && selected.id === place.id}
                        <section
                          aria-label="Station place details"
                          class="bg-surface rounded-xl p-4"
                          transition:slide={{
                            duration: prefersReducedMotion.current ? 0 : 240,
                          }}
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="text-primary text-xs">
                                {selected.code ||
                                  (selected.kind === 'shop' ? 'Shop' : 'Facility')}
                              </p>
                              <h3 class="font-semibold">{displayName(selected)}</h3>
                              {#if placement}
                                <p class="mt-2 text-sm break-words whitespace-normal">
                                  {placement.en}
                                </p>
                                <p class="mt-1 text-sm break-words whitespace-normal">
                                  {placement['zh-Hant']}
                                </p>
                              {/if}
                            </div>
                            <button
                              aria-label="Close place details"
                              type="button"
                              class="text-muted-foreground px-2"
                              onclick={() => station.openFloor(station.floor)}
                            >
                              ×
                            </button>
                          </div>
                          <p class="text-muted-foreground mt-2 text-xs">
                            {levelName(selected.levelId)}
                            · {selected.area}
                          </p>
                          <div class="text-primary mt-3 flex justify-end gap-1">
                            {#each ['copy', 'share'] as action}
                              {#if action === 'copy' || canShare}
                                {@const success =
                                  action === 'copy' ? succeeded.copy : succeeded.share}
                                <button
                                  type="button"
                                  aria-label={action === 'copy' ? 'Copy link' : 'Share'}
                                  title={action === 'copy' ? 'Copy link' : 'Share'}
                                  class="hover:bg-panel focus-visible:outline-focus relative rounded-full p-2"
                                  onclick={() => share(action === 'copy')}
                                >
                                  <span
                                    class="block transition-[opacity,transform] duration-200 motion-reduce:transition-none"
                                    class:opacity-0={success}
                                    class:scale-75={success}
                                  >
                                    {#if action === 'copy'}
                                      <LinkIcon class="size-5" aria-hidden="true" />
                                    {:else}
                                      <ShareIcon class="size-5" aria-hidden="true" />
                                    {/if}
                                  </span>
                                  <span
                                    class="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200 motion-reduce:transition-none"
                                    class:opacity-0={!success}
                                    class:scale-75={!success}
                                    data-share-success={success}
                                  >
                                    <CheckIcon class="size-5" aria-hidden="true" />
                                  </span>
                                </button>
                              {/if}
                            {/each}
                          </div>
                          <p role="status" class="sr-only">{shareStatus}</p>
                          {#if shareError}
                            <p role="alert" class="mt-2 text-xs">{shareError}</p>
                          {/if}
                          {#if selected.kind === 'shop' && !selected.code}
                            <p class="text-muted-foreground mt-2 text-xs">
                              The source does not supply a shop code.
                            </p>
                          {/if}
                          {#if selected.occupants.length > 1}
                            <p class="text-muted-foreground mt-2 text-xs">
                              {selected.occupants.length}
                              occupant records share this source unit; separate shop
                              boundaries are not supplied.
                            </p>
                          {/if}
                          {#if isConnector(selected.category)}
                            {#each targets as target}
                              <button
                                type="button"
                                class="text-primary border-border mt-3 w-full rounded-lg border p-2 text-left text-xs"
                                onclick={() => select(target.place)}
                              >
                                {target.direction}
                                to {levelName(target.place.levelId)}
                              </button>
                            {/each}
                            {#if targets.length}
                              <p class="text-muted-foreground mt-2 text-xs">
                                {station.showInferred
                                  ? 'Possible connection; verify signage at the venue.'
                                  : 'Connection from matching source lift codes.'}
                              </p>
                            {/if}
                          {/if}
                        </section>
                      {:else}
                        <button
                          type="button"
                          class="hover:bg-surface focus-visible:outline-primary rounded-lg px-3 py-2 text-left"
                          aria-pressed={selected?.id === place.id}
                          onclick={() => select(place)}
                        >
                          <span class="text-sm font-medium">{displayName(place)}</span>
                          {#if place.code}
                            <span class="text-primary ml-2 text-xs">{place.code}</span>
                          {/if}
                          <span class="text-muted-foreground block text-xs"
                            >{levelName(place.levelId)}</span
                          >
                        </button>
                      {/if}
                    </div>
                  {/each}
                  {#if !entries.length}
                    <p class="text-muted-foreground py-4 text-sm">
                      No matching shops or facilities.
                    </p>
                  {/if}
                </section>
                {#if showAmenities && station.data.unmappedPlaces?.length}
                  <section
                    aria-label="Unmapped directory entries"
                    class="text-muted-foreground text-xs"
                  >
                    <p>The source lists these shops without mapped shapes:</p>
                    {#each station.data.unmappedPlaces as place}
                      <p>{place.name} · {place.code} · Level {place.level}</p>
                    {/each}
                  </section>
                {/if}
              </div>
              <fieldset
                class="border-border min-w-0 shrink-0 border-t px-4 py-2"
                aria-label="Place types"
              >
                <p class="text-muted-foreground text-xs font-medium">Show in Places</p>
                <div class="grid grid-cols-2 gap-x-3">
                  <div
                    class="flex min-h-11 items-center"
                    title="Corridors, stairs, lifts and gates"
                  >
                    <Checkbox
                      bind:checked={showCirculation}
                      rightText="Circulation"
                      size="sm"
                    />
                  </div>
                  <div
                    class="flex min-h-11 items-center"
                    title="Shops, toilets and passenger services"
                  >
                    <Checkbox
                      bind:checked={showAmenities}
                      rightText="Amenities"
                      size="sm"
                    />
                  </div>
                </div>
              </fieldset>
            </div>
          {/if}
        {:else}
          {#if station.isBuilding}
            {#each station.documents as document}
              <a
                class="text-primary underline"
                href={document.path}
                target="_blank"
                rel="noreferrer"
                >Official floor directory ↗</a
              >
            {/each}
          {/if}
          <p class="text-muted-foreground text-sm">
            {station.isBuilding
              ? 'The official floor directory is linked in the map panel. No interactive map is published for this premises.'
              : 'Official PDF maps are available in the map panel. Interactive floor plans are not available for this station yet.'}
          </p>
        {/if}
      </div>
    {/if}
  </section>
</PanelRoot>
