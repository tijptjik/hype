<script lang="ts">
import DeferredPanel from '#lib/bits/patterns/panels/DeferredPanel.svelte'
import type { Component } from 'svelte'
let { active, load }: { active: boolean; load: () => Promise<{ default: Component }> } =
  $props()
</script>

<DeferredPanel {active} {load}>
  {#snippet pending()}
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      class="bg-foreground/10 h-20 w-full"
    ></div>
  {/snippet}
  {#snippet children(Content)}
    <Content />
  {/snippet}
</DeferredPanel>
