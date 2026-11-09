<script lang="ts">
// ICONS
import ArrowLeftIcon from 'virtual:icons/lucide/arrow-left'
import ArrowRightIcon from 'virtual:icons/lucide/arrow-right'
import PinIcon from 'virtual:icons/lucide/map-pin'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// I18N
import { m } from '#lib/i18n.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// DOMAIN
import { locationSearchColor } from '#lib/locations/searchPresentation.js'
// TYPES
import type { DraftLocationSearchResult as Result } from './draftLocationSearch.types.js'

let {
  origin,
  location,
  distance,
  markerNumberFor,
  onHighlight,
  onSelect,
  onEdit,
  onReset,
  editing = false,
  originalCustom = false,
  locationCustom = false,
  moveMarker = $bindable(false),
}: {
  origin: Result
  location: Result
  distance: number
  markerNumberFor: (result: Result) => number
  onHighlight?: (id: string | null) => void
  onSelect?: (result: Result) => void
  moveMarker?: boolean
  onEdit?: () => void
  onReset?: (result: Result) => void
  editing?: boolean
  originalCustom?: boolean
  locationCustom?: boolean
} = $props()
</script>

{#snippet marker(result: Result, useLocation: boolean)}
  {@const number = markerNumberFor(result)}
  {@const selected = moveMarker === useLocation}
  {@const custom = useLocation ? locationCustom : originalCustom}
  <div
    class="relative row-start-1 min-w-0 {useLocation ? 'col-start-3' : 'col-start-1'}"
  >
    <button
      type="button"
      data-marker-choice={useLocation ? 'location' : 'original'}
      aria-pressed={selected}
      class="{useLocation
        ? 'col-start-3'
        : 'col-start-1'} flex w-full min-w-0 row-start-1 min-h-14 items-center gap-2 rounded-md border border-transparent px-3 py-2 {useLocation
        ? `justify-start text-left ${custom ? 'pr-12' : ''}`
        : `flex-row-reverse justify-start text-right ${custom ? 'pl-12' : ''}`} focus-visible:outline-2 focus-visible:outline-primary {selected
        ? 'bg-muted/50 text-foreground'
        : 'text-muted-foreground hover:bg-muted/30'}"
      onmouseenter={() => onHighlight?.(result.id)}
      onmouseleave={() => onHighlight?.(null)}
      onfocus={() => onHighlight?.(result.id)}
      onblur={() => onHighlight?.(null)}
      onclick={() => {
        moveMarker = useLocation
        onSelect?.(result)
      }}
    >
      <span
        aria-hidden={!number}
        class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-base font-semibold text-white shadow-md"
        style:background-color={number ? locationSearchColor(result.kind) : '#3b82f6'}
        >{#if number}
          {number}
        {:else}
          <PinIcon class="size-4" />
        {/if}</span
      >
      <span class="min-w-0 text-xs font-medium break-words whitespace-normal"
        >{(useLocation ? locationCustom : originalCustom)
          ? m.association_custom_position()
          : m.association_kind_position({ kind: locationKindLabel(result.kind) })}</span
      >
    </button>
    {#if custom && onReset}
      <button
        type="button"
        aria-label={m.association_reset_field({
          field: m.association_kind_position({ kind: locationKindLabel(result.kind) }),
        })}
        title={m.forms__reset()}
        class="text-muted-foreground hover:bg-muted focus-visible:outline-primary absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded focus-visible:outline-2 {useLocation
          ? 'right-2'
          : 'left-2'}"
        onclick={() => onReset?.(result)}
      >
        <ResetIcon class="size-4" />
      </button>
    {/if}
  </div>
{/snippet}

<div class="pt-2" data-association-marker-choice>
  <div
    class="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]"
  >
    {@render marker(origin, false)}
    <div
      class="col-start-2 row-start-1 flex flex-col items-center gap-1"
      data-marker-choice-controls
    >
      <div class="col-start-2 row-start-1 space-y-1 text-center">
        <h3 class="text-xs font-semibold">{m.feature_find_pin()}</h3>
        <p class="text-muted-foreground text-[10px]">
          {m.association_marker_distance({ distance: String(Math.round(distance)) })}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!moveMarker}
        aria-label={m.association_switch({ field: m.feature_find_pin() })}
        class="border-border text-primary hover:bg-primary/10 focus-visible:outline-primary col-start-2 row-start-1 mx-auto flex size-8 items-center justify-center rounded-full border focus-visible:outline-2"
        onclick={() => {
          moveMarker = !moveMarker
          onSelect?.(moveMarker ? location : origin)
        }}
      >
        {#if moveMarker}
          <ArrowRightIcon class="size-4" />
        {:else}
          <ArrowLeftIcon class="size-4" />
        {/if}
      </button>
      <button
        type="button"
        aria-pressed={editing}
        class="text-primary focus-visible:outline-primary rounded text-xs underline focus-visible:outline-2"
        onclick={onEdit}
      >
        {editing ? m.filters__done() : m.forms__edit()}
      </button>
    </div>
    {@render marker(location, true)}
  </div>
</div>
