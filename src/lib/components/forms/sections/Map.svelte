<script lang="ts">
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { calculateDistance } from '$lib/utils/geocoding'
// COMPONENTS
import Maplet from '$lib/components/common/Maplet.svelte'
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

const appCtx = getAppCtx()

// STATE : CONTEXT :: FORM
let featureForm: FeatureForm['form'] = $derived((sectionProps.form as FeatureForm).form)

// STATE : DERIVED
let lngLat = $derived(
  getCoordinates(($featureForm.geometry as Point).coordinates as LngLatLike),
)
let mapStyleCode = $derived(
  appCtx.cache.project.get(String($featureForm.projectId ?? ''))?.mapStyle?.code ??
    null,
)

$effect(() => {
  if (typeof window === 'undefined') {
    return
  }

  const projectId = String($featureForm.projectId ?? '')
  const project = appCtx.cache.project.get(projectId)

  console.debug('[MapSection] resolved project mapStyleCode', {
    projectId,
    derivedMapStyleCode: mapStyleCode,
    projectMapStyleCode: project?.mapStyle?.code ?? null,
    cachedProject: project ?? null,
  })
})

// UTILS
const syncUpCoordinates = (lngLat: number[]) => {
  featureForm.update($form => {
    ;($form.geometry as Point).coordinates = lngLat
    if ($form.addressMeta?.longitude && $form.addressMeta?.latitude) {
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
  <div class="relative h-full w-full grow">
    <Maplet
      coordinates={lngLat}
      dragEndCallback={syncUpCoordinates}
      addressMeta={$featureForm.addressMeta}
      {mapStyleCode}
      {...sectionProps}
    />
  </div>
{/if}
