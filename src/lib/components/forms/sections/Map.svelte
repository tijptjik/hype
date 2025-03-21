<script lang="ts">
// MapLibre
import SpectralStyle from '$lib/map/style.json';
// UTILS
import { loadScript } from '$lib';
// COMPONENTS
import Map from '$lib/components/common/Map.svelte';
// TYPES
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();

// STATE : FORM
let { form } = sectionProps.form;

// STATE : DERIVED
let lngLat = $derived($form.geometry?.coordinates);

// UTILS
const syncUpCoordinates = (lngLat: number[]) => {
  form.update(($form) => {
    $form.geometry.coordinates = lngLat;
    return $form;
  });
};
</script>

<div class="relative h-full w-full flex-grow">
  <Map coordinates={lngLat} dragEndCallback={syncUpCoordinates} {...sectionProps} />
</div>
