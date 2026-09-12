<script lang="ts">
// THIRD PARTY
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// API
// CONTEXT
import type { useDefaultMapSettingsModel } from '$lib/adapters/panels/useDefaultMapSettingsModel.svelte'
// BITS
import { Switch, cx } from '$lib/bits'
// COMPONENTS
import Section from '$lib/bits/patterns/panels/components/common/Section.svelte'
// TYPES
import type { PanelProps } from '$lib/types'

// CONTEXT

// PROPS
let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useDefaultMapSettingsModel> } = $props()

const DESCRIPTION_PREVIEW_THRESHOLD = 180
let expandedLayerIds = $state(new Set<string>())
/**
 * Tracks whether a long layer description is expanded.
 */
const isDescriptionExpanded = (layerId: string): boolean => {
  return expandedLayerIds.has(layerId)
}

/**
 * Toggles the expanded state for a layer description preview.
 */
const toggleDescriptionExpanded = (layerId: string): void => {
  const nextExpandedLayerIds = new Set(expandedLayerIds)

  if (nextExpandedLayerIds.has(layerId)) {
    nextExpandedLayerIds.delete(layerId)
  } else {
    nextExpandedLayerIds.add(layerId)
  }

  expandedLayerIds = nextExpandedLayerIds
}

const userLayerIds = $derived(model.userLayerIds)
const canSaveUserLayers = $derived(model.canSaveUserLayers)
const userPreferences = $derived(model.userPreferences)
const orderedLayers = $derived(model.orderedLayers)
const isSavingLayers = $derived(model.isSavingLayers)
const toggleUserLayer = (...args: Parameters<typeof model.toggleUserLayer>) =>
  model.toggleUserLayer(...args)
</script>

<Section
  {...panelProps}
  title={m.settings_default_map_title()}
  iconGraphicClass="scale-125 origin-bottom-right mr-1"
  icon="/globe.svg"
  position="right"
>
  <div
    class="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg pl-6 pr-3 pb-[60px]"
  >
    {#each orderedLayers as layer (layer.id)}
      {@const { organisation, project } = model.getHierarchy(layer)}
      {@const organisationName = getI18n(
          organisation,
          'nameShort',
          userPreferences
        )}
      {@const projectName = model.getProjectName(project)}
      {@const description = getI18n(
          layer,
          'description',
          userPreferences
        )}
      {@const hasLongDescription =
          Boolean(description && description !== '-') &&
          description.length > DESCRIPTION_PREVIEW_THRESHOLD}
      {@const isExpanded = isDescriptionExpanded(layer.id)}
      <div
        class="flex w-full flex-row items-start justify-between gap-3 px-4 py-2 pl-2"
      >
        <div class="flex min-w-0 grow flex-col gap-0.5">
          {#if organisation && project}
            <div class="flex flex-row items-center gap-3">
              <div class="flex min-w-0 flex-col items-start gap-0">
                <p
                  class="flex min-w-0 space-x-0.5 font-mono text-xs uppercase tracking-widest"
                >
                  {#if organisationName}
                    <span class="text-primary">{organisationName}</span>
                  {/if}
                  {#if projectName}
                    <span class="px-0">›</span>
                    <span class="text-accent">{projectName}</span>
                  {/if}
                </p>
                <div class="min-w-0 font-light">
                  <p class="block">{getI18n(layer, 'name', userPreferences)}</p>
                  {#if description && description !== '-'}
                    <p
                      class={cx(
                          'mt-0.5 block max-h-96 overflow-hidden text-sm leading-5 text-neutral-content transition-[max-height] duration-300 ease-in-out',
                          !isExpanded && 'max-h-15',
                        )}
                    >
                      {description}
                    </p>
                    {#if hasLongDescription}
                      <button
                        type="button"
                        class="mt-1 text-xs uppercase tracking-[0.18em] text-primary transition-opacity hover:opacity-80"
                        onclick={() => toggleDescriptionExpanded(layer.id)}
                      >
                        {isExpanded ? m.common__read_less() : m.common__read_more()}
                      </button>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="flex flex-row items-center gap-3">
              <p class="min-w-0 font-light">
                {getI18n(layer, 'name', userPreferences)}
              </p>
            </div>
          {/if}
        </div>
        <Switch
          name={layer.id}
          class="mt-0.5 shrink-0"
          size="sm"
          color="primary"
          checked={userLayerIds.has(layer.id)}
          disabled={!canSaveUserLayers || isSavingLayers}
          onCheckedChange={(checked) => void toggleUserLayer(layer.id, checked === true)}
        />
      </div>
    {/each}
  </div>
</Section>
