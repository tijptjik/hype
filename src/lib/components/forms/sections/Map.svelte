<script lang="ts">
// SERVICES
import { calculateDistance } from '$lib/utils/geocoding'
// COMPONENTS
import Map from '$lib/components/common/Map.svelte'
// MAP
import { getCoordinates } from '$lib/client/services/geospatial'
// TYPES
import type { SectionProps, FeatureForm } from '$lib/types'
import type { Point } from 'geojson'
import type { LngLatLike } from 'maplibre-gl'

// STATE : PROPS
let sectionProps: SectionProps & {
  toggleFullscreen: (isFullscreen: boolean) => void
  toggleCollapsed: (isCollapsed: boolean) => void
} = $props()

// STATE : CONTEXT :: FORM
let featureForm: FeatureForm['form'] = $derived((sectionProps.form as FeatureForm).form)

// STATE : DERIVED
let lngLat = $derived(
  getCoordinates(($featureForm.geometry as Point).coordinates as LngLatLike),
)

// UTILS
const syncUpCoordinates = (lngLat: number[]) => {
  featureForm.update($form => {
    ;($form.geometry as Point).coordinates = lngLat
    if (
      $form.addressMeta &&
      $form.addressMeta?.longitude &&
      $form.addressMeta?.latitude
    ) {
      $form.addressMeta.distanceFromPoint = calculateDistance(
        lngLat[0],
        lngLat[1],
        $form.addressMeta?.longitude,
        $form.addressMeta?.latitude,
      )
    }
    return $form
  })
}
</script>

{#if lngLat}
  <div class="relative h-full w-full flex-grow">
    <Map
      coordinates={lngLat}
      dragEndCallback={syncUpCoordinates}
      addressMeta={$featureForm.addressMeta}
      {...sectionProps}
    />
  </div>
{/if}
