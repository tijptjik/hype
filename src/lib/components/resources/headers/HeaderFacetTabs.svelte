<script lang="ts">
// COMPONENTS
import HeaderButton from '$lib/components/layout/HeaderButton.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'

// STATE : CONTEXT
const appCtx = getAppCtx()
const adminCtx = getAdminCtx()

// STATE : DERIVED
let facetTabs = $derived(appCtx.state.header.facetTabs)
let activeFacet = $derived(adminCtx.activeFacet)
</script>

{#if facetTabs.size > 0}
  <ul class="mt-1 flex flex-row space-x-2 px-2">
    {#each Array.from(facetTabs.entries()) as [ facetRef, label ]}
      <HeaderButton
        facet={{ label, ref: facetRef }}
        isActive={activeFacet === facetRef ||
          (activeFacet === false && facetRef === 'core')}
      />
    {/each}
  </ul>
{/if}
