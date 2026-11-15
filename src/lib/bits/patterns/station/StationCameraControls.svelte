<script lang="ts">
// ICONS
import RotateCcwIcon from 'virtual:icons/proicons/arrow-counterclockwise'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
const station = getAppCtx().station
</script>
<div class="grid w-64 max-w-full gap-3 text-sm" oninput={() => station.stopFly()}>
  {#if station.data?.coordinateSpace === 'image-pixels'}
    <label class="grid gap-1">
      Original plan opacity · {Math.round(station.artworkOpacity * 100)}%
      <input
        aria-label="Original plan opacity"
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={station.artworkOpacity}
      >
    </label>
    <p>Compare the original plan with the traced polygons and facility markers.</p>
  {/if}
  <label class="grid gap-1"
    >Rotation
    <input
      aria-label="Station rotation"
      type="range"
      min="-180"
      max="180"
      step="1"
      bind:value={station.bearing}
    ></label
  >
  <label class="grid gap-1"
    >Tilt
    <input
      aria-label="Station tilt"
      type="range"
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
    <label class="grid gap-1"
      >Floor spacing
      <input
        aria-label="Floor spacing"
        type="range"
        min="10"
        max="65"
        step="1"
        bind:value={station.spacing}
      ></label
    >
  {/if}
  <label class="flex gap-2"
    ><input type="checkbox" bind:checked={station.showInferred}>Show unverified
    connections</label
  >
  <button
    class="text-primary inline-flex items-center gap-1.5 justify-self-end"
    type="button"
    onclick={() => {
      station.clearRoute()
      station.bearing = station.data?.coordinateSpace === 'image-pixels' ? 0 : -115
      station.tilt = 60
      station.planTilt = 0
      station.spacing = 25
      station.artworkOpacity = 0
      station.fitRevision++
    }}
  >
    <RotateCcwIcon class="size-4" aria-hidden="true" />
    Reset view
  </button>
</div>
