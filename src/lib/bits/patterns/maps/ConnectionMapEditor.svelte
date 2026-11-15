<script lang="ts">
// DOMAIN
import { stationProjection } from '#lib/indoor/scene.js'
import { centre, value } from '#lib/indoor/model.js'
// TYPES
import type { IndoorData, IndoorFeature } from '#lib/indoor/model.js'
import type { MapConnection } from '#lib/indoor/releases.js'

let {
  data,
  connections = $bindable(),
  disabled = false,
}: {
  data: IndoorData
  connections: MapConnection[]
  disabled?: boolean
} = $props()
let editing = $state(true)
let selected = $state('')
let floor = $state('')
let zoom = $state(1)
let notice = $state('')
const projection = $derived(stationProjection(data, false, { bearing: 0, tilt: 0 }))
const levels = $derived(data.level_polygon.features)
const activeFloor = $derived(floor || value(levels[0]?.properties ?? {}, 'level_id'))
const facilities = $derived(
  data.unit_polygon.features.filter(unit =>
    ['stairs', 'steps', 'escalator', 'elevator', 'ramp'].includes(
      value(unit.properties, 'unit_category'),
    ),
  ),
)
const source = $derived(
  facilities.find(unit => value(unit.properties, 'unit_id') === selected),
)
const floorFeatures = $derived(
  data.level_polygon.features.filter(
    unit => value(unit.properties, 'level_id') === activeFloor,
  ),
)
const bounds = $derived(projection.box(floorFeatures))
const viewBox = $derived(
  [
    bounds[0] - 5,
    bounds[1] - 5,
    Math.max(bounds[2], 1) + 10,
    Math.max(bounds[3], 1) + 10,
  ].join(' '),
)
const related = $derived(
  connections
    .map((connection, index) => ({ connection, index }))
    .filter(
      ({ connection }) => connection.from === selected || connection.to === selected,
    ),
)

/** Describe a facility in its floor context. @param unit Map facility. @returns Human-readable label. */
function label(unit: IndoorFeature): string {
  return [
    value(unit.properties, 'level_name_en') || value(unit.properties, 'level_id'),
    value(unit.properties, 'unit_name_en') || value(unit.properties, 'unit_category'),
  ].join(' · ')
}
/** Find compatible endpoints without imposing one-link-per-facility restrictions. @param unit Candidate endpoint. @returns Whether a new pair can be made. */
function available(unit: IndoorFeature): boolean {
  const id = value(unit.properties, 'unit_id')
  return (
    !!source &&
    id !== selected &&
    value(unit.properties, 'level_id') !== value(source.properties, 'level_id') &&
    value(unit.properties, 'unit_category') ===
      value(source.properties, 'unit_category') &&
    !connections.some(
      c => (c.from === selected && c.to === id) || (c.to === selected && c.from === id),
    )
  )
}
/** Describe the visible connection state. @param unit Facility. @returns Legend state. */
function status(unit: IndoorFeature): string {
  const id = value(unit.properties, 'unit_id')
  if (selected === id) return 'Selected'
  if (available(unit)) return 'Available'
  return connections.some(c => c.enabled && (c.from === id || c.to === id))
    ? 'Linked'
    : 'Unlinked'
}
/** Select a facility or create a compatible cross-floor pair. @param unit Clicked facility. @returns Nothing. */
function choose(unit: IndoorFeature): void {
  if (!editing || disabled) return
  if (available(unit) && source) {
    connections = [
      ...connections,
      {
        from: selected,
        to: value(unit.properties, 'unit_id'),
        fromLevel: value(source.properties, 'level_id'),
        toLevel: value(unit.properties, 'level_id'),
        category: value(
          source.properties,
          'unit_category',
        ) as MapConnection['category'],
        evidence: 'aligned-footprints',
        direction:
          value(source.properties, 'unit_category') === 'escalator' ? null : 'both',
        enabled: true,
      },
    ]
    notice = 'Connection added to draft. Publish to verify it.'
  } else {
    selected = value(unit.properties, 'unit_id')
    notice = 'Choose an available facility on another floor to connect it.'
  }
}
</script>

<section class="flex flex-col gap-4">
  <h2 class="text-lg font-semibold">Floor connections</h2>
  <label class="flex items-center gap-2"
    ><input type="checkbox" bind:checked={editing} {disabled}>Connection editor
    mode</label
  >
  <p class="text-sm">
    Select a facility, then choose a floor and click an available endpoint. Publishing
    verifies every enabled connection. Unknown directions remain display only.
  </p>
  <div class="flex flex-wrap gap-4 text-sm">
    <span class="text-blue-600">● Linked</span
    ><span class="text-orange-600">● Unlinked</span>
    <span class="text-purple-600">● Selected</span
    ><span class="text-green-700">● Available</span>
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <label
      >Floor
      <select
        class="bg-panel rounded border p-2"
        value={activeFloor}
        onchange={event => {
          floor = event.currentTarget.value
          zoom = 1
        }}
      >
        {#each levels as level}
          {@const id = value(level.properties, 'level_id')}
          <option value={id}>
            {value(level.properties, 'level_name_en') || id}
            ({facilities.filter(
              unit => value(unit.properties, 'level_id') === id && available(unit),
            ).length}
            available)
          </option>
        {/each}
      </select></label
    >
    <button
      type="button"
      class="rounded border px-3 py-2"
      onclick={() => (zoom = Math.min(zoom + 0.5, 5))}
    >
      Zoom in
    </button>
    <button
      type="button"
      class="rounded border px-3 py-2"
      onclick={() => (zoom = Math.max(zoom - 0.5, 1))}
    >
      Zoom out
    </button>
    {#if selected}
      <button
        type="button"
        class="underline"
        onclick={() => {
          selected = ''
          notice = ''
        }}
      >
        Clear selection
      </button>
    {/if}
  </div>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
    <div class="h-[32rem] overflow-auto rounded border bg-slate-50" data-connection-map>
      <svg
        {viewBox}
        style:width={`${zoom * 100}%`}
        style:height={`${zoom * 100}%`}
        aria-label="Floor plan"
      >
        {#each floorFeatures as feature}
          <path
            d={projection.path(feature)}
            fill="#e2e8f0"
            stroke="#94a3b8"
            stroke-width="0.5"
          />
        {/each}
        {#if data.coordinateSpace === 'image-pixels'}
          {#each floorFeatures as level}
            {@const origin = projection.project([0, 0], activeFloor)}
            <image
              href={value(level.properties, 'image_url')}
              x={origin[0]}
              y={origin[1]}
              width={Number(level.properties.image_width) * 0.2}
              height={Number(level.properties.image_height) * 0.2}
            />
          {/each}
        {/if}
        {#each data.unit_polygon.features.filter(
          unit => value(unit.properties, 'level_id') === activeFloor,
        ) as unit}
          <path
            d={projection.path(unit)}
            fill={data.coordinateSpace === 'image-pixels' ? 'transparent' : '#f8fafc'}
            stroke="#cbd5e1"
            stroke-width="0.25"
          />
        {/each}
        {#each facilities.filter(
          unit => value(unit.properties, 'level_id') === activeFloor,
        ) as unit}
          {@const state = status(unit)}
          {@const point = projection.project(centre(unit), activeFloor)}
          <!-- biome-ignore lint/a11y/useSemanticElements: SVG facilities need keyboard-operable geometry rather than HTML buttons. -->
          <g
            role="button"
            tabindex={editing && !disabled ? 0 : -1}
            aria-disabled={!editing || disabled}
            aria-label={`${label(unit)} — ${state}`}
            data-facility={value(unit.properties, 'unit_id')}
            data-state={state}
            onclick={() => choose(unit)}
            onkeydown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                choose(unit)
              }
            }}
          >
            <title>{label(unit)} — {state}</title>
            <path
              d={projection.path(unit)}
              fill={state === 'Selected'
                ? '#9333ea'
                : state === 'Available'
                  ? '#15803d'
                  : state === 'Linked'
                    ? '#2563eb'
                    : '#ea580c'}
              stroke="#fff"
              stroke-width="0.5"
            />
            <circle
              cx={point[0]}
              cy={point[1]}
              r={Math.max(bounds[2], bounds[3]) / 100}
              fill={state === 'Selected'
                ? '#9333ea'
                : state === 'Available'
                  ? '#15803d'
                  : state === 'Linked'
                    ? '#2563eb'
                    : '#ea580c'}
              stroke="#fff"
              stroke-width="0.5"
            />
          </g>
        {/each}
      </svg>
    </div>
    <aside class="flex max-h-[32rem] flex-col gap-3 overflow-auto rounded border p-4">
      {#if source}
        <h3 class="font-semibold">{label(source)}</h3>
        <p class="text-sm">
          {facilities.filter(available).length}
          available endpoints across all floors.
        </p>
        {#each related as { connection, index }}
          {@const target = facilities.find(
            unit =>
              value(unit.properties, 'unit_id') ===
              (connection.from === selected ? connection.to : connection.from),
          )}
          <fieldset
            class="flex flex-col gap-2 rounded border p-3"
            disabled={disabled || !editing}
          >
            <legend>{target ? label(target) : 'Connection'}</legend>
            <label class="flex items-center gap-2"
              ><input
                type="checkbox"
                bind:checked={connections[index].enabled}
              >Enabled</label
            >
            <label
              >Direction
              <select
                class="bg-panel w-full rounded border p-2"
                bind:value={connections[index].direction}
              >
                <option value={null}>Unknown — display only</option>
                <option value="both">Both ways</option>
                <option value="forward">From → To only</option>
              </select>
            </label>
            <p class="text-xs">From {connection.fromLevel} → {connection.toLevel}</p>
            <button
              type="button"
              class="self-start underline"
              onclick={() => {
                floor =
                  connection.from === selected
                    ? connection.toLevel
                    : connection.fromLevel
                selected =
                  connection.from === selected ? connection.to : connection.from
              }}
            >
              Show other endpoint
            </button>
          </fieldset>
        {/each}
        {#if !related.length}
          <p>No connections yet.</p>
        {/if}
      {:else}
        <p>Select a coloured facility on the map to inspect its connections.</p>
      {/if}
    </aside>
  </div>
  <p role="status">{notice}</p>
</section>
