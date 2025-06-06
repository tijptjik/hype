<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
import { getMapCtx } from '$lib/context/map.svelte';
// TYPES
import type { Layer, Project } from '$lib/types';
// CONTEXT
const omniCtx = getOmniContext();
const mapCtx = getMapCtx();

let handleClick = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  omniCtx.setMode('new-feature');
  // Determine whether there is only a single layer active
  const activeLayers = mapCtx.state.prisms.layer;
  if (activeLayers.length === 1) {
    // If only one layer is active, proceed with that layer
    const layer = mapCtx.getLayerById(activeLayers[0]);
    const project = mapCtx.getProject(layer as Layer);
    const organisation = mapCtx.getOrganisation(project as Project);
    mapCtx.setNewFeature({
      layerId: layer?.id,
      projectId: project?.id,
      organisationId: organisation?.id,
      feature: {
        layerId: layer?.id
      }
    });
    // Trigger the GeoLocation modal directly
    const event = new CustomEvent('showGeoLocationModal');
    window.dispatchEvent(event);
  } else {
    // If multiple layers are active, dispatch event to show the layer selection modal
    const event = new CustomEvent('showLayerSelectionModal');
    window.dispatchEvent(event);
  }
};
</script>

<div
  class="flex select-none flex-col divide-y divide-neutral-800 overscroll-none bg-neutral-900 caret-transparent">
  <button
    onclick={handleClick}
    class="btn rounded-t-none bg-transparent p-4 text-center uppercase text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:bg-base-200 active:scale-100 active:bg-base-200/80">
    {m.whole_house_cougar_hurl()}
  </button>
</div>
