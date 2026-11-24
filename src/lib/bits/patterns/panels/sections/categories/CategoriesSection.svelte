<script lang="ts">
import { isRangeProperty } from '#lib/properties/range.js'
// SVELTE
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import GridIcon from 'virtual:icons/proicons/grid'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
import CategorySection from '#lib/bits/patterns/panels/sections/categorySection/CategorySection.svelte'
import CategoryFilter from '#lib/bits/patterns/panels/components/controls/CategoryFilter.svelte'
import RangeFilter from '#lib/bits/patterns/panels/components/controls/RangeFilter.svelte'
// ADAPTERS
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
let {
  model,
  ...panelProps
}: PanelProps & {
  model: ReturnType<typeof useFilterPanelModel>
} = $props()
</script>

{#if model.categoriesLoading}
  <Section title={m.filters__categories()} icon={GridIcon} {...panelProps}>
    <div aria-busy="true" aria-label={m.resource_loading()} role="status">
      <div class="px-6 py-3" aria-hidden="true">
        <div
          class="bg-base-content/10 h-3 w-32 rounded motion-safe:animate-pulse"
        ></div>
      </div>
      <div class="pb-4" aria-hidden="true">
        {#each [24, 16, 20, 24] as width}
          <div
            class="border-base-content/10 mx-6 flex h-[68px] items-center justify-between border-b last:border-b-0"
          >
            <span class="flex flex-col gap-2">
              <span
                class="bg-base-content/10 h-3 rounded motion-safe:animate-pulse"
                style:width="{width * 4}px"
              ></span>
              <span
                class="bg-base-content/10 h-4 w-8 rounded motion-safe:animate-pulse"
              ></span>
            </span>
            <span
              class="bg-base-content/10 size-4 rounded motion-safe:animate-pulse"
            ></span>
          </div>
        {/each}
      </div>
    </div>
  </Section>
{/if}

{#each model.categories as group, index (group.hierarchy.layerId)}
  <!-- Animate the whole keyed layer group as its selection enters or leaves. -->
  <div
    class="shrink-0"
    transition:slide={{
      axis: 'y',
      duration: prefersReducedMotion.current ? 0 : 240,
      easing: cubicOut,
    }}
  >
    <CategorySection
      {panelProps}
      title={m.filters__categories()}
      icon={GridIcon}
      isOpen={index === 0}
      selectedSummary={group.selectedSummary}
      hierarchy={group.hierarchy}
    >
      <div class="space-y-2">
        {#each group.properties as property (property.id)}
          {@const filter = model.propertyFilter(property, group.hierarchy.layerId)}
          {#if property.component === 'RangeField' || isRangeProperty(property)}
            <RangeFilter {filter} defaultOpen={property.key === 'grade'} />
          {:else}
            <CategoryFilter {property} {filter} />
          {/if}
        {/each}
      </div>
    </CategorySection>
  </div>
{/each}
