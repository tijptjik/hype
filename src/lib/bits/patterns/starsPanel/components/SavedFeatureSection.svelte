<script lang="ts">
// ICONS
import Star from 'virtual:icons/proicons/star'
import MapPin from 'virtual:icons/proicons/location'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import FilterBar from '#lib/bits/patterns/panels/components/common/FilterBar.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { useSavedFeatureListModel } from '#lib/adapters/panels/useSavedFeatureListModel.svelte.js'

let {
  model,
  panel,
  kind,
}: {
  model: ReturnType<typeof useSavedFeatureListModel>
  panel: PanelProps
  kind: 'wishlist' | 'visited'
} = $props()
</script>

<Section title={model.title} icon={kind === 'visited' ? MapPin : Star} {...panel}>
  <FilterBar
    bind:searchTerm={() => model.search, model.setSearch}
    label={m.panel__search({
      name: kind === 'visited' ? m.stars__have_visited() : m.stars__want_to_visit(),
    })}
  />
  <div class="px-6 pb-4">
    {#if model.rows.length === 0 &&
      !model.error &&
      (!model.loading || model.totalCount !== null)}
      <p class="py-3 text-sm text-muted-foreground">
        {kind === 'visited' ? m.due_mad_whale_attend() : m.short_watery_marten_race()}
      </p>
    {:else}
      <ul class="divide-y divide-border">
        {#each model.rows as row (row.id)}
          <li>
            <button
              type="button"
              class="-mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer flex-col gap-1 rounded-md px-3 py-3 text-left text-base-content outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
              aria-label={row.title}
              onclick={() => model.onOpen(row.id)}
            >
              <span
                class="flex flex-wrap gap-x-1 text-xs text-muted-foreground [overflow-wrap:anywhere]"
              >
                {#if row.organisation}
                  <span>{row.organisation}</span>
                {/if}
                {#if row.project}
                  <span aria-hidden="true">›</span><span>{row.project}</span>
                {/if}
                {#if row.layer}
                  <span aria-hidden="true">›</span><span>{row.layer}</span>
                {/if}
              </span>
              <span class="text-sm leading-5 [overflow-wrap:anywhere]"
                >{row.title}</span
              >
              {#if row.dateLabel}
                <span class="text-xs text-muted-foreground">{row.dateLabel}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if model.hasMore}
        <button
          type="button"
          class="mt-2 min-h-10 w-full rounded-md border border-border px-3 py-2 text-sm text-primary outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          disabled={model.loading}
          onclick={model.loadMore}
        >
          {m.resource_load_more()}
        </button>
      {/if}
    {/if}
    {#if model.error}
      <p role="alert" class="pt-3 text-sm text-muted-foreground">
        {kind === 'visited' ? m.livid_polite_mayfly_build() : m.honest_swift_lamb_sew()}
      </p>
      <button
        type="button"
        class="min-h-10 rounded-sm py-2 text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onclick={model.retry}
      >
        {m.resource_retry()}
      </button>
    {/if}
  </div>
</Section>
