<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'
// COMPONENTS
import Panel from '$lib/components/layout/Panel.svelte'
import AdminHeader from '$lib/components/panels/common/variants/AdminHeader.svelte'
import Organisations from '$lib/components/panels/sections/Organisations.svelte'
import Projects from '$lib/components/panels/sections/Projects.svelte'
import Layers from '$lib/components/panels/sections/Layers.svelte'
import FilteredResource from '$lib/components/panels/common/FilteredResource.svelte'
import AdminFooter from '$lib/components/panels/common/variants/AdminFooter.svelte'
// SERVICES
import { getSupportedFacetForResource, navigateOnAdminById } from '$lib/navigation'
// ENUMS
import { Panel as PanelEnum, FirstClassResource } from '$lib/enums'
// TYPES
import type {
  Id,
  Organisation,
  Project,
  Layer,
  ResourceContext,
  PanelProps,
} from '$lib/types'

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
</script>

<Panel {...panelProps} bind:panelContainer>
  <div class="flex h-full min-h-0 flex-col">
    <AdminHeader title={m.menu_admin()} {...panelProps} />
    <div class="flex-grow-1 flex min-h-0 flex-col">
      <div class="flex-grow-1 flex min-h-0 flex-col overflow-hidden overscroll-none">
        <div class="flex-grow-1 flex min-h-0 flex-col">
          <Organisations {...panelProps}>
            {#snippet filteredItem(
              organisation: Organisation,
              selectedOrganisations: Id[]
            )}
              <FilteredResource
                resource={organisation}
                selectedClass="bg-primary"
                isSelected={selectedOrganisations.includes(organisation.id)}
                onNavigate={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (
                    panelProps.active?.resourceType ==
                      FirstClassResource.organisation &&
                    panelProps.active?.resourceId == organisation.id
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
        <div class="flex-grow-1 flex min-h-0 flex-col">
          <Projects {...panelProps}>
            {#snippet filteredItem(
              project: Project,
              selectedProjects: Id[],
              hierarchy: ResourceContext
            )}
              <FilteredResource
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
                    panelProps.active?.resourceType == FirstClassResource.project &&
                    panelProps.active?.resourceId == project.id
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
        <div class="flex-grow-4 flex min-h-0 flex-col">
          <Layers {...panelProps}>
            {#snippet filteredItem(
              layer: Layer,
              selectedLayers: Id[],
              hierarchy: ResourceContext
            )}
              <FilteredResource
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
                    panelProps.active?.resourceType == FirstClassResource.layer &&
                    panelProps.active?.resourceId == layer.id
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
      <div class="flex w-full flex-shrink-0 flex-col items-end">
        <AdminFooter {...panelProps} />
      </div>
    </div>
  </div>
</Panel>
