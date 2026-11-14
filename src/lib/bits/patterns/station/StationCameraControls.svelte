<script lang="ts">
import { getAppCtx } from '#lib/context/app.svelte.js'
const station = getAppCtx().station
</script>
<details
  class="bg-panel text-base-content border-border pointer-events-auto max-w-full rounded-xl border p-3 text-xs"
>
  <summary class="cursor-pointer">Options</summary>
  <div class="mt-3 grid w-64 max-w-full gap-3" oninput={() => station.stopFly()}>
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
      class="text-primary text-left"
      type="button"
      onclick={() => {
        station.clearRoute()
        station.bearing = -115
        station.tilt = 60
        station.planTilt = 0
        station.spacing = 25
        station.fitRevision++
      }}
    >
      Reset view
    </button>
    <p>
      Drag to pan. Ctrl-drag rotates/tilts; Alt-drag tilts. Scroll or Ctrl-scroll zooms;
      Alt-scroll rotates; Ctrl+Alt-scroll tilts. Two fingers pan, pinch and rotate.
    </p>
    <p>
      Solid links follow lift codes or the MTR layout. Dashed links are unverified
      footprint matches; other connections are not mapped yet.
    </p>
  </div>
</details>
