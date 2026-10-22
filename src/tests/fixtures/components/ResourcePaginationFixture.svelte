<script lang="ts">
import { setContext } from 'svelte'
import { FirstClassResource } from '#lib/enums.js'
import { ADMINCTX_KEY } from '#lib/context/admin.svelte.js'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import type { LocationResource } from '#lib/locations/resource.js'
setContext(ADMINCTX_KEY, {
  listUi: {
    state: {
      layoutMode: {
        location:
          new URLSearchParams(window.location.search).get('layout') === 'card'
            ? 'card'
            : 'table',
      },
    },
  },
  view: { panels: { isPanelOpenOrVisual: () => false } },
})
const all: LocationResource[] = Array.from({ length: 75 }, (_, index) => ({
  id: String(index),
  kind: 'unknown',
  state: 'unresolved',
  sourceAvailability: 'current',
  ssId: null,
  sourceReference: null,
  ownerOrganisationId: null,
  revisionId: null,
  facts: null,
}))
let entities = $state(all.slice(0, 25))
let loading = $state(false)
let requests = $state(0)
function next(): void {
  if (loading || entities.length === all.length) return
  loading = true
  requests++
  setTimeout(() => {
    entities = all.slice(0, entities.length + 25)
    loading = false
  }, 700)
}
</script>
<div
  data-requests={requests}
  data-count={entities.length}
  style="height:600px;display:flex;flex-direction:column;width:1000px"
>
  <ResourceIndex
    resource={FirstClassResource.location}
    {entities}
    hasMore={entities.length < all.length}
    isLoadingMore={loading}
    onNearEnd={next}
  >
    {#snippet row(
      entity,
    )}
      <div data-row={entity.id} style="height:72px;background:#ddd">
        Location {entity.id}
      </div>
    {/snippet}
    {#snippet card(
      entity,
    )}
      <div data-row={entity.id} style="height:396px;background:#ddd">
        Location {entity.id}
      </div>
    {/snippet}
  </ResourceIndex>
</div>
