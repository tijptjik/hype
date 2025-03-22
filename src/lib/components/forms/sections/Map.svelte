<script lang="ts">
// SERVICES
import { calculateDistance } from '$lib/utils/geocoding';
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
    if (
      $form.addressMeta &&
      $form.addressMeta?.longitude &&
      $form.addressMeta?.latitude
    ) {
      $form.addressMeta.distanceFromPoint = calculateDistance(
        lngLat[0],
        lngLat[1],
        $form.addressMeta?.longitude,
        $form.addressMeta?.latitude
      );
    }
    return $form;
  });
};
</script>

<div class="relative h-full w-full flex-grow">
  <Map
    coordinates={lngLat}
    dragEndCallback={syncUpCoordinates}
    {form}
    {...sectionProps} />
</div>
