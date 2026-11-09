<script lang="ts">
import LazyMaplet from '#lib/bits/patterns/maps/LazyMaplet.svelte'
import type { MapController } from '#lib/map/controller.js'

let visible = $state(false)
let controller = $state<MapController | null>(null)
let coordinates = $state([114.17, 22.3])
</script>

<button
  type="button"
  onclick={() => {
    visible = !visible
  }}
>
  Toggle map
</button>
<button
  type="button"
  onclick={() => {
    coordinates = [114.18, 22.31]
  }}
>
  Move pin
</button>
<div data-map-ready={Boolean(controller)} class="relative h-[500px] w-[700px]">
  {#if visible}
    <LazyMaplet
      {coordinates}
      addressMeta={null}
      onMapReady={value => {
        controller = value
      }}
    >
      {#snippet pinControls()}
        <span data-pin-control>Pin controls</span>
      {/snippet}
    </LazyMaplet>
  {/if}
</div>
