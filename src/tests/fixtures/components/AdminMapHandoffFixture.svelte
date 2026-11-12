<script lang="ts">
// COMPONENTS
import AdminMapHost from '#lib/bits/patterns/maps/AdminMapHost.svelte'
import AdminMapOutlet from '#lib/bits/patterns/maps/AdminMapOutlet.svelte'
import RouteViewport from '#lib/bits/custom/transition/RouteViewport.svelte'
// CONTEXT
import { setAdminMap } from '#lib/context/adminMap.svelte.js'
// TYPES
import type { MapController } from '#lib/map/controller.js'

const owner = setAdminMap()
let route = $state('feature')
let coordinates = $state([114.16, 22.3182])
let controller = $state.raw<MapController | null>(null)
let camera = $state('')
</script>

<button type="button" onclick={() => (route = 'loading')}>Leave route</button>
<button type="button" onclick={() => (route = 'location')}>Open same Location</button>
<button
  type="button"
  onclick={() => {
    coordinates = [114.17, 22.32]
    route = 'other'
  }}
>
  Open another Location
</button>
<button type="button" onclick={() => (route = 'feature')}>Back to Feature</button>
<button type="button" onclick={() => (route = 'draft')}>New unpinned draft</button>
<button
  type="button"
  onclick={() =>
    controller?.jumpTo({ center: [114.161, 22.319], zoom: 17, bearing: 23, pitch: 30 })}
>
  Pan camera
</button>
<button
  type="button"
  onclick={() => (camera = JSON.stringify(controller?.getCamera()))}
>
  Read camera
</button>
<button type="button" onclick={() => owner.clear()}>Clear account</button>
<output data-camera>{camera}</output>
<main data-route={route} data-ready={Boolean(controller)}>
  <RouteViewport routeKey={route}>
    {#if route !== 'loading'}
      <section
        class="h-[320px] w-full [&_.bits-feature-map]:min-h-0 [&_.bits-feature-map]:rounded-none"
      >
        <AdminMapOutlet
          {coordinates}
          initialZoom={route === 'draft' ? 11.5 : 18}
          initialCenter={route === 'draft' ? [114.1, 22.3] : null}
          showMarker={route !== 'draft'}
          addressMeta={null}
          draggable={false}
          onMapReady={value => (controller = value)}
        />
      </section>
    {/if}
  </RouteViewport>
</main>
<AdminMapHost {owner} />
