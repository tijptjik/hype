<script lang="ts">
// SVELTE
import { setContext } from 'svelte'
// CONTEXT
import { ADMINCTX_KEY } from '#lib/context/admin.svelte.js'
// COMPONENTS
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import Row from '#lib/bits/custom/rows/Row.svelte'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { Resource } from '#lib/types.js'

let count = $state(50)
let loading = $state(false)
let requests = $state(0)
const entities = $derived(
  Array.from({ length: count }, (_, index) => ({ id: String(index) })) as Resource[],
)
setContext(ADMINCTX_KEY, {
  listUi: { state: { layoutMode: { feature: 'table' } } },
  view: { panels: { isPanelOpenOrVisual: () => false } },
})
</script>

<div
  class="bits-theme bg-panel relative flex h-[600px] w-[1000px] flex-col"
  data-fixture
>
  <ResourceIndex
    resource={FirstClassResource.feature}
    {entities}
    hasMore={count < 150}
    isLoadingMore={loading}
    onNearEnd={() => {
      requests++
      loading = true
    }}
  >
    {#snippet row(entity, index)}
      <Row
        onclick={() => {}}
        onkeydown={() => {}}
        {index}
        title={`Feature ${entity.id}`}
        description="A feature address"
      />
    {/snippet}
  </ResourceIndex>
</div>
<button
  type="button"
  data-append
  onclick={() => {
    count += 50
    loading = false
  }}
>
  Resolve next page
</button>
<output data-requests>{requests}</output>
