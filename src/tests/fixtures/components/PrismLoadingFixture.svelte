<script lang="ts">
// COMPONENTS
import ResourceSection from '#lib/bits/patterns/resourcePanel/components/ResourceSection.svelte'
// TYPES
import type { ResourcePanelSection } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'
let loaded = $state([false, false, false])
const types = ['organisation', 'project', 'layer'] as const
const sections = $derived<ResourcePanelSection[]>(
  types.map((id, index) => ({
    id,
    title: id,
    search: '',
    loading: !loaded[index],
    error: false,
    defaultOpen: true,
    viewKey: id,
    rows: loaded[index]
      ? Array.from({ length: 6 }, (_, row) => ({
          id: `${id}-${row}`,
          name: `${id} ${row}`,
          breadcrumbs: index ? ['Parent'] : [],
          selected: false,
          active: false,
          enabled: true,
          primaryLabel: `Open ${id} ${row}`,
          toggleLabel: `Pin ${id} ${row}`,
          onPrimary: () => {},
          onToggle: () => {},
        }))
      : [],
    onSearch: () => {},
    onReset: () => {},
    onNext: () => {},
    onRetry: () => {},
    onVisible: () => {},
  })),
)
</script>
<div class="bits-theme bg-canvas flex h-screen">
  <aside class="bg-panel flex h-full w-[344px] flex-col">
    {#each sections as section (section.id)}
      <ResourceSection
        {section}
        initialLayoutReady={sections.every(item => !item.loading || item.error)}
      />
    {/each}
  </aside>
  <main>
    {#each types as type, index}
      <button type="button" onclick={() => (loaded[index] = true)}>Load {type}</button>
    {/each}
  </main>
</div>
