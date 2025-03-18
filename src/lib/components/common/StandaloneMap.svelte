<script lang="ts">
// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
// SVELTE
import { onMount } from 'svelte';
// NAVIGATION
import { goto } from '$app/navigation';
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

    navigator.geolocation.watchPosition((geoLocation) => {
      mapContext.state.userLocation = geoLocation;
    });
  });

  mapContext.map!.on('click', (e) => {
    const target = e.originalEvent.target as HTMLElement;
    if (target.dataset.type === 'marker') {
      ('STANDALONE MAP :: MARKER HANDLER');
      const featureId = target.dataset.featureId;
      if (!featureId) return;
      omniContext.handleFeatureSelection(mapContext, featureId, { openCard: true });
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
</div>
