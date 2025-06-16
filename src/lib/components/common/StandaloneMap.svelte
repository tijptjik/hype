<script lang="ts">
import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
// SVELTE
import { onMount } from 'svelte';
import { watch } from 'runed';
// ICONS
import { Square3Stack3d } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// ANIMATION
import { fade } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// I18N
import { m } from '$lib/i18n';
// LIB
import { updateMarkers } from '$lib/map/markers';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// MAP STYLES
import {
  ghosteryEarth,
  ghosteryRoads,
  ghosteryBuildings,
  ghosteryAddressLabel,
  ghosteryPlacesLocality,
  ghosteryPlacesSubplace,
  ghosteryRoadsLabelsMinor
} from '$lib/map/styles/ghostery';
// STYLES
import '$lib/styles/map.css';
// MAPLIBRE
import { Point } from 'maplibre-gl';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';
// TYPES
import type { PointLike, LngLatLike } from 'maplibre-gl';

// let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
let mapContainer: HTMLDivElement;
// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

let lastHorizontalOffset = $state(0);
let isAnimating = $state(false);

// WATCHERS
// Watch for changes in features
onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they 
  // are heavy and the max worker size in the free tier is 1 MB
  
  // Wait for maplibre to be loaded globally
  while (!appCtx.isMaplibreLoaded || !appCtx.maplibre) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Wait for the DOM element to be available
  if (!mapContainer) {
    console.error('Map container not available');
    return;
  }

  appCtx.map = new appCtx.maplibre.Map({
    container: mapContainer,
    style: {
      version: 8,
      sources: {},
      layers: [],
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
      glyphs:
        'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
    },
    center: [114.17276, 22.29191],
    bearing: 17.6,
    zoom: 14,
    hash: false,
    pitch: 45,
    attributionControl: false
  });

  // appCtx.map.transform.setFov(0);

  appCtx.map.on('load', () => {
    appCtx.map.addSource('hongkong-latest', {
      type: 'vector',
      url: 'https://tiles.hype.hk/basemap/hongkong-latest.json'
    });

    if (!appCtx.user?.experimental?.noLabelsMode) {
      appCtx.map.addLayer(ghosteryEarth);
    }
    for (const layer of [ghosteryRoads, ghosteryBuildings, ghosteryAddressLabel]) {
      appCtx.map.addLayer(layer);
    }
    if (!appCtx.user?.experimental?.noLabelsMode) {
      for (const layer of [
        ghosteryPlacesLocality,
        ghosteryPlacesSubplace,
        ghosteryRoadsLabelsMinor
      ]) {
        appCtx.map.addLayer(layer);
      }
    }

    if (appCtx.user) {
      // Initialize and store the GeolocateControl
      const geolocateControl = new appCtx.maplibre.GeolocateControl({
        positionOptions: {
          timeout: 5000,
          enableHighAccuracy: true,
          maximumAge: Infinity
        },
        trackUserLocation: true
      });

      // HACK: This is a hack to prevent the geolocate control from updating the camera
      geolocateControl._updateCamera = () => {};

      appCtx.map!.addControl(geolocateControl, 'bottom-right');

      // TODO : Reactivate
      // setTimeout(() => {
      //   geolocateControl._geolocateButton.click();
      // }, 200);

      navigator.geolocation.watchPosition(
        (geoLocation) => {
          appCtx.state.userLocation = geoLocation;
        },
        (error) => {
          // TODO: Add a fallback to the default location
          // console.error('Error getting geolocation:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity }
      );
    }
  });

  appCtx.map!.on('click', (e) => {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
    const target = e.originalEvent.target as HTMLElement;
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId;
      if (!featureId) return;
      omniCtx.handleFeatureSelection(appCtx, featureId, { openCard: true });
    } else {
      // Priority 1: Close feature card if open
      if (omniCtx.state.isCardOpen) {
        omniCtx.close();
      }
      // Priority 2: Close tray if open in search mode
      else if (omniCtx.state.mode === 'search' && omniCtx.state.isTrayOpen) {
        omniCtx.closeTray();
      }
      // Priority 3: Close panels if open
      else if (Object.values(appCtx.state.panels).some((panel) => panel)) {
        appCtx.closeAllPanels();
      }
    }
  });
  // TODO Add Navigation control
  // appCtx.map!.addControl(new NavigationControl({}), 'bottom-right');
  // appCtx.map!.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
  // appCtx.map!.addControl(new AttributionControl({ compact: true }), 'bottom-right');
});

watch(
  () => [appCtx.featuresVisible, appCtx.isMaplibreLoaded],
  () => {
    if (!isAnimating && appCtx.maplibre && appCtx.isMaplibreLoaded) {
      updateMarkers(appCtx, appCtx.getVisibleFeatures(), appCtx.maplibre);
    }
  }
);

// STATE : DERIVED
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = appCtx.state.panels;
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

// Ensure that the center of the map is in the center of the viewport,
// even after a panel is triggered.
$effect(() => {
  if (horizontalOffset() !== lastHorizontalOffset && appCtx.map && !isAnimating) {
    isAnimating = true;
    let coordinates = appCtx.map!.getCenter();
    const centerInPx: Point = appCtx.map!.project(coordinates);
    const newPoint: PointLike = new Point(
      centerInPx.x +
        (horizontalOffset() === 0 ? lastHorizontalOffset : -horizontalOffset()),
      centerInPx.y
    );
    const newCenter: LngLatLike = appCtx.map!.unproject(newPoint);

    lastHorizontalOffset = horizontalOffset();

    // Set up one-time event listener for when animation completes
    const onMoveEnd = () => {
      isAnimating = false;
      appCtx.map?.off('moveend', onMoveEnd);
    };
    appCtx.map!.on('moveend', onMoveEnd);

    // Start the animation
    appCtx.map!.easeTo({
      center: newCenter,
      duration: 300
    });

    // Fallback timeout in case moveend doesn't fire
    setTimeout(() => {
      isAnimating = false;
      appCtx.map?.off('moveend', onMoveEnd);
    }, 500);
  }
});
</script>

<div
  id="map"
  class="map absolute inset-0 overflow-hidden rounded-2xl caret-transparent"
  data-testid="map"
  bind:this={mapContainer}>
  {#if appCtx.user && appCtx.state.resources.layer.length > 0 && !appCtx.state.prisms.layer.length && !appCtx.state.panels.maps}
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      onclick={() => (appCtx.state.panels.maps = true)}>
      <div
        class="group pointer-events-auto flex max-w-xs flex-col items-center gap-8 rounded-lg border-2 border-[#4987E2] bg-black p-8 px-8 font-mono shadow-[0_0_15px_rgba(0,0,255,0.5)]">
        <p class="text-lg text-base-content">{m.map__no_markers_without_layers()}</p>
        <button
          class="group-hover:inset-shadow-lg btn btn-outline border-[#4987E2] bg-black font-bold uppercase text-[#4987E2] ring-primary transition-all duration-300 group-hover:border-primary/70 group-hover:text-primary/70 group-hover:shadow-primary/70 group-hover:ring-2">
          <Icon
            src={Square3Stack3d}
            class="transition-all duration-300 group-hover:scale-125 group-hover:text-primary" />
          {m.map__select_layer()}
        </button>
      </div>
    </div>
  {/if}
</div>
