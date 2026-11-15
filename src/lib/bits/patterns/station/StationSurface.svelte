<script lang="ts">
// I18N

import { untrack } from 'svelte'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { getSurfaceLayoutCtx } from '#lib/context/surfaceLayout.svelte.js'
import { Panel as RoutePanel } from '#lib/enums.js'
import { loadPremisesCatalogue, premisesCode } from '#lib/indoor/registry.js'
import { page } from '$app/state'

const app = getAppCtx()
const station = app.station
const layout = getSurfaceLayoutCtx()
const responsive = getResponsiveCtx()
// Same-path navigation must not restart catalogue resolution or replace the scene.
const pathname = $derived(page.url.pathname)
const indoorMatch = $derived(
  /^\/premises\/([a-z0-9-]+)(?:\/places\/([^/]+))?\/?$/.exec(pathname),
)
const _hasCurrentScene = $derived(
  Boolean(station.data && indoorMatch && premisesCode(indoorMatch[1]) === station.code),
)
let _resolving = $state(false)
let _resolutionError = $state('')
let _resolutionRetry = $state(0)
$effect(() => {
  const match = indoorMatch
  _resolutionRetry
  _resolving = Boolean(match)
  _resolutionError = ''
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
          const revealPanel = Boolean(match[2])
          void station.open(code, match[2], false)
          if (revealPanel) app.view.panels.openPanel(RoutePanel.prisms, false)
        } else {
          if (station.active) station.close(false)
          if (match) _resolutionError = 'Premises not found'
        }
      }),
    )
    .catch(error => {
      if (!cancelled) {
        console.error(error)
        _resolutionError = 'Could not load premises maps'
      }
    })
    .finally(() => {
      if (!cancelled) _resolving = false
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
const _offset = $derived(responsive.isMobile ? 0 : (layout?.getAppMainOffsetX() ?? 0))
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
          class="pointer-events-auto absolute top-1/2 left-3 z-20 max-h-[calc(100%-15rem)] w-40 max-w-[40vw] -translate-y-1/2 overflow-y-auto px-3 py-2 text-left text-sm text-[var(--station-legend-ink)] sm:left-5 sm:w-52"
        >
          <details
            class="group [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
            open={!responsive.isMobile}
          >
            <summary
              class="text-primary focus-visible:outline-focus flex w-fit max-w-full cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
            >
              Levels<ChevronDown
                class="size-4 -rotate-90 transition-transform group-open:rotate-0"
                aria-hidden="true"
              />
            </summary>
            <div class="mt-3 grid gap-2.5">
              {#each stationLevelOptions(
                station.data.level_polygon.features,
              ) as option (option.value)}
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full flex-col gap-1 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left aria-pressed:font-semibold"
                  aria-label={option.value === 'all' ? 'All' : option.label}
                  aria-pressed={station.exploded
                    ? option.value === 'all'
                    : option.value === station.floor}
                  onclick={() => station.selectLevel(option.value)}
                >
                  <StationLevelLabel
                    option={option.value === 'all'
                      ? { ...option, floor: 'All' }
                      : option}
                  />
                  {#if option.exit || option.line}
                    <span class="text-muted-foreground pl-7 text-xs"
                      >{option.exit ? `Exit ${option.exit}` : option.line}</span
                    >
                  {/if}
                </button>
              {/each}
            </div>
          </details>
        </nav>
      {/if}

      <div
        class="pointer-events-auto absolute top-1/2 right-3 z-20 max-h-[calc(100%-15rem)] w-48 -translate-y-1/2 overflow-y-auto px-3 py-2 text-sm text-[var(--station-legend-ink)] sm:right-5 sm:w-52"
      >
        {#if !station.isBuilding}
          <details
            class="group mb-4 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
            open={!responsive.isMobile}
          >
            <summary
              class="text-primary focus-visible:outline-focus flex w-fit max-w-full cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
            >
              Concourse<ChevronDown
                class="size-4 -rotate-90 transition-transform group-open:rotate-0"
                aria-hidden="true"
              />
            </summary>
            <ul class="mt-3 grid gap-2.5" aria-label="Concourse legend">
              <li class="flex items-center gap-2">
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left disabled:opacity-40"
                  onclick={() => station.selectIndex('paid')}
                  disabled={!indexMatches(station.entries, 'paid').length}
                >
                  <span
                    class="h-5 w-7 shrink-0 rounded border border-[var(--station-edge)] bg-[var(--station-paid)]"
                    aria-hidden="true"
                  ></span
                  >Paid area
                </button>
              </li>
              <li class="flex items-center gap-2">
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left disabled:opacity-40"
                  onclick={() => station.selectIndex('unpaid')}
                  disabled={!indexMatches(station.entries, 'unpaid').length}
                >
                  <span
                    class="h-5 w-7 shrink-0 rounded border border-[var(--station-edge)] bg-[var(--station-unpaid)]"
                    aria-hidden="true"
                  ></span
                  >Unpaid area
                </button>
              </li>
            </ul>
          </details>
        {/if}
        <details
          class="group [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
          open={!responsive.isMobile}
        >
          <summary
            class="text-primary focus-visible:outline-focus flex w-fit max-w-full cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
          >
            Map symbols<ChevronDown
              class="size-4 -rotate-90 transition-transform group-open:rotate-0"
              aria-hidden="true"
            />
          </summary>
          <ul class="mt-3 grid gap-2.5" aria-label="Map symbol legend">
            {#if !station.isBuilding}
              <li
                class="flex items-center gap-2"
                title="Solid: lifts. Dashed: escalators. Dotted: stairs. Dot-dash: ramps. Arrows do not indicate travel direction."
              >
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left disabled:opacity-40"
                  onclick={() => station.selectIndex('level-change')}
                  disabled={!indexMatches(station.entries, 'level-change').length}
                >
                  <span class="w-7 shrink-0 text-center text-2xl" aria-hidden="true"
                    >↕</span
                  >Level change
                </button>
              </li>
            {/if}
            {#each [
              ...new Set(
                station.entries
                  .filter(
                    p =>
                      p.kind === 'facility' &&
                      p.feature.geometry.type === 'Point' &&
                      (station.data?.coordinateSpace === 'image-pixels' ||
                        !isConnector(p.category)) &&
                      !['platform', 'faregate', 'entry'].includes(p.category),
                  )
                  .map(p => p.category),
              ),
            ].sort((a, b) => facilityLegendRank(a) - facilityLegendRank(b)) as category}
              {@const symbol = facilitySymbol(
                category,
                station.entries.find(p => p.category === category)?.name.en,
              )}
              <li>
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left"
                  onclick={() => station.selectIndex(category)}
                  aria-label={`Find ${symbol.label}`}
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="-4 -4 32 32"
                    aria-hidden="true"
                    class="shrink-0"
                  >
                    <rect
                      x="-4"
                      y="-4"
                      width="32"
                      height="32"
                      rx="8"
                      fill={symbol.background}
                    />
                    <path
                      d={symbol.path}
                      fill="none"
                      stroke={symbol.color}
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    {#if symbol.text}
                      <text
                        x="12"
                        y="20"
                        text-anchor="middle"
                        font-size="10"
                        font-weight="800"
                        fill={symbol.color}
                      >
                        {symbol.text}
                      </text>
                    {/if}
                  </svg>
                  {symbol.label}
                </button>
              </li>
            {/each}
          </ul>
        </details>
        {#if station.entries.some(place => isConnector(place.category))}
          <details
            class="group mt-4 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
            open={!responsive.isMobile}
          >
            <summary
              class="text-primary focus-visible:outline-focus flex w-fit max-w-full cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
            >
              Connections<ChevronDown
                class="size-4 -rotate-90 transition-transform group-open:rotate-0"
                aria-hidden="true"
              />
            </summary>
            <ul class="mt-3 grid gap-2.5" aria-label="Connection legend">
              {#each [
                { key: 'elevator', label: 'Lift', dash: undefined },
                { key: 'escalator', label: 'Escalator', dash: '5 4' },
                { key: 'stairs', label: 'Stair', dash: '0 4' },
                { key: 'ramp', label: 'Ramp', dash: '0 4 5 4' },
              ] as connection (connection.key)}
                {#if indexMatches(station.entries, connection.key).length}
                  <li>
                    <button
                      type="button"
                      class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left"
                      onclick={() => station.selectIndex(connection.key)}
                    >
                      <svg
                        class="h-5 w-7 shrink-0"
                        viewBox="0 0 28 20"
                        aria-hidden="true"
                      >
                        <line
                          x1="3"
                          y1="10"
                          x2="25"
                          y2="10"
                          stroke="var(--station-connector)"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-dasharray={connection.dash}
                        />
                      </svg>
                      {connection.label}
                    </button>
                  </li>
                {/if}
              {/each}
            </ul>
          </details>
        {/if}
      </div>
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
        class="text-muted-foreground absolute right-3 bottom-2 z-10 flex items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-[9px]"
        ><img
          src={station.data.attributionLogo}
          alt="Lands Department"
          class="h-4 w-auto"
        >Lands Department</a
      >
    {/if}
  </section>
{/if}
