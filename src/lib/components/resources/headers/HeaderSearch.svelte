<script lang="ts">
// COMPONENTS
import FilterInput from '$lib/components/menu/FilterInput.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import type { FirstClassResource } from '$lib/enums'

// STATE : CONTEXT
const appCtx = getAppCtx()

// STATE : DERIVED
let resourceType = $derived(appCtx.headerResourceType) as FirstClassResource

function focusFirstVirtualListItem(e: KeyboardEvent) {
  e.preventDefault()
  const firstItem = document.querySelector(
    'svelte-virtual-list-row [tabindex]',
  ) as HTMLElement
  if (firstItem) {
    firstItem.focus()
  }
}
</script>

<div class="relative flex w-full flex-grow items-center justify-center">
  {#if resourceType}
    <FilterInput {resourceType} rounded={true} onTabOut={focusFirstVirtualListItem} />
  {/if}
</div>
