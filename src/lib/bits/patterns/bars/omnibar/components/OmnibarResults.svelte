<script lang="ts">
// COMPONENTS
import OmnibarSection from './OmnibarSection.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { OmnibarResultsProps } from './omnibarPrimitives.types'

let { sections }: OmnibarResultsProps = $props()
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: Search results group independent actions rather than form fields. -->
<div
  class="divide-border bg-panel z-50 flex min-h-0 flex-col divide-y overscroll-contain caret-transparent select-none"
  role="group"
  tabindex="-1"
>
  {#if sections.every(section => section.results.length === 0)}
    <div class="text-base-content/60 p-4 text-center">
      {sections.some(section => section.loading)
        ? m.resource_loading()
        : m.omni__no_results()}
    </div>
  {:else}
    {#each sections as section (section.collectionType)}
      {#if section.results.length > 0}
        <OmnibarSection
          collectionType={section.collectionType}
          results={section.results}
          limit={section.limit}
          onSelection={section.onSelection}
          onPreview={section.onPreview}
          totalCount={section.totalCount}
          hasMore={section.hasMore}
          loading={section.loading}
          onLoadMore={section.onLoadMore}
        />
      {/if}
    {/each}
  {/if}
</div>
