<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
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
} from '$lib/client/services/import/features/layer'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import FormI18nTranslationBar from '$lib/bits/patterns/forms/formI18nSection/components/FormI18nTranslationBar.svelte'
import ImportAnalysisStatus from '../../../shared/ImportAnalysisStatus.svelte'
import ImportMappingRow from '../../../shared/ImportMappingRow.svelte'
import ImportSearchBox from '../../../shared/ImportSearchBox.svelte'
import LayerResolutionPanel from './LayerResolutionPanel.svelte'
import LayerValidationResults from './LayerValidationResults.svelte'
import ResolvedTargetButton from '../../../shared/ResolvedTargetButton.svelte'
import XCircle from 'virtual:icons/lucide/circle-x'
// ENUMS
import { SupportedLocales } from '$lib/enums'
// TYPES
import type { LayerFormInput } from '$lib/db/zod/schema/layer.types'
import type { Locale } from '$lib/types'
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
}

type LayerFormData = LayerFormInput['data']
type LayerFormLocaleKey = keyof LayerFormData['i18n']

let { importCtx }: Props = $props()

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

async function preloadLayersForStep(): Promise<void> {
  const selectedProject = importCtx.getSelectedProject()
  if (!selectedProject) {
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
    return
  }

  try {
    const layers = await preloadLayers(selectedProject.id)
    importCtx.setAllLayers(layers)
    importCtx.setLayersLoaded(true)
    importCtx.setLayerSearchResults(layers)
  } catch (error) {
    console.error('Error preloading layers:', error)
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
  }
}

function handleLayerSearchInput(): void {
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
        {@const localeCode = SupportedLocales[localeKey] as Locale}
        <fieldset
          class="relative min-w-0 space-y-4 overflow-visible rounded-xl border border-base-content/20 bg-base-100/70 p-4"
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
          <div class="space-y-1.5 mt-6">
            <label
              class="block text-xs font-semibold uppercase tracking-wide text-base-content/60"
              for={`layer-${locale}-name`}
            >
              Name
            </label>
            <input
              id={`layer-${localeKey}-name`}
              class="input input-bordered input-sm w-full bg-base-100/90 px-3 py-2"
              value={layerFormData.i18n[localeKey]?.name ?? ''}
              oninput={event =>
                updateLayerFormField(
                  localeKey,
                  'name',
                  event.currentTarget.value,
                )}
            >
          </div>
          <div class="space-y-1.5">
            <label
              class="block text-xs font-semibold uppercase tracking-wide text-base-content/60"
              for={`layer-${localeKey}-name-short`}
            >
              Short name
            </label>
            <input
              id={`layer-${localeKey}-name-short`}
              class="input input-bordered input-sm w-full bg-base-100/90 px-3 py-2"
              value={layerFormData.i18n[localeKey]?.nameShort ?? ''}
              oninput={event =>
                updateLayerFormField(
                  localeKey,
                  'nameShort',
                  event.currentTarget.value,
                )}
            >
          </div>
          <div class="space-y-1.5">
            <label
              class="block text-xs font-semibold uppercase tracking-wide text-base-content/60"
              for={`layer-${localeKey}-description`}
            >
              Description
            </label>
            <textarea
              id={`layer-${localeKey}-description`}
              class="textarea textarea-bordered textarea-sm min-h-24 w-full resize-y bg-base-100/90 p-3"
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
            <h4 class="text-xs font-bold uppercase tracking-wide text-base-content/55">
              {m.feature_import__layers_no_columns_title()}
            </h4>
            <div class="truncate text-sm font-semibold text-base-content">
              {m.feature_import__users_all_features_label()}
            </div>
            <p class="text-xs leading-relaxed text-base-content/60">
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
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-xs font-medium text-success-content"
              >
                {selectedLayer.i18n?.en?.name?.charAt(0)?.toUpperCase() || 'L'}
              </div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">
                  {selectedLayer.i18n?.en?.name || 'Selected Layer'}
                </div>
                {#if selectedLayer.i18n?.en?.description}
                  <div class="truncate text-xs text-success/70">
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
        <div class="mt-4 rounded-lg bg-primary/5 p-4">
          <div class="mb-4 flex items-center justify-between">
            <h4 class="font-medium text-primary">Create New Layer</h4>
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
                  text={importCtx.getIsSubmittingLayer() ? 'Creating...' : 'Create Layer'}
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

{#if !importCtx.getLayerValidation().isValidating && !importCtx.getLayerValidation().showLayerSelection}
  <div class="space-y-4 mt-4">
    {#if importCtx.getLayerValidation().results.length > 0 && !importCtx.getLayerValidation().showLayerResolution}
      <h4 class="font-medium">Validation Results</h4>
      <LayerValidationResults results={importCtx.getLayerValidation().results} />
    {:else}
      <LayerResolutionPanel {importCtx} onCreateLayer={handleLayerResolutionCreate} />

      {#each importCtx.getLayerResolution().invalidValues as invalidValue}
        {#if importCtx.getIsCreatingLayer() && importCtx.getActiveLayerCreation() === invalidValue}
          <div class="mt-4 rounded-lg bg-primary/5 p-4">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="font-medium text-white">
                Create New Layer for
                <span class="font-semibold text-secondary">{invalidValue}</span>
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
