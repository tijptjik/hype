<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// CONTEXT
const omniCtx = getOmniCtx();
const appCtx = getAppCtx();

let activeLayers = $derived(appCtx.state.prisms.layer);
let singleActiveLayer = $derived(
  activeLayers.length === 1 ? appCtx.cache.layer.get(activeLayers[0]) : null
);

let handleClick = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  omniCtx.setMode('new-feature');

  if (activeLayers.length === 1) {
    if (singleActiveLayer) {
      const hierarchy = await appCtx.getHierarchy(singleActiveLayer!);
      appCtx.setNewFeature({
        organisationId: hierarchy.organisation?.id,
        projectId: hierarchy.project?.id,
        layerId: hierarchy.layer?.id,
        feature: {
          organisationId: hierarchy.organisation?.id,
          projectId: hierarchy.project?.id,
          layerId: hierarchy.layer?.id
        }
      });
      // Trigger the GeoLocation modal directly
      const event = new CustomEvent('showGeoLocationModal');
      window.dispatchEvent(event);
    }
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
