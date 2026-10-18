<script lang="ts">
// COMPONENTS
import OmnibarEntry from './OmnibarEntry.svelte'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let { results, limit, onSelection, onPreview }: OmnibarSectionProps = $props()
</script>

<section class="flex shrink-0 select-none flex-col">
  {#each results.slice(0, limit) as result}
    <OmnibarEntry {result} {onSelection} {onPreview} />
  {/each}
</section>
