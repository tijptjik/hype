import { AppCtx } from '$lib/context/app.svelte';
import { OmniCtx } from '$lib/context/omni.svelte';
import { OmniMode } from '$lib/enums';

export const initAddNewFeature = async (appCtx: AppCtx, omniCtx: OmniCtx, e: Event) => {
  const activeLayers = appCtx.state.prisms.layer;
  const singleActiveLayer =
    activeLayers.length === 1 ? appCtx.cache.layer.get(activeLayers[0]) : null;

  e.preventDefault();
  e.stopPropagation();
  omniCtx.setMode(OmniMode.newFeature);

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
