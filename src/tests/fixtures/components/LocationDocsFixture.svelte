<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AdminShell from '#lib/bits/patterns/layout/app/components/AdminShell.svelte'
import LocationModelDocs from '#lib/bits/patterns/docs/LocationModelDocs.svelte'

setResponsiveCtx()
</script>

<div class="h-screen w-screen">
  <AdminShell
    minWidth={0}
    title=""
    description=""
    widthLabel=""
    isReady={true}
    headerProps={{ title: { text: 'Docs' }, avatar: { isVisible: false } }}
  >
    {#snippet sidebar()}
      <aside class="bg-panel hidden w-40 shrink-0 p-4 md:block">Admin / Docs</aside>
    {/snippet}
    {#snippet settings()}
      <!-- Settings are outside this documentation fixture. -->
      <span hidden></span>
    {/snippet}
    <LocationModelDocs />
  </AdminShell>
</div>
