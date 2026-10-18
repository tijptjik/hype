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
  <!-- Hierarchy path stays visible so each layer's filters remain identifiable. -->
  <div
    class="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 px-6 pb-3 text-xs text-muted-foreground [overflow-wrap:anywhere]"
  >
    {#each [
      { name: hierarchy.organisation, color: 'text-primary' },
      { name: hierarchy.project, color: 'text-tertiary' },
      { name: hierarchy.layer, color: 'text-secondary' },
    ].filter(part => part.name) as part, index}
      {#if index > 0}
        <span aria-hidden="true">›</span>
      {/if}
      <span class={part.color}>{part.name}</span>
    {/each}
  </div>
{/snippet}

<Section
  {title}
  {icon}
  defaultOpen={isOpen}
  persistentContent={hierarchyPath}
  {...panelProps}
>
  <!-- Title row is provided by the shared panel section header. -->
  <div class="space-y-2 pb-4">{@render children()}</div>
  {#snippet collapsedContent()}
    {#if selectedSummary}
      <SelectedFilter text={selectedSummary} />
    {/if}
  {/snippet}
</Section>
