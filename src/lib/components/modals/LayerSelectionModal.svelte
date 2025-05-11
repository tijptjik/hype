<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
import { slide, fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { XMark, UserGroup, Squares2x2, Square3Stack3d } from '@steeze-ui/heroicons';
// TYPES
import type { Organisation, Project, Layer, UserContributedFeature } from '$lib/types';
// UTILS
import { MOBILE_MAX_WIDTH } from '$lib/index';

// CONTEXT
const mapCtx = getMapContext();

// STATE
let isOpen = $state(false);
let isValid = $state(false);

let searchQuery = $state('');

let newFeature: UserContributedFeature | null = $derived.by(mapCtx.getNewFeature);

// DERIVED STATE
let selectedOrganisation = $derived(
  mapCtx.getOrganisationById(newFeature?.organisationId!)
);
let selectedProject = $derived(mapCtx.getProjectById(newFeature?.projectId!));
let selectedLayer = $derived(mapCtx.getLayerById(newFeature?.layerId!));

// PANEL STATE
let horizontalOffset = $derived.by(() => {
  const { filters, maps, stars, settings } = mapCtx.state.panels;
  const leftPanelOpen = maps || stars;
  const rightPanelOpen = filters || settings;
  if (window.innerWidth < MOBILE_MAX_WIDTH) {
    return 0;
  }
  return leftPanelOpen && rightPanelOpen
    ? 0
    : leftPanelOpen
      ? 420 / 2
      : rightPanelOpen
        ? -420 / 2
        : 0;
});

// FILTERED STATE
let filteredOrganisations: Organisation[] = $derived(
  searchQuery
    ? mapCtx.state.resources.organisation.filter((org) =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : mapCtx.state.resources.organisation
);

let filteredProjects: Project[] = $derived(
  mapCtx.state.resources.project
    .filter((p) =>
      newFeature?.organisationId
        ? p.organisationId === newFeature?.organisationId
        : true
    )
    .filter((p) =>
      searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    )
);

let filteredLayers: Layer[] = $derived(
  mapCtx.state.resources.layer
    .filter((l) =>
      newFeature?.projectId ? l.projectId === newFeature?.projectId : true
    )
    .filter((l) =>
      searchQuery ? l.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    )
);

const handleShowModal = () => {
  isOpen = true;
  // Set default selections based on active layers
  const activeLayers = mapCtx.state.resources.layer.filter((l) =>
    mapCtx.state.prisms.layer.includes(l.id)
  );
  if (activeLayers.length > 0) {
    const firstLayer = activeLayers[0];
    const project = mapCtx.getProject(firstLayer);
    const organisation = project ? mapCtx.getOrganisation(project) : null;

    // Check if all layers share the same organisation
    const allSameOrg = activeLayers.every((layer) => {
      const layerProject = mapCtx.getProject(layer);
      const layerOrg = layerProject ? mapCtx.getOrganisation(layerProject) : null;
      return layerOrg?.id === organisation?.id;
    });

    // Check if all layers share the same project
    const allSameProject = activeLayers.every(
      (layer) => layer.projectId === firstLayer.projectId
    );

    mapCtx.setNewFeature({
      organisationId: allSameOrg && organisation ? organisation.id : undefined,
      projectId: allSameProject && project ? project.id : undefined,
      layerId: undefined
    });
  }
  // Focus the title heading after a short delay to ensure the modal is rendered
  setTimeout(() => {
    const title = document.getElementById('modal-title');
    if (title) title.focus();
  }, 0);
};

// EVENT HANDLERS
onMount(() => {
  window.addEventListener('showLayerSelectionModal', handleShowModal);
  return () => {
    window.removeEventListener('showLayerSelectionModal', handleShowModal);
  };
});

function close() {
  isOpen = false;
  searchQuery = '';
  isValid = false;
  resetSelections();
  // Trigger the GeoLocation modal
  const event = new CustomEvent('showGeoLocationModal');
  window.dispatchEvent(event);
}

function resetSelections() {
  mapCtx.resetNewFeature();
  searchQuery = '';
}

function handleOrganisationSelect(org: Organisation, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    organisationId: org.id,
    projectId: undefined,
    layerId: undefined
  });
  searchQuery = '';
}

function handleProjectSelect(project: Project, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    organisationId: project.organisationId,
    projectId: project.id,
    layerId: undefined
  });
  searchQuery = '';
}

function handleLayerSelect(layer: Layer, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    organisationId: mapCtx.getProject(layer)?.organisationId,
    projectId: layer.projectId,
    layerId: layer.id
  });
  isValid = true;
}

function clearOrganisation(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    organisationId: undefined,
    projectId: undefined,
    layerId: undefined
  });
  searchQuery = '';
  isValid = false;
}

function clearProject(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    projectId: undefined,
    layerId: undefined
  });
  searchQuery = '';
  isValid = false;
}

function clearLayer(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  mapCtx.setNewFeature({
    layerId: undefined
  });
  searchQuery = '';
  isValid = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (newFeature?.organisationId || newFeature?.projectId || newFeature?.layerId) {
      // If any selection exists, reset them
      mapCtx.resetNewFeature();
      searchQuery = '';
    } else {
      // If no selections, close the modal
      close();
    }
  }
}
</script>

{#if isOpen}
  <dialog
    class="modal pointer-events-auto"
    class:modal-open={isOpen}
    onkeydown={handleKeydown}>
    <div
      class="modal-box max-w-xl border-2 border-[#4987E2] bg-black shadow-[0_0_15px_rgba(0,0,255,0.5)]"
      style={`transform: translateX(${horizontalOffset}px)`}>
      <div class="mb-4 flex items-center justify-between caret-transparent">
        <h3
          id="modal-title"
          class="w-full text-center text-lg font-bold focus:border-none focus:outline-none"
          tabindex="-1">
          Select Map
        </h3>
        <button class="btn btn-ghost btn-sm absolute right-6 top-6" onclick={close}>
          <Icon src={XMark} class="h-5 w-5" />
        </button>
      </div>

      <!-- Results Section -->
      <div
        class="mx-auto flex w-full items-center justify-center gap-2 text-sm uppercase tracking-widest caret-transparent transition-[margin] duration-300 {isValid
          ? 'mt-8'
          : 'my-8'}">
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={clearOrganisation}
          tabindex={selectedOrganisation ? 0 : -1}>
          {#if selectedOrganisation}
            <Icon
              src={XMark}
              class="h-4 w-4 opacity-80 group-hover:opacity-100 group-focus:text-primary group-focus:opacity-100" />
          {:else}
            <Icon src={UserGroup} class="h-4 w-4" />
          {/if}
          <span
            class="uppercase {selectedOrganisation
              ? 'text-primary'
              : 'text-base-content'}">
            {selectedOrganisation?.nameShort || 'Organisation'}
          </span>
        </button>
        <span class="text-base-content/60">›</span>
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={clearProject}
          tabindex={selectedProject ? 0 : -1}>
          {#if selectedProject}
            <Icon
              src={XMark}
              class="h-4 w-4 opacity-80 group-hover:opacity-100 group-focus:text-accent group-focus:opacity-100" />
          {:else}
            <Icon src={Squares2x2} class="h-4 w-4" />
          {/if}
          <span
            class="uppercase {selectedProject ? 'text-accent' : 'text-base-content'}">
            {selectedProject?.nameShort || 'Project'}
          </span>
        </button>
        <span class="text-base-content/60">›</span>
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={clearLayer}
          tabindex={selectedLayer ? 0 : -1}>
          {#if selectedLayer}
            <Icon
              src={XMark}
              class="h-4 w-4 opacity-80 group-hover:opacity-100 group-focus:text-secondary group-focus:opacity-100" />
          {:else}
            <Icon src={Square3Stack3d} class="h-4 w-4" />
          {/if}
          <span
            class="uppercase {selectedLayer ? 'text-secondary' : 'text-base-content'}">
            {selectedLayer?.nameShort || 'Layer'}
          </span>
        </button>
      </div>

      <!-- Search Bar -->
      {#if !isValid}
        <div in:fade={{ duration: 200, delay: 200 }} out:fade={{ duration: 200 }}>
          <div class="mb-4">
            <input
              type="text"
              placeholder="Search..."
              class="input input-bordered w-full"
              bind:value={searchQuery} />
          </div>
        </div>
      {/if}

      <!-- Results List -->
      <div
        class="max-h-60 overflow-y-auto rounded-lg caret-transparent"
        tabindex="-1"
        in:fade={{ duration: 200 }}
        out:fade={{ duration: 200 }}>
        {#if filteredOrganisations && !newFeature?.organisationId}
          {#each filteredOrganisations as org (org.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleOrganisationSelect(org as Organisation, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={UserGroup} class="h-4 w-4" />
              {org.name}
            </button>
          {/each}
        {/if}
        {#if filteredProjects && !newFeature?.projectId}
          {#each filteredProjects as project (project.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleProjectSelect(project as Project, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={Squares2x2} class="h-4 w-4" />
              {project.name}
            </button>
          {/each}
        {/if}
        {#if filteredLayers && !newFeature?.layerId}
          {#each filteredLayers as layer (layer.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleLayerSelect(layer as Layer, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={Square3Stack3d} class="h-4 w-4" />
              {layer.name}
            </button>
          {/each}
        {/if}
      </div>

      <div class="modal-action caret-transparent">
        <button
          class="btn transition-all duration-300 {isValid
            ? 'bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300'
            : 'btn-disabled'}"
          onclick={close}>
          OK
        </button>
      </div>
    </div>
    <div class="modal-backdrop" onclick={close}></div>
  </dialog>
{/if}
