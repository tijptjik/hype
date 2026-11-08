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
    {#if kind === 'wishlist' &&
      (model.splitGuidance.length || model.guidanceError || model.hasMoreGuidance)}
      <section
        class="border-border mb-4 grid gap-2 rounded-md border p-3"
        aria-label="Updates to saved places"
      >
        <p class="text-sm font-medium">Updates to saved places</p>
        {#if model.splitGuidance.length}
          <p class="text-muted-foreground text-xs">
            These places were split. Your original saved links are kept; choose which
            resulting places you want to visit.
          </p>
        {/if}
        {#each model.splitGuidance as saved (saved.id)}
          <div class="grid gap-1 text-sm">
            <a
              class="break-words whitespace-normal underline"
              href={`/features/${encodeURIComponent(saved.id)}`}
              >{Object.values(saved.titles)[0] || saved.id}</a
            >
            <ul class="grid gap-1 pl-3">
              {#each saved.successors as successor (successor.id)}
                <li>
                  <a
                    class="break-words whitespace-normal underline"
                    href={`/features/${encodeURIComponent(successor.id)}`}
                    >{Object.values(successor.titles)[0] || successor.id}</a
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/each}
        {#if model.guidanceError}
          <p role="alert" class="text-sm">{model.guidanceError}</p>
          <button
            type="button"
            class="text-left text-sm underline"
            onclick={model.retryGuidance}
          >
            Retry saved-place updates
          </button>
        {/if}
        {#if model.hasMoreGuidance}
          <button
            type="button"
            class="text-left text-sm underline disabled:opacity-50"
            disabled={model.guidanceLoading}
            onclick={model.loadMoreGuidance}
          >
            {model.guidanceLoading ? 'Loading updates…' : 'More saved-place updates'}
          </button>
        {/if}
      </section>
    {/if}
    {#if model.rows.length === 0 &&
      model.splitGuidance.length === 0 &&
      !model.guidanceLoading &&
      !model.guidanceError &&
      !model.error &&
      (!model.loading || model.totalCount !== null)}
      <p class="text-muted-foreground py-3 text-sm">
        {kind === 'visited' ? m.due_mad_whale_attend() : m.short_watery_marten_race()}
      </p>
    {:else}
      <ul class="divide-border divide-y">
        {#each model.rows as row (row.id)}
          <li>
            <button
              type="button"
              class="text-base-content hover:bg-surface focus-visible:ring-focus -mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer flex-col gap-1 rounded-md px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
              aria-label={row.title}
              onclick={() => model.onOpen(row.id)}
            >
              <span
                class="text-muted-foreground flex flex-wrap gap-x-1 text-xs [overflow-wrap:anywhere]"
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
                <span class="text-muted-foreground text-xs">{row.dateLabel}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if model.hasMore}
        <button
          type="button"
          class="border-border text-primary hover:bg-surface focus-visible:ring-focus mt-2 min-h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
          disabled={model.loading}
          onclick={model.loadMore}
        >
          {m.resource_load_more()}
        </button>
      {/if}
    {/if}
    {#if model.error}
      <p role="alert" class="text-muted-foreground pt-3 text-sm">
        {kind === 'visited' ? m.livid_polite_mayfly_build() : m.honest_swift_lamb_sew()}
      </p>
      <button
        type="button"
        class="text-primary focus-visible:ring-focus min-h-10 rounded-sm py-2 text-sm outline-none focus-visible:ring-2"
        onclick={model.retry}
      >
        {m.resource_retry()}
      </button>
    {/if}
  </div>
</Section>
