<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import HeaderFacets from '#lib/bits/patterns/layout/header/components/HeaderFacets.svelte'
import { getAdminFacetTabsForResource } from '#lib/navigation/facets.js'
import { FirstClassResource } from '#lib/enums.js'
setResponsiveCtx()
let resource = $state(FirstClassResource.project)
const items = $derived(
  Array.from(getAdminFacetTabsForResource(resource), ([ref, config]) => ({
    ref,
    ...config,
  })),
)
</script>
<div data-review-header data-expected={JSON.stringify(items.map(item => item.label))}>
  <HeaderFacets {items} />
</div>
<button type="button" onclick={() => (resource = FirstClassResource.project)}>
  Switch to project
</button>
<button type="button" onclick={() => (resource = FirstClassResource.organisation)}>
  Switch to organisation
</button>
