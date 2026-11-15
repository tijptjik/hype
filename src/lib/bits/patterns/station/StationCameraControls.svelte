<script lang="ts">
// ICONS
import FitIcon from 'virtual:icons/tabler/focus-centered'
import RotateCcwIcon from 'virtual:icons/proicons/arrow-counterclockwise'
// TYPES
import type { StationState } from '#lib/indoor/station.svelte.js'
// STYLES
import { sliderClasses } from './StationCameraControls.styles'
let { station }: { station: StationState } = $props()
// Match the compass heading while keeping the scene's clockwise rotation convention.
const rotationHeading = $derived(((-station.bearing % 360) + 360) % 360)
</script>
<div class="grid w-44 max-w-full gap-3 text-sm" oninput={() => station.stopFly()}>
  {#if station.data?.coordinateSpace === 'image-pixels'}
    <label class="grid min-w-0 gap-1">
      Original plan opacity · {Math.round(station.artworkOpacity * 100)}%
      <input
        aria-label="Original plan opacity"
        type="range"
        class={sliderClasses}
        min="0"
        max="1"
        step="0.05"
        bind:value={station.artworkOpacity}
      >
    </label>
    <p>Compare the original plan with the traced polygons and facility markers.</p>
  {/if}
  <label class="grid min-w-0 gap-1"
    >Rotation
    <input
      aria-label="Station rotation"
      type="range"
      class={sliderClasses}
      min="0"
      max="359"
      step="1"
      value={rotationHeading}
      oninput={e => {
        station.bearing = -e.currentTarget.valueAsNumber
      }}
    ></label
  >
  <label class="grid min-w-0 gap-1"
    >Tilt
    <input
      aria-label="Station tilt"
      type="range"
      class={sliderClasses}
      min="0"
      max="75"
      step="1"
      value={station.exploded ? station.tilt : station.planTilt}
      oninput={e => {
        if (station.exploded) station.tilt = e.currentTarget.valueAsNumber
        else station.planTilt = e.currentTarget.valueAsNumber
      }}
    ></label
  >
  {#if station.exploded}
    <label class="grid min-w-0 gap-1"
      >Floor spacing
      <input
        aria-label="Floor spacing"
        type="range"
        class={sliderClasses}
        min="10"
        max="65"
        step="1"
        bind:value={station.spacing}
      ></label
    >
  {/if}
  <div class="flex flex-wrap items-center gap-5">
    <button
      class="text-primary inline-flex items-center gap-1.5"
      type="button"
      onclick={() => station.fitView()}
    >
      <FitIcon class="size-4" aria-hidden="true" />
      Fit
    </button>
    <button
      class="text-primary inline-flex items-center gap-1.5"
      type="button"
      onclick={() => {
        station.stopFly()
        station.clearRoute()
        station.bearing = station.data?.coordinateSpace === 'image-pixels' ? 0 : -115
        station.tilt = 60
        station.planTilt = 0
        station.spacing = 25
        station.artworkOpacity = 0
        station.fitView()
      }}
    >
      <RotateCcwIcon class="size-4" aria-hidden="true" />
      Reset
    </button>
  </div>
</div>
