<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import type { ImportCtx } from '#lib/context/import.svelte.js'
// I18N
import { m } from '#lib/i18n.js'
// SERVICES
import {
  getLayerCreationPrefill,
  handleLayerSearch,
  handleLayerSearchFocus,
  hideLayerCreationForm,
  preloadLayers,
  resetLayerFormLocale,
  selectLayer,
  showLayerCreationForm,
  submitLayerForm,
  translateLayerFormLocale,
} from '#lib/client/services/import/features/layer.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import FormI18nTranslationBar from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nTranslationBar.svelte'
import ImportAnalysisStatus from '../../../shared/ImportAnalysisStatus.svelte'
import ImportMappingRow from '../../../shared/ImportMappingRow.svelte'
import ImportSearchBox from '../../../shared/ImportSearchBox.svelte'
import LayerResolutionPanel from './LayerResolutionPanel.svelte'
import LayerValidationResults from './LayerValidationResults.svelte'
import ResolvedTargetButton from '../../../shared/ResolvedTargetButton.svelte'
import XCircle from 'virtual:icons/proicons/cancel-circle'
// ENUMS
import { SupportedLocales } from '#lib/enums.js'
// TYPES
import type { LayerFormInput } from '#lib/db/zod/schema/layer.types.js'
import type { Locale } from '#lib/types.js'
import type { ImportSearchBoxItem } from '../../../shared/importSearch.types'

type LayerLike = import('#lib/client/services/import/types.js').Layer

type Props = {
  importCtx: ImportCtx
}

type LayerFormData = LayerFormInput['data']
type LayerFormLocaleKey = keyof LayerFormData['i18n']

let { importCtx }: Props = $props()

let disposed = false
let preloadRequest = 0
onDestroy(() => {
  disposed = true
})

let layerFormData = $derived(importCtx.getLayerForm())
let visibleTranslationLocale = $state<LayerFormLocaleKey | null>(null)
const selectedLayer = $derived(importCtx.getSelectedLayer() as LayerLike | null)
const fallbackLayerSearchResults = $derived(
  importCtx
    .getLayerSearchResults()
    .map((layer, index) => toLayerSearchItem(layer as LayerLike, index)),
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

function updateLayerFormField(
  locale: LayerFormLocaleKey,
  field: 'name' | 'nameShort' | 'description',
  value: string,
): void {
  const layerForm = importCtx.getLayerForm()
  if (!layerForm) return

  importCtx.setLayerForm({
    ...layerForm,
    i18n: {
      ...layerForm.i18n,
      [locale]: {
        ...layerForm.i18n[locale],
        [field]: value,
        [`${field}Gen`]: false,
      },
    },
  })
}

async function handleLayerFormTranslate(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  return translateLayerFormLocale(importCtx, sourceLocale, targetLocale)
}

function handleLayerFormLocaleReset(targetLocale: Locale): void {
  resetLayerFormLocale(importCtx, targetLocale)
}

function handleLayerLocaleEnter(locale: LayerFormLocaleKey): void {
  visibleTranslationLocale = locale
}

function handleLayerLocaleLeave(locale: LayerFormLocaleKey): void {
  if (visibleTranslationLocale === locale) {
    visibleTranslationLocale = null
  }
}

/**
 * Loads fallback choices only while this step owns the requesting import.
 * @returns Completion of the current preload or a discarded obsolete read.
 */
async function preloadLayersForStep(): Promise<void> {
  const request = ++preloadRequest
  const data = importCtx.getData()
  const step = importCtx.getCurrentStep()
  const selectedProject = importCtx.getSelectedProject()
  const isCurrent = (): boolean =>
    !disposed &&
    request === preloadRequest &&
    importCtx.getData() === data &&
    importCtx.getCurrentStep() === step &&
    importCtx.getSelectedProject() === selectedProject
  if (!selectedProject) {
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
    return
  }

  try {
    const layers = await preloadLayers(selectedProject.id, isCurrent)
    if (!isCurrent()) return
    importCtx.setAllLayers(layers)
    importCtx.setLayersLoaded(true)
    importCtx.setLayerSearchResults(layers)
  } catch (error) {
    if (!isCurrent()) return
    console.error('Error preloading layers:', error)
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
  }
}

/**
 * Persists the search-box value before filtering the loaded catalogue.
 * @param query Current text supplied by the search input.
 * @returns Nothing.
 */
function handleLayerSearchInput(query: string): void {
  importCtx.setLayerSearchQuery(query)
  const results = handleLayerSearch(
    importCtx.getLayerSearchQuery(),
    importCtx.getAllLayers(),
  )
  importCtx.setLayerSearchResults(results)
}

function handleLayerSearchInputFocus(): void {
  const results = handleLayerSearchFocus(importCtx.getAllLayers())
  if (!importCtx.getLayersLoaded()) {
    void preloadLayersForStep()
    return
  }

  importCtx.setLayerSearchResults(results)
}

function handleLayerSelect(layer: LayerLike): void {
  const result = selectLayer(layer)
  importCtx.setSelectedLayer(result.layer)
  const layerValidation = importCtx.getLayerValidation()
  layerValidation.fallbackLayerId = result.layerId
  importCtx.setLayerValidation(layerValidation)
  importCtx.setLayerSearchQuery('')
  importCtx.setLayerSearchResults([])
}

function handleLayerSearchSelect(item: ImportSearchBoxItem): void {
  handleLayerSelect(item.value as LayerLike)
}

function handleSelectedLayerClear(): void {
  importCtx.setSelectedLayer(null)
  const layerValidation = importCtx.getLayerValidation()
  layerValidation.fallbackLayerId = undefined
  importCtx.setLayerValidation(layerValidation)
}

function handleLayerCreationShow(prefillValue?: string): void {
  showLayerCreationForm(importCtx, prefillValue)
}

function handleLayerResolutionCreate(invalidValue: string): void {
  handleLayerCreationShow(getLayerCreationPrefill(invalidValue))
  importCtx.setActiveLayerCreation(invalidValue)
}

function handleLayerCreationHide(): void {
  hideLayerCreationForm(importCtx)
}

async function handleLayerFormSubmit(event: Event): Promise<void> {
  await submitLayerForm(importCtx, event)
}
</script>

{#snippet layerI18nSection()}
  {#if layerFormData?.i18n}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#each Object.keys(SupportedLocales) as locale}
        {@const localeKey = locale as LayerFormLocaleKey}
        {@const localeCode = SupportedLocales[
          locale as keyof typeof SupportedLocales
        ] as Locale}
        <fieldset
          class="border-base-content/20 bg-base-100/70 relative min-w-0 space-y-4 overflow-visible rounded-xl border p-4"
          onmouseenter={() => handleLayerLocaleEnter(localeKey)}
          onmouseleave={() => handleLayerLocaleLeave(localeKey)}
          onfocusin={() => handleLayerLocaleEnter(localeKey)}
          onfocusout={() => handleLayerLocaleLeave(localeKey)}
        >
          <FormI18nTranslationBar
            targetLocale={localeCode}
            onTranslate={handleLayerFormTranslate}
            onResetLocale={handleLayerFormLocaleReset}
            isEditing={true}
            isVisible={visibleTranslationLocale === localeKey}
            positionStyle="top: 0px; right: -0px;"
          />
          <div class="mt-6 space-y-1.5">
            <label
              class="text-base-content/60 block text-xs font-semibold tracking-wide uppercase"
              for={`layer-${locale}-name`}
            >
              Name
            </label>
            <input
              id={`layer-${localeKey}-name`}
              class="input input-bordered input-sm bg-base-100/90 w-full px-3 py-2"
              value={layerFormData.i18n[localeKey]?.name ?? ''}
              oninput={event =>
                updateLayerFormField(localeKey, 'name', event.currentTarget.value)}
            >
          </div>
          <div class="space-y-1.5">
            <label
              class="text-base-content/60 block text-xs font-semibold tracking-wide uppercase"
              for={`layer-${localeKey}-name-short`}
            >
              Short name
            </label>
            <input
              id={`layer-${localeKey}-name-short`}
              class="input input-bordered input-sm bg-base-100/90 w-full px-3 py-2"
              value={layerFormData.i18n[localeKey]?.nameShort ?? ''}
              oninput={event =>
                updateLayerFormField(localeKey, 'nameShort', event.currentTarget.value)}
            >
          </div>
          <div class="space-y-1.5">
            <label
              class="text-base-content/60 block text-xs font-semibold tracking-wide uppercase"
              for={`layer-${localeKey}-description`}
            >
              Description
            </label>
            <textarea
              id={`layer-${localeKey}-description`}
              class="textarea textarea-bordered textarea-sm bg-base-100/90 min-h-24 w-full resize-y p-3"
              value={layerFormData.i18n[localeKey]?.description ?? ''}
              oninput={event =>
                updateLayerFormField(
                  localeKey,
                  'description',
                  event.currentTarget.value,
                )}
            ></textarea>
          </div>
        </fieldset>
      {/each}
    </div>
  {/if}
{/snippet}

{#if importCtx.getLayerValidation().isValidating}
  <ImportAnalysisStatus label={m.feature_import__layers_analysing()} />
{/if}

{#if importCtx.getLayerValidation().showLayerSelection}
  <div class="flex h-full min-h-80 items-center">
    <div class="mx-auto w-full max-w-5xl space-y-4">
      <ImportMappingRow actionLabel={m.feature_import__users_assign_action()}>
        {#snippet source()}
          <div class="min-w-0 space-y-1.5">
            <h4 class="text-base-content/55 text-xs font-bold tracking-wide uppercase">
              {m.feature_import__layers_no_columns_title()}
            </h4>
            <div
              class="text-base-content overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap"
            >
              {m.feature_import__users_all_features_label()}
            </div>
            <p class="text-base-content/60 text-xs leading-relaxed">
              {m.feature_import__layers_no_columns_select_description()}
            </p>
          </div>
        {/snippet}

        {#snippet target()}
          {#if selectedLayer}
            <ResolvedTargetButton
              onReset={handleSelectedLayerClear}
              title="Click to change layer selection"
              changeLabel={m.feature_import__users_click_to_change()}
            >
              <div
                class="bg-success text-success-content flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              >
                {selectedLayer.i18n?.en?.name?.charAt(0)?.toUpperCase() || 'L'}
              </div>
              <div class="min-w-0">
                <div
                  class="overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap"
                >
                  {selectedLayer.i18n?.en?.name || 'Selected Layer'}
                </div>
                {#if selectedLayer.i18n?.en?.description}
                  <div
                    class="text-success/70 overflow-hidden text-xs text-ellipsis whitespace-nowrap"
                  >
                    {selectedLayer.i18n.en.description}
                  </div>
                {/if}
              </div>
            </ResolvedTargetButton>
          {:else if !importCtx.getIsCreatingLayer()}
            <div class="flex w-full items-center gap-2">
              {#if importCtx.getLayersLoaded() && importCtx.getAllLayers().length > 0}
                <div class="min-w-0 flex-1">
                  <ImportSearchBox
                    id="feature-import-layer-fallback"
                    value={importCtx.getLayerSearchQuery()}
                    results={fallbackLayerSearchResults}
                    ariaLabel={m.feature_import__layers_no_columns_select_description()}
                    placeholder="Search for layer..."
                    size="sm"
                    dropdown="floating"
                    searchFor={m.feature_import__users_all_features_label()}
                    inputClass="rounded-xl border-base-content/25 bg-base-100 p-3 shadow-[var(--shadow-mini)] outline-none focus:border-primary focus:outline focus:outline-2 focus:outline-primary/20"
                    onInput={handleLayerSearchInput}
                    onFocus={handleLayerSearchInputFocus}
                    onSelect={handleLayerSearchSelect}
                  />
                </div>
              {/if}
              <Button
                text="+ NEW"
                style="outline"
                color="primary"
                size="sm"
                onClick={() => handleLayerCreationShow()}
              />
            </div>
          {/if}
        {/snippet}
      </ImportMappingRow>

      {#if importCtx.getIsCreatingLayer()}
        <div class="bg-primary/5 mt-4 rounded-lg p-4">
          <div class="mb-4 flex items-center justify-between">
            <h4 class="text-primary font-medium">Create New Layer</h4>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onclick={handleLayerCreationHide}
            >
              <Icon src={XCircle} class="h-4 w-4" />
            </button>
          </div>

          {#if importCtx.getLayerForm()}
            <form onsubmit={handleLayerFormSubmit}>
              {@render layerI18nSection()}

              <div class="mt-4 flex justify-end gap-2">
                <Button
                  text="Cancel"
                  style="ghost"
                  color="light"
                  size="md"
                  type="button"
                  onClick={handleLayerCreationHide}
                />
                <Button
                  text={importCtx.getIsSubmittingLayer()
                    ? 'Creating...'
                    : 'Create Layer'}
                  style="none"
                  color="primary"
                  size="md"
                  type="button"
                  onClick={handleLayerFormSubmit}
                  disabled={importCtx.getIsSubmittingLayer()}
                />
              </div>
            </form>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if !importCtx.getLayerValidation().isValidating &&
  !importCtx.getLayerValidation().showLayerSelection}
  <div class="mt-4 space-y-4">
    {#if importCtx.getLayerValidation().results.length > 0 &&
      !importCtx.getLayerValidation().showLayerResolution}
      <h4 class="font-medium">Validation Results</h4>
      <LayerValidationResults results={importCtx.getLayerValidation().results} />
    {:else}
      <LayerResolutionPanel {importCtx} onCreateLayer={handleLayerResolutionCreate} />

      {#each importCtx.getLayerResolution().invalidValues as invalidValue}
        {#if importCtx.getIsCreatingLayer() &&
          importCtx.getActiveLayerCreation() === invalidValue}
          <div class="bg-primary/5 mt-4 rounded-lg p-4">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="text-foreground font-medium">
                Create New Layer for
                <span class="text-secondary font-semibold">{invalidValue}</span>
              </h4>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onclick={() => {
                  handleLayerCreationHide()
                  importCtx.setActiveLayerCreation(null)
                }}
              >
                <Icon src={XCircle} class="h-4 w-4" />
              </button>
            </div>

            {#if importCtx.getLayerForm()}
              <form onsubmit={handleLayerFormSubmit}>
                {@render layerI18nSection()}

                <div class="mt-4 flex justify-end gap-2">
                  <Button
                    text="Cancel"
                    style="ghost"
                    color="light"
                    size="md"
                    type="button"
                    onClick={() => {
                      handleLayerCreationHide()
                      importCtx.setActiveLayerCreation(null)
                    }}
                  />
                  <Button
                    text={importCtx.getIsSubmittingLayer()
                      ? 'Creating...'
                      : 'Create Layer'}
                    style="none"
                    color="primary"
                    size="md"
                    type="button"
                    onClick={handleLayerFormSubmit}
                    disabled={importCtx.getIsSubmittingLayer()}
                  />
                </div>
              </form>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>
{/if}
