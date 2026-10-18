<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// ICONS
import Crosshair from 'virtual:icons/proicons/target'
import { Icon } from '#lib/bits/index.js'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// COMPONENTS
import ResourceHierarchyPath from '#lib/bits/patterns/panels/components/common/ResourceHierarchyPath.svelte'
// TYPES
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

// CONTEXT
const appCtx = getSurfaceCtx()

interface FilteredLayerProps {
  layer: Layer
  hierarchy: {
    organisation?: Organisation
    project?: Project
  }
  isSelected: boolean
  onToggle: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
  onIsolate: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
  selectedClass?: string
}

// PROPS
const {
  layer,
  hierarchy,
  isSelected,
  onToggle,
  onIsolate,
  selectedClass = 'bg-yellow-400',
}: FilteredLayerProps = $props()

const layerName = $derived(
  appCtx.getContextualLayerName(layer, false, false) ||
    getI18n(layer, 'nameShort', appCtx.getUserPreferences()),
)
</script>

<div
  class="group flex items-center gap-3 bg-panel py-2 pl-8 pr-4 caret-transparent transition-colors duration-200"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  <button
    type="button"
    class="flex min-w-0 flex-1 -translate-x-5 items-center gap-3 text-left focus:outline-none"
    aria-label={isSelected
      ? m.panel__deactivate_layer({ name: layerName })
      : m.panel__activate_layer({ name: layerName })}
    onclick={onToggle}
  >
    <div
      class="h-2 w-2 shrink-0 rounded-full group-hover:bg-base-content/30 group-focus-visible:bg-base-content/30 {isSelected
        ? selectedClass
        : ''} {isSelected
        ? 'group-hover:bg-secondary/75 group-focus-visible:bg-secondary/75'
        : ''}"
      aria-hidden="true"
    ></div>
    {#if hierarchy.organisation && hierarchy.project}
      <div class="flex min-w-0 flex-col items-start gap-0">
        <ResourceHierarchyPath {hierarchy} />
        <p class="font-light">{layerName}</p>
      </div>
    {:else}
      <p class="min-w-0 font-light">{layerName}</p>
    {/if}
  </button>
  <button
    type="button"
    class="inline-flex shrink-0 items-center justify-center text-base-content/45 hover:text-base-content/80 focus-visible:text-base-content/80"
    aria-label={m.panel__isolate_layer({ name: layerName })}
    title={m.panel__isolate_layer({ name: layerName })}
    onclick={onIsolate}
  >
    <Icon src={Crosshair} class="h-5 w-5" aria-hidden="true" />
  </button>
</div>
