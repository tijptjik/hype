<!--
  @component
  Prisms panel component that displays hierarchical resources (organisations, projects, and layers)
  with filtering and selection capabilities.
-->
<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// NAVIGATION
import { navigate } from '$lib/navigation'
// BITS
import { PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
import Info from '$lib/components/panels/info/Maps.svelte'
import Organisations from '$lib/components/panels/sections/Organisations.svelte'
import Projects from '$lib/components/panels/sections/Projects.svelte'
import Layers from '$lib/components/panels/sections/Layers.svelte'
import FilteredLayer from '$lib/components/panels/common/variants/FilteredLayer.svelte'
import OrganisationPrismItem from '$lib/components/panels/common/variants/OrganisationPrismItem.svelte'
import ProjectPrismItem from '$lib/components/panels/common/variants/ProjectPrismItem.svelte'
// ENUMS
import { Panel as PanelType, PanelSide } from '$lib/enums'
// TYPES
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { PanelProps, PanelPosition, Id, ResourceContext } from '$lib/types'
// ENUMS
import { OmniMode } from '$lib/enums'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// STATE
let isInfoOpen = $state(false)
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let handleToggleInfo = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation()
  isInfoOpen = !isInfoOpen
  if (isInfoOpen) {
    setTimeout(() => {
      panelContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 300)
  }
}

let panelProps: PanelProps = $derived({
  panelType: PanelType.prisms,
  position: PanelSide.left,
  scrollable: false,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
  active: {
    resourceType: appCtx.getActiveResourceType(),
    resourceRef: appCtx.getActiveResourceRef(),
    resourceId: appCtx.getActiveResourceId(),
    facet: appCtx.getActiveFacet(),
  },
})
</script>

<Panel bind:panelContainer {...panelProps}>
  <div class="flex h-full min-h-0 flex-col">
    <Header
      {...panelProps}
      title={m.maps__title()}
      onToggleInfo={(e) => {
        handleToggleInfo(e);
      }}
    />
    <Info isOpen={isInfoOpen} />
    <div class="prisms-sections">
      <div class="prisms-sections__section prisms-sections__section--bounded">
        <Organisations {...panelProps}>
          {#snippet filteredItem(resource: Organisation, selectedOrganisations: Id[])}
            <OrganisationPrismItem
              {resource}
              isPrismActive={selectedOrganisations.includes(resource.id)}
              isDefaultLayersActive={appCtx.isOrganisationDefaultLayersActive(resource.id)}
              onPrimaryAction={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (selectedOrganisations.includes(resource.id)) {
                  await appCtx.deactivateOrganisation(resource.id);
                } else if (
                  selectedOrganisations.length === 0 &&
                  appCtx.isOrganisationDefaultLayersActive(resource.id)
                ) {
                  await appCtx.deactivateOrganisationLayers(resource.id);
                } else {
                  await appCtx.activateOrganisationWithDefaultLayers(resource.id);
                }
              }}
              onTogglePrism={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (selectedOrganisations.includes(resource.id)) {
                  await appCtx.toggleOrganisation(resource.id);
                } else {
                  await appCtx.activateOrganisationPrismWithDefaultLayers(resource.id);
                }
              }}
            />
          {/snippet}
        </Organisations>
      </div>
      <div class="prisms-sections__section prisms-sections__section--bounded">
        <Projects {...panelProps}>
          {#snippet filteredItem(
            resource: Project,
            selectedProjects: Id[],
            hierarchy: ResourceContext
          )}
            <ProjectPrismItem
              {resource}
              hierarchy={{
                organisation: hierarchy.organisation
              }}
              isPrismActive={selectedProjects.includes(resource.id)}
              isDefaultLayersActive={appCtx.isProjectDefaultLayersActive(resource.id)}
              onPrimaryAction={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (selectedProjects.includes(resource.id)) {
                  await appCtx.deactivateProject(resource.id);
                } else if (
                  selectedProjects.length === 0 &&
                  appCtx.isProjectDefaultLayersActive(resource.id)
                ) {
                  await appCtx.deactivateProjectLayers(resource.id);
                } else {
                  await appCtx.activateProjectWithDefaultLayers(resource.id);
                }
              }}
              onTogglePrism={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (selectedProjects.includes(resource.id)) {
                  await appCtx.toggleProject(resource.id);
                } else {
                  await appCtx.activateProjectPrismWithDefaultLayers(resource.id);
                }
              }}
              {...panelProps}
            />
          {/snippet}
        </Projects>
      </div>
      <div class="prisms-sections__section prisms-sections__section--layers">
        <Layers {...panelProps}>
          {#snippet filteredItem(
            layer: Layer,
            selectedLayers: Id[],
            hierarchy: ResourceContext
          )}
            <FilteredLayer
              {layer}
              {hierarchy}
              selectedClass="bg-secondary"
              isSelected={selectedLayers.includes(layer.id)}
              onToggle={async (e: MouseEvent | KeyboardEvent) => {
                e.preventDefault();
                e.stopPropagation();
                await appCtx.toggleLayer(layer.id);
                // Close the card if it belonged to a layer which is no longer active
                const activeFeature = appCtx.getActiveFeature();
                if (
                  activeFeature &&
                  !appCtx.state.prisms.layer.includes(activeFeature.layerId)
                ) {
                  navigate('/');
                  omniCtx.setMode(OmniMode.search);
                }
              }}
              onIsolate={async (e: MouseEvent | KeyboardEvent) => {
                e.preventDefault();
                e.stopPropagation();
                await appCtx.isolateLayer(layer.id);
                // Close the card if its layer was excluded by the isolated layer.
                const activeFeature = appCtx.getActiveFeature();
                if (activeFeature && activeFeature.layerId !== layer.id) {
                  navigate('/');
                  omniCtx.setMode(OmniMode.search);
                }
              }}
              {...panelProps}
            />
          {/snippet}
        </Layers>
      </div>
    </div>
  </div>
</Panel>

<style>
.prisms-sections {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
}

.prisms-sections__section {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.prisms-sections__section--bounded {
  max-height: 33.333%;
  flex: 0 1 auto;
}

.prisms-sections__section--layers {
  flex: 1 1 auto;
  min-height: 0;
}

.prisms-sections__section > :global(section) {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
