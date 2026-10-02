<script lang="ts">
// COMPONENTS
import OmnibarSection from './OmnibarSection.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { OmnibarResultsProps } from './omnibarPrimitives.types'

let { sections }: OmnibarResultsProps = $props()
</script>

<div
  class="z-50 flex min-h-0 select-none flex-col divide-y divide-border overscroll-contain bg-panel caret-transparent"
  role="listbox"
  tabindex="-1"
>
  {#if sections.every(section => section.results.length === 0)}
    <div class="p-4 text-center text-base-content/60">
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
          totalCount={section.totalCount}
          hasMore={section.hasMore}
          loading={section.loading}
          onLoadMore={section.onLoadMore}
        />
      {/if}
    {/each}
  {/if}
</div>
