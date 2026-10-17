<script lang="ts">
// COMPONENTS
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
import SelectedFilter from '#lib/bits/patterns/panels/components/items/SelectedFilter.svelte'
// TYPES
import type { Component, Snippet } from 'svelte'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

type Props = {
  panelProps: PanelProps
  children: Snippet
  title: string
  icon: string | Component
  selectedSummary: string
  isOpen: boolean
  hierarchy: {
    organisation?: string | null
    project?: string | null
    layer?: string | null
    layerId: string
  }
}

let {
  panelProps,
  children,
  title,
  icon,
  selectedSummary,
  isOpen = false,
  hierarchy,
}: Props = $props()
</script>

{#snippet hierarchyPath()}
  <!-- Hierarchy path -->
  <div class="flex flex-wrap gap-1 px-6 pb-3 text-xs text-muted-foreground">
    {#if hierarchy.organisation}
      <span>{hierarchy.organisation}</span>
    {/if}
    {#if hierarchy.project}
      <span aria-hidden="true">›</span><span>{hierarchy.project}</span>
    {/if}
    {#if hierarchy.layer}
      <span aria-hidden="true">›</span><span>{hierarchy.layer}</span>
    {/if}
  </div>
{/snippet}

<Section {title} {icon} defaultOpen={isOpen} {...panelProps}>
  {@render hierarchyPath()}
  <!-- Title row is provided by the shared panel section header. -->
  <div class="space-y-2 pb-4">{@render children()}</div>
  {#snippet collapsedContent()}
    {@render hierarchyPath()}
    <SelectedFilter text={selectedSummary} />
  {/snippet}
</Section>
