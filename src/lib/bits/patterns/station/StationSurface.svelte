<script lang="ts">
// I18N
import { getLocale } from '#lib/i18n.js'
import { premisesLabel } from '#lib/indoor/premisesLabels.js'
import { page } from '$app/state'
import { untrack } from 'svelte'
import { Panel as RoutePanel } from '#lib/enums.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getSurfaceLayoutCtx } from '#lib/context/surfaceLayout.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { premisesCode, loadPremisesCatalogue } from '#lib/indoor/registry.js'
import { Panel } from '#lib/enums.js'
// COMPONENTS
import StationScene from './StationScene.svelte'
import StationCameraControls from './StationCameraControls.svelte'
import StationRouteControls from './StationRouteControls.svelte'
import StationLevelLabel from './StationLevelLabel.svelte'
import { stationLevelOptions } from '#lib/indoor/levels.js'
const app = getAppCtx()
const station = app.station
const layout = getSurfaceLayoutCtx()
const responsive = getResponsiveCtx()
// Same-path navigation must not restart catalogue resolution or replace the scene.
const pathname = $derived(page.url.pathname)
const indoorMatch = $derived(
  /^\/premises\/([a-z0-9-]+)(?:\/places\/([^/]+))?\/?$/.exec(pathname),
)
const hasCurrentScene = $derived(
  Boolean(station.data && indoorMatch && premisesCode(indoorMatch[1]) === station.code),
)
let resolving = $state(false)
let resolutionError = $state('')
let resolutionRetry = $state(0)
$effect(() => {
  const match = indoorMatch
  resolutionRetry
  resolving = Boolean(match)
  resolutionError = ''
  if (!match) {
    untrack(() => {
      if (station.active) station.close(false)
    })
    return
  }
  let cancelled = false
  void (premisesCode(match[1]) ? Promise.resolve() : loadPremisesCatalogue())
    .then(() =>
      untrack(() => {
        if (cancelled) return
        const code = match ? premisesCode(match[1]) : undefined
        if (match && code) {
          const revealPanel =
            !station.active || station.code !== code || Boolean(match[2])
          void station.open(code, match[2], false)
          if (revealPanel) app.view.panels.openPanel(RoutePanel.prisms, false)
        } else {
          if (station.active) station.close(false)
          if (match) resolutionError = 'Premises not found'
        }
      }),
    )
    .catch(error => {
      if (!cancelled) {
        console.error(error)
        resolutionError = 'Could not load premises maps'
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
const offset = $derived(responsive.isMobile ? 0 : (layout?.getAppMainOffsetX() ?? 0))
</script>
{#if station.active || indoorMatch}
  <section
    class="absolute inset-0 z-10 overflow-hidden bg-[var(--station-canvas)]"
    aria-label={`${premisesLabel(station.metadata, getLocale())} indoor layout`}
    data-station-surface
  >
    <div
      class="absolute inset-x-4 top-32 bottom-40 sm:top-32 sm:bottom-32"
      style:margin-left={`${Math.max(0, offset * 2)}px`}
      style:margin-right={`${Math.max(0, -offset * 2)}px`}
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
      {#if !app.view.panels.isPanelOpenOrVisual(Panel.prisms)}
        <nav
          aria-label="Indoor levels"
          class="pointer-events-auto absolute top-1/2 left-3 z-20 max-h-[calc(100%-15rem)] w-40 max-w-[40vw] -translate-y-1/2 overflow-y-auto text-left text-sm text-[var(--station-legend-ink)] sm:left-5 sm:w-52"
        >
          {#each stationLevelOptions(
            station.data.level_polygon.features,
          ) as option (option.value)}
            <button
              type="button"
              class="hover:bg-panel/80 focus-visible:outline-focus aria-pressed:bg-panel flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left aria-pressed:font-semibold"
              aria-label={option.label}
              aria-pressed={station.exploded
                ? option.value === 'all'
                : option.value === station.floor}
              onclick={() => station.selectLevel(option.value)}
            >
              <StationLevelLabel {option} />
              {#if option.exit || option.line}
                <span class="text-muted-foreground pl-7 text-xs"
                  >{option.exit ? `Exit ${option.exit}` : option.line}</span
                >
              {/if}
            </button>
          {/each}
        </nav>
      {/if}
      <div
        class="pointer-events-none absolute inset-x-4 bottom-28 flex flex-col items-center gap-2 sm:bottom-24"
        style:transform={`translateX(${offset}px)`}
      >
        <!-- Shared planner choices and routing evidence come from the active source snapshot. -->
        <StationRouteControls />
        <StationCameraControls />
      </div>
      <a
        href={station.data.sourceUrl ||
          'https://api.portal.hkmapservice.gov.hk/disclaimer'}
        target="_blank"
        rel="noreferrer"
        class="text-muted-foreground absolute right-2 bottom-1 z-10 flex items-center gap-1 text-[9px]"
        ><img
          src={station.data.attributionLogo}
          alt="Lands Department"
          class="h-4 w-auto"
        >{station.data.source || 'Lands Department'}
        · {station.data?.retrievedAt.slice(0, 10)}</a
      >
    {/if}
  </section>
{/if}
