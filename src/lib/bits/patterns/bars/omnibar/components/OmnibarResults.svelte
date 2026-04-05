<script lang="ts">
// COMPONENTS
import OmnibarSection from './OmnibarSection.svelte'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { OmnibarResultsProps } from './omnibarPrimitives.types'

let { sections }: OmnibarResultsProps = $props()
</script>

<div
  class="z-50 flex min-h-0 select-none flex-col divide-y divide-neutral-800 overscroll-contain bg-neutral-900 caret-transparent"
  role="listbox"
  tabindex="-1"
>
  {#if sections.every(section => section.results.length === 0)}
    <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
  {:else}
    {#each sections as section (section.collectionType)}
      {#if section.results.length > 0}
        <OmnibarSection
          collectionType={section.collectionType}
          results={section.results}
          limit={section.limit}
          onSelection={section.onSelection}
        />
      {/if}
    {/each}
  {/if}
</div>
