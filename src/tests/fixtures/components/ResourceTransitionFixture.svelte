<script lang="ts">
// SVELTE
import { setContext } from 'svelte'
import { fade } from 'svelte/transition'
// CONTEXT
import { ADMINCTX_KEY } from '#lib/context/admin.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import RouteViewport from '#lib/bits/custom/transition/RouteViewport.svelte'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import ResourceRow from '#lib/bits/patterns/resource/rows/ResourceRow/ResourceRow.svelte'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
setResponsiveCtx()
setContext(ADMINCTX_KEY, {
  listUi: {
    state: { layoutMode: { layer: 'table', project: 'table', organisation: 'table' } },
  },
  view: { panels: { isPanelOpenOrVisual: () => false } },
})
const resources = [
  FirstClassResource.layer,
  FirstClassResource.project,
  FirstClassResource.organisation,
]
let current = $state(0)
let ready = $state(false)
let empty = $state(false)
let viewport: ReturnType<typeof RouteViewport>
function navigate(): void {
  viewport.prepareNavigation()
  ready = false
  empty = false
  current = (current + 1) % resources.length
}
</script>
<button
  type="button"
  onclick={async () => {
    viewport.prepareNavigation()
    ready = false
    await new Promise(resolve => setTimeout(resolve, 50))
    current = (current + 1) % resources.length
  }}
>
  Next staggered resource
</button>
<button type="button" onclick={navigate}>Next resource</button>
<button type="button" onclick={() => (ready = true)}>Resolve records</button>
<button
  type="button"
  onclick={() => {
    empty = true
    ready = true
  }}
>
  Resolve empty
</button>
<button
  type="button"
  onclick={() => {
    navigate()
    ready = true
  }}
>
  Next cached resource
</button>
<div class="bits-theme flex h-[600px] flex-col" data-stage>
  <RouteViewport bind:this={viewport} routeKey={String(current)}>
    {#key current}
      <!-- A global control transition retains the outgoing route subtree. -->
      <span class="absolute" transition:fade|global={{ duration: 220 }}></span>
      <ResourceIndex
        resource={resources[current]}
        isInitialised={ready}
        entities={(empty
          ? []
          : Array.from({ length: 20 }, (_, i) => ({ id: String(i) }))) as never}
      >
        {#snippet row(entity, index)}
          <ResourceRow
            {index}
            title={resources[current] + entity.id}
            description="Resource description"
          />
        {/snippet}
      </ResourceIndex>
    {/key}
  </RouteViewport>
</div>
