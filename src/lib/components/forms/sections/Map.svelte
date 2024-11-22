<script lang="ts">
// Svelte
import { setContext, getContext } from 'svelte';
import { fade } from 'svelte/transition';
// MapLibre
import SpectralStyle from '$lib/map/style.json';
// UTILS
import { loadScript } from '$lib';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { EntityRouter, SectionProps } from '$lib/types';
// ENV
// import { PUBLIC_MAPTILER_KEY } from '$env/static/public';

// STATE : PROPS
let sectionProps: SectionProps = $props();

// STATE : FORM
let { form } = sectionProps.form;

// STATE : MAP
let mapContainer: HTMLDivElement;
let map = $state();
let feature = $state();
let isMapLoaded = $state(false);

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE : DERIVED
let lngLat = $derived($form.geometry?.coordinates);

// EFFECTS :: ON MOUNT
let loadMapLibre = loadScript(
  'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js'
).then(() => {
  // await loadScript('../../map/maplibre-preload.modern.js');
  // eslint-disable-next-line no-undef
  const maplibre = maplibregl;
  maplibre.prewarm();
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());
  
  map = new maplibre.Map({
    container: mapContainer,
    style: SpectralStyle,
    center: lngLat,
    zoom: 20,
    hash: false,
    attributionControl: false
  });

  map.on('load', () => {
    isMapLoaded = true;
  });

  feature = new maplibre.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: true
  })
    .setLngLat(lngLat)
    .addTo(map);

  feature.on('dragend', handleDragEnd);
});

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map) {
    map.flyTo({
      center: lngLat,
      zoom: 20
    });
    feature.setLngLat(lngLat);
  }
});

// EVENTS
const handleDragEnd = (e: Event) => {
  syncUpCoordinates(e.target.getLngLat().toArray());
};

// UTILS
const syncUpCoordinates = (lngLat: number[]) => {
  form.update(($form) => {
    $form.geometry.coordinates = lngLat;
    return $form;
  });
};
</script>

<div class="relative h-full w-full flex-grow">
  <!-- Loading Spinner -->
  {#if !isMapLoaded}
    <div class="absolute inset-0 flex items-center justify-center bg-base-300 rounded-lg">
      <div class="loading loading-spinner loading-lg text-primary"></div>
    </div>
  {/if}

  <!-- Map Container -->
  <div
    class="map h-full w-full flex-grow rounded-lg bg-base-300"
    class:opacity-0={!isMapLoaded}
    class:opacity-100={isMapLoaded}
    data-testid="map"
    bind:this={mapContainer}>
  </div>
</div>

<style>
@import 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
.maplibregl-canvas {
  outline: none;
}

.map {
  transition: opacity 0.3s ease-in-out;
}
</style>