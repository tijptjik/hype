<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// TRANSITIONS
import { fade, slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import MapIcon from 'virtual:icons/hype-divisions/area'
import SarIcon from 'virtual:icons/hype-divisions/sar'
import DistrictIcon from 'virtual:icons/hype-divisions/district'
import IslandIcon from 'virtual:icons/hype-divisions/major_island'
import MacrohoodIcon from 'virtual:icons/hype-divisions/macrohood'
import TownIcon from 'virtual:icons/hype-divisions/town'
import HoodIcon from 'virtual:icons/hype-divisions/neighbourhood'
import RuralIcon from 'virtual:icons/hype-divisions/rural_area'
import MinorIslandIcon from 'virtual:icons/hype-divisions/minor_island'
import VillageIcon from 'virtual:icons/hype-divisions/village'
import MicrohoodIcon from 'virtual:icons/hype-divisions/microhood'
import HamletIcon from 'virtual:icons/hype-divisions/hamlet'
import IsletIcon from 'virtual:icons/hype-divisions/islet'
// DOMAIN
import { divisionClassLabel } from '#lib/divisions/classes.js'

const icons = {
  sar: SarIcon,
  area: MapIcon,
  district: DistrictIcon,
  major_island: IslandIcon,
  macrohood: MacrohoodIcon,
  town: TownIcon,
  neighbourhood: HoodIcon,
  rural_area: RuralIcon,
  minor_island: MinorIslandIcon,
  village: VillageIcon,
  microhood: MicrohoodIcon,
  hamlet: HamletIcon,
  islet: IsletIcon,
}

type NeighbourhoodRow = {
  id: string
  count: number
  selected: boolean
  name: string
  level: number | null
  class: string | null
}
let {
  row,
  loading = false,
  onToggle,
  onPreview,
}: {
  row: NeighbourhoodRow
  loading?: boolean
  onToggle: (id: string) => void
  onPreview?: (id: string, active: boolean) => void
} = $props()
onDestroy(() => onPreview?.(row.id, false))
const Icon = $derived(icons[row.class as keyof typeof icons] ?? MapIcon)
// The class label already identifies districts; shorten only the English name suffix.
const displayName = $derived(
  row.class === 'district' ? row.name.replace(/\s+District$/, '') : row.name,
)
</script>

{#if row.count > 0}
  <button
    type="button"
    class="group flex w-full cursor-pointer items-center justify-between gap-4 bg-panel py-2 pl-8 pr-7 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
    aria-pressed={row.selected}
    onclick={() => onToggle(row.id)}
    onpointerenter={() => onPreview?.(row.id, true)}
    onpointerleave={() => onPreview?.(row.id, false)}
    onfocus={() => onPreview?.(row.id, true)}
    onblur={() => onPreview?.(row.id, false)}
    onkeydown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.closest('section')?.querySelector('input')?.focus()
      }
    }}
    in:slide={{ axis: 'y', duration: 200 }}
    out:slide={{ axis: 'y', duration: 200 }}
  >
    <span class="flex min-w-0 -translate-x-5 items-center gap-3">
      <span
        class="size-2 shrink-0 rounded-full {row.selected
          ? 'bg-primary'
          : 'bg-transparent group-hover:bg-base-content/30'}"
      ></span>
      <Icon class="size-5 shrink-0 text-base-content/60" aria-hidden="true" />
      <span class="flex min-w-0 flex-col">
        <span class="text-xs text-base-content/60"
          >{divisionClassLabel(row.class)}</span
        >
        <span class="font-normal text-base-content">{displayName}</span>
      </span>
    </span>
    <span
      class="badge flex size-8 shrink-0 items-center justify-center border-2 border-base-200 font-mono font-bold text-base-content/60 {loading
        ? 'motion-safe:animate-pulse bg-base-content/10'
        : 'bg-transparent'}"
      aria-busy={loading}
    >
      {#if !loading}
        <span in:fade={{ duration: prefersReducedMotion.current ? 0 : 200 }}
          >{row.count}</span
        >
      {/if}
    </span>
  </button>
{/if}
