<script lang="ts">
// DATA
import { roomLabel } from '#lib/indoor/labels.js'
import { centre, value, type IndoorFeature, type Place } from '#lib/indoor/model.js'
import { stationFill, type StationProjection } from '#lib/indoor/scene.js'
import { connectorLabel, isConnector, type Connection } from '#lib/indoor/spatial.js'
// TYPES
import type { ShopArtwork } from '#lib/indoor/artwork.js'
let {
  level,
  artwork,
  artworkOpacity = 0,
  units,
  entries,
  treads,
  projection,
  shops,
  connections,
  brand,
  maskId,
  exploded,
  selectedId,
  opacity,
  textScale,
  dragged,
  activate,
  chooseFloor,
  onSelectPlace,
}: {
  level: IndoorFeature
  artwork?: { src: string; width: number; height: number }
  artworkOpacity?: number
  units: IndoorFeature[]
  entries: Place[]
  treads: IndoorFeature[]
  projection: StationProjection
  shops: Map<string, Place>
  connections: Connection[]
  brand: (feature: IndoorFeature) => ShopArtwork | null
  maskId: string
  exploded: boolean
  selectedId?: string
  opacity: number
  textScale: number
  dragged: boolean
  activate: (event: MouseEvent, feature: IndoorFeature) => void
  chooseFloor: (id: string) => void
  onSelectPlace: (place: Place) => void
} = $props()
const id = $derived(value(level.properties, 'level_id'))
const artworkTransform = $derived.by(() => {
  if (!artwork) return ''
  const a = projection.project([0, 0], id),
    b = projection.project([artwork.width, 0], id),
    d = projection.project([0, artwork.height], id)
  return `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${d[0] - a[0]} ${d[1] - a[1]} ${a[0]} ${a[1]})`
})
const isBrand = (feature: IndoorFeature) => Boolean(brand(feature))
</script>
<g data-station-level={id} {opacity}>
  <path
    d={projection.path(level)}
    fill="var(--station-paper)"
    stroke="var(--station-edge)"
    stroke-width="1.5"
    vector-effect="non-scaling-stroke"
  />
  {#each units as unit}
    {@const shop = shops.get(value(unit.properties, 'unit_id'))}
    <path
      d={projection.path(unit)}
      fill={brand(unit)?.background ?? stationFill(unit)}
      fill-rule="evenodd"
      stroke={selectedId === shop?.id && shop
        ? 'var(--station-accent)'
        : 'var(--station-edge)'}
      stroke-width={selectedId === shop?.id && shop ? 3 : 0.9}
      vector-effect="non-scaling-stroke"
    />
    {#if isBrand(unit)}
      <g clip-path={`url(#${maskId}-${value(unit.properties, 'unit_id')})`}>
        <image
          href={brand(unit)?.src}
          width="1"
          height="1"
          preserveAspectRatio="none"
          transform={projection.logo(unit, brand(unit)?.aspect, brand(unit)?.padding)}
          data-shop-logo={shop?.code || shop?.name.en}
        />
      </g>
    {:else if shop && !exploded}
      {@const p = projection.project(centre(unit), id)}
      <text
        x={p[0]}
        y={p[1]}
        fill="var(--station-ink)"
        font-size={12 * textScale}
        text-anchor="middle"
        dominant-baseline="central"
      >
        {roomLabel(shop.code || shop.name.en)}
      </text>
    {/if}
  {/each}
  {#each treads as tread}
    <path
      d={projection.path(tread)}
      fill="none"
      stroke="var(--station-connector)"
      stroke-width="0.8"
      vector-effect="non-scaling-stroke"
    />
  {/each}
  {#if !exploded}
    {#each entries.filter(p => p.levelId === id && isConnector(p.category)) as place}
      {@const unit = units.find(
        f => f.properties.unit_id === place.feature.properties.unit_id,
      )}
      {@const p = projection.project(centre(unit ?? place.feature), id)}
      <text
        x={p[0]}
        y={p[1]}
        font-size={14 * textScale}
        text-anchor="middle"
        dominant-baseline="central"
        fill="var(--station-ink)"
        stroke="var(--station-paper)"
        stroke-width={3 * textScale}
        paint-order="stroke"
      >
        {connectorLabel(place, connections).split(' ')[0]}
      </text>
    {/each}
  {/if}
  <!-- Transparent targets sit above artwork, so a logo remains a shop hit target. -->
  {#each units.filter(
    unit =>
      exploded || entries.some(place => place.id === value(unit.properties, 'unit_id')),
  ) as unit}
    <!-- biome-ignore lint/a11y/useSemanticElements: SVG geometry cannot be an HTML button; the directory provides keyboard selection. -->
    <path
      d={projection.path(unit)}
      fill="transparent"
      class="cursor-pointer"
      role="button"
      tabindex="-1"
      aria-label={exploded
        ? `Open ${value(level.properties, 'level_name_en')}`
        : value(unit.properties, 'unit_name_en') ||
          value(unit.properties, 'unit_category')}
      onclick={e => activate(e, unit)}
      onkeydown={e => {
        if (e.key === 'Enter') chooseFloor(id)
      }}
    />
  {/each}
  {#if !exploded}
    {#each entries.filter(
      p =>
        p.levelId === id &&
        p.kind === 'facility' &&
        p.feature.geometry.type === 'Point' &&
        !isConnector(p.category) &&
        !['platform', 'faregate', 'entry'].includes(p.category),
    ) as amenity}
      {@const point = projection.project(centre(amenity.feature), id)}
      <!-- biome-ignore lint/a11y/useSemanticElements: SVG markers have equivalent keyboard-accessible entries in the station directory. -->
      <g
        role="button"
        tabindex="-1"
        aria-label={amenity.name.en}
        class="cursor-pointer"
        onclick={event => {
          event.stopPropagation()
          if (!dragged) {
            onSelectPlace(amenity)
          }
        }}
        onkeydown={e => {
          if (e.key === 'Enter') {
            onSelectPlace(amenity)
          }
        }}
      >
        <title>{amenity.name.en}</title>
        <circle
          cx={point[0]}
          cy={point[1]}
          r={7 * textScale}
          fill="var(--station-paper)"
          stroke={selectedId === amenity.id
            ? 'var(--station-accent)'
            : 'var(--station-edge)'}
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <text
          x={point[0]}
          y={point[1]}
          dominant-baseline="central"
          text-anchor="middle"
          font-size={8 * textScale}
          fill="var(--station-ink)"
        >
          {amenity.category.startsWith('restroom')
            ? 'WC'
            : amenity.category === 'information'
              ? 'i'
              : amenity.category === 'defibrillator'
                ? '+'
                : '•'}
        </text>
      </g>
    {/each}
  {/if}
  {#if artwork}
    <image
      href={artwork.src}
      width="1"
      height="1"
      preserveAspectRatio="none"
      transform={artworkTransform}
      opacity={artworkOpacity}
      pointer-events="none"
      data-floor-artwork
    />
  {/if}
</g>
