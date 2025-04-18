<script lang="ts">
// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
// SVELTE
import { page } from '$app/stores';
import { onMount } from 'svelte';
// ICONS
import { Square3Stack3d } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// ANIMATION
import { fade } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// I18N
import { m } from '$lib/i18n';
// LIB
import { loadScript } from '$lib';
import { updateMarkers, createMarkerElement } from '$lib/map/markers';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// STYLES
import '$lib/styles/map.css';

// let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
let mapContainer: HTMLDivElement;

// GLOBAL
let maplibre: any;

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();

// WATCHERS
// Watch for changes in features
onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
  // and the max worker size in the free tier is 1 MB
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');

  // eslint-disable-next-line no-undef
  maplibre = maplibregl;
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());

  mapContext.map = new maplibre.Map({
    container: mapContainer,
    // style: `https://api.maptiler.com/maps/streets/style.json?key=${PUBLIC_MAPTILER_KEY}`,
    // style: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`,
    style: { version: 8, sources: {}, layers: [] },
    center: [114.17276, 22.29191],
    // pitch: 60,
    bearing: 17.6,
    zoom: 14,
    hash: false,
    attributionControl: false
  });

  mapContext.map!.on('load', () => {
    mapContext.map!.addSource('hongkong-latest', {
      type: 'vector',
      url: 'https://tiles.hype.hk/hongkong-latest.json'
    });

    mapContext.map!.addLayer({
      id: 'hk-transportation',
      source: 'hongkong-latest',
      'source-layer': 'transportation',
      type: 'line',
      paint: { 'line-color': '#4987E2' }
    });

    // Initial marker setup
    updateMarkers(mapContext, mapContext.getVisibleFeatures(), maplibre);
    // TODO: Add a cleanup function to remove the markers when the component unmounts

    // Initialize and store the GeolocateControl
    const geolocateControl = new maplibre.GeolocateControl({
      positionOptions: {
        timeout: 5000,
        enableHighAccuracy: true,
        maximumAge: Infinity
      },
      trackUserLocation: true
    });

    // HACK: This is a hack to prevent the geolocate control from updating the camera
    geolocateControl._updateCamera = () => {};

    mapContext.map!.addControl(geolocateControl, 'bottom-right');

    setTimeout(() => {
      geolocateControl._geolocateButton.click();
    }, 200);

    navigator.geolocation.watchPosition(
      (geoLocation) => {
        mapContext.state.userLocation = geoLocation;
      },
      (error) => {
        console.error('Error getting geolocation:', error);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity }
    );
  });

  mapContext.map!.on('click', (e) => {
    const target = e.originalEvent.target as HTMLElement;
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId;
      if (!featureId) return;
      omniContext.handleFeatureSelection(mapContext, featureId, { openCard: true });
    } else if (Object.values(mapContext.state.panels).some((panel) => panel)) {
      mapContext.closeAllPanels();
    }
  });

  // mapContext.map!.addControl(new NavigationControl({}), 'bottom-right');
  // mapContext.map!.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
  // mapContext.map!.addControl(new AttributionControl({ compact: true }), 'bottom-right');
});

$effect(() => {
  // Rerender the map when the features change
  mapContext.features;
  updateMarkers(mapContext, mapContext.getVisibleFeatures(), maplibre);
});
</script>

<div id="map" class="map absolute inset-0" data-testid="map" bind:this={mapContainer}>
  {#if $page.data.session && !mapContext.state.prisms.layer.length && !mapContext.state.panels.maps}
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      onclick={() => (mapContext.state.panels.maps = true)}>
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
