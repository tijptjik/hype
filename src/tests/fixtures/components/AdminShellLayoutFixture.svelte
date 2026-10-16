<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
// COMPONENTS
import AdminShell from '#lib/bits/patterns/layout/app/components/AdminShell.svelte'
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
setResponsiveCtx()
let open = $state(true)
export function toggleSettings() {
  open = !open
}
</script>
<div class="h-screen w-screen">
  <AdminShell
    minWidth={0}
    title=""
    description=""
    widthLabel=""
    isReady={true}
    headerProps={{ title: { text: 'Organisation' }, avatar: { isVisible: false } }}
  >
    {#snippet sidebar()}
      <aside class="h-full w-64 shrink-0 bg-panel" data-test-sidebar>Resources</aside>
    {/snippet}
    {#snippet settings()}
      <PanelRoot isOpen={open} inline isAdmin position="right">
        <div class="p-6">
          <button type="button" onclick={() => (open = false)}>Close settings</button>
          <div class="h-[1500px]">Settings content</div>
        </div>
      </PanelRoot>
    {/snippet}
    <div class="h-full overflow-auto" data-test-main>Main content</div>
  </AdminShell>
</div>
