<script lang="ts">
import { createEventDispatcher } from 'svelte';
// LIBRARY
import { once, preventDefault, stopPropagation } from '$lib';
// MapLibre
import SpectralStyle from '$lib/map/style.json';
// UTILS
import { loadScript } from '$lib';
// ICONS
import { ArrowsPointingIn, ArrowsPointingOut } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

type MapProps = {
  coordinates: number[];
  draggable?: boolean;
  toggleFullscreen?: (isFullscreen: boolean) => void;
  dragEndCallback?: (lngLat: number[]) => void;
};

let isFullscreen = $state(false);

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
    attributionControl: false,
    canvasContextAttributes: {
      antialias: true
    }
  });

  // @ts-ignore
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

  // @ts-ignore
  feature.on('dragend', handleDragEnd);
});

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map) {
    // @ts-ignore
    map.flyTo({
      center: mapProps.coordinates,
      zoom: 20
    });
    // @ts-ignore
    feature.setLngLat(mapProps.coordinates);
  }
});

// EVENTS
const handleDragEnd = (e: Event) => {
  // @ts-ignore
  mapProps.dragEndCallback?.(e.target!.getLngLat().toArray());
};
</script>

<div class="relative h-full w-full">
  <div class="absolute right-4 top-4 z-10">
    <button
      class="btn btn-circle btn-sm bg-base-100 opacity-80 hover:opacity-100"
      onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        isFullscreen = !isFullscreen;
        console.log('isFullscreen', e, mapProps.toggleFullscreen);
        mapProps.toggleFullscreen?.(isFullscreen);
      }}>
      <div class="swap">
        <input type="checkbox" checked={isFullscreen} />
        <Icon src={ArrowsPointingIn} class="swap-on h-5 w-5" />
        <Icon src={ArrowsPointingOut} class="swap-off h-5 w-5" />
      </div>
    </button>
  </div>
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

/* This will be used by the parent container */
:global(.map-container) {
  transition: flex-basis 0.3s ease-in-out;
}

:global(.map-container.fullscreen) {
  flex-basis: 100% !important;
}

:global(.content-container) {
  transition:
    flex-basis 0.3s ease-in-out,
    opacity 0.2s ease-in-out;
}

:global(.content-container.hidden) {
  flex-basis: 0% !important;
  opacity: 0;
  overflow: hidden;
}
</style>
