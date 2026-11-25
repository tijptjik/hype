<script lang="ts">
// I18N
import { getLocale } from '#lib/i18n.js'
import { premisesLabel } from '#lib/indoor/premisesLabels.js'
import { page } from '$app/state'
import { goto } from '$app/navigation'
import { tick, untrack } from 'svelte'
import { fade } from 'svelte/transition'
import type { IndoorData, Place } from '#lib/indoor/model.js'
import { prefersReducedMotion } from 'svelte/motion'
import { Panel as RoutePanel } from '#lib/enums.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { premisesCode, loadPremisesCatalogue } from '#lib/indoor/registry.js'
import { Panel } from '#lib/enums.js'
// COMPONENTS
import StationScene from './StationScene.svelte'
import StationIndexes from './StationIndexes.svelte'
import StationIdentity from './StationIdentity.svelte'
const app = getAppCtx()
const station = app.station
// Same-path navigation must not restart catalogue resolution or replace the scene.
const pathname = $derived(page.url.pathname)
const indoorMatch = $derived(
  /^\/(?:premises|buildings)\/([a-z0-9-]+)(?:\/places\/([^/]+))?\/?$/.exec(pathname),
)
const hasCurrentScene = $derived(
  Boolean(station.data && indoorMatch && premisesCode(indoorMatch[1]) === station.code),
)
let resolving = $state(false)
let resolutionError = $state('')
let resolutionRetry = $state(0)
let venueOpacity = $state(1)
const venueFadeMs = 220
// Keep legend membership and level state intact until the next venue has finished loading.
let legend = $state<{
  data: IndoorData
  entries: Place[]
  isBuilding: boolean
  exploded: boolean
  floor: string
} | null>(null)
$effect(() => {
  if (station.loading || resolving || station.error || resolutionError) return
  legend = station.data
    ? {
        data: station.data,
        entries: station.entries,
        isBuilding: station.isBuilding,
        exploded: station.exploded,
        floor: station.floor,
      }
    : null
})

$effect(() => {
  const match = indoorMatch
  resolutionRetry
  resolving = Boolean(match) && untrack(() => !station.active)
  resolutionError = ''
  if (!match) {
    untrack(() => {
      venueOpacity = 1
      if (station.active) station.close(false)
    })
    return
  }
  let cancelled = false
  void (premisesCode(match[1]) ? Promise.resolve() : loadPremisesCatalogue())
    .then(() =>
      untrack(async () => {
        if (cancelled) return
        const code = match ? premisesCode(match[1]) : undefined
        if (match && code) {
          const revealPanel = Boolean(match[2])
          // Retain the outgoing floor map until its fade finishes; load the next venue while hidden.
          const changesVenue = station.active && station.code !== code
          if (changesVenue && !prefersReducedMotion.current) {
            venueOpacity = 0
            await tick()
            await new Promise(resolve => setTimeout(resolve, venueFadeMs))
            if (cancelled) return
          }
          resolving = true
          await station.open(code, match[2], false)
          if (cancelled) return
          resolving = false
          await tick()
          // Give the new scene a paint before fading it in, including cached station maps.
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          )
          if (cancelled) return
          venueOpacity = 1
          if (revealPanel) app.view.panels.openPanel(RoutePanel.prisms, false)
        } else {
          if (station.active) station.close(false)
          venueOpacity = 1
          if (match) resolutionError = 'Premises not found'
        }
      }),
    )
    .catch(error => {
      if (!cancelled) {
        console.error(error)
        resolutionError = 'Could not load premises maps'
        venueOpacity = 1
      }
    })
    .finally(() => {
      if (!cancelled) resolving = false
    })
  return () => {
    cancelled = true
  }
})
$effect(() => {
  const refresh = () => {
    if (document.visibilityState === 'visible') void station.refreshPublished()
  }
  document.addEventListener('visibilitychange', refresh)
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void station.checkPublished()
  }, 60000)
  return () => {
    document.removeEventListener('visibilitychange', refresh)
    clearInterval(timer)
  }
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
// Keep the indoor scene above the world map until its matching camera has rendered.
$effect(() => {
  if (!station.returningToMap || !station.returnSceneReady || !station.returnMapReady)
    return
  station.returnFading = true
  const timer = setTimeout(
    () => {
      const view = station.worldView
      if (!view) return
      const query = new URLSearchParams({
        mapTracking: 'true',
        lng: String(view.center[0]),
        lat: String(view.center[1]),
        zoom: String(view.zoom),
        bearing: String(view.bearing),
        pitch: String(view.pitch),
      })
      void goto(`/?${query}`)
    },
    prefersReducedMotion.current ? 0 : 420,
  )
  return () => clearTimeout(timer)
})
</script>
{#if station.active || indoorMatch}
  <section
    in:fade={{ duration: prefersReducedMotion.current ? 0 : 420 }}
    class="absolute inset-0 z-10 overflow-hidden bg-[var(--station-canvas)] select-none [&_*]:select-none"
    aria-label={`${premisesLabel(station.metadata, getLocale()) || 'Premises'} indoor layout`}
    style:opacity={station.returnFading ? 0 : 1}
    style:transition={prefersReducedMotion.current ? 'none' : 'opacity 420ms ease'}
    inert={station.returningToMap}
    data-station-return={station.returningToMap
      ? station.returnFading
        ? 'fading'
        : 'zooming'
      : undefined}
    data-station-surface
  >
    <div
      class={[
        'absolute inset-0',
        station.data?.sourceDataset?.startsWith('gbp:') && 'md:right-56 md:left-40',
      ]}
      data-station-venue-content
      style:opacity={venueOpacity}
      style:transition={prefersReducedMotion.current
        ? 'none'
        : `opacity ${venueFadeMs}ms ease`}
      inert={venueOpacity === 0}
    >
      {#if (resolving && !hasCurrentScene) ||
        station.loading ||
        (!station.active && !resolutionError)}
        <div
          class="bg-surface h-full animate-pulse rounded-2xl"
          role="status"
          aria-label="Loading station layout"
        ></div>
      {:else if resolutionError || station.error}
        <div
          class="bg-panel text-base-content mx-auto mt-20 max-w-sm rounded-xl p-5"
          role="alert"
        >
          <p>{resolutionError || station.error}</p>
          <button
            type="button"
            class="text-primary mt-3 underline"
            onclick={() => {
              if (resolutionError) resolutionRetry++
              else void station.open(station.code, undefined, false)
            }}
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
          <h2 class="text-xl font-semibold">
            {premisesLabel(station.metadata, getLocale())}
          </h2>
          <p class="text-muted-foreground mt-2 text-sm">
            {station.isBuilding
              ? 'An interactive floor plan is not published for this premises yet.'
              : 'Explore the official station maps. Interactive floor plans are not available for this station yet.'}
          </p>
          {#each station.documents as document}
            <a
              class="text-primary mt-4 block underline"
              href={document.path}
              target="_blank"
              rel="noreferrer"
              >{document.kind === 'directory'
                ? 'Official floor directory'
                : document.kind === 'shops'
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
    <StationIndexes
      {station}
      {legend}
      showLevels={!app.view.panels.isPanelOpenOrVisual(Panel.prisms)}
      disabled={station.loading ||
        resolving ||
        Boolean(station.error || resolutionError) ||
        venueOpacity === 0}
    />
    <StationIdentity {station} />
    {#if station.data && (!resolving || hasCurrentScene) && !station.loading}
      {#if station.data.sourceDataset?.startsWith('gbp:')}
        <span class="text-muted-foreground absolute right-2 bottom-1 z-10 text-[9px]"
          >General building plan · Schematic, not to scale</span
        >
      {:else if station.data.coordinateSpace === 'image-pixels'}
        <a
          href={station.data.sourceUrl}
          target="_blank"
          rel="noreferrer"
          class="text-muted-foreground absolute right-2 bottom-1 z-10 text-[9px]"
          >Floor plan © {premisesLabel(station.metadata, getLocale())} · Schematic, not
          to scale</a
        >
      {:else}
        <a
          href="https://api.portal.hkmapservice.gov.hk/disclaimer"
          target="_blank"
          rel="noreferrer"
          class="text-muted-foreground absolute right-3 bottom-2 z-10 flex items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-[9px]"
          ><img src="/logos/landsd.jpg" alt="" class="h-4 w-auto shrink-0">Lands
          Department</a
        >
      {/if}
    {/if}
  </section>
{/if}
