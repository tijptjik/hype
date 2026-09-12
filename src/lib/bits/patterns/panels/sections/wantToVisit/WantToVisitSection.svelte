<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Section from '$lib/bits/patterns/panels/components/common/Section.svelte'
import FilterBar from '$lib/bits/patterns/panels/components/common/FilterBar.svelte'
import { Icon } from '$lib/bits'
import Squares2x2 from 'virtual:icons/lucide/layout-grid'
// TYPES
import type { PanelProps } from '$lib/types'
import type { useSavedFeatureListModel } from '$lib/adapters/panels/useSavedFeatureListModel.svelte'

let {
  model,
  panel,
}: {
  model: ReturnType<typeof useSavedFeatureListModel>
  panel: PanelProps
} = $props()
</script>

<Section
  title={model.title}
  iconGraphicClass="scale-130 origin-bottom"
  icon="/compass.svg"
  {...panel}
>
  {#if model.search || (model.totalCount ?? 0) > 5}
    <FilterBar bind:searchTerm={() => model.search, model.setSearch} />
  {/if}
  <div class="flex min-h-0 flex-col">
    {#if model.loading && model.rows.length === 0}
      <p role="status" class="px-8.5 py-2 text-sm text-base-content/60">
        {m.resource_loading()}
      </p>
    {:else if model.rows.length === 0 && !model.error}
      <div class="flex flex-wrap justify-start gap-2 px-8.5 pt-2">
        <p class="text-sm text-base-content/60">{m.short_watery_marten_race()}</p>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto">
        {#each model.rows as row (row.id)}
          <button
            type="button"
            class="min-h-21 flex w-full cursor-pointer flex-row items-center justify-between gap-4 bg-panel px-4 py-2 text-left text-base-content"
            aria-label={row.title}
            onclick={() => model.onOpen(row.id)}
          >
            <Icon src={Squares2x2} class="h-5 w-5 shrink-0" filled />
            <span class="flex min-w-0 grow flex-col">
              <span class="text-xs uppercase tracking-widest">
                {#if row.organisation}
                  <span class="text-primary">{row.organisation}</span>
                {/if}
                {#if row.project}
                  <span class="mx-1 text-secondary">›</span
                  ><span class="text-secondary">{row.project}</span>
                {/if}
                {#if row.layer}
                  <span class="mx-1 text-secondary">›</span
                  ><span class="text-secondary">{row.layer}</span>
                {/if}
              </span>
              <span class="font-normal">{row.title}</span>
            </span>
          </button>
        {/each}
        {#if model.hasMore}
          <button
            type="button"
            class="w-full px-8.5 py-3 text-sm text-primary disabled:opacity-50"
            disabled={model.loading}
            onclick={model.loadMore}
          >
            {model.loading ? m.resource_loading() : m.resource_load_more()}
          </button>
        {/if}
      </div>
    {/if}
    {#if model.error}
      <p role="alert" class="px-8.5 pt-2 text-sm text-base-content/60">
        {m.honest_swift_lamb_sew()}
      </p>
      <button
        type="button"
        class="px-8.5 py-2 text-left text-sm text-primary"
        onclick={model.retry}
      >
        {m.resource_retry()}
      </button>
    {/if}
  </div>
</Section>
