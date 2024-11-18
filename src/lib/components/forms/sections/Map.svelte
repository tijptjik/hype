<script lang="ts">
import { setContext, onMount, tick } from 'svelte';
import { loadScript } from '$lib';
import SpectralStyle from '$lib/map/style.json';

// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
import { createMapStore, MAPSTORE_CONTEXT_KEY } from '$lib/stores';
// TYPES
import type { SectionProps } from '$lib/types';
// ENV
// import { PUBLIC_MAPTILER_KEY } from '$env/static/public';



// STATE : PROPS
const sectionProps: SectionProps = $props();
let { entity, resource } = sectionProps;

// STATE : DERIVED
let mapEntity = $derived(entity);

// STATE : CONTEXT : FORM
const formProps = getForm(resource, entity);
let { form } = formProps;

const lngLat = $derived($form.geometry?.coordinates);

// STATE : CONTEXT : MAP
let mapContainer: HTMLDivElement;
let map = $state();
let feature = $state();

const syncUpCoordinates = (lngLat: number[]) => {
  form.update(($form) => {
    $form.geometry.coordinates = lngLat;
    return $form;
  });
};

function handleDragEnd(e) {
  syncUpCoordinates(e.target.getLngLat().toArray());
}

// ON MOUNT
$effect(async () => {
    await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');
    // await loadScript('../../map/maplibre-preload.modern.js');

  // eslint-disable-next-line no-undef
  const maplibre = maplibregl;
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());

  map = new maplibre.Map({
    container: mapContainer,
    style: SpectralStyle,
    center: lngLat,
    zoom: 20,
    hash: false,
    attributionControl: false
  });


  feature = new maplibre.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: true
  })
    .setLngLat(lngLat)
    .addTo(map);

  feature.on('dragend', handleDragEnd);

  maplibre.prewarm()
});


$effect(async () => {
    if (map) {
      map.flyTo({
        center: lngLat,
        zoom: 20,
      });
      feature.setLngLat(lngLat)
    }
});
</script>

<div
  class="map rounded-lg bg-base-300 h-full w-full"
  data-testid="map"
  bind:this={mapContainer}>
</div>

<style>
@import 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
.maplibregl-canvas {
  outline: none;
}
</style>
