<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// TRANSITIONS
import { slide } from 'svelte/transition'
// ICONS
import MapIcon from 'virtual:icons/lucide/map'
import DistrictIcon from 'virtual:icons/lucide/landmark'
import IslandIcon from 'virtual:icons/lucide/mountain'
import MacrohoodIcon from 'virtual:icons/lucide/blocks'
import TownIcon from 'virtual:icons/lucide/building'
import HoodIcon from 'virtual:icons/lucide/house'
import RuralIcon from 'virtual:icons/lucide/trees'
import MinorIslandIcon from 'virtual:icons/lucide/waves'
import VillageIcon from 'virtual:icons/lucide/church'
import MicrohoodIcon from 'virtual:icons/lucide/door-open'
import HamletIcon from 'virtual:icons/lucide/tent'
import IsletIcon from 'virtual:icons/lucide/shell'

const icons = {
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
  onToggle,
  onPreview,
}: {
  row: NeighbourhoodRow
  onToggle: (id: string) => void
  onPreview?: (id: string, active: boolean) => void
} = $props()
onDestroy(() => onPreview?.(row.id, false))
const Icon = $derived(icons[row.class as keyof typeof icons] ?? MapIcon)
</script>

{#if row.count > 0}
  <button
    type="button"
    class="group ml-4 flex w-[calc(100%-1rem)] cursor-pointer items-center justify-between gap-4 rounded-l-md bg-panel py-2 pl-4 pr-7 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-focus"
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
        {#if row.level !== null}
          <span class="font-mono text-xs text-base-content/60">L{row.level}</span>
        {/if}
        <span class="font-normal text-base-content">{row.name}</span>
      </span>
    </span>
    <span
      class="badge flex size-8 items-center justify-center border-2 border-base-200 bg-transparent font-mono font-bold text-base-content/60"
      >{row.count}</span
    >
  </button>
{/if}
