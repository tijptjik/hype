<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// COMPONENTS
import OmnibarSection from './OmnibarSection.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { OmnibarResultsProps } from './omnibarPrimitives.types'
import type { OmnibarResultSection } from '../omnibar.types'

let { sections, updating = false }: OmnibarResultsProps = $props()

// Keep established rows and counts through debounce/loading, then replace each settled category.
let previousSections = $state(new Map<string, OmnibarResultSection>())

/**
 * Preserves a category's visible result set until its replacement has settled.
 * @param section Current category state and action handlers.
 * @param previous Last displayed categories.
 * @returns Current actions with stable rows, count and row limit while loading.
 */
function retainPendingResults(
  section: OmnibarResultSection,
  previous: Map<string, OmnibarResultSection>,
): OmnibarResultSection {
  const retained = previous.get(section.collectionType)
  if (!section.loading || !retained?.results.length) return section
  return {
    ...section,
    results: retained.results,
    totalCount: retained.totalCount,
    limit: retained.limit,
  }
}

const visibleSections = $derived(
  sections
    .map(section => retainPendingResults(section, previousSections))
    .filter(section => section.results.length > 0),
)
$effect(() => {
  const previous = untrack(() => previousSections)
  previousSections = new Map(
    sections.map(section => [
      section.collectionType,
      retainPendingResults(section, previous),
    ]),
  )
})
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: Search results group independent actions rather than form fields. -->
<div
  class="divide-border bg-panel z-50 flex min-h-0 flex-col divide-y overscroll-contain caret-transparent select-none"
  role="group"
  aria-busy={updating || sections.some(section => section.loading)}
  tabindex="-1"
>
  {#if visibleSections.length === 0}
    <div class="text-base-content/60 p-4 text-center">
      {updating || sections.some(section => section.loading)
        ? m.resource_loading()
        : m.omni__no_results()}
    </div>
  {:else}
    {#each visibleSections as section (section.collectionType)}
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
    {/each}
  {/if}
</div>
