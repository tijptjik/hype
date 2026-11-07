<script lang="ts">
// COMPONENTS
import OmnibarSectionEntries from './OmnibarSectionEntries.svelte'
import OmnibarSectionHeader from './OmnibarSectionHeader.svelte'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let {
  collectionType,
  results,
  limit,
  onSelection,
  onPreview,
  totalCount,
  loading,
  onLoadMore,
}: OmnibarSectionProps = $props()
</script>

<div
  data-omni-section={collectionType}
  class="flex shrink-0 flex-col pt-2 pb-2 select-none"
>
  <OmnibarSectionHeader {collectionType} {totalCount} {loading} onclick={onLoadMore} />
  <OmnibarSectionEntries {collectionType} {results} {limit} {onSelection} {onPreview} />
</div>
