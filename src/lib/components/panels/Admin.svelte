<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'
// COMPONENTS
import Organisations from '$lib/components/panels/sections/Organisations.svelte'
import Projects from '$lib/components/panels/sections/Projects.svelte'
import Layers from '$lib/components/panels/sections/Layers.svelte'
// BITS
import { AdminMenu, PanelRoot as Panel } from '$lib/bits'
import * as PanelPattern from '$lib/bits/patterns/panels'
// SERVICES
import { getSupportedFacetForResource, navigateOnAdminById } from '$lib/navigation'
// STYLES
import '$lib/styles/admin-panel.css'
// ENUMS
import { Panel as PanelEnum, FirstClassResource } from '$lib/enums'
// TYPES
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Id, ResourceContext, PanelProps } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()
const adminCtx = getAdminCtx()

// ELEMENTS
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let panelProps: PanelProps = $derived({
  panelType: PanelEnum.admin,
  position: 'left',
  scrollable: false,
  inline: true,
  isNarrow: appCtx.isPanelNarrow(PanelEnum.admin),
  isAdmin: true,
  active: {
    resourceType: appCtx.getActiveResourceType(),
    resourceRef: appCtx.getActiveResourceRef(),
    resourceId: appCtx.getActiveResourceId(),
    facet: appCtx.getActiveFacet(),
  },
  adminCtx,
})

const handleToggleAdminPanel = (): void => {
  appCtx.closePanelVisually(PanelEnum.admin)
  appCtx.togglePanel(PanelEnum.admin)
}
</script>

<Panel {...panelProps} bind:panelContainer>
  <div class="flex h-full min-h-0 flex-col">
    <PanelPattern.PanelHeader.AdminPanel
      title={m.menu_admin()}
      isNarrow={panelProps.isNarrow}
      onTogglePanel={handleToggleAdminPanel}
    />
    <div class="grow flex min-h-0 flex-col">
      <div class="admin-sections">
        <div class="admin-sections__section admin-sections__section--bounded">
          <Organisations {...panelProps}>
            {#snippet filteredItem(
              organisation: Organisation,
              selectedOrganisations: Id[]
            )}
              <PanelPattern.Item.ItemResource
                resource={organisation}
                selectedClass="bg-primary"
                isSelected={selectedOrganisations.includes(organisation.id)}
                onNavigate={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (
                    panelProps.active?.resourceType ===
                      FirstClassResource.organisation &&
                    panelProps.active?.resourceId === organisation.id
                  ) {
                    await appCtx.toggleOrganisation(organisation.id);
                  } else {
                    await navigateOnAdminById(
                      adminCtx,
                      FirstClassResource.organisation,
                      organisation.id,
                       getSupportedFacetForResource(FirstClassResource.organisation, panelProps.active?.facet)
                    );
                  }
                }}
                onToggle={async (e) => {
                  e.stopPropagation();
                  await appCtx.toggleOrganisation(organisation.id);
                }}
                resourceType={FirstClassResource.organisation}
                {...panelProps}
              />
            {/snippet}
          </Organisations>
        </div>
        <div class="admin-sections__section admin-sections__section--bounded">
          <Projects {...panelProps}>
            {#snippet filteredItem(
              project: Project,
              selectedProjects: Id[],
              hierarchy: ResourceContext
            )}
              <PanelPattern.Item.ItemResource
                resource={project}
                hierarchy={{
                  organisation: hierarchy.organisation
                }}
                selectedClass="bg-accent"
                isSelected={selectedProjects.includes(project.id)}
                onNavigate={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (
                    panelProps.active?.resourceType === FirstClassResource.project &&
                    panelProps.active?.resourceId === project.id
                  ) {
                    appCtx.toggleProject(project.id);
                  } else {
                    navigateOnAdminById(
                      adminCtx,
                      FirstClassResource.project,
                      project.id,
                      getSupportedFacetForResource(FirstClassResource.project, panelProps.active?.facet)
                    );
                  }
                }}
                onToggle={(e) => {
                  e.stopPropagation();
                  appCtx.toggleProject(project.id);
                }}
                resourceType={FirstClassResource.project}
                {...panelProps}
              />
            {/snippet}
          </Projects>
        </div>
        <div
          class="admin-sections__section-shell admin-sections__section-shell--layers"
        >
          <div class="admin-sections__section admin-sections__section--layers">
            <Layers {...panelProps}>
              {#snippet filteredItem(
                layer: Layer,
                selectedLayers: Id[],
                hierarchy: ResourceContext
              )}
                <PanelPattern.Item.ItemResource
                  resource={layer}
                  hierarchy={{
                    organisation: hierarchy.organisation,
                    project: hierarchy.project
                  }}
                  selectedClass="bg-secondary"
                  isSelected={selectedLayers.includes(layer.id)}
                  onNavigate={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (
                      panelProps.active?.resourceType === FirstClassResource.layer &&
                      panelProps.active?.resourceId === layer.id
                    ) {
                      appCtx.toggleLayer(layer.id);
                    } else {
                      navigateOnAdminById(
                        adminCtx,
                        FirstClassResource.layer,
                        layer.id,
                        getSupportedFacetForResource(FirstClassResource.layer, panelProps.active?.facet)
                      );
                    }
                  }}
                  onToggle={(e) => {
                    e.stopPropagation();
                    appCtx.toggleLayer(layer.id);
                  }}
                  resourceType={FirstClassResource.layer}
                  {...panelProps}
                />
              {/snippet}
            </Layers>
          </div>
        </div>
      </div>
      <div class="flex w-full shrink-0 flex-col items-end">
        <AdminMenu isNarrow={panelProps.isNarrow} />
      </div>
    </div>
  </div>
</Panel>
