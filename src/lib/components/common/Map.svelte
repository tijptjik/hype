<script lang="ts">
// MapLibre
import SpectralStyle from '$lib/map/style.json';
// UTILS
import { loadScript } from '$lib';
// TYPES
import type { EntityRouter, SectionProps } from '$lib/types';
// ENV
// import { PUBLIC_MAPTILER_KEY } from '$env/static/public';

type MapProps = {
  coordinates: number[];
  draggable?: boolean;
  dragEndCallback?: (lngLat: number[]) => void;
};

// STATE : PROPS
let mapProps: MapProps = $props();

// STATE : MAP
let mapContainer: HTMLDivElement;
let map = $state();
let feature = $state();
let isMapLoaded = $state(false);

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
    center: mapProps.coordinates,
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
    draggable: mapProps.draggable || true
  })
    .setLngLat(mapProps.coordinates)
    .addTo(map);

  feature.on('dragend', handleDragEnd);
});

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map) {
    map.flyTo({
      center: mapProps.coordinates,
      zoom: 20
    });
    feature.setLngLat(mapProps.coordinates);
  }
});

// EVENTS
const handleDragEnd = (e: Event) => {
  mapProps.dragEndCallback?.(e.target.getLngLat().toArray());
};
</script>

<div class="relative h-full w-full">
  <!-- Loading Spinner -->
  {#if !isMapLoaded}
    <div
      class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
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
