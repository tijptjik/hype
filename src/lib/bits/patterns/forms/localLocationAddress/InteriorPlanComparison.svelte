<script lang="ts">
// DOMAIN
import { polygonLabels } from '#lib/indoor/labels.js'
import { facilityColourGroup } from '#lib/indoor/facilityColours.js'
// TYPES
import type { FloorplanExtraction } from '#lib/indoor/floorplans/extraction.js'

let {
  floor,
  original,
  cleaned,
}: {
  floor: FloorplanExtraction['floors'][number]
  original: string
  cleaned: string
} = $props()
let blend = $state(2)
const stops = ['Original', 'Cleaned', 'AI polygons']
const stopsId = $props.id()
const paperMaskId = `${stopsId}-paper`
const blendLabel = $derived(
  Number.isInteger(blend)
    ? stops[blend]
    : stops[Math.floor(blend)] + ' to ' + stops[Math.ceil(blend)],
)
const units = $derived(
  floor.units.map((unit, index) => {
    const rings = [unit.polygon, ...(unit.holes ?? [])]
    const anchor = polygonLabels(
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: rings },
      },
      p => [p[0], p[1]],
    )[0]
    return {
      ...unit,
      number: index + 1,
      href: unit.locationId
        ? '/admin/locations/' + encodeURIComponent(unit.locationId)
        : undefined,
      path: rings
        .map(ring => 'M' + ring.map(p => p.join(',')).join('L') + 'Z')
        .join(' '),
      color: facilityColourGroup(
        unit.category === 'lavatory' || unit.category === 'toilet'
          ? 'restroom.unisex'
          : unit.category,
      ).color,
      anchor,
    }
  }),
)
</script>

<div class="grid min-h-0 min-w-0 flex-1 overflow-auto">
  <div class="bg-canvas flex min-w-0 flex-col gap-4 p-4">
    <fieldset aria-label="Floor plan layers" class="w-full max-w-72">
      <input
        aria-label="Floor plan blend"
        aria-valuetext={blendLabel}
        type="range"
        min="0"
        max="2"
        step="0.01"
        list={stopsId}
        bind:value={blend}
        class="accent-primary block w-full cursor-pointer"
      >
      <datalist id={stopsId}>
        <option value="0"></option>
        <option value="1"></option>
        <option value="2"></option>
      </datalist>
      <div class="flex justify-between">
        {#each stops as label, i (label)}
          <button
            type="button"
            aria-pressed={blend === i}
            onclick={() => (blend = i)}
            class="text-muted-foreground aria-pressed:text-foreground py-1 text-xs aria-pressed:font-semibold"
          >
            {label}
          </button>
        {/each}
      </div>
    </fieldset>
    <svg
      role="img"
      aria-label={floor.label + ' floor plan comparison'}
      viewBox={'0 0 ' + floor.width + ' ' + floor.height}
      class="min-h-52 w-full flex-1"
    >
      <defs>
        <!-- The cleaned scan's paper luminance selects the canvas colour between ink strokes. -->
        <mask
          id={paperMaskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={floor.width}
          height={floor.height}
        >
          <rect width={floor.width} height={floor.height} fill="white" />
          <image href={cleaned} width={floor.width} height={floor.height} />
        </mask>
      </defs>
      <image href={original} width={floor.width} height={floor.height} />
      <g data-layer="cleaned" opacity={Math.min(1, blend)}>
        <rect width={floor.width} height={floor.height} class="fill-foreground" />
        <rect
          width={floor.width}
          height={floor.height}
          class="fill-canvas"
          mask={`url(#${paperMaskId})`}
        />
      </g>
      <g
        data-layer="polygons"
        opacity={Math.max(0, blend - 1)}
        pointer-events={blend > 1 ? 'auto' : 'none'}
      >
        {#each units as part (part.id)}
          <a href={part.href} tabindex="-1" aria-label={part.label}>
            <title>{part.label} · {part.evidence}</title>
            <path
              d={part.path}
              fill={part.color}
              fill-rule="evenodd"
              fill-opacity="0.23"
              stroke={`color-mix(in srgb, ${part.color} 65%, var(--color-foreground))`}
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            {#if part.anchor}
              {@const radius = Math.min(
                floor.width * 0.013,
                part.anchor.clearance * 0.85,
              )}
              <circle
                cx={part.anchor.point[0]}
                cy={part.anchor.point[1]}
                r={radius}
                fill={part.color}
              />
              <text
                x={part.anchor.point[0]}
                y={part.anchor.point[1]}
                text-anchor="middle"
                dominant-baseline="central"
                fill="white"
                font-size={radius * 1.35}
              >
                {part.number}
              </text>
            {/if}
          </a>
        {/each}
      </g>
    </svg>
  </div>
</div>
