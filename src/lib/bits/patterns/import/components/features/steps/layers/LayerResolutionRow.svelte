<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import {
  getLayerResolutionParts,
  handleLayerResolutionSearch,
  resetLayerResolution,
  selectLayerForResolution,
} from '$lib/client/services/import/features/layer'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportMappingRow from '../../../shared/ImportMappingRow.svelte'
import ImportSearchBox from '../../../shared/ImportSearchBox.svelte'
import ResolvedTargetButton from '../../../shared/ResolvedTargetButton.svelte'
import XCircle from 'virtual:icons/lucide/circle-x'
// TYPES
import type { ImportSearchBoxItem } from '../../../shared/importSearch.types'

type LayerLike = {
  id?: string
  i18n?: {
    en?: {
      name?: string | null
      description?: string | null
    } | null
  } | null
}

type Props = {
  importCtx: ImportCtx
  invalidValue: string
  onCreateLayer: (invalidValue: string) => void
}

let { importCtx, invalidValue, onCreateLayer }: Props = $props()

const resolution = $derived(
  importCtx.getLayerResolution().resolutions.get(invalidValue),
)
const resolvedLayer = $derived(resolution?.layerData as LayerLike | undefined)
const canSearch = $derived(
  !importCtx.getIsCreatingLayer() ||
    importCtx.getActiveLayerCreation() !== invalidValue,
)
const searchValue = $derived(
  importCtx.getLayerResolutionSearchQueries().get(invalidValue) || '',
)
const searchResults = $derived(
  (importCtx.getLayerResolutionSearchResults().get(invalidValue) || []).map(
    (layer, index) => toLayerSearchItem(layer as LayerLike, index),
  ),
)

function toLayerSearchItem(
  layer: LayerLike,
  index: number,
): ImportSearchBoxItem<LayerLike> {
  const title = layer.i18n?.en?.name || 'Unknown Layer'
  return {
    id: `${layer.id ?? title}-${index}`,
    title,
    subtitle: layer.i18n?.en?.description,
    fallback: title.charAt(0).toUpperCase() || 'L',
    value: layer,
  }
}

function handleLayerResolutionSearchInput(query: string): void {
  const queries = importCtx.getLayerResolutionSearchQueries()
  queries.set(invalidValue, query)
  importCtx.setLayerResolutionSearchQueries(new Map(queries))

  const results = handleLayerResolutionSearch(query, importCtx.getAllLayers())
  const nextSearchResults = importCtx.getLayerResolutionSearchResults()
  nextSearchResults.set(invalidValue, results)
  importCtx.setLayerResolutionSearchResults(new Map(nextSearchResults))
}

function handleLayerResolutionSelect(item: ImportSearchBoxItem): void {
  const layerResolution = importCtx.getLayerResolution()
  const nextResolutions = selectLayerForResolution(
    invalidValue,
    item.value,
    layerResolution.resolutions,
  )
  importCtx.setLayerResolution({
    invalidValues: layerResolution.invalidValues,
    resolutions: nextResolutions,
  })

  const searchResults = importCtx.getLayerResolutionSearchResults()
  searchResults.delete(invalidValue)
  importCtx.setLayerResolutionSearchResults(new Map(searchResults))

  const queries = importCtx.getLayerResolutionSearchQueries()
  queries.delete(invalidValue)
  importCtx.setLayerResolutionSearchQueries(new Map(queries))
}

function handleLayerResolutionReset(): void {
  const layerResolution = importCtx.getLayerResolution()
  const nextResolutions = resetLayerResolution(
    invalidValue,
    layerResolution.resolutions,
  )
  importCtx.setLayerResolution({
    invalidValues: layerResolution.invalidValues,
    resolutions: nextResolutions,
  })

  const queries = importCtx.getLayerResolutionSearchQueries()
  queries.set(invalidValue, '')
  importCtx.setLayerResolutionSearchQueries(new Map(queries))

  setTimeout(() => {
    const searchInput = document.querySelector(
      `input[data-layer-search-for="${invalidValue}"]`,
    ) as HTMLInputElement
    searchInput?.focus()
  }, 100)
}

function handleLayerResolutionSearchFocus(): void {
  const nextSearchResults = importCtx.getLayerResolutionSearchResults()
  nextSearchResults.set(invalidValue, [...importCtx.getAllLayers()])
  importCtx.setLayerResolutionSearchResults(new Map(nextSearchResults))
}
</script>

<div class="space-y-3">
  <ImportMappingRow actionLabel="Assign to">
    {#snippet source()}
      <div class="min-w-0 space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-wide text-error">
          No Match Found
        </h4>
        <div class="space-y-2 p-3">
          {#each getLayerResolutionParts(invalidValue) as part}
            <div class="flex items-start gap-2 text-sm">
              <code class="rounded bg-base-200 px-2 py-1 text-xs uppercase">
                {part.key}
              </code>
              <span class="truncate font-mono" title={part.value}>{part.value}</span>
            </div>
          {/each}
        </div>
      </div>
    {/snippet}

    {#snippet target()}
      <div class="flex w-full items-center gap-2">
        <div class="min-w-0 flex-1">
          {#if resolution}
            <ResolvedTargetButton
              onReset={handleLayerResolutionReset}
              title="Click to change layer selection"
              changeLabel={m.feature_import__users_click_to_change()}
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-xs font-medium text-success-content"
              >
                {resolvedLayer?.i18n?.en?.name?.charAt(0)?.toUpperCase() || 'L'}
              </div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">
                  {resolvedLayer?.i18n?.en?.name || 'Selected Layer'}
                </div>
                {#if resolvedLayer?.i18n?.en?.description}
                  <div class="truncate text-xs text-success/70">
                    {resolvedLayer.i18n.en.description}
                  </div>
                {/if}
              </div>
            </ResolvedTargetButton>
          {:else if canSearch}
            <ImportSearchBox
              id={`feature-import-layer-resolution-${invalidValue}`}
              value={searchValue}
              results={searchResults}
              ariaLabel="Search for replacement layer"
              placeholder="Search for replacement layer..."
              size="sm"
              dropdown="floating"
              searchFor={invalidValue}
              inputClass="rounded-xl border-base-content/25 bg-base-100 p-3 shadow-[var(--shadow-mini)] outline-none focus:border-primary focus:outline focus:outline-2 focus:outline-primary/20"
              onInput={handleLayerResolutionSearchInput}
              onFocus={handleLayerResolutionSearchFocus}
              onSelect={handleLayerResolutionSelect}
            />
          {/if}
        </div>

        {#if canSearch}
          <Button
            text="+ NEW"
            style="outline"
            color="primary"
            size="sm"
            onClick={() => onCreateLayer(invalidValue)}
          />
        {/if}
      </div>
    {/snippet}
  </ImportMappingRow>
</div>
