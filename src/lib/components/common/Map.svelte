<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// MapLibre
import SpectralStyle from '$lib/map/style-protomaps.json';
import { addAddressMarker } from '$lib/map/markers';
import { getCoordinates } from '$lib/map/data';
// UTILS
import { loadScript } from '$lib';
// ICONS
import { ArrowsPointingIn, ArrowsPointingOut } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { Marker, LngLatLike } from 'maplibre-gl';
import type { Id, AddressMeta } from '$lib/types';
// Add import for preload code
import { monkeyPatchMapLibre } from '$lib/map/maplibre-preload';
// GLOBAL
let maplibre: any;
type MapProps = {
  coordinates: number[];
  addressMeta: AddressMeta | null;
  draggable?: boolean;
  toggleFullscreen?: (isFullscreen: boolean) => void;
  dragEndCallback?: (lngLat: number[]) => void;
};

// CONTEXT
let mapCtx = getMapCtx();
let resourceState = getHierarchicalResourceState();

let isFullscreen = $state(false);

// STATE : PROPS
let mapProps: MapProps = $props();

// STATE : MAP
let mapContainer: HTMLDivElement;
let map = $derived(mapCtx.map);
let feature = $state();
let isMapLoaded = $state(false);

// STATE : DERIVED
let markedAddressLngLat: [number, number] | null = $state(null);
let addressLngLat: [number, number] | null = $derived(
  getCoordinates(mapProps.addressMeta as LngLatLike)
);


// STATE : UI
let addressMarker: Marker | null = $state(null);
let featureMarkerId: Id | null = $state(null);

onMount(async () => {
  // EFFECTS :: ON MOUNT
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');
  // @ts-ignore
  globalThis.maplibregl = maplibregl;

  maplibre = monkeyPatchMapLibre();

  mapCtx.map = new maplibre.Map({
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
  mapCtx.map.on('load', () => {
    isMapLoaded = true;
  });

  feature = new maplibre.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: mapProps.draggable || true
  })
    .setLngLat(mapProps.coordinates)
    .addTo(mapCtx.map);

  // @ts-ignore
  feature.on('dragend', handleDragEnd);
});

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map && mapProps.coordinates && feature) {
    mapCtx.zoomToMarkerOnly = true;
    if (mapProps.coordinates && addressLngLat && !mapCtx.zoomToMarkerOnly) {
      // @ts-ignore
      mapCtx.zoomToCoordinates([mapProps.coordinates, addressLngLat]);
    } else {
      // @ts-ignore
      map.cachedFlyTo({
        center: mapProps.coordinates,
        zoom: 20,
        run: true
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
  mapCtx.zoomToMarkerOnly = true;
};

let isSameCoordinates = (lngLat1: LngLatLike | null, lngLat2: LngLatLike | null) => {
  if (!lngLat1 || !lngLat2) return false;
  if (Array.isArray(lngLat1) && Array.isArray(lngLat2)) {
    return lngLat1[0] === lngLat2[0] && lngLat1[1] === lngLat2[1];
  }
  if ('lon' in lngLat1 && 'lon' in lngLat2) {
    return lngLat1.lon === lngLat2.lon && lngLat1.lat === lngLat2.lat;
  } else if ('lng' in lngLat1 && 'lng' in lngLat2) {
    return lngLat1.lng === lngLat2.lng && lngLat1.lat === lngLat2.lat;
  }
  return false;
};

// Handle address marker updates
$effect(() => {
  if (map && addressLngLat && !isSameCoordinates(addressLngLat, markedAddressLngLat)) {
    // Remove existing marker if it exists
    if (addressMarker) {
      addressMarker.remove();
    }
    // Add new marker
    addressMarker = addAddressMarker(maplibregl, mapCtx, addressLngLat);
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

<!-- ENHANCEMENT - show the canonical image on top of the marker, so that we 
 can remove the canonical image box and leave more space for the properties -->
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
        <input
          name="fullscreen"
          type="checkbox"
          checked={isFullscreen}
          onchange={() => {
            isFullscreen = !isFullscreen;
            mapProps.toggleFullscreen?.(isFullscreen);
          }} />
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
