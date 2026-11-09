<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AdminShell from '#lib/bits/patterns/layout/app/components/AdminShell.svelte'

setResponsiveCtx()
let ready = $state(false)
let failed = $state(false)
let section = $state('Tasks')
</script>

<AdminShell
  minWidth={0}
  title=""
  description=""
  widthLabel=""
  isReady={true}
  isContentReady={ready}
  headerProps={{ title: { text: section }, avatar: { isVisible: false } }}
>
  {#snippet sidebar()}
    <aside class="bg-panel h-full w-64 p-4" data-test-sidebar>
      <button
        type="button"
        onclick={() => {
          section = 'Projects'
        }}
      >
        Projects
      </button>
    </aside>
  {/snippet}
  {#snippet settings()}
    <!-- This fixture deliberately has no settings controls. -->
  {/snippet}
  {#snippet pending()}
    <div class="p-6" role="status">
      {#if failed}
        <p>Request failed</p>
        <button
          type="button"
          onclick={() => {
            failed = false
          }}
        >
          Retry data
        </button>
      {:else}
        <p>Loading section</p>
        <button
          type="button"
          onclick={() => {
            ready = true
          }}
        >
          Resolve data
        </button>
        <button
          type="button"
          onclick={() => {
            failed = true
          }}
        >
          Fail data
        </button>
      {/if}
    </div>
  {/snippet}
  <div class="p-6" data-test-content>{section} content</div>
</AdminShell>
