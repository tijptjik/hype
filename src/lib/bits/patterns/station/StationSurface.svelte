<script lang="ts">
import { page } from '$app/state'
import { untrack } from 'svelte'
import { Panel as RoutePanel } from '#lib/enums.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getSurfaceLayoutCtx } from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { premisesCode } from '#lib/indoor/registry.js'
import { Panel } from '#lib/enums.js'
// COMPONENTS
import StationScene from './StationScene.svelte'
import StationCameraControls from './StationCameraControls.svelte'
import StationRouteControls from './StationRouteControls.svelte'
const app = getAppCtx()
const station = app.station
const layout = getSurfaceLayoutCtx()
const responsive = getResponsiveCtx()
$effect(() => {
  const match = /^\/premises\/([a-z0-9-]+)(?:\/places\/([^/]+))?\/?$/.exec(
    page.url.pathname,
  )
  untrack(() => {
    const code = match ? premisesCode(match[1]) : undefined
    if (match && code) {
      const revealPanel = !station.active || station.code !== code || Boolean(match[2])
      void station.open(code, match[2], false)
      if (revealPanel) app.view.panels.openPanel(RoutePanel.prisms, false)
    } else if (station.active) station.close(false)
  })
})
// Clear hidden shop details and routes when the selected project or Feature set changes.
$effect(() => {
  const visible = new Set(station.entries.map(place => place.id))
  if (station.selected?.kind === 'shop' && !visible.has(station.selected.id)) {
    station.selected = null
    station.clearRoute()
  }
  if (station.route && !visible.has(station.route.targetId)) station.clearRoute()
})
const offset = $derived(responsive.isMobile ? 0 : (layout?.getAppMainOffsetX() ?? 0))
</script>
{#if station.active}
  <section
    class="absolute inset-0 z-10 overflow-hidden bg-[var(--station-canvas)]"
    aria-label={`${station.metadata?.name} indoor layout`}
    data-station-surface
  >
    <div
      class="absolute inset-x-4 top-32 bottom-40 sm:top-32 sm:bottom-32"
      style:margin-left={`${Math.max(0, offset * 2)}px`}
      style:margin-right={`${Math.max(0, -offset * 2)}px`}
    >
      {#if station.loading}
        <div
          class="bg-surface h-full animate-pulse rounded-2xl"
          role="status"
          aria-label="Loading station layout"
        ></div>
      {:else if station.error}
        <div
          class="bg-panel text-base-content mx-auto mt-20 max-w-sm rounded-xl p-5"
          role="alert"
        >
          <p>{station.error}</p>
          <button
            type="button"
            class="text-primary mt-3 underline"
            onclick={() => station.open(station.code, undefined, false)}
          >
            Retry loading station
          </button>
        </div>
      {:else if station.data}
        <StationScene
          {station}
          data={station.data}
          onSelect={() => app.view.panels.openPanel(Panel.prisms, false)}
        />
      {:else}
        <div class="bg-panel text-base-content mx-auto mt-16 max-w-md rounded-xl p-6">
          <h2 class="text-xl font-semibold">{station.metadata?.name}</h2>
          <p class="text-muted-foreground mt-2 text-sm">
            Explore the official station maps. Interactive floor plans are not available
            for this station yet.
          </p>
          {#each station.documents as document}
            <a
              class="text-primary mt-4 block underline"
              href={document.path}
              target="_blank"
              rel="noreferrer"
              >{document.kind === 'shops'
                ? 'Shop map'
                : document.kind === 'layout'
                  ? 'Station layout'
                  : 'Location map'}
              ↗</a
            >
          {/each}
          {#if !station.documents.length}
            <p class="mt-4 text-sm">No official PDFs were available when checked.</p>
          {/if}
        </div>
      {/if}
    </div>
    {#if station.data}
      <div
        class="pointer-events-none absolute inset-x-4 bottom-28 flex flex-col items-center gap-2 sm:bottom-24"
        style:transform={`translateX(${offset}px)`}
      >
        <!-- Shared planner choices and routing evidence come from the active source snapshot. -->
        <StationRouteControls />
        <StationCameraControls />
      </div>
      <a
        href="https://api.portal.hkmapservice.gov.hk/disclaimer"
        target="_blank"
        rel="noreferrer"
        class="text-muted-foreground absolute right-2 bottom-1 z-10 flex items-center gap-1 text-[9px]"
        ><img
          src="/indoor/kennedy-town/landsdlogo.jpg"
          alt="Lands Department"
          class="h-4 w-auto"
        >Map from Lands Department · {station.data?.retrievedAt.slice(0, 10)}</a
      >
    {/if}
  </section>
{/if}
