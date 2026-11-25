<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// CONTEXT
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// DOMAIN
import { indexMatches } from '#lib/indoor/indexNavigation.js'
import { isConnector } from '#lib/indoor/spatial.js'
import { facilitySymbol, facilityLegendRank } from '#lib/indoor/facilities.js'
import { stationLevelOptions } from '#lib/indoor/levels.js'
// COMPONENTS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import StationLevelLabel from './StationLevelLabel.svelte'
import StationCameraControls from './StationCameraControls.svelte'
// TYPES
import type { StationState } from '#lib/indoor/station.svelte.js'
import { value, type IndoorData, type Place } from '#lib/indoor/model.js'

let {
  station,
  legend,
  showLevels = true,
  disabled = false,
  embedded = false,
  compare = false,
}: {
  station: StationState
  legend: {
    data: IndoorData
    entries: Place[]
    isBuilding: boolean
    exploded: boolean
    floor: string
  } | null
  showLevels?: boolean
  disabled?: boolean
  embedded?: boolean
  compare?: boolean
} = $props()
const responsive = getResponsiveCtx()
const reviewedBuilding = $derived(legend?.data.sourceDataset?.startsWith('gbp:'))
const indexedAreas = $derived(
  legend &&
    !legend.exploded &&
    (embedded || legend.data.sourceDataset?.startsWith('gbp:'))
    ? legend.data.unit_polygon.features.filter(
        f =>
          f.properties.level_id === legend?.floor &&
          (!compare || !f.properties.extraction_residual),
      )
    : [],
)
/** Animate natural list height changes without moving its scrollable header.
 * @param node Clipping wrapper around the naturally sized entries.
 * @returns Observer cleanup when the legend leaves the page.
 */
function animateEntriesHeight(node: HTMLDivElement): { destroy: () => void } {
  const content = node.firstElementChild
  if (!content) return { destroy: () => {} }
  let initialized = false
  const observer = new ResizeObserver(() => {
    node.style.transition =
      initialized && !prefersReducedMotion.current ? 'height 320ms ease' : 'none'
    node.style.height = `${content.getBoundingClientRect().height}px`
    initialized = true
  })
  observer.observe(content)
  return { destroy: () => observer.disconnect() }
}
</script>
{#if legend}
  {#if showLevels}
    <nav
      aria-label="Indoor levels"
      data-station-legend="levels"
      inert={disabled}
      class={[
        'pointer-events-auto z-20 flex min-h-0 flex-col px-3 py-2 text-left text-sm text-[var(--station-legend-ink)]',
        embedded
          ? 'col-start-1 row-start-1 overflow-y-auto lg:row-span-2'
          : 'absolute top-1/2 left-3 max-h-[calc(100%-15rem)] w-64 max-w-[45vw] -translate-y-1/2 sm:left-5 sm:w-72 sm:max-w-[calc(100vw-2rem)]',
        !embedded && reviewedBuilding && 'max-sm:top-36 max-sm:translate-y-0',
      ]}
    >
      <details
        class="group flex min-h-0 flex-col [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:min-h-0 [&::details-content]:[scrollbar-width:thin] [&::details-content]:[scrollbar-color:color-mix(in_srgb,var(--station-legend-ink)_16%,var(--station-canvas))_transparent] [&::details-content]:overflow-y-auto [&::details-content]:overscroll-contain [&::details-content]:opacity-0 [&::details-content]:[direction:rtl] [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
        open={!responsive.isMobile}
      >
        <summary
          class="text-primary focus-visible:outline-focus flex w-fit max-w-full shrink-0 cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
        >
          Levels<ChevronDown
            class="size-4 -rotate-90 transition-transform group-open:rotate-0"
            aria-hidden="true"
          />
        </summary>
        <div use:animateEntriesHeight class="overflow-hidden">
          <div
            class="flex flex-col items-start gap-2 pt-3 pb-1 [direction:ltr]"
            data-station-level-entries
          >
            {#each stationLevelOptions(
              legend.data.level_polygon.features,
            ) as option (option.value)}
              <button
                animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
                type="button"
                class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full shrink-0 flex-col items-start gap-1 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left aria-pressed:font-semibold"
                aria-label={option.value === 'all' ? 'All' : option.label}
                aria-pressed={legend.exploded
                  ? option.value === 'all'
                  : option.value === legend.floor}
                onclick={event => {
                  station.selectLevel(option.value)
                  if (responsive.isMobile && (reviewedBuilding || embedded)) {
                    const list = event.currentTarget.closest('details')
                    if (list) list.open = false
                  }
                }}
              >
                <span class="max-w-full">
                  <StationLevelLabel
                    option={option.value === 'all'
                      ? { ...option, floor: 'All' }
                      : option}
                  />
                </span>
                {#if option.exit || option.line}
                  <span class="text-muted-foreground max-w-full pl-7 text-xs"
                    >{[option.exit ? `Exit ${option.exit}` : '', option.line]
                      .filter(Boolean)
                      .join(' · ')}</span
                  >
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </details>
      {#if !compare}
        <details
          class="group mt-4 shrink-0 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
          data-station-controls
        >
          <summary
            class="text-primary focus-visible:outline-focus flex w-fit max-w-full cursor-pointer list-none items-center gap-3 px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
          >
            Controls<ChevronDown
              class="size-4 -rotate-90 transition-transform group-open:rotate-0"
              aria-hidden="true"
            />
          </summary>
          <div class="mt-3 px-2">
            <StationCameraControls {station} />
          </div>
        </details>
      {/if}
    </nav>
  {/if}

  <div
    data-station-legend="symbols"
    inert={disabled}
    class={[
      'pointer-events-auto z-20 flex min-h-0 flex-col overflow-y-auto px-3 py-2 text-sm text-[var(--station-legend-ink)]',
      embedded
        ? 'col-start-2 row-start-1 lg:col-start-3 lg:row-span-2'
        : 'absolute top-1/2 right-3 max-h-[calc(100%-15rem)] w-48 max-w-[45vw] -translate-y-1/2 sm:right-5 sm:w-52',
      !embedded && reviewedBuilding && 'max-sm:top-36 max-sm:translate-y-0',
    ]}
  >
    {#if indexedAreas.length}
      <section aria-label="Building parts" class="text-foreground mb-3">
        <details open={!responsive.isMobile}>
          <summary
            class="text-primary w-fit cursor-pointer rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase"
          >
            Floor index
          </summary>
          <ol class="mt-2 list-decimal space-y-1 pl-7">
            {#each indexedAreas as area (area.properties.unit_id)}
              {@const p = area.properties}
              <li
                title={value(p, 'unit_address_en') || undefined}
                class="w-fit rounded bg-[var(--station-canvas)] px-1 text-[var(--station-legend-ink)]"
              >
                {#if embedded && typeof p.canonical_location_id === 'string'}
                  <a
                    href={'/admin/locations/' +
                      encodeURIComponent(p.canonical_location_id)}
                    class="hover:text-primary underline"
                    >{p.unit_name_en}</a
                  >
                {:else}
                  <button
                    type="button"
                    class="hover:text-primary text-left align-top"
                    onclick={() => {
                      const entry = station.entries.find(
                        place => place.id === p.unit_id,
                      )
                      if (entry) station.select(entry)
                    }}
                  >
                    {p.unit_name_en}
                  </button>
                {/if}
              </li>
            {/each}
          </ol>
        </details>
      </section>
    {/if}
    {#if !compare}
      {#if !legend.isBuilding}
        <details
          class="group mb-4 shrink-0 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
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
                disabled={!indexMatches(legend.entries, 'paid').length}
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
                disabled={!indexMatches(legend.entries, 'unpaid').length}
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
        class="group flex min-h-0 flex-col [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:min-h-0 [&::details-content]:[scrollbar-width:thin] [&::details-content]:[scrollbar-color:color-mix(in_srgb,var(--station-legend-ink)_16%,var(--station-canvas))_transparent] [&::details-content]:overflow-y-auto [&::details-content]:overscroll-contain [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
        open={!responsive.isMobile}
      >
        <summary
          class="text-primary focus-visible:outline-focus flex w-fit max-w-full shrink-0 cursor-pointer list-none items-center gap-3 rounded-lg bg-[var(--station-canvas)] px-2 py-2 text-xs font-medium tracking-[0.1em] uppercase [&::-webkit-details-marker]:hidden"
        >
          Map symbols<ChevronDown
            class="size-4 -rotate-90 transition-transform group-open:rotate-0"
            aria-hidden="true"
          />
        </summary>
        <ul class="mt-3 grid gap-2.5" aria-label="Map symbol legend">
          {#if !legend.isBuilding}
            <li class="flex items-center gap-1.5 px-2 py-1" data-station-access-legend>
              <svg
                width="30"
                height="30"
                viewBox="0 0 30 30"
                class="shrink-0"
                aria-hidden="true"
              >
                <path d="M2 15H28" fill="none" stroke="#168bd2" stroke-width="5" />
              </svg>
              <span>Station access</span>
            </li>
          {/if}
          {#if !legend.isBuilding}
            <li
              class="flex items-center gap-2"
              title="Solid: lifts. Dashed: escalators. Dotted: stairs. Dot-dash: ramps. Arrows do not indicate travel direction."
            >
              <button
                type="button"
                class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left disabled:opacity-40"
                onclick={() => station.selectIndex('level-change')}
                disabled={!indexMatches(legend.entries, 'level-change').length}
              >
                <span class="w-7 shrink-0 text-center text-lg" aria-hidden="true"
                  >↕</span
                >Level change
              </button>
            </li>
          {/if}
          {#each [
            ...new Set(
              legend.entries
                .filter(
                  p =>
                    p.kind === 'facility' &&
                    (!indexedAreas.length || p.levelId === legend?.floor) &&
                    (p.markerFeature ?? p.feature).geometry.type === 'Point' &&
                    (legend?.data?.coordinateSpace === 'image-pixels' ||
                      !isConnector(p.category)) &&
                    !['platform', 'faregate', 'entry'].includes(p.category),
                )
                .map(p => p.category),
            ),
          ].sort(
            (a, b) => facilityLegendRank(a) - facilityLegendRank(b),
          ) as category (category)}
            {@const symbol = facilitySymbol(
              category,
              legend.entries.find(p => p.category === category)?.name.en,
            )}
            <li animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}>
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
      {#if legend.entries.some(place => isConnector(place.category)) &&
        (!legend.data.sourceDataset?.startsWith('gbp:') ||
          legend.data.connections?.length)}
        <details
          class="group mt-4 shrink-0 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-hidden [&::details-content]:opacity-0 [&::details-content]:[transition:height_240ms_ease,opacity_240ms_ease,content-visibility_240ms_allow-discrete] motion-reduce:[&::details-content]:transition-none [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100"
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
              { key: 'ramp', label: 'Ramp', dash: '0 4 5 4' },
              { key: 'stairs', label: 'Stairs', dash: '0 4' },
            ].filter(
              connection => indexMatches(legend?.entries ?? [], connection.key).length,
            ) as connection (connection.key)}
              <li animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}>
                <button
                  type="button"
                  class="hover:text-primary focus-visible:outline-focus flex w-fit max-w-full items-center gap-2 rounded-lg bg-[var(--station-canvas)] px-2 py-1 text-left"
                  onclick={() => station.selectIndex(connection.key)}
                >
                  <svg class="h-5 w-7 shrink-0" viewBox="0 0 28 20" aria-hidden="true">
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
            {/each}
          </ul>
        </details>
      {/if}
    {/if}
  </div>
{/if}
