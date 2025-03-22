<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// MapLibre
import SpectralStyle from '$lib/map/style.json';
import { addAddressMarker } from '$lib/map/markers';
// UTILS
import { loadScript } from '$lib';
// ICONS
import { ArrowsPointingIn, ArrowsPointingOut } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { Marker, LngLatLike } from 'maplibre-gl';
import type { Id } from '$lib/types';

type MapProps = {
  coordinates: number[];
  draggable?: boolean;
  toggleFullscreen?: (isFullscreen: boolean) => void;
  dragEndCallback?: (lngLat: number[]) => void;
  form: any;
};

// CONTEXT
let mapContext = getMapContext();
let resourceState = getHierarchicalResourceState();

let isFullscreen = $state(false);

// STATE : PROPS
let mapProps: MapProps = $props();

// STATE : MAP
let mapContainer: HTMLDivElement;
let map = $derived(mapContext.map);
let feature = $state();
let isMapLoaded = $state(false);

// STATE : FORM
let { form } = mapProps.form;

// STATE : DERIVED
let markedAddressLngLat: LngLatLike | null = $state(null);
let addressLngLat: LngLatLike | null = $derived(
  $form.addressMeta?.longitude && $form.addressMeta?.latitude
    ? [$form.addressMeta?.longitude, $form.addressMeta?.latitude]
    : null
);

// STATE : UI
let addressMarker: Marker | null = $state(null);
let featureMarkerId: Id | null = $state(null);

onMount(async () => {
  // EFFECTS :: ON MOUNT
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');
  // await loadScript('../../map/maplibre-preload.modern.js');
  // eslint-disable-next-line no-undef
  const maplibre = maplibregl;
  maplibre.prewarm();
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());

  mapContext.map = new maplibre.Map({
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
  mapContext.map.on('load', () => {
    isMapLoaded = true;
  });

  feature = new maplibre.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: mapProps.draggable || true
  })
    .setLngLat(mapProps.coordinates)
    .addTo(mapContext.map);

  // @ts-ignore
  feature.on('dragend', handleDragEnd);
});

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map) {
    if (mapProps.coordinates && addressLngLat && !mapContext.zoomToMarkerOnly) {
      // @ts-ignore
      mapContext.zoomToCoordinates([mapProps.coordinates, addressLngLat]);
    } else {
      map.flyTo({
        center: mapProps.coordinates,
        zoom: 20
      });
    }
    // @ts-ignore
    feature.setLngLat(mapProps.coordinates);
  }
});

// EVENTS
const handleDragEnd = (e: Event) => {
  // @ts-ignore
  mapProps.dragEndCallback?.(e.target!.getLngLat().toArray());
  mapContext.zoomToMarkerOnly = true;
};

let isSameCoordinates = (lngLat1: LngLatLike, lngLat2: LngLatLike) => {
  if (!lngLat1 || !lngLat2) return false;
  return lngLat1[0] === lngLat2[0] && lngLat1[1] === lngLat2[1];
};

// Handle address marker updates
$effect(() => {
  if (map && addressLngLat && !isSameCoordinates(addressLngLat, markedAddressLngLat)) {
    // Remove existing marker if it exists
    if (addressMarker) {
      addressMarker.remove();
    }
    // Add new marker
    addressMarker = addAddressMarker(maplibregl, mapContext, addressLngLat);
    markedAddressLngLat = addressLngLat;
  }
  if (resourceState.activeEntity && resourceState.activeEntity !== featureMarkerId) {
    featureMarkerId = resourceState.activeEntity;
    if (addressMarker) {
      addressMarker.remove();
    }
  }
});
</script>

<div class="relative h-full w-full">
  <div class="absolute right-4 top-4 z-10">
    <button
      class="btn btn-circle btn-sm bg-base-100 opacity-80 hover:opacity-100"
      onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        isFullscreen = !isFullscreen;
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

.marker-address {
  width: 124px;
  height: 124px;
  border-radius: 50%;
  border: 2px solid #5769d3;
  background-color: rgba(20, 9, 77, 0.2);
  cursor: pointer;
}
</style>
