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
  selectLayer,
  showLayerCreationForm,
  submitLayerForm,
} from '$lib/client/services/import/features/layer'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportAnalysisStatus from '../../../shared/ImportAnalysisStatus.svelte'
import LayerResolutionPanel from './LayerResolutionPanel.svelte'
import LayerValidationResults from './LayerValidationResults.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import XCircle from 'virtual:icons/lucide/circle-x'
import MagnifyingGlass from 'virtual:icons/lucide/search'
import Plus from 'virtual:icons/lucide/plus'
// ENUMS
import { SupportedLocales } from '$lib/enums'
// TYPES
import type { LayerFormInput } from '$lib/db/zod/schema/layer.types'

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
  <!-- Inlined from old $lib/components/forms/sections/I18n.svelte. -->
  {#if layerFormData?.i18n}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#each Object.keys(SupportedLocales) as locale}
        {@const localeKey = locale as LayerFormLocaleKey}
        <fieldset
          class="min-w-0 space-y-4 rounded-xl border border-base-content/20 bg-base-100/70 p-4"
        >
          <legend class="px-2 text-xs font-bold uppercase text-base-content/60">
            {SupportedLocales[localeKey]}
          </legend>
          <div class="space-y-1.5">
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
  <div class="space-y-4">
    <div class="rounded-lg border border-info bg-info/10 p-4">
      <h4 class="font-medium text-info">Select Layer</h4>
      <p class="text-sm text-base-content/70">
        No layer column was detected.
        {#if importCtx.getLayersLoaded() && importCtx.getAllLayers().length === 0}
          Create a new layer for all features to be assigned to.
        {:else}
          Please select which layer all features should be assigned to.
        {/if}
      </p>
    </div>

    {#if !importCtx.getSelectedLayer() && !importCtx.getIsCreatingLayer()}
      {#if importCtx.getLayersLoaded() && importCtx.getAllLayers().length > 0}
        <div class="space-y-4">
          <div class="flex w-full flex-row items-stretch gap-2">
            <div class="relative z-10 flex-1">
              <div class="relative">
                <input
                  type="text"
                  placeholder="Search for layer..."
                  class="input input-bordered w-full border-base-content/25 bg-base-100 pr-10 shadow-[var(--shadow-mini)] outline-none focus:border-primary focus:outline focus:outline-2 focus:outline-primary/20"
                  bind:value={importCtx.state.layerSearchQuery}
                  oninput={handleLayerSearchInput}
                  onfocus={handleLayerSearchInputFocus}
                >
                <div
                  class="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-3"
                >
                  <Icon src={MagnifyingGlass} class="h-4 w-4 text-base-content/50" />
                </div>
              </div>

              {#if importCtx.getLayerSearchResults().length > 0}
                <div
                  class="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 shadow-lg"
                >
                  {#each importCtx.getLayerSearchResults() as layer}
                    {@const layerItem = layer as LayerLike}
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-base-200 focus:bg-base-200 focus:outline-none"
                      onclick={() => handleLayerSelect(layerItem)}
                    >
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded bg-primary text-xs font-medium text-primary-content"
                      >
                        {layerItem.i18n?.en?.name?.charAt(0)?.toUpperCase() || 'L'}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-medium">
                          {layerItem.i18n?.en?.name || 'Unknown Layer'}
                        </div>
                        {#if layerItem.i18n?.en?.description}
                          <div class="text-xs text-base-content/70">
                            {layerItem.i18n.en.description}
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <button
              type="button"
              class="btn btn-outline btn-primary flex-shrink-0"
              onclick={() => handleLayerCreationShow()}
            >
              <Icon src={Plus} class="h-4 w-4" />
              Create New Layer
            </button>
          </div>
        </div>
      {:else}
        <div class="flex justify-center">
          <button
            type="button"
            class="btn btn-outline btn-primary"
            onclick={() => handleLayerCreationShow()}
          >
            <Icon src={Plus} class="h-4 w-4" />
            Create New Layer
          </button>
        </div>
      {/if}
    {/if}

    {#if importCtx.getIsCreatingLayer()}
      <div class="mt-4 rounded-lg border border-primary bg-primary/5 p-4">
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

    {#if importCtx.getSelectedLayer()}
      <button
        type="button"
        class="w-full rounded border border-success bg-success/10 p-3 text-left transition-colors hover:bg-success/20"
        onclick={handleSelectedLayerClear}
        title="Click to unselect this layer"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Icon src={CheckCircle} class="h-5 w-5 text-success" />
            <div>
              <div class="font-medium text-success">
                Selected: {importCtx.getSelectedLayer()?.i18n?.en?.name}
              </div>
              <div class="text-sm text-success/70">
                All features will be assigned to this layer
              </div>
            </div>
          </div>
          <div class="text-xs text-success/70">Click to change</div>
        </div>
      </button>
    {/if}
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
          <div class="mt-4 rounded-lg border border-primary bg-primary/5 p-4">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="font-medium text-primary">
                Create New Layer for "{invalidValue}"
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
