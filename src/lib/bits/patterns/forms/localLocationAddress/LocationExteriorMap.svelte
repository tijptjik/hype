<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import {
  findLocationExteriorCandidates,
  getLocationExterior,
  importLocationExterior,
} from '#lib/api/locationExterior.remote.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/boxes'
import SearchIcon from 'virtual:icons/lucide/search'
import SliceIcon from 'virtual:icons/lucide/box'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import type { ExteriorSlice } from '#lib/locations/exterior/assembly.js'
import ExteriorFootprintPicker from './ExteriorFootprintPicker.svelte'
import ExteriorTextureSlider from './ExteriorTextureSlider.svelte'
import FacadeReview from './FacadeReview.svelte'
import type { ModelViewerElement } from '@google/model-viewer'

let { locationId, coordinates }: { locationId: string; coordinates: [number, number] } =
  $props()
let result = $state<Awaited<ReturnType<typeof getLocationExterior>> | null>(null)
const model = $derived(result?.model ?? null)
const includedFootprints = $derived([
  ...new Set(
    (result?.slices ?? []).flatMap(slice =>
      slice.footprintId ? [slice.footprintId] : [],
    ),
  ),
])
const selectedAlreadyAdded = $derived(
  Boolean(result?.slices.some(slice => slice.modelId === selected)),
)
let candidates = $state<Awaited<
  ReturnType<typeof findLocationExteriorCandidates>
> | null>(null)
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
let pendingSaved = $state(false)
let activeBatch = $state<Omit<ExteriorSlice, 'sheet'>[]>([])
const selectedQueued = $derived(pendingSlices.some(slice => slice.modelId === selected))
const displayedSlices = $derived([
  ...(result?.slices ?? []).filter(
    slice => !pendingSlices.some(pending => pending.modelId === slice.modelId),
  ),
  ...pendingSlices,
])
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

/** Search the CSDI sheet covering the Building. @returns Completion. */
async function search(): Promise<void> {
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
  {:else if !result || (associating && !candidates && busy)}
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
      class="border-border relative z-20 flex shrink-0 items-center gap-4 border-b px-5 py-3"
    >
      <div class="relative min-w-0 flex-1">
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
            class="border-border absolute top-full right-0 left-0 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white p-1 shadow-lg"
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
          disabled={busy}
          onClick={() => (associating = false)}
        />
      {/if}
    </header>
    {#if candidates}
      <div class="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <ExteriorFootprintPicker
          {coordinates}
          footprints={candidates.footprints}
          {selectedFootprint}
          {includedFootprints}
          onselect={selectFootprint}
          class="h-full min-h-[28rem] rounded-none border-0"
        />
        <aside class="border-border flex min-h-0 flex-col border-l">
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
                      {candidate.id}{result.slices.some(
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
                    {candidate.id}{result.slices.some(
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
              disabled={busy || !selected || selectedAlreadyAdded || selectedQueued}
              onClick={() => {
                queueSlice()
                void importModel()
              }}
            />
          </section>
          <section
            aria-label="Building model slices"
            class="border-border flex min-h-48 flex-1 flex-col border-t"
          >
            <h3 class="flex items-center justify-between px-5 py-4 font-semibold">
              Building slices
              <span class="bg-muted rounded-full px-2 py-0.5 text-xs"
                >{displayedSlices.length}</span
              >
            </h3>
            <div class="min-h-0 flex-1 overflow-y-auto">
              <ul class="divide-border divide-y">
                {#each displayedSlices as slice (slice.modelId)}
                  {@const pending = pendingSlices.some(
                    item => item.modelId === slice.modelId,
                  )}
                  <li
                    class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 px-5 py-4"
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
                        {@const evidence = result.evidence.find(
                          item => item.key === key,
                        )}
                        {#if evidence}
                          <p class="text-muted-foreground break-words">
                            {evidence.label}
                          </p>
                        {/if}
                      {/each}
                    </div>
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
    {:else}
      <div class="flex flex-1 items-center justify-center p-8">
        <Button text="Retry loading footprints" onClick={search} />
      </div>
    {/if}
  {:else if model}
    <div
      class="border-border flex flex-wrap items-center justify-end gap-3 border-b px-5 py-3"
    >
      {#if comparisonFile && analysisViewer}
        <div class="mr-auto w-full max-w-72">
          <ExteriorTextureSlider
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
            viewer={analysisViewer}
            {locationId}
            sourceAssetId={model.assetId}
            canSave={result.canImport}
            assetId={comparisonFile ?? model.assetId}
            comparisonGeometry={Boolean(comparisonFile)}
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
