<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// API
import { getResearchLocations } from '#lib/api/fieldResearchLocations.remote.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { GalleryCamera } from '#lib/indoor/galleryCamera.svelte.js'
import ResearchModelPreview from './ResearchModelPreview.svelte'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/building-2'
// I18N
import { buildingNameLabel, recordedBuildingName } from '#lib/locations/kinds.i18n.js'
import { getLocale } from '#lib/i18n.js'

let {
  view,
  title,
  icon,
  organisationId,
  sessionId,
  revision,
}: {
  view: 'exterior' | 'interior' | 'map'
  title: string
  icon: Component
  organisationId: string
  sessionId: string
  revision: number
} = $props()
// A new session owns a fresh camera; lazy cards in this session inherit its latest pose.
const interiorCamera = $derived.by(() => {
  void sessionId
  return new GalleryCamera()
})
const query = $derived(getResearchLocations({ sessionId, revision }))
const buildings = $derived(
  (query.current ?? [])
    .filter(row => row.kind === 'building')
    .map(row => {
      const name = recordedBuildingName(row.names)
      const address =
        row.address ||
        row.streetAddresses
          .map(line => line.label)
          .filter(Boolean)
          .join(' / ')
      return {
        ...row,
        hasPreview: view === 'interior' ? row.hasInteriorMap : row.hasExteriorMap,
        title: name || address || buildingNameLabel(row.names, row.confirmedUnnamed),
        subtitle: name && address !== name ? address : '',
      }
    })
    .sort(
      (a, b) =>
        Number(b.hasPreview) - Number(a.hasPreview) ||
        a.title.localeCompare(b.title, getLocale(), { numeric: true }),
    ),
)
const columns =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-4 p-4'
</script>

{#snippet mapSkeleton()}
  <div
    role="status"
    aria-label="Loading building map"
    class="bg-muted min-h-0 flex-1 motion-safe:animate-pulse"
  ></div>
{/snippet}

<section
  aria-label={title}
  class={view === 'map' ? 'flex min-h-0 flex-1 flex-col' : ''}
>
  {#if view !== 'map'}
    <SectionHeader {title} {icon} />
  {/if}
  {#await query}
    {#if view === 'map'}
      {@render mapSkeleton()}
    {:else}
      <div class={columns} role="status" aria-label={'Loading ' + title}>
        {#each [1, 2, 3] as n (n)}
          <div
            class="border-border overflow-hidden rounded-xl border motion-safe:animate-pulse"
          >
            <div class="bg-muted aspect-square"></div>
            <div class="border-border bg-panel border-t px-4 py-3">
              <div class="bg-muted h-5 w-1/3 rounded"></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:then}
    {#if !buildings.length}
      <p class="text-muted-foreground p-6 text-sm">
        No buildings included in this session.
      </p>
    {:else if view === 'map'}
      {#await import('./ResearchModelMap.svelte')}
        {@render mapSkeleton()}
      {:then { default: ModelMap }}
        <ModelMap {buildings} />
      {:catch}
        <p role="alert" class="text-error p-6">Could not load the building map.</p>
      {/await}
    {:else}
      <section class={columns} aria-label={`${title} cards`}>
        {#each buildings as building (building.id)}
          {@const locationHref =
            '/admin/locations/' +
            encodeURIComponent(building.id) +
            '?organisation=' +
            encodeURIComponent(organisationId)}
          {@const previews =
            view === 'exterior'
              ? [{ url: building.exteriorUrl, name: '' }]
              : building.interiorMaps.length
                ? building.interiorMaps.map(map => ({
                    url:
                      '/api/premises-maps/' +
                      encodeURIComponent(map.id) +
                      '/releases/' +
                      map.hash,
                    name: building.interiorMaps.length > 1 ? map.name : '',
                  }))
                : [{ url: null, name: '' }]}
          {#each previews as preview (view + ':' + (preview.url ?? ''))}
            <article
              aria-label={building.title}
              class="border-border bg-panel flex min-w-0 flex-col overflow-hidden rounded-xl border"
            >
              <div
                class="bg-surface relative grid aspect-square min-h-0 flex-auto place-items-center"
                style:background={view === 'interior'
                  ? 'var(--station-canvas)'
                  : undefined}
              >
                {#if preview.url}
                  <ResearchModelPreview
                    url={preview.url}
                    frontViewId={building.frontViewId}
                    title={building.title + ' ' + view}
                    interior={view === 'interior'}
                    camera={view === 'interior' ? interiorCamera : undefined}
                  />
                {:else}
                  <span
                    role="img"
                    aria-label={'No ' + view + ' model'}
                    title={'No ' + view + ' model'}
                    class="text-muted-foreground/60"
                  >
                    <BuildingIcon class="size-14" aria-hidden="true" />
                  </span>
                {/if}
              </div>
              <a
                href={locationHref}
                class="border-border hover:bg-muted focus-visible:outline-ring block shrink-0 border-t px-4 py-3 hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <h3 class="text-foreground font-semibold break-words">
                  {building.title}
                </h3>
                {#if building.subtitle}
                  <p class="text-muted-foreground text-sm break-words">
                    {building.subtitle}
                  </p>
                {/if}
                {#if preview.name}
                  <p class="text-muted-foreground text-sm">{preview.name}</p>
                {/if}
              </a>
            </article>
          {/each}
        {/each}
      </section>
    {/if}
  {:catch}
    <p role="alert" class="text-error p-6">
      Could not load the session buildings.
      <button type="button" class="underline" onclick={() => query.refresh()}>
        Retry
      </button>
    </p>
  {/await}
</section>
