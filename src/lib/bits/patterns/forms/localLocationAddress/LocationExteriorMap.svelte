<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// ADDRESS
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
import { getLocaleKey } from '#lib/i18n.js'
import { recordedBuildingName } from '#lib/locations/kinds.i18n.js'
// API
import {
  findLocationExteriorCandidates,
  getLocationExterior,
  importLocationExterior,
  removeLocationExteriorSlice,
} from '#lib/api/locationExterior.remote.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/boxes'
import FacadeIcon from 'virtual:icons/lucide/building'
import AddressIcon from 'virtual:icons/lucide/sparkles'
import SearchIcon from 'virtual:icons/lucide/search'
import SliceIcon from 'virtual:icons/lucide/box'
import TrashIcon from 'virtual:icons/lucide/trash-2'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import type { ExteriorSlice } from '#lib/locations/exterior/assembly.js'
import ExteriorFootprintPicker from './ExteriorFootprintPicker.svelte'
import ExteriorTextureSlider from './ExteriorTextureSlider.svelte'
import FacadeReview from './FacadeReview.svelte'
import type { ModelViewerElement } from '@google/model-viewer'
import type { LocationFacts } from '#lib/locations/model.js'

let {
  locationId,
  coordinates,
  facts,
}: { locationId: string; coordinates: [number, number]; facts: LocationFacts } =
  $props()
const displayAddress = $derived(
  getAddressDisplay(
    {
      version: 1,
      source: facts.location.address,
      coordinates: facts.location.geometry.coordinates,
      matchStatus: facts.location.address.status,
      overrides: {},
    },
    getLocaleKey(),
    [],
    'building',
    facts.location.geometry.coordinates,
  ),
)
let result = $state<Awaited<ReturnType<typeof getLocationExterior>> | null>(null)
const model = $derived(result?.model ?? null)
let removalQueue = $state<string[]>([])
const savedSlices = $derived(
  (result?.slices ?? []).filter(slice => !removalQueue.includes(slice.modelId)),
)
const includedFootprints = $derived([
  ...new Set(
    savedSlices.flatMap(slice => (slice.footprintId ? [slice.footprintId] : [])),
  ),
])
const selectedAlreadyAdded = $derived(
  savedSlices.some(slice => slice.modelId === selected),
)
let candidates = $state<Awaited<
  ReturnType<typeof findLocationExteriorCandidates>
> | null>(null)
let textureBlend = $state(1)
const viewModes = ['Facade', '3D'] as const
let viewMode = $state<(typeof viewModes)[number]>('Facade')
let associating = $state(false)
let footprintSearch = $state('')
let searchOpen = $state(false)
const searchResults = $derived.by(() => {
  const query = footprintSearch.trim().toLocaleLowerCase()
  if (!query) return []
  return (candidates?.footprints.features ?? [])
    .map(item => {
      const text = [item.properties.name, item.properties.nameZh, item.properties.csuid]
        .join(' ')
        .toLocaleLowerCase()
      const direct = text.indexOf(query)
      let cursor = 0
      let gaps = 0
      for (const character of query.replace(/\s/g, '')) {
        const next = text.indexOf(character, cursor)
        if (next < 0) return { item, score: Infinity }
        gaps += next - cursor
        cursor = next + 1
      }
      return { item, score: direct >= 0 ? direct : 1000 + gaps }
    })
    .filter(row => Number.isFinite(row.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
})
/** Select a footprint from either discovery surface. @param id Government footprint ID. @returns Nothing. */
function selectFootprint(id: string): void {
  selectedFootprint = id
  const chosen = candidates?.footprints.features.find(
    item => item.properties.csuid === id,
  )
  const suggestions = chosen
    ? (candidates?.candidates.filter(
        item => item.id.slice(1, 11) === chosen.properties.geoRef,
      ) ?? [])
    : []
  selected = suggestions.length === 1 ? suggestions[0].id : ''
  selectedEvidence = []
  sliceLabel = ''
  searchOpen = false
}
let selected = $state('')
let selectedEvidence = $state<string[]>([])
let sliceLabel = $state('')
let pendingSlices = $state<Omit<ExteriorSlice, 'sheet'>[]>([])
let importing = $state(false)
let refreshing = $state(false)
let deletionMode = $state(false)
let pendingSaved = $state(false)
let activeBatch = $state<Omit<ExteriorSlice, 'sheet'>[]>([])
const selectedQueued = $derived(pendingSlices.some(slice => slice.modelId === selected))
const displayedSlices = $derived([
  ...savedSlices.filter(
    slice => !pendingSlices.some(pending => pending.modelId === slice.modelId),
  ),
  ...pendingSlices,
])
let hoveredModelId = $state('')
let focusedModelId = $state('')
let mapHoverId = $state('')
const previewModelId = $derived(hoveredModelId || (mapHoverId ? '' : focusedModelId))
const highlightedFootprint = $derived(
  (mapHoverId
    ? displayedSlices.find(slice => slice.footprintId === mapHoverId)
    : displayedSlices.find(slice => slice.modelId === previewModelId)
  )?.footprintId ?? '',
)
let selectedFootprint = $state('')
const footprint = $derived(
  candidates?.footprints.features.find(
    item => item.properties.csuid === selectedFootprint,
  ),
)
const matchingModels = $derived(
  footprint
    ? (candidates?.candidates.filter(
        item => item.id.slice(1, 11) === footprint.properties.geoRef,
      ) ?? [])
    : [],
)
let busy = $state(true)
let message = $state('')
let viewerHost = $state<HTMLDivElement>()
let viewerReady = $state(false)
let modelLoading = $state(true)
let failedComparison = $state('')
const comparisonFile = $derived(
  model?.comparisonFile && model.comparisonFile !== failedComparison
    ? model.comparisonFile
    : null,
)
/** Recover the upstream model when comparison resources fail. @returns Nothing. */
function useGovernmentModel(): void {
  failedComparison = model?.comparisonFile ?? ''
  message = 'Facade comparison unavailable. Showing the government model.'
}
let analysisViewer = $state.raw<ModelViewerElement>()

/** Refresh the linked model after loading or importing. @returns Completion. */
async function refresh(): Promise<void> {
  const query = getLocationExterior({ locationId })
  await query.refresh()
  result = await query
  if (!result.slices.length) deletionMode = false
}

onMount(() => {
  let disposed = false
  void Promise.all([import('@google/model-viewer'), refresh()])
    .then(() => {
      if (!disposed) viewerReady = true
    })
    .catch(() => {
      if (!disposed) message = 'Could not load the exterior model.'
    })
    .finally(() => {
      if (!disposed) busy = false
    })
  return () => {
    disposed = true
  }
})

$effect(() => {
  if (!viewerHost || !viewerReady || !model) return
  modelLoading = true
  analysisViewer = undefined
  const viewer = document.createElement('model-viewer')
  let disposed = false
  viewer.addEventListener('load', () => {
    if (disposed) return
    modelLoading = false
    analysisViewer = viewer as ModelViewerElement
  })
  viewer.addEventListener('error', () => {
    if (disposed) return
    modelLoading = false
    if (comparisonFile) useGovernmentModel()
    else message = 'Could not display the exterior model.'
  })
  viewer.setAttribute(
    'src',
    comparisonFile ? model.url.replace(/[^/]+$/, comparisonFile) : model.url,
  )
  viewer.setAttribute('camera-controls', '')
  viewer.setAttribute('auto-rotate', '')
  viewer.setAttribute('alt', 'Building exterior model')
  viewer.style.width = '100%'
  viewer.style.height = '100%'
  viewerHost.replaceChildren(viewer)
  return () => {
    disposed = true
    viewer.remove()
  }
})

/** Re-fetch every reviewed slice with its current upstream textures. @returns Completion. */
async function refreshModels(): Promise<void> {
  if (!model || refreshing || importing) return
  refreshing = true
  message = ''
  try {
    await importLocationExterior({
      locationId,
      coordinates,
      expectedAssetId: model.assetId,
      slices: [],
      refreshAll: true,
    })
    await refresh()
    message =
      'Current upstream models and textures fetched. Texture quality depends on the published source.'
  } catch (error) {
    console.error('CSDI refresh failed', error)
    message =
      'Could not refresh all models. Reload to check the saved model before retrying.'
  } finally {
    refreshing = false
  }
}

/** Hide the slice immediately and save queued removals against successive assembly revisions.
 * @param modelId Source model selected in the Building slices list.
 * @returns Completion after enqueueing, or after draining the queue for its first caller.
 */
async function removeSlice(modelId: string): Promise<void> {
  if (
    !savedSlices.some(slice => slice.modelId === modelId) ||
    importing ||
    refreshing ||
    pendingSlices.length
  )
    return
  removalQueue.push(modelId)
  if (hoveredModelId === modelId) hoveredModelId = ''
  if (focusedModelId === modelId) focusedModelId = ''
  if (removalQueue.length > 1) return

  message = ''
  const failed: string[] = []
  while (removalQueue.length && result?.model) {
    const id = removalQueue[0]
    const expectedAssetId: string = result.model.assetId
    try {
      const saved = await removeLocationExteriorSlice({
        locationId,
        modelId: id,
        expectedAssetId,
      })
      result = {
        ...result,
        model: saved,
        slices: result.slices.filter(slice => slice.modelId !== id),
      }
      if (!saved) deletionMode = false
    } catch (error) {
      console.error('Exterior slice removal failed', error)
      // Confirm the current revision before applying any remaining clicks.
      try {
        await refresh()
      } catch {
        removalQueue = []
        message =
          'Could not verify the removals. Reload to see the saved building slices.'
        return
      }
      if (result?.model?.assetId !== expectedAssetId) {
        removalQueue = []
        message =
          'The exterior changed. Review the current slices before removing more.'
        return
      }
      failed.push(id)
      message = `Could not remove: ${failed.join(', ')}. You can retry those slices.`
    }
    removalQueue.shift()
  }
}

/** Search the CSDI sheet covering the Building. @returns Completion. */
async function search(): Promise<void> {
  if (!associating) {
    deletionMode = false
    hoveredModelId = ''
    focusedModelId = ''
    mapHoverId = ''
    footprintSearch = recordedBuildingName(facts.names) || displayAddress
    searchOpen = false
  }
  associating = true
  busy = true
  message = ''
  try {
    const query = findLocationExteriorCandidates({ locationId, coordinates })
    await query.refresh()
    candidates = await query
    selected = ''
    selectedFootprint = ''
    if (!candidates.candidates.length)
      message = 'No building models were found on this map sheet.'
  } catch (error) {
    console.error('CSDI model search failed', error)
    message = 'Could not find CSDI building models. Please retry.'
  } finally {
    busy = false
  }
}

/** Add the explicitly reviewed footprint/model mapping to the import queue. @returns Nothing. */
function queueSlice(): void {
  if (!selected || selectedAlreadyAdded || selectedQueued) return
  pendingSlices = [
    ...pendingSlices.filter(item => item.modelId !== selected),
    {
      modelId: selected,
      footprintId: selectedFootprint || undefined,
      label:
        sliceLabel.trim() ||
        footprint?.properties.name ||
        footprint?.properties.nameZh ||
        undefined,
      evidenceKeys: [...selectedEvidence],
    },
  ]
  selected = ''
  selectedFootprint = ''
  selectedEvidence = []
  sliceLabel = ''
}
/** Import the source models chosen by the user. @returns Completion. */
async function importModel(): Promise<void> {
  if (!pendingSlices.length || importing) return
  importing = true
  message = ''
  try {
    // Snapshot each batch; selections queued during its download belong to the next import.
    while (pendingSlices.length) {
      if (!pendingSaved) {
        activeBatch = [...pendingSlices]
        await importLocationExterior({
          locationId,
          coordinates,
          expectedAssetId: model?.assetId ?? null,
          slices: activeBatch,
        })
        pendingSaved = true
      }
      // If refresh fails, retry it without downloading the successfully saved batch again.
      await refresh()
      const savedIds = new Set(activeBatch.map(slice => slice.modelId))
      pendingSlices = pendingSlices.filter(slice => !savedIds.has(slice.modelId))
      pendingSaved = false
      activeBatch = []
    }
  } catch (error) {
    console.error('CSDI model import failed', error)
    message = pendingSaved
      ? 'Slices were saved, but the list could not refresh. Retry to continue.'
      : 'Could not import model slices. Retry to continue the queue.'
  } finally {
    importing = false
  }
}
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if message}
    <p role="alert" class="text-destructive border-b px-5 py-3 text-sm">{message}</p>
  {/if}
  {#if !result && !busy && message}
    <div class="flex min-h-[32rem] flex-1 items-center justify-center">
      <Button
        text="Retry loading exterior"
        onClick={() => {
          busy = true
          message = ''
          void refresh()
            .catch(() => (message = 'Could not load the exterior model.'))
            .finally(() => (busy = false))
        }}
      />
    </div>
  {:else if !result || (associating && !candidates && busy && !model)}
    <div
      role="status"
      aria-label="Loading exterior workspace"
      class="flex min-h-[32rem] flex-1 flex-col gap-4 p-5"
    >
      <div class="bg-muted h-12 animate-pulse rounded-lg"></div>
      <div class="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="bg-muted min-h-80 animate-pulse rounded-lg"></div>
        <div class="space-y-4">
          <div class="bg-muted h-64 animate-pulse rounded-lg"></div>
          <div class="bg-muted h-40 animate-pulse rounded-lg"></div>
        </div>
      </div>
    </div>
  {:else if !associating && !model}
    <div class="flex min-h-[32rem] flex-1 items-center justify-center p-8">
      <div class="flex max-w-sm flex-col items-center gap-5 text-center">
        <div
          class="bg-primary/10 text-primary flex size-24 items-center justify-center rounded-full"
        >
          <BuildingIcon class="size-12" />
        </div>
        <h2 class="text-xl font-semibold">Building exterior</h2>
        <p class="text-muted-foreground text-sm">
          Bring the building together with its 3D model slices.
        </p>
        {#if result.canImport}
          <Button text="Associate 3D Models" onClick={search} />
        {/if}
      </div>
    </div>
  {:else if associating}
    <header
      class="border-border relative z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3"
    >
      {#if displayAddress}
        <p
          class="text-foreground flex max-w-full min-w-0 items-center gap-2 text-sm font-medium"
        >
          <AddressIcon
            class="text-muted-foreground size-5 shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 break-words">{displayAddress}</span>
        </p>
      {/if}
      <div class="relative min-w-0 flex-[1_1_16rem]">
        <SearchIcon class="text-muted-foreground absolute top-3 left-3 size-5" />
        <input
          aria-label="Search building footprints"
          placeholder="Search buildings by name or footprint ID"
          class="border-border w-full rounded-lg border py-2.5 pr-3 pl-10"
          bind:value={footprintSearch}
          oninput={() => (searchOpen = true)}
          onfocus={() => (searchOpen = true)}
          onkeydown={event => {
            if (event.key === 'Escape') searchOpen = false
          }}
          disabled={!candidates || busy}
        >
        {#if searchOpen && footprintSearch.trim()}
          <div
            class="border-border bg-panel text-foreground absolute top-full right-0 left-0 mt-1 max-h-80 overflow-y-auto rounded-lg border p-1 shadow-lg"
          >
            {#each searchResults as { item } (item.properties.csuid)}
              <button
                type="button"
                class="hover:bg-muted grid w-full gap-1 rounded px-3 py-2 text-left text-sm"
                onclick={() => selectFootprint(item.properties.csuid)}
              >
                <span class="font-medium"
                  >{item.properties.name ||
                    item.properties.nameZh ||
                    'Unnamed building'}</span
                >
                <span class="text-muted-foreground"
                  >{includedFootprints.includes(item.properties.csuid)
                    ? 'Added · '
                    : ''}{item.properties.csuid}</span
                >
              </button>
            {:else}
              <p class="text-muted-foreground px-3 py-3 text-sm">
                No matching footprints in this area.
              </p>
            {/each}
          </div>
        {/if}
      </div>
      {#if model}
        <Button
          text="View 3D model"
          disabled={busy || removalQueue.length > 0}
          onClick={() => {
            viewMode = '3D'
            associating = false
          }}
        />
      {/if}
    </header>
    <div class="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
      {#if candidates}
        <ExteriorFootprintPicker
          {coordinates}
          footprints={candidates.footprints}
          {selectedFootprint}
          {includedFootprints}
          {highlightedFootprint}
          onhover={id => (mapHoverId = id)}
          onselect={selectFootprint}
          class="h-full min-h-[28rem] rounded-none border-0"
        />
      {:else if busy}
        <div
          role="status"
          aria-label="Loading building footprints"
          class="bg-muted min-h-80 animate-pulse"
        ></div>
      {:else}
        <div class="flex flex-1 items-center justify-center p-8">
          <Button text="Retry loading footprints" onClick={search} />
        </div>
      {/if}
      <aside class="border-border flex min-h-0 flex-col border-l">
        {#if candidates}
          <section
            aria-label="Associate model slice"
            class="max-h-[60vh] space-y-4 overflow-y-auto p-5"
          >
            <h2 class="flex items-center gap-2 font-semibold">
              <SliceIcon class="size-5" />Associate model slice
            </h2>
            {#if footprint}
              <p class="text-sm font-medium">
                {footprint.properties.name ||
                  footprint.properties.nameZh ||
                  'Unnamed building'}
              </p>
            {:else}
              <p class="text-muted-foreground text-sm">
                Select a footprint on the map or search above.
              </p>
            {/if}
            {#if matchingModels.length}
              <div class="space-y-2">
                <p class="text-muted-foreground text-xs">
                  Suggested models · review before adding
                </p>
                <div class="flex flex-wrap gap-2">
                  {#each matchingModels as candidate (candidate.id)}
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selected === candidate.id}
                      class="border-border aria-pressed:bg-primary/10 aria-pressed:border-primary rounded border px-3 py-2 text-sm"
                      onclick={() => (selected = candidate.id)}
                    >
                      {candidate.id}{savedSlices.some(
                        slice => slice.modelId === candidate.id,
                      )
                        ? ' · Added'
                        : ''}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <label class="grid gap-1 text-sm"
              >Building model ID
              <select
                class="border-border bg-surface text-foreground w-full rounded-lg border px-3 py-2"
                bind:value={selected}
                disabled={busy}
              >
                <option value="">Choose a model</option>
                {#each candidates.candidates as candidate (candidate.id)}
                  <option value={candidate.id}>
                    {candidate.id}{savedSlices.some(
                      slice => slice.modelId === candidate.id,
                    )
                      ? ' · Added'
                      : ''}
                  </option>
                {/each}
              </select>
            </label>
            <label class="grid gap-1 text-sm"
              >Slice label or address
              <input
                class="border-border rounded-lg border px-3 py-2"
                bind:value={sliceLabel}
                disabled={busy}
                placeholder="Optional"
              >
            </label>
            {#if result.evidence.length}
              <fieldset class="space-y-2">
                <legend class="mb-2 text-sm font-medium">
                  Corresponding evidence
                  <span class="text-muted-foreground font-normal">(optional)</span>
                </legend>
                {#each result.evidence as item (item.key)}
                  <label class="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      bind:group={selectedEvidence}
                      value={item.key}
                      disabled={busy}
                    >
                    <span class="min-w-0 break-words">{item.label}</span>
                  </label>
                {/each}
              </fieldset>
            {/if}
            {#if selectedAlreadyAdded}
              <p class="text-sm text-sky-700">
                This model slice is already included in the building.
              </p>
            {/if}
            <Button
              text={selectedAlreadyAdded
                ? 'Already added'
                : selectedQueued
                  ? 'Queued'
                  : 'Add slice to building'}
              disabled={busy ||
                removalQueue.length > 0 ||
                refreshing ||
                !selected ||
                selectedAlreadyAdded ||
                selectedQueued}
              onClick={() => {
                queueSlice()
                void importModel()
              }}
            />
          </section>
        {/if}
        <section
          aria-label="Building model slices"
          class="border-border flex min-h-48 flex-1 flex-col border-t"
        >
          <div class="flex items-center gap-2 px-5 py-4">
            <h3 class="flex flex-1 items-center justify-between font-semibold">
              Building slices
              <span class="bg-muted rounded-full px-2 py-0.5 text-xs"
                >{displayedSlices.length}</span
              >
            </h3>
            {#if result.canImport && savedSlices.length}
              <Button
                text="Slice deletion mode"
                iconComponent={TrashIcon}
                modifier="square"
                size="sm"
                color={deletionMode ? 'error' : 'neutral'}
                style={deletionMode ? 'soft' : 'ghost'}
                attrs={{
                  title: deletionMode ? 'Exit deletion mode' : 'Remove building slices',
                  'aria-pressed': deletionMode,
                }}
                onClick={() => (deletionMode = !deletionMode)}
              />
            {/if}
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <ul class="divide-border divide-y">
              {#each displayedSlices as slice (slice.modelId)}
                {@const pending = pendingSlices.some(
                  item => item.modelId === slice.modelId,
                )}
                <li
                  class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-3 px-5 py-4 data-highlighted:bg-amber-400/15 data-highlighted:inset-ring-2 data-highlighted:inset-ring-amber-400"
                  data-highlighted={slice.modelId === previewModelId ||
                    (!!mapHoverId && slice.footprintId === mapHoverId) ||
                    undefined}
                  onpointerenter={() => (hoveredModelId = slice.modelId)}
                  onpointerleave={() => (hoveredModelId = '')}
                  onfocusin={event => {
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.matches(':focus-visible')
                    )
                      focusedModelId = slice.modelId
                  }}
                  onfocusout={() => (focusedModelId = '')}
                  aria-busy={pending && importing}
                >
                  <span
                    role="status"
                    aria-label={pending && importing
                      ? 'Importing model slice'
                      : undefined}
                  >
                    <SliceIcon
                      class={`text-primary mt-1 size-5 ${pending && importing ? 'motion-safe:animate-pulse' : ''}`}
                    />
                  </span>
                  <div class="space-y-1 text-sm">
                    <p class="font-medium break-words">
                      {slice.label || slice.modelId}
                    </p>
                    <p class="text-muted-foreground break-words">{slice.modelId}</p>
                    {#if pending && !importing}
                      <p class="text-destructive text-xs">
                        {pendingSaved
                          ? 'Saved · refresh needed'
                          : 'Not saved · import failed'}
                      </p>
                      <div class="flex flex-wrap items-center gap-2">
                        <Button
                          text={pendingSaved ? 'Refresh' : 'Retry'}
                          onClick={importModel}
                        />
                        {#if !pendingSaved}
                          <button
                            type="button"
                            class="px-3 py-2 text-sm"
                            onclick={() => {
                              pendingSlices = []
                              message = ''
                            }}
                          >
                            Discard
                          </button>
                        {/if}
                      </div>
                    {/if}
                    {#each slice.evidenceKeys as key (key)}
                      {@const evidence = result.evidence.find(item => item.key === key)}
                      {#if evidence}
                        <p class="text-muted-foreground break-words">
                          {evidence.label}
                        </p>
                      {/if}
                    {/each}
                  </div>
                  {#if deletionMode && result.canImport && !pending}
                    <Button
                      text="Remove"
                      size="sm"
                      style="ghost"
                      color="error"
                      class="self-start"
                      attrs={{
                        'aria-label': `Remove ${slice.label || slice.modelId} from this location`,
                      }}
                      disabled={refreshing || importing || pendingSlices.length > 0}
                      onClick={() => removeSlice(slice.modelId)}
                    />
                  {/if}
                </li>
              {:else}
                <li class="text-muted-foreground px-5 pb-5 text-sm">
                  Added slices will appear here.
                </li>
              {/each}
            </ul>
          </div>
        </section>
      </aside>
    </div>
  {:else if model}
    <div
      class="border-border flex flex-wrap items-center justify-end gap-3 border-b px-5 py-3"
    >
      <fieldset
        aria-label="Exterior view mode"
        class="border-border mr-auto inline-flex items-center gap-1 rounded-lg border p-1"
      >
        {#each viewModes as mode (mode)}
          <Button
            text={mode}
            iconComponent={mode === 'Facade' ? FacadeIcon : SliceIcon}
            modifier="square"
            size="sm"
            style={mode === viewMode ? 'soft' : 'ghost'}
            color={mode === viewMode ? 'primary' : 'neutral'}
            attrs={{ title: mode, 'aria-pressed': mode === viewMode }}
            onClick={() => (viewMode = mode)}
          />
        {/each}
      </fieldset>
      {#if comparisonFile && analysisViewer}
        <div class="w-full max-w-72">
          <ExteriorTextureSlider
            bind:value={textureBlend}
            viewer={analysisViewer}
            onfailure={useGovernmentModel}
          />
        </div>
      {/if}
      {#if result.canImport}
        <Button
          text="Refresh models and textures"
          disabled={refreshing || importing}
          onClick={refreshModels}
        />
      {/if}
      {#if result.canImport}
        <Button text="Manage model associations" onClick={search} />
      {/if}
    </div>
    <div class="relative min-h-[32rem] flex-1">
      <div class="absolute inset-0" bind:this={viewerHost}></div>
      {#if modelLoading}
        <div
          role="status"
          aria-label="Loading exterior model"
          class="bg-muted absolute inset-0 animate-pulse"
        ></div>
      {/if}
      {#if analysisViewer && !modelLoading}
        {#key comparisonFile ?? model.assetId}
          <FacadeReview
            active={viewMode === 'Facade'}
            viewer={analysisViewer}
            {locationId}
            sourceAssetId={model.assetId}
            canSave={result.canImport}
            assetId={comparisonFile ?? model.assetId}
            comparisonGeometry={Boolean(comparisonFile)}
            textureBlend={comparisonFile ? textureBlend : 0}
          />
        {/key}
      {/if}
      <section
        aria-label="Exterior model metadata"
        aria-busy={refreshing}
        class="text-muted-foreground absolute bottom-2 left-3 z-10 max-h-24 max-w-[min(30%,25rem)] overflow-y-auto bg-transparent font-mono text-[10px] leading-relaxed"
      >
        {#if refreshing}
          <div
            role="status"
            aria-label="Refreshing models and textures"
            class="bg-muted mb-2 h-8 w-64 animate-pulse rounded"
          ></div>
        {/if}
        <p>Source: Lands Department, Hong Kong SAR Government.</p>
        <p>
          Government assembly: {result.slices.length} model(s) · Imported
          {model.createdAt}
        </p>
        {#if comparisonFile && analysisViewer}
          <p>Texture comparison revision: {comparisonFile.slice(11, 23)}</p>
        {/if}
        {#each result.slices as slice (slice.modelId)}
          <p class="break-words">
            {slice.label ? `${slice.label} · ` : ''}{slice.modelId} · Sheet
            {slice.sheet}{slice.footprintId ? ` · CSUID ${slice.footprintId}` : ''}
          </p>
          {#if slice.sourceVersion}
            <p class="break-words">
              Sheet revision:
              {slice.sourceVersion.revisionDate
                ? new Date(slice.sourceVersion.revisionDate).toISOString().slice(0, 10)
                : 'Not supplied'}
              · Archive modified: {slice.sourceVersion.lastModified || 'Not supplied'}
            </p>
            <p class="break-words">
              Archive ETag: {slice.sourceVersion.etag} ·
              {slice.sourceVersion.textureCount} texture image(s)
            </p>
          {:else}
            <p>Source version not recorded · refresh to capture metadata</p>
          {/if}
        {/each}
        <p>Archive dates are not texture capture dates.</p>
      </section>
    </div>
  {/if}
</div>
