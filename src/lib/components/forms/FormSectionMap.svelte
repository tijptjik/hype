<script lang="ts">
import { setContext, onMount } from 'svelte';
import { loadScript } from '$lib';
import SpectralStyle from '$lib/map/style.json';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
import { createMapStore, MAPSTORE_CONTEXT_KEY } from '$lib/stores';
// TYPES
import type { FalsableRef, ResourceType } from '$lib/types';
// ENV
import { PUBLIC_MAPTILER_KEY } from '$env/static/public';

// TYPES
type Props = {
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { entity, resourceType }: Props = $props();

// STATE : CONTEXT : FORM
const { form, errors, constraints } = getForm(resourceType, entity);

const lngLat = $derived($form.geometry?.coordinates);

// STATE : CONTEXT : MAP
const mapStore = createMapStore();
setContext(MAPSTORE_CONTEXT_KEY, mapStore);
let mapContainer: HTMLDivElement;

// ON MOUNT
$effect(async () => {
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');

  // eslint-disable-next-line no-undef
  const maplibre = maplibregl;
  console.info('Built with 🗺️ MapLibre ' + maplibre?.getVersion());
  // const map = new Map({
  const map = new maplibre.Map({
    container: mapContainer,
    style: SpectralStyle,
    center: lngLat,
    zoom: 20,
    hash: false,
    attributionControl: false
  });

  const feature = new maplibre.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: true
  })
    .setLngLat(lngLat)
    .addTo(map);

  function onDragEnd() {
    const lngLat = feature.getLngLat();
    form.update(($form) => {
      $form.geometry.coordinates = lngLat.toArray();
      return $form;
    });
  }

  feature.on('dragend', onDragEnd);

  mapStore?.set(map);
});
</script>

<div
  class="map full-w relative flex-shrink-0 flex-grow basis-1/3 rounded-lg bg-base-300"
  data-testid="map"
  bind:this={mapContainer}>
</div>

<style>
@import 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
.maplibregl-canvas {
  outline: none;
}
</style>
