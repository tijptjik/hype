<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
import { slide, fade } from 'svelte/transition';
// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  XMark,
  UserGroup,
  Squares2x2,
  Square3Stack3d,
  ChevronDown
} from '@steeze-ui/heroicons';
// TYPES
import type {
  Organisation,
  Project,
  Layer,
  NewFeatureTask,
  DeepPartial,
  Id
} from '$lib/types';
// UTILS
import { MOBILE_MAX_WIDTH } from '$lib/index';

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());
// STATE
let isOpen = $state(false);
let isValid = $state(false);

let searchQuery = $state('');

let newFeature: DeepPartial<NewFeatureTask> | null = $derived.by(appCtx.getNewFeature);

// DERIVED STATE
let selectedOrganisation = $derived(
  newFeature?.organisationId
    ? appCtx.cache.organisation.get(newFeature.organisationId)
    : undefined
);
let selectedProject = $derived(
  newFeature?.projectId ? appCtx.cache.project.get(newFeature.projectId) : undefined
);
let selectedLayer = $derived(
  newFeature?.layerId ? appCtx.cache.layer.get(newFeature.layerId) : undefined
);

// PANEL STATE
let horizontalOffset = $derived.by(() => {
  const { filters, prisms, stars, settings } = appCtx.state.isPanelOpen;
  const leftPanelOpen = prisms || stars;
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
    ? appCtx.state.resources.organisation.filter((org) =>
        org.i18n?.[getLocale()]?.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : appCtx.state.resources.organisation
);

let filteredProjects: Project[] = $derived(
  appCtx.state.resources.project
    .filter((p) =>
      newFeature?.organisationId
        ? p.organisationId === newFeature?.organisationId
        : true
    )
    .filter((p) =>
      searchQuery
        ? p.i18n?.[getLocale()]?.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )
);

let filteredLayers: Layer[] = $derived(
  appCtx.state.resources.layer
    .filter((l) =>
      newFeature?.projectId ? l.projectId === newFeature?.projectId : true
    )
    .filter((l) =>
      searchQuery
        ? l.i18n?.[getLocale()]?.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )
);

const handleShowModal = () => {
  isOpen = true;
  // Set default selections based on active layers
  const activeLayers = appCtx.state.resources.layer.filter((l) =>
    appCtx.state.prisms.layer.includes(l.id)
  );
  if (activeLayers.length > 0) {
    const firstLayer = activeLayers[0];
    const project = appCtx.cache.project.get(firstLayer.projectId);
    const organisation = project
      ? appCtx.cache.organisation.get(project.organisationId)
      : null;

    // Check if all layers share the same organisation
    const allSameOrg = activeLayers.every((layer) => {
      const layerProject = appCtx.cache.project.get(layer.projectId);
      const layerOrg = layerProject
        ? appCtx.cache.organisation.get(layerProject.organisationId)
        : null;
      return layerOrg?.id === organisation?.id;
    });

    // Check if all layers share the same project
    const allSameProject = activeLayers.every(
      (layer) => layer.projectId === firstLayer.projectId
    );

    appCtx.updateNewFeature({
      organisationId: allSameOrg && organisation ? organisation.id : undefined,
      projectId: allSameProject && project ? project.id : undefined,
      layerId: undefined
    });
    appCtx.updateNewFeatureValue('layerId', undefined);
  }
  // Focus the title heading after a short delay to ensure the modal is rendered
  setTimeout(() => {
    const title = document.getElementById('modal-title');
    if (title) title.focus();
  }, 0);
};

function reset() {
  searchQuery = '';
  isValid = false;
}

function handleCloseModal() {
  reset();
  isOpen = false;
  omniCtx.cancelNewFeature();
}

function handleAccept() {
  reset();
  isOpen = false;
  window.dispatchEvent(new CustomEvent('showGeoLocationModal'));
}

function handleResourceSelect(resource: Organisation | Project | Layer, e: Event) {
  e.preventDefault();
  e.stopPropagation();

  // Check from most specific to least specific since children inherit all parent keys
  if ('projectId' in resource && 'organisationId' in resource) {
    // This is a Layer - has both projectId and organisationId
    const layer = resource as Layer;
    appCtx.updateNewFeature({
      organisationId: layer.organisationId as Id,
      projectId: layer.projectId as Id,
      layerId: layer.id as Id,
      feature: {
        organisationId: layer.organisationId as Id,
        projectId: layer.projectId as Id,
        layerId: layer.id as Id
      }
    });
    isValid = true;
  } else if ('organisationId' in resource) {
    // This is a Project - has organisationId but not projectId
    const project = resource as Project;
    appCtx.updateNewFeature({
      organisationId: project.organisationId as Id,
      projectId: project.id as Id,
      layerId: undefined,
      feature: {
        organisationId: project.organisationId as Id,
        projectId: project.id as Id,
        layerId: undefined
      }
    });
    isValid = true;
  } else {
    // This is an Organisation - has neither projectId nor organisationId as foreign key
    const organisation = resource as Organisation;
    appCtx.updateNewFeature({
      organisationId: organisation.id as Id,
      projectId: undefined,
      layerId: undefined,
      feature: {
        organisationId: organisation.id as Id,
        projectId: undefined,
        layerId: undefined
      }
    });
  }
  searchQuery = '';
}

function clearResource(level: 'organisation' | 'project' | 'layer', e: Event) {
  e.preventDefault();
  e.stopPropagation();

  const hierarchy = ['organisationId', 'projectId', 'layerId'] as const;

  const levelIndex = hierarchy.indexOf((level + 'Id') as any);
  const updates: any = { feature: {} };

  // Clear from this level onwards
  for (let i = levelIndex; i < hierarchy.length; i++) {
    updates[hierarchy[i]] = undefined;
    updates.feature[hierarchy[i]] = undefined;
  }

  appCtx.updateNewFeature(updates);
  searchQuery = '';
  isValid = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (newFeature?.organisationId || newFeature?.projectId || newFeature?.layerId) {
      // If any selection exists, reset them
      appCtx.resetNewFeature();
      searchQuery = '';
    } else {
      // If no selections, close the modal
      handleCloseModal();
    }
  } else if (e.key === '/') {
    e.preventDefault();
    // Focus the search input if present
    const input = document.querySelector(
      '.modal-box input[type="text"]'
    ) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }
}

// EVENT HANDLERS
onMount(() => {
  window.addEventListener('showLayerSelectionModal', handleShowModal);
  window.addEventListener('closeLayerSelectionModal', handleCloseModal);
  return () => {
    window.removeEventListener('showLayerSelectionModal', handleShowModal);
    window.removeEventListener('closeLayerSelectionModal', handleCloseModal);
  };
});
</script>

{#if isOpen}
  <dialog
    class="modal pointer-events-auto z-10"
    class:modal-open={isOpen}
    onkeydown={handleKeydown}>
    <div
      class="modal-box flex max-h-[calc(100vh-10rem)] max-w-xl flex-col border-2 border-[#4987E2] bg-black shadow-[0_0_15px_rgba(0,0,255,0.5)]"
      style={`transform: translateX(${horizontalOffset}px)`}>
      <div class="mb-4 flex items-center justify-between caret-transparent">
        <h3
          id="modal-title"
          class="w-full text-center text-lg font-bold focus:border-none focus:outline-none"
          tabindex="-1">
          {m.each_gray_felix_catch()}
        </h3>
        <button
          class="btn btn-ghost btn-sm absolute right-6 top-6"
          onclick={handleCloseModal}>
          <Icon src={XMark} class="h-5 w-5" />
        </button>
      </div>

      <!-- Results Section -->
      <div
        class="mx-auto flex w-full items-center justify-center gap-1 text-sm uppercase tracking-widest caret-transparent transition-[margin] duration-300 {isValid
          ? 'mt-2 w-116:mt-8'
          : 'mb-6 mt-4 w-116:my-8'} flex-col w-116:flex-row">
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={(e) => clearResource('organisation', e)}
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
            {getI18n(
              selectedOrganisation!,
              'nameShort',
              userPreferences,
              m.any_small_midge_aim()
            )}
          </span>
        </button>
        <!-- Chevron: show down chevron on mobile, › on desktop -->
        <span class="flex h-4 items-center justify-center sm:hidden">
          <Icon src={ChevronDown} class="h-4 w-4 text-base-content/60" />
        </span>
        <span
          class="hidden h-4 items-center justify-center text-base-content/60 sm:flex"
          >›</span>
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={(e) => clearResource('project', e)}
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
            {getI18n(
              selectedProject!,
              'nameShort',
              userPreferences,
              m.deft_mealy_ant_vent()
            )}
          </span>
        </button>
        <span class="flex h-4 items-center justify-center sm:hidden">
          <Icon src={ChevronDown} class="h-4 w-4 text-base-content/60" />
        </span>
        <span
          class="hidden h-4 items-center justify-center text-base-content/60 sm:flex"
          >›</span>
        <button
          class="group flex items-center gap-1 focus:border-none focus:outline-none"
          onclick={(e) => clearResource('layer', e)}
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
            {getI18n(
              selectedLayer!,
              'nameShort',
              userPreferences,
              m.active_bold_cobra_grin()
            )}
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
        class="max-h-48 overflow-y-auto rounded-lg caret-transparent"
        tabindex="-1"
        in:fade={{ duration: 200 }}
        out:fade={{ duration: 200 }}>
        {#if filteredOrganisations && !newFeature?.organisationId}
          {#each filteredOrganisations as org (org.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleResourceSelect(org as Organisation, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={UserGroup} class="h-4 w-4" />
              {getI18n(org, 'name', userPreferences)}
            </button>
          {/each}
        {/if}
        {#if filteredProjects && !newFeature?.projectId}
          {#each filteredProjects as project (project.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleResourceSelect(project as Project, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={Squares2x2} class="h-4 w-4" />
              {getI18n(project, 'name', userPreferences)}
            </button>
          {/each}
        {/if}
        {#if filteredLayers && !newFeature?.layerId}
          {#each filteredLayers as layer (layer.id)}
            <button
              class="btn btn-ghost w-full justify-start gap-2 rounded-none focus:border-none focus:outline-none focus-visible:bg-base-200"
              onclick={(e) => handleResourceSelect(layer as Layer, e)}
              in:slide={{ duration: 200, axis: 'y', delay: 200 }}
              out:slide={{ duration: 200, axis: 'y' }}>
              <Icon src={Square3Stack3d} class="h-4 w-4" />
              {getI18n(layer, 'name', userPreferences)}
            </button>
          {/each}
        {/if}
      </div>

      <div class="modal-action caret-transparent">
        <button
          class="btn transition-all duration-300 {isValid
            ? 'bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300'
            : 'btn-disabled'}"
          onclick={handleAccept}>
          {m.main_east_boar_jump()}
        </button>
      </div>
    </div>
    <div class="modal-backdrop" onclick={handleCloseModal}></div>
  </dialog>
{/if}
