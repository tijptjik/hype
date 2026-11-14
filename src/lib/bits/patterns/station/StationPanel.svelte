<script lang="ts">
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
// DATA
import { matches, value, type Place } from '#lib/indoor/model.js'
import { connectionCandidates, isConnector } from '#lib/indoor/spatial.js'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'
let { model }: { model: ResourcePanelModel } = $props()
const app = getAppCtx(),
  station = app.station,
  responsive = getResponsiveCtx()
let shareStatus = $state('')
async function share(copy = false): Promise<void> {
  const url = window.location.href
  try {
    if (!copy && navigator.share)
      await navigator.share({ title: station.selected?.name.en, url })
    else {
      await navigator.clipboard.writeText(url)
      shareStatus = 'Link copied'
    }
  } catch (error) {
    shareStatus =
      error instanceof Error && error.name === 'AbortError'
        ? ''
        : 'Could not share the link. Copy it from the address bar.'
  }
}
let query = $state('')
const levels = $derived(
  station.data?.level_polygon.features.toSorted(
    (a, b) => Number(b.properties.level_ordinal) - Number(a.properties.level_ordinal),
  ) ?? [],
)
const levelName = (id: string) =>
  value(
    levels.find(f => f.properties.level_id === id)?.properties ?? {},
    'level_name_en',
  )
const entries = $derived(station.entries.filter(p => matches(p, query)))
const connections = $derived(
  station.data
    ? connectionCandidates(station.data).filter(
        c => station.showInferred || c.evidence !== 'aligned-footprints',
      )
    : [],
)
const selected = $derived(station.selected)
const targets = $derived.by(() => {
  const unit = selected?.feature.properties.unit_id
  return connections
    .filter(c => c.from === unit || c.to === unit)
    .flatMap(c => {
      const target = c.from === unit ? c.to : c.from
      const place = station.entries.find(
        p => p.kind === 'facility' && p.feature.properties.unit_id === target,
      )
      return place ? [{ place, direction: c.from === unit ? '↑ Up' : '↓ Down' }] : []
    })
})
function select(place: Place): void {
  station.select(place)
  if (responsive.isMobile) model.onClose()
}
</script>
<PanelRoot
  {...model.panel}
  isOpen={model.open}
  preserveContentWidth={!model.panel.isNarrow}
>
  <section
    class="bg-panel text-base-content flex h-full min-h-0 flex-col"
    aria-label="Station layout panel"
  >
    <header
      class="border-border flex min-h-18 items-center justify-between gap-2 border-b px-4 py-3"
    >
      {#if !model.panel.isNarrow}
        <div>
          <p class="text-primary text-xs tracking-widest uppercase">Station layout</p>
          <h2 class="text-lg font-semibold">{station.metadata?.name}</h2>
          <p class="text-muted-foreground text-xs">
            {station.metadata?.nameZh}
            · {station.code}
          </p>
        </div>
      {/if}
      <button
        type="button"
        class="text-primary hover:bg-surface rounded-lg p-2"
        aria-label={model.panel.isNarrow
          ? 'Expand station panel'
          : 'Close station panel'}
        onclick={model.onClose}
      >
        {model.panel.isNarrow ? '→' : '←'}
      </button>
    </header>
    {#if !model.panel.isNarrow}
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {#if station.data}
          <label class="text-muted-foreground grid gap-2 text-xs"
            >Level
            <select
              aria-label="Station level"
              class="bg-surface text-base-content border-border w-full rounded-lg border px-3 py-2 text-sm"
              value={station.exploded ? 'all' : station.floor}
              onchange={e => {
                if (e.currentTarget.value === 'all') {
                  station.openFloor(station.floor)
                  station.exploded = true
                  station.selected = null
                  station.fitRevision++
                } else station.openFloor(e.currentTarget.value)
              }}
            >
              <option value="all">All levels · exploded view</option>
              {#each levels as level}
                <option value={value(level.properties, 'level_id')}>
                  {value(level.properties, 'level_name_en')}
                </option>
              {/each}
            </select>
          </label>
          <fieldset
            class="text-muted-foreground grid grid-cols-2 gap-2 text-xs"
            aria-label="Station legend"
          >
            <span
              ><i
                class="mr-2 inline-block h-3 w-4 rounded-sm border border-[var(--station-edge)] bg-[var(--station-paid)]"
              ></i
              >Paid area</span
            ><span
              ><i
                class="mr-2 inline-block h-3 w-4 rounded-sm border border-[var(--station-edge)] bg-[var(--station-unpaid)]"
              ></i
              >Unpaid area</span
            ><span class="col-span-2"
              >↕ Level change · arrows do not show escalator direction</span
            >
          </fieldset>
          {#if selected}
            <section
              aria-label="Station place details"
              class="bg-surface rounded-xl p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-primary text-xs">
                    {selected.code || (selected.kind === 'shop' ? 'Shop' : 'Facility')}
                  </p>
                  <h3 class="font-semibold">{selected.name.en}</h3>
                </div>
                <button
                  aria-label="Close place details"
                  type="button"
                  class="text-muted-foreground px-2"
                  onclick={() => station.openFloor(station.floor)}
                >
                  ×
                </button>
              </div>
              <p class="text-muted-foreground mt-2 text-xs">
                {levelName(selected.levelId)}
                · {selected.area}
              </p>
              <div class="text-primary mt-3 flex gap-4 text-sm">
                <button type="button" onclick={() => share(true)}>Copy link</button>
                <button type="button" onclick={() => share()}>Share</button>
              </div>
              <p role="status" class="mt-2 text-xs">{shareStatus}</p>
              {#if selected.kind === 'shop' && !selected.code}
                <p class="text-muted-foreground mt-2 text-xs">
                  The source does not supply a shop code.
                </p>
              {/if}
              {#if selected.occupants.length > 1}
                <p class="text-muted-foreground mt-2 text-xs">
                  {selected.occupants.length}
                  occupant records share this source unit; separate shop boundaries are
                  not supplied.
                </p>
              {/if}
              {#if isConnector(selected.category)}
                {#each targets as target}
                  <button
                    type="button"
                    class="text-primary border-border mt-3 w-full rounded-lg border p-2 text-left text-xs"
                    onclick={() => select(target.place)}
                  >
                    {target.direction}
                    to {levelName(target.place.levelId)}
                  </button>
                {/each}
                <p class="text-muted-foreground mt-2 text-xs">
                  {targets.length
                    ? station.showInferred
                      ? 'Possible connection; verify signage at the venue.'
                      : 'Connection from matching source lift codes.'
                    : 'Destination not confirmed in the source.'}
                </p>
              {/if}
            </section>
          {/if}
          <label class="text-muted-foreground grid gap-2 text-xs"
            >Station directory<input
              type="search"
              aria-label="Search station directory"
              bind:value={query}
              placeholder="Shop, kiosk code, lift…"
              class="bg-surface text-base-content border-border rounded-lg border p-3 text-sm"
            ></label
          >
          <div class="grid gap-1">
            {#each entries as place}
              <button
                type="button"
                class="hover:bg-surface focus-visible:outline-primary rounded-lg px-3 py-2 text-left"
                aria-pressed={selected?.id === place.id}
                onclick={() => select(place)}
              >
                <span class="text-sm font-medium">{place.name.en}</span>
                {#if place.code}
                  <span class="text-primary ml-2 text-xs">{place.code}</span>
                {/if}
                <span class="text-muted-foreground block text-xs"
                  >{levelName(place.levelId)}</span
                >
              </button>
            {/each}
            {#if !entries.length}
              <p class="text-muted-foreground py-4 text-sm">
                No matching shops or facilities.
              </p>
            {/if}
          </div>
          <nav aria-label="Official station maps" class="grid gap-2 text-sm">
            {#each station.documents as document}
              <a
                class="text-primary underline"
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
          </nav>
          <p class="text-muted-foreground text-xs">
            Lands Department snapshot · {station.data?.retrievedAt.slice(0, 10)}. Shop
            records are not linked to Hype locations.
          </p>
        {:else}
          <p class="text-muted-foreground text-sm">
            {station.loading
              ? 'Loading station maps…'
              : 'Official PDF maps are available in the map panel. Interactive floor plans are not available for this station yet.'}
          </p>
        {/if}
      </div>
    {/if}
  </section>
</PanelRoot>
