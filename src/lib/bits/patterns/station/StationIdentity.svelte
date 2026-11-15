<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import { getLocale } from '#lib/i18n.js'
import { premisesLabel } from '#lib/indoor/premisesLabels.js'
// CONTEXT
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { getSurfaceLayoutCtx } from '#lib/context/surfaceLayout.svelte.js'
// LAYOUT
import { getOmnibarTopGutter } from '#lib/bits/patterns/bars/omnibar/Omnibar.layout.js'
// COMPONENTS
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// TYPES
import type { StationState } from '#lib/indoor/station.svelte.js'

let {
  station,
  standalone = false,
}: {
  station: StationState
  /** Fullscreen embedded maps have no omnibar to reserve space for. */
  standalone?: boolean
} = $props()
const responsive = getResponsiveCtx()
const layout = getSurfaceLayoutCtx()
// Center the 32px identity on the search bar's 56px row, including its tall-screen gutter.
const top = $derived(
  getOmnibarTopGutter(
    responsive.visibleWindowWidth,
    responsive.visibleWindowHeight,
    layout?.getEffectiveAppMainWidth() || responsive.visibleWindowWidth,
  ) + 12,
)
const name = $derived(premisesLabel(station.metadata, getLocale()))
const operator = $derived(
  station.metadata && 'operator' in station.metadata ? station.metadata.operator : null,
)
let failedLogo = $state<string | null>(null)
const logo = $derived(
  operator?.logo && failedLogo !== operator.logo
    ? operator.logo
    : station.isMtr
      ? '/brands/mtr.svg'
      : null,
)
const identity = $derived({
  key: `${station.code}:${name}`,
  name,
  logo,
  operatorName: operator?.name || (station.isMtr ? 'MTR' : ''),
})
</script>

{#if name}
  <div
    data-station-identity
    class={`pointer-events-none absolute right-5 z-30 grid items-center text-[var(--station-ink)] opacity-55 sm:right-7 ${standalone ? 'top-5 max-w-[min(23rem,calc(100%-6rem))]' : 'top-24 max-w-[calc(100%-6rem)] lg:top-[var(--station-identity-top)] lg:max-w-[min(23rem,calc((100%-36rem)/2))]'}`}
    style:--station-identity-top={`${top}px`}
  >
    {#each [identity] as item (item.key)}
      <div
        class="col-start-1 row-start-1 flex max-w-full items-center gap-3 justify-self-end"
        transition:fade={{
          duration: standalone || prefersReducedMotion.current ? 0 : 220,
        }}
      >
        <div class="flex size-8 shrink-0 items-center justify-center">
          {#if item.logo && failedLogo !== item.logo}
            <img
              src={item.logo}
              alt={item.operatorName}
              class="size-full object-contain"
              onerror={() => (failedLogo = item.logo)}
            >
          {:else}
            <LocationIcon kind="premises" class="size-6" />
          {/if}
        </div>
        <span
          class="min-w-0 text-sm leading-snug font-medium tracking-[0.14em] break-words uppercase sm:text-base"
          >{item.name}</span
        >
      </div>
    {/each}
  </div>
{/if}
