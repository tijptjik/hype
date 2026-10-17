<script lang="ts">
// COMPONENTS
import OmnibarSectionEntries from './OmnibarSectionEntries.svelte'
import OmnibarSectionHeader from './OmnibarSectionHeader.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

let {
  collectionType,
  results,
  limit,
  onSelection,
  onPreview,
  totalCount,
  hasMore,
  loading,
  onLoadMore,
}: OmnibarSectionProps = $props()
</script>

<div class="flex shrink-0 select-none flex-col pb-2 pt-2">
  <OmnibarSectionHeader {collectionType} {totalCount} />
  <OmnibarSectionEntries {collectionType} {results} {limit} {onSelection} {onPreview} />
  {#if onLoadMore && (hasMore || results.length > limit)}
    <button
      type="button"
      class="px-4 py-2 text-left text-sm text-primary disabled:opacity-50"
      disabled={loading}
      onclick={onLoadMore}
    >
      {loading ? m.resource_loading() : m.resource_load_more()}
    </button>
  {/if}
</div>
