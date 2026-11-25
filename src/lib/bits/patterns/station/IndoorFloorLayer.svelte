<script lang="ts">
// COMPONENTS
import StationExitMarkers from './StationExitMarkers.svelte'
import { shopImagePlacement } from '#lib/indoor/artwork.js'
// DATA
import { facilityCategory, facilitySymbol } from '#lib/indoor/facilities.js'
import { centre, value, type IndoorFeature, type Place } from '#lib/indoor/model.js'
import { polygonLabels, fitPolygonText, roomLabel } from '#lib/indoor/labels.js'
import { stationFill, type StationProjection } from '#lib/indoor/scene.js'
import {
  isConnector,
  connectorTravelDirection,
  type Connection,
} from '#lib/indoor/spatial.js'
// TYPES
import type { ConnectorRelief } from '#lib/indoor/connectorRelief.js'
import type { ShopArtwork } from '#lib/indoor/artwork.js'
let {
  level,
  reliefs,
  connections,
  artwork,
  artworkOpacity = 0,
  units,
  hitUnits,
  entries,
  treads,
  openings = [],
  projection: cameraProjection,
  flatProjection,
  screenAlignedLogos = false,
  shops,
  brand,
  maskId,
  exploded,
  detailOpacity,
  selectedId,
  opacity,
  textScale,
  dragged,
  activate,
  chooseFloor,
  onSelectPlace,
}: {
  level: IndoorFeature
  connections: Connection[]
  reliefs: Map<string, ConnectorRelief>
  artwork?: { src: string; width: number; height: number }
  artworkOpacity?: number
  units: IndoorFeature[]
  hitUnits: IndoorFeature[]
  entries: Place[]
  treads: IndoorFeature[]
  openings?: IndoorFeature[]
  projection: StationProjection
  flatProjection: StationProjection
  screenAlignedLogos?: boolean
  shops: Map<string, Place>
  brand: (feature: IndoorFeature) => ShopArtwork | null
  maskId: string
  exploded: boolean
  detailOpacity: number
  selectedId?: string
  opacity: number
  textScale: number
  dragged: boolean
  activate: (event: MouseEvent, feature: IndoorFeature) => void
  chooseFloor: (id: string) => void
  onSelectPlace: (place: Place) => void
} = $props()
const reliefUnits = $derived(
  units.filter(unit => reliefs.has(value(unit.properties, 'unit_id'))),
)
// Flat overview floors keep their paths stable; only a six-number matrix follows the camera.
// Sloped relief and logos retain the full screen-space projection so floor tilt cannot stretch images.
const useFloorTransform = $derived(
  exploded &&
    detailOpacity === 0 &&
    reliefUnits.length === 0 &&
    !screenAlignedLogos &&
    !units.some(unit => brand(unit)),
)
const projection = $derived(useFloorTransform ? flatProjection : cameraProjection)
const floorTransform = $derived.by(() => {
  if (!useFloorTransform) return undefined
  const a = cameraProjection.project(flatProjection.unproject([0, 0], id), id)
  const b = cameraProjection.project(flatProjection.unproject([1, 0], id), id)
  const c = cameraProjection.project(flatProjection.unproject([0, 1], id), id)
  return `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${c[0] - a[0]} ${c[1] - a[1]} ${a[0]} ${a[1]})`
})
const reliefMask = $props.id()
const floorClip = `${reliefMask}-floor`
const floorBounds = $derived(projection.box([level]))
const id = $derived(value(level.properties, 'level_id'))
const artworkTransform = $derived.by(() => {
  if (!artwork) return ''
  const a = projection.project([0, 0], id),
    b = projection.project([artwork.width, 0], id),
    d = projection.project([0, artwork.height], id)
  return `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${d[0] - a[0]} ${d[1] - a[1]} ${a[0]} ${a[1]})`
})
const isBrand = (feature: IndoorFeature) => Boolean(brand(feature))
const facilityMarkers = $derived.by(() => {
  const markers: {
    amenity: Place
    origin: [number, number]
    point: [number, number]
  }[] = []
  const gap = 32 * textScale
  for (const amenity of entries.filter(
    p =>
      p.levelId === id &&
      p.kind === 'facility' &&
      (p.markerFeature ?? p.feature).geometry.type === 'Point' &&
      (artwork || !isConnector(p.category)) &&
      !['platform', 'faregate', 'entry'].includes(p.category),
  )) {
    const origin = projection.project(
      centre(amenity.markerFeature ?? amenity.feature),
      id,
    )
    let point: [number, number] = origin
    // Keep adjacent toilet symbols readable; leaders retain their exact source locations.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        markers.every(
          marker =>
            Math.hypot(marker.point[0] - point[0], marker.point[1] - point[1]) >= gap,
        )
      )
        break
      const step = Math.ceil((attempt + 1) / 2)
      point = [origin[0] + (attempt % 2 ? -1 : 1) * step * gap, origin[1]]
    }
    markers.push({ amenity, origin, point })
  }
  return markers
})
</script>
{#snippet reliefSurface(unit: IndoorFeature, facesOnly = false)}
  {@const relief = reliefs.get(value(unit.properties, 'unit_id'))!}
  {@const openingId = `${reliefMask}-opening-${value(unit.properties, 'unit_id')}`}
  {@const lightEnd = relief.surfaceLighting.upper}
  {@const darkEnd = relief.surfaceLighting.lower}
  <g
    data-connector-relief={facesOnly ? undefined : value(unit.properties, 'unit_id')}
    data-connector-walls={facesOnly ? value(unit.properties, 'unit_id') : undefined}
    data-source-network-edge={facesOnly ? undefined : relief.sourceEdge}
    data-exterior-continuation={!facesOnly && relief.exterior ? true : undefined}
    data-descending={relief.descending}
    clip-path={relief.descending && !relief.exterior ? `url(#${floorClip})` : undefined}
    pointer-events="none"
  >
    {#if !facesOnly}
      <defs>
        <linearGradient
          id={`${openingId}-depth`}
          gradientUnits="userSpaceOnUse"
          x1={lightEnd[0]}
          y1={lightEnd[1]}
          x2={darkEnd[0]}
          y2={darkEnd[1]}
        >
          <stop
            offset="0"
            stop-color="color-mix(in srgb, var(--station-paper) 14%, var(--station-connector-fill))"
          />
          <stop
            offset="1"
            stop-color="color-mix(in srgb, var(--station-connector) 28%, var(--station-connector-fill))"
          />
        </linearGradient>
        <!-- Wall shading follows elevation continuously across end walls and split side panels. -->
        {#each relief.faceLighting as lighting, index}
          <linearGradient
            id={`${openingId}-face-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={lighting.upper[0]}
            y1={lighting.upper[1]}
            x2={lighting.lower[0]}
            y2={lighting.lower[1]}
          >
            <stop
              offset="0"
              stop-color={`color-mix(in srgb, var(--station-connector) 24%, var(--station-connector-fill))`}
            />
            <stop
              offset="1"
              stop-color={`color-mix(in srgb, var(--station-connector) ${relief.descending ? 55 : 40}%, var(--station-connector-fill))`}
            />
          </linearGradient>
        {/each}
        {#each relief.bridgeFaces as face, index}
          <linearGradient
            id={`${openingId}-bridge-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={face.upper[0]}
            y1={face.upper[1]}
            x2={face.lower[0]}
            y2={face.lower[1]}
          >
            <stop
              offset="0"
              stop-color="color-mix(in srgb, var(--station-connector) 24%, var(--station-connector-fill))"
            />
            <stop
              offset="1"
              stop-color={`color-mix(in srgb, var(--station-connector) ${relief.descending ? 55 : 40}%, var(--station-connector-fill))`}
            />
          </linearGradient>
        {/each}
        <clipPath id={openingId} clipPathUnits="userSpaceOnUse">
          <path d={relief.opening} />
        </clipPath>
      </defs>
    {/if}
    <!-- Adjoining flights share an opening; their connecting face meets both independent slopes. -->
    <g
      clip-path={relief.descending && !relief.exterior
        ? `url(#${openingId})`
        : undefined}
    >
      <!-- Only exposed edge faces are filled; nearby inclines leave the shared side open. -->
      {#if facesOnly}
        {#each relief.visibleFaces as face, index}
          <path
            d={face}
            fill={`url(#${openingId}-face-${index})`}
            stroke="var(--station-connector)"
            stroke-width={relief.descending ? 0 : 0.8}
            vector-effect="non-scaling-stroke"
            data-connector-recess-face
          />
        {/each}
        <!-- Corner strokes reveal the far-end depth without filled separating walls. -->
        {#each relief.descending ? relief.depthEdges : [] as edge}
          <path
            d={edge}
            fill="none"
            stroke="var(--station-connector)"
            stroke-width="1.2"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
            data-connector-depth-edge
          />
        {/each}
      {:else}
        {#each relief.bridgeFaces as face, index}
          <path
            d={face.path}
            fill={`url(#${openingId}-bridge-${index})`}
            data-connector-shared-surface
          />
        {/each}
        <!-- Both travel directions shade toward the lower end, with opaque warm colours. -->
        {#each relief.surfaces ?? [relief.surface] as surface}
          <path
            d={surface}
            fill={`url(#${openingId}-depth)`}
            stroke="var(--station-connector)"
            stroke-width="0.9"
            vector-effect="non-scaling-stroke"
            fill-rule="evenodd"
          />
        {/each}
        {#if relief.outdoorEdge}
          <path
            d={relief.outdoorEdge}
            fill="none"
            stroke="#168bd2"
            stroke-width="5"
            vector-effect="non-scaling-stroke"
            data-outdoor-edge
          >
            <title>Outdoor connection · source direction; schematic slope</title>
          </path>
        {/if}
        {#if relief.exteriorTreads}
          <path
            d={relief.exteriorTreads}
            fill="none"
            stroke="var(--station-connector)"
            stroke-width="0.8"
            vector-effect="non-scaling-stroke"
          />
        {/if}
        {#each treads.filter(
          tread =>
            !relief.exterior && tread.properties.unit_id === unit.properties.unit_id,
        ) as tread}
          <path
            d={relief.line(tread)}
            fill="none"
            stroke="var(--station-connector)"
            stroke-width="0.8"
            vector-effect="non-scaling-stroke"
          />
        {/each}
      {/if}
    </g>
  </g>
{/snippet}
<g
  data-station-level={id}
  {opacity}
  transform={floorTransform}
  data-floor-transform={useFloorTransform}
>
  <defs>
    <!-- Logo clips use the same local coordinates as transformed floor geometry. -->
    {#each units.filter(isBrand) as unit}
      <clipPath id={`${maskId}-${value(unit.properties, 'unit_id')}`}>
        <path d={projection.path(unit)} />
      </clipPath>
    {/each}
    <!-- Only lowered openings and flat linework are clipped; raised flights extend above the floor edge. -->
    <clipPath id={floorClip} clipPathUnits="userSpaceOnUse">
      <path d={projection.path(level)} clip-rule="evenodd" />
    </clipPath>
    <mask
      id={reliefMask}
      maskUnits="userSpaceOnUse"
      x={floorBounds[0] - 5}
      y={floorBounds[1] - 5}
      width={floorBounds[2] + 10}
      height={floorBounds[3] + 10}
    >
      <rect
        x={floorBounds[0] - 5}
        y={floorBounds[1] - 5}
        width={floorBounds[2] + 10}
        height={floorBounds[3] + 10}
        fill="white"
      />
      {#each reliefUnits.filter(
        unit => reliefs.get(value(unit.properties, 'unit_id'))?.descending,
      ) as unit}
        <path
          d={reliefs.get(value(unit.properties, 'unit_id'))!.opening}
          fill="black"
        />
      {/each}
    </mask>
  </defs>
  <!-- Descending flights sit beneath openings cut through the flat floor and its units. -->
  {#each reliefUnits.filter(
    unit => reliefs.get(value(unit.properties, 'unit_id'))?.descending,
  ) as unit}
    {@render reliefSurface(unit, true)}
  {/each}
  {#each reliefUnits.filter(
    unit => reliefs.get(value(unit.properties, 'unit_id'))?.descending,
  ) as unit}
    {@render reliefSurface(unit)}
  {/each}
  <g mask={reliefUnits.length ? `url(#${reliefMask})` : undefined}>
    <path
      d={projection.path(level)}
      fill="var(--station-paper)"
      stroke="var(--station-edge)"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
    />
    {#each units.filter(
      unit => !reliefs.has(value(unit.properties, 'unit_id')),
    ) as unit}
      {@const shop = shops.get(value(unit.properties, 'unit_id'))}
      <path
        d={projection.path(unit)}
        clip-path={isConnector(value(unit.properties, 'unit_category'))
          ? `url(#${floorClip})`
          : undefined}
        fill={value(unit.properties, 'geometry_role') === 'artwork_colour_trace'
          ? 'var(--station-edge)'
          : stationFill(unit)}
        fill-rule="evenodd"
        stroke="var(--station-edge)"
        stroke-width="0.9"
        vector-effect="non-scaling-stroke"
      />
      {#if isBrand(unit)}
        {@const placement = shopImagePlacement(
          (screenAlignedLogos ? projection.screenAlignedLogo : projection.logo)(
            unit,
            brand(unit)?.aspect,
            brand(unit)?.padding,
          ),
          brand(unit)?.aspect,
          true,
        )}
        <!-- Both modes lie on the floor and stay clipped to the shop; magic mode only changes their orientation. -->
        {#if placement}
          <g clip-path={`url(#${maskId}-${value(unit.properties, 'unit_id')})`}>
            <image
              href={brand(unit)?.src}
              width={placement.width}
              height={placement.height}
              preserveAspectRatio="xMidYMid meet"
              transform={placement.transform}
              data-shop-logo={shop?.code || shop?.name.en}
            />
          </g>
        {/if}
      {:else if shop &&
        detailOpacity > 0 &&
        facilityCategory(shop.category, shop.name.en) === 'exhibition' &&
        value(unit.properties, 'geometry_role') !== 'artwork_colour_trace'}
        {@const symbol = facilitySymbol(shop.category, shop.name.en)}
        {#each polygonLabels(unit, point => projection.project(point, id)) as placement}
          <!-- Keep the exhibition display centred inside its source polygon. -->
          {@const size = Math.min(24 * textScale, placement.clearance * 1.4)}
          <g
            data-unit-icon="exhibition"
            aria-label={shop.name.en}
            transform={`translate(${placement.point[0] - size / 2} ${placement.point[1] - size / 2}) scale(${size / 24})`}
          >
            <title>{shop.name.en}</title>
            <path
              d={symbol.path}
              fill="none"
              stroke={symbol.color}
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>
        {/each}
      {:else if shop &&
        detailOpacity > 0 &&
        value(unit.properties, 'geometry_role') !== 'artwork_colour_trace'}
        {#each polygonLabels(unit, point => projection.project(point, id)) as placement}
          {@const labels = (
            artwork
              ? shop.code
                  .replace(/L[12]-/g, '')
                  .replace(/\s*-\s*/g, '–')
                  .replace(/(\d{3})–\d{3}–(\d{3})/g, '$1–$2')
                  .split(/\s*&\s*|(?<=–)/)
              : [shop.code || shop.name.en]
          ).map(roomLabel)}
          {@const fitted = fitPolygonText(
            placement,
            12 * textScale,
            Math.max(...labels.map(label => label.length)),
            labels.length,
          )}
          {@const p = fitted.point}
          {@const labelSize = Math.max(10 * textScale, fitted.size)}
          <text
            x={p[0]}
            y={p[1]}
            fill="var(--station-ink)"
            data-unit-label={shop.code}
            opacity={detailOpacity}
            font-size={labelSize}
            stroke="var(--station-paper)"
            stroke-width={2 * textScale}
            paint-order="stroke"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {#each labels as label, index}
              <tspan
                x={p[0]}
                dy={index === 0
                  ? -(labels.length - 1) * labelSize * 0.55
                  : labelSize * 1.1}
              >
                {label}
              </tspan>
            {/each}
          </text>
        {/each}
      {/if}
    {/each}
    {#each treads.filter(
      tread => !reliefs.has(value(tread.properties, 'unit_id')),
    ) as tread}
      <path
        d={projection.path(tread)}
        clip-path={`url(#${floorClip})`}
        fill="none"
        stroke="var(--station-connector)"
        stroke-width="0.8"
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </g>
  <!-- Raised flights are opaque solids: paint far flights before near flights, then their front faces. -->
  {#each reliefUnits
    .filter(unit => !reliefs.get(value(unit.properties, 'unit_id'))?.descending)
    .toSorted(
      (a, b) =>
        reliefs.get(value(a.properties, 'unit_id'))!.paintDepth -
        reliefs.get(value(b.properties, 'unit_id'))!.paintDepth,
    ) as unit}
    {@render reliefSurface(unit)}
    {@render reliefSurface(unit, true)}
  {/each}
  {#if detailOpacity > 0}
    <g
      data-level-details
      opacity={detailOpacity}
      pointer-events={exploded ? 'none' : 'auto'}
    >
      {#each entries.filter(
        p =>
          p.levelId === id &&
          isConnector(p.category) &&
          !(artwork && (p.markerFeature ?? p.feature).geometry.type === 'Point'),
      ) as place}
        {@const unit = units.find(
          f => f.properties.unit_id === place.feature.properties.unit_id,
        )}
        {@const p = projection.project(centre(unit ?? place.feature), id)}
        {@const relief = reliefs.get(value(place.feature.properties, 'unit_id'))}
        {@const hasReviewedDirection = connections.some(
          c =>
            (c.from === place.feature.properties.unit_id ||
              c.to === place.feature.properties.unit_id) &&
            ['editor-verified', 'reviewed-layout'].includes(c.evidence),
        )}
        {@const direction = hasReviewedDirection
          ? connectorTravelDirection(
              value(place.feature.properties, 'unit_id'),
              connections,
            )
          : relief?.sourceTravel}
        {#if direction && relief}
          {@const angle =
            (Math.atan2(
              relief.farEnd[1] - relief.entrance[1],
              relief.farEnd[0] - relief.entrance[0],
            ) *
              180) /
            Math.PI}
          <text
            data-connector-travel-direction={direction}
            x={p[0]}
            y={p[1]}
            transform={`rotate(${angle} ${p[0]} ${p[1]})`}
            font-size={16 * textScale}
            text-anchor="middle"
            dominant-baseline="central"
            fill="var(--station-ink)"
            stroke="var(--station-paper)"
            stroke-width={3 * textScale}
            paint-order="stroke"
            pointer-events="none"
          >
            <title>
              {hasReviewedDirection
                ? 'Reviewed travel direction'
                : `3D indoor network · ${relief.sourceEdge}`}
            </title>
            {direction === 'both' ? '↔' : direction === 'depart' ? '→' : '←'}
          </text>
        {/if}
      {/each}
    </g>
  {/if}
  <!-- Exterior endpoints are authored portals, not inferred street-network attachments. -->
  {#each connections.filter(
    c =>
      c.enabled !== false &&
      ((c.fromLevel === id && c.toExterior) || (c.toLevel === id && c.fromExterior)),
  ) as connection}
    {@const exterior = connection.fromExterior ?? connection.toExterior}
    {#if exterior}
      {@const endpoint = projection.project(exterior.point, id)}
      <g
        data-exterior-portal={connection.fromExterior ? connection.from : connection.to}
        pointer-events="none"
      >
        <circle
          cx={endpoint[0]}
          cy={endpoint[1]}
          r={4 * textScale}
          fill="var(--station-ink)"
          stroke="var(--station-paper)"
        />
        <text
          x={endpoint[0]}
          y={endpoint[1] - 9 * textScale}
          text-anchor="middle"
          font-size={12 * textScale}
          fill="var(--station-ink)"
          stroke="var(--station-paper)"
          stroke-width={3 * textScale}
          paint-order="stroke"
        >
          {exterior.label}
        </text>
      </g>
    {/if}
  {/each}
  <!-- A ground-level lift-only lobby can have a principal entrance without a sloping network edge. -->
  {#if Number(level.properties.level_ordinal) === 0 &&
    units.some(
      unit => facilityCategory(value(unit.properties, 'unit_category')) === 'elevator',
    ) &&
    units.every(unit =>
      ['elevator', 'walkway'].includes(value(unit.properties, 'unit_category')),
    )}
    {#each openings.filter(
      opening => opening.properties.opening_category === 'pedestrian.principal',
    ) as opening}
      <path
        d={projection.path(opening)}
        fill="none"
        stroke="#168bd2"
        stroke-width="5"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        data-station-access-opening={value(opening.properties, 'opening_id')}
      >
        <title>Station access</title>
      </path>
    {/each}
  {/if}
  {#if !exploded}
    <!-- Every lift shaft gets a screen-aligned symbol on its own floor. -->
    {#each units.filter(
      unit => facilityCategory(value(unit.properties, 'unit_category')) === 'elevator',
    ) as unit}
      {@const symbol = facilitySymbol('elevator')}
      {#each polygonLabels(unit, point => projection.project(point, id)) as placement}
        {@const size = 24 * textScale}
        <g
          data-elevator-access={value(unit.properties, 'unit_id')}
          aria-label="Lift access"
          pointer-events="none"
          transform={`translate(${placement.point[0] - size / 2} ${placement.point[1] - size / 2}) scale(${size / 24})`}
        >
          <title>Lift access</title>
          <path
            d={symbol.path}
            fill="none"
            stroke="var(--station-paper)"
            stroke-width="4.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d={symbol.path}
            fill="none"
            stroke="var(--station-ink)"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      {/each}
    {/each}
  {/if}
  <!-- One floor target is enough in overview; detailed targets stay above artwork so logos remain selectable. -->
  {#each exploded
    ? [level]
    : hitUnits.filter(unit =>
        entries.some(place => place.id === value(unit.properties, 'unit_id')),
      ) as unit}
    <!-- biome-ignore lint/a11y/useSemanticElements: SVG geometry cannot be an HTML button; the directory provides keyboard selection. -->
    <path
      d={projection.path(unit)}
      fill="transparent"
      fill-rule="evenodd"
      data-unit-target={exploded ? undefined : value(unit.properties, 'unit_id')}
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
  {#if detailOpacity > 0}
    {#each treads.filter(tread => tread.properties.flight_label) as tread}
      {@const p = projection.project(centre(tread), id)}
      <text
        x={p[0]}
        y={p[1]}
        data-stair-flight={tread.properties.flight_label}
        font-size={10 * textScale}
        fill="var(--station-ink)"
        stroke="var(--station-paper)"
        stroke-width={3 * textScale}
        paint-order="stroke"
        font-weight="700"
        pointer-events="none"
        text-anchor="middle"
        dominant-baseline="central"
      >
        {tread.properties.flight_label}
      </text>
    {/each}
    <g
      data-level-details
      opacity={detailOpacity}
      pointer-events={exploded ? 'none' : 'auto'}
    >
      {#each facilityMarkers as { amenity, origin, point }}
        {@const symbol = facilitySymbol(amenity.category, amenity.name.en)}
        {#if point[0] !== origin[0] || point[1] !== origin[1]}
          <line
            x1={origin[0]}
            y1={origin[1]}
            x2={point[0]}
            y2={point[1]}
            stroke="var(--station-ink)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            pointer-events="none"
          />
        {/if}
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
            r={14 * textScale}
            fill={symbol.background}
            stroke={selectedId === amenity.id ? 'var(--station-accent)' : symbol.color}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <path
            d={symbol.path}
            transform={`translate(${point[0] - 10 * textScale} ${point[1] - 10 * textScale}) scale(${(20 * textScale) / 24})`}
            fill="none"
            stroke={symbol.color}
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          {#if symbol.text}
            <text
              x={point[0]}
              y={point[1] + 7 * textScale}
              text-anchor="middle"
              font-size={9 * textScale}
              font-weight="800"
              fill={symbol.color}
            >
              {symbol.text}
            </text>
          {/if}
        </g>
      {/each}
    </g>
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
  <!-- Source entry labels remain above reference artwork and never imply a routing edge. -->
  {#if detailOpacity > 0 && !exploded}
    <g opacity={detailOpacity} data-exit-markers>
      <StationExitMarkers
        {entries}
        levelId={id}
        {projection}
        {textScale}
        {selectedId}
        {dragged}
        {onSelectPlace}
      />
    </g>
  {/if}
  <!-- Paint selection last: logos, neighbour fills and the reference overlay cannot cover its perimeter. -->
  {#each units.filter(
    unit => value(unit.properties, 'unit_id') === selectedId,
  ) as selectedUnit}
    <path
      d={projection.path(selectedUnit)}
      fill="none"
      stroke="var(--station-accent)"
      stroke-width="3"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
      pointer-events="none"
      data-selection-outline={selectedId}
    />
  {/each}
</g>
