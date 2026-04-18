<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import { Icon } from '$lib/bits'
import MapPin from 'virtual:icons/lucide/map-pin'
import GlobeAsiaAustralia from 'virtual:icons/lucide/globe-2'

// TRANSITIONS
import { fade } from 'svelte/transition'
// TYPES
import type { FeatureForm } from '$lib/types'
import type { Point } from 'geojson'

// CONFIG
const coordinateLabels = [m.admin__geo_latitude(), m.admin__geo_longitude()]

// STATE : PROPS
let extraProps: { form: FeatureForm } = $props()

// STATE : CONTEXT
let { form } = extraProps.form

// STATE : DERIVED :: GEOMETRY
let [lng, lat] = $derived(($form.geometry as Point).coordinates)

// HANDLERS
function copyCoordinates() {
  const coords = ($form.geometry as Point).coordinates.join(',')
  navigator.clipboard.writeText(coords)
}
</script>

<div class="flex h-full flex-1 select-none flex-row items-center justify-center gap-6">
  <div class="tooltip" data-tip={m.arable_gray_okapi_roam()}>
    <Icon
      src={MapPin}
      class="hover:text-content/70 h-6 w-6 cursor-pointer select-none stroke-[2px] active:text-neutral-content"
      onclick={copyCoordinates}
    />
  </div>
  {#each coordinateLabels as label, index}
    <div class="flex select-none flex-row items-center gap-3">
      <p class="font-spaced hidden text-sm font-bold xl:block">{label}</p>
      {#key ($form.geometry as Point).coordinates}
        <pre
          in:fade={{ duration: 300 }}
          class="selected:bg-primary selected:text-base-content select-all font-mono text-lg font-light tracking-wider text-base-content/80"
        >{(
            $form.geometry as Point
          ).coordinates[index].toFixed(5)}</pre>
      {/key}
    </div>
  {/each}
  <a
    draggable="false"
    class="btn-rounded group btn btn-circle btn-ghost select-none transition-colors duration-300"
    href={`https://earth.google.com/web/@${lat},${lng}`}
    target="_blank"
    aria-label="View on Google Earth"
  >
    <Icon
      src={GlobeAsiaAustralia}
      class="transition-size h-8 w-8 stroke-[2px] duration-300 hover:rotate-6 group-hover:scale-110"
    />
  </a>
</div>
