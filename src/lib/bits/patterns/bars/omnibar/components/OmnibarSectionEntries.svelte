<script lang="ts">
// COMPONENTS
import OmnibarEntry from './OmnibarEntry.svelte'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let { results, limit, onSelection }: OmnibarSectionProps = $props()
</script>

<div class="flex shrink-0 select-none flex-col" role="group">
  {#each results.slice(0, limit) as result}
    <OmnibarEntry {result} {onSelection} />
  {/each}
</div>
