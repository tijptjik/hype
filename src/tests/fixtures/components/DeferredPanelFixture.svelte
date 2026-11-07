<script lang="ts">
import DeferredPanel from '#lib/bits/patterns/panels/DeferredPanel.svelte'
import type { Component } from 'svelte'
let { active, load }: { active: boolean; load: () => Promise<{ default: Component }> } =
  $props()
</script>

<DeferredPanel {active} {load}>
  {#snippet children(Content)}
    <Content />
  {/snippet}
</DeferredPanel>
