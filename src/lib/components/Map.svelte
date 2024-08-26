<script lang="ts">
// noinspection TypeScriptCheckImport
import { PUBLIC_MAPTILER_KEY } from '$env/static/public';
import { type MapStore, MAPSTORE_CONTEXT_KEY } from '$lib/stores';
// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
import { getContext, onMount } from 'svelte';

let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
let mapContainer: HTMLDivElement;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;

    document.body.appendChild(script);

    script.addEventListener('load', () => resolve(script));
    script.addEventListener('error', () => reject(script));
  });
}

onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
  // and the max worker size in the free tier is 1 MB
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');

  // eslint-disable-next-line no-undef
  const maplibre = maplibregl;
  console.log('Built with 🗺️ MapLibre ' + maplibre?.getVersion());

  // const map = new Map({
  const map = new maplibre.Map({
    container: mapContainer,
    // style: `https://api.maptiler.com/maps/streets/style.json?key=${PUBLIC_MAPTILER_KEY}`,
    // style: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`,
    style: { version: 8, sources: {}, layers: [] },
    center: [114.15166, 22.28781],
    pitch: 60,
    bearing: 68,
    zoom: 14.32,
    hash: true,
    attributionControl: false
  });
  map.on('load', () => {
    map.addSource('hongkong-latest', {
      type: 'vector',
      url: 'https://tiles.hype.hk/hongkong-latest.json'
    });

    map.addLayer({
      id: 'hk-transportation',
      source: 'hongkong-latest',
      'source-layer': 'transportation',
      type: 'line',
      paint: { 'line-color': '#198EC8' }
      // }, 'building');
    });
  });

  // map.addControl(new NavigationControl({}), 'top-right');
  // map.addControl(
  // 	new GeolocateControl({
  // 		positionOptions: { enableHighAccuracy: true },
  // 		trackUserLocation: true
  // 	}),
  // 	'top-right'
  // );
  // map.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
  // map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

  mapStore?.set(map);
});
</script>

<div class="map full-w relative flex-grow" data-testid="map" bind:this={mapContainer}></div>

<style>
@import 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
.maplibregl-canvas {
  outline: none;
}
</style>
