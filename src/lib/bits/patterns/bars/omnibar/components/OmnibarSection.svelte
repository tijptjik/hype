<script lang="ts">
// COMPONENTS
import OmnibarSectionEntries from './OmnibarSectionEntries.svelte'
import OmnibarSectionHeader from './OmnibarSectionHeader.svelte'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let { collectionType, results, limit, onSelection }: OmnibarSectionProps = $props()
</script>

<div class="flex shrink-0 select-none flex-col pb-2 pt-2">
  <OmnibarSectionHeader {collectionType} />
  <OmnibarSectionEntries {collectionType} {results} {limit} {onSelection} />
</div>
