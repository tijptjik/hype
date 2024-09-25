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
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());

  // const map = new Map({
  const map = new maplibre.Map({
    container: mapContainer,
    style: `https://api.maptiler.com/maps/streets/style.json?key=${PUBLIC_MAPTILER_KEY}`,
    // style: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`,
    // style: { version: 8, sources: {}, layers: [] },
    center: [-2.301405,52.382721],
    pitch: 60,
    bearing: 23.9,
    zoom: 16.39,
    hash: true,
    attributionControl: false
  });


    // map.on('load', () => {
    //     map.addSource('wms-wyre', {
    //         'type': 'raster',
    //         // use the tiles option to specify a WMS tile source URL
    //         // https://maplibre.org/maplibre-style-spec/sources/
    //         'tiles': [
    //             'https://corsproxy.io/?http://inspire.misoportal.com/geoserver/wyre_forest_district_council_treepo/wms?request=getCapabilities'
    //         ],
    //         'tileSize': 256
    //     });
    //     map.addLayer(
    //         {
    //             'id': 'wms-wyre-layer',
    //             'type': 'raster',
    //             'source': 'wms-wyre',
    //             'paint': {}
    //         }
    //     );
    // });



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
