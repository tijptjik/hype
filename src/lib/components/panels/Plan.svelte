<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { getFPI18n, getI18n, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// REMOTE
import { getFeature, getFeatures } from '$lib/api/server/feature.remote'
import { getLayer } from '$lib/api/server/layer.remote'
import { getProject } from '$lib/api/server/project.remote'
// SERVICES
import { getURLfromImage } from '$lib/client/services/image'
// BITS
import { Button, PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
// ENUMS
import { Panel as PanelType } from '$lib/enums'
// ICONS
import GripVerticalIcon from 'virtual:icons/lucide/grip-vertical'
import MapPinnedIcon from 'virtual:icons/lucide/map-pinned'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import FootprintsIcon from 'virtual:icons/lucide/footprints'
import PlusIcon from 'virtual:icons/lucide/plus'
import FootPrints from 'virtual:icons/lucide/footprints'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { ProjectDetailProfile } from '$lib/db/zod/schema/project.types'
import type { PanelProps, PlanScheduleStop } from '$lib/types'

const appCtx = getAppCtx()

let panelProps: PanelProps = $derived({
  panelType: PanelType.plan,
  position: 'left',
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: false,
})

let headerTitle = $state('Friday circuit')
let layerDescription = $state('Layer description coming soon.')
let projectImageUrl = $state<string | null>(null)
let scheduleStops = $state<PlanScheduleStop[]>([])
let isLoading = $state(true)
let errorMessage = $state('')
let isDescriptionExpanded = $state(false)

function shuffleFeatures(features: FeatureFromCollection[]): FeatureFromCollection[] {
  const nextFeatures = [...features]

  for (let index = nextFeatures.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[nextFeatures[index], nextFeatures[swapIndex]] = [
      nextFeatures[swapIndex],
      nextFeatures[index],
    ]
  }

  return nextFeatures
}

function getFirstAddressLine(feature: FeatureFromCollection): string {
  const displayAddress = getI18n(
    feature,
    'displayAddress',
    appCtx.getUserPreferences(),
    'Address to confirm',
  )

  return displayAddress.split(',')[0]?.trim() || 'Address to confirm'
}

function getCountryValue(feature: FeatureFromCollection): string | null {
  const countryProperty = feature.properties.find(property =>
    ['country', 'countries'].includes(property.property?.key?.toLowerCase() ?? ''),
  )

  if (!countryProperty) return null

  const country = getFPI18n(countryProperty, appCtx.getUserPreferences()).trim()
  return country && country !== '-' ? country : null
}

function getCountryFlag(country: string | null): string {
  const normalizedCountry = country?.trim().toLowerCase()

  if (!normalizedCountry) return '🌍'

  if (
    normalizedCountry === 'belgium & slovenia' ||
    normalizedCountry === 'belgium and slovenia'
  ) {
    return '🇧🇪 🇸🇮'
  }

  if (normalizedCountry === 'belgium') {
    return '🇧🇪'
  }

  if (normalizedCountry === 'slovenia') {
    return '🇸🇮'
  }

  if (normalizedCountry === 'czechia' || normalizedCountry === 'czech republic') {
    return '🇨🇿'
  }

  if (
    normalizedCountry === 'hksar' ||
    normalizedCountry === 'hong kong' ||
    normalizedCountry === '香港特區' ||
    normalizedCountry === '香港特区' ||
    normalizedCountry === 'hong kong sar'
  ) {
    return '🇭🇰'
  }

  if (
    normalizedCountry === 'china' ||
    normalizedCountry === '中國' ||
    normalizedCountry === '中国'
  ) {
    return '🇨🇳'
  }

  if (normalizedCountry === 'japan' || normalizedCountry === '日本') {
    return '🇯🇵'
  }

  if (normalizedCountry === 'germany') {
    return '🇩🇪'
  }

  if (normalizedCountry === 'poland') {
    return '🇵🇱'
  }

  if (normalizedCountry === 'portugal') {
    return '🇵🇹'
  }

  if (normalizedCountry === 'spain') {
    return '🇪🇸'
  }

  if (normalizedCountry === 'switzerland') {
    return '🇨🇭'
  }

  if (normalizedCountry === 'finland') {
    return '🇫🇮'
  }

  if (normalizedCountry === 'france') {
    return '🇫🇷'
  }

  if (normalizedCountry === 'hungary') {
    return '🇭🇺'
  }

  if (normalizedCountry === 'ireland') {
    return '🇮🇪'
  }

  if (normalizedCountry === 'italy') {
    return '🇮🇹'
  }

  if (normalizedCountry === 'netherlands' || normalizedCountry === 'the netherlands') {
    return '🇳🇱'
  }

  if (normalizedCountry === 'ukraine') {
    return '🇺🇦'
  }

  if (
    normalizedCountry === 'taiwan' ||
    normalizedCountry === '台灣' ||
    normalizedCountry === '台湾'
  ) {
    return '🇹🇼'
  }

  if (
    normalizedCountry === 'south korea' ||
    normalizedCountry === 'korea' ||
    normalizedCountry === '대한민국'
  ) {
    return '🇰🇷'
  }

  return '🌍'
}

function getCountryBadge(country: string | null): string {
  const flag = getCountryFlag(country)

  if (flag === '🌍' && country) {
    return country
  }

  return flag
}

function getAuthorValue(feature: FeatureFromCollection): string {
  const authorProperty = feature.properties.find(property =>
    ['author', 'authors', 'writer', 'writers'].includes(
      property.property?.key?.toLowerCase() ?? '',
    ),
  )

  if (!authorProperty) return 'Author to confirm'

  const author = getFPI18n(authorProperty, appCtx.getUserPreferences()).trim()
  return author && author !== '-' ? author : 'Author to confirm'
}

function toTimeLabel(index: number): string {
  const startMinutes = 18 * 60
  const totalMinutes = startMinutes + index * 30
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getCoordinates(feature: FeatureFromCollection): {
  latitude: number | null
  longitude: number | null
} {
  const rawGeometry =
    typeof feature.geometry === 'string'
      ? (() => {
          try {
            return JSON.parse(feature.geometry) as {
              type?: string
              coordinates?: unknown
            }
          } catch {
            return null
          }
        })()
      : (feature.geometry as { type?: string; coordinates?: unknown } | null)
  const geometryCoordinates =
    rawGeometry?.type === 'Point' && Array.isArray(rawGeometry.coordinates)
      ? rawGeometry.coordinates
      : null
  const geometryLongitude =
    geometryCoordinates &&
    (typeof geometryCoordinates[0] === 'number' ||
      typeof geometryCoordinates[0] === 'string')
      ? Number(geometryCoordinates[0])
      : null
  const geometryLatitude =
    geometryCoordinates &&
    (typeof geometryCoordinates[1] === 'number' ||
      typeof geometryCoordinates[1] === 'string')
      ? Number(geometryCoordinates[1])
      : null
  const addressLongitude =
    typeof feature.addressMeta?.longitude === 'number' ||
    typeof feature.addressMeta?.longitude === 'string'
      ? Number(feature.addressMeta.longitude)
      : null
  const addressLatitude =
    typeof feature.addressMeta?.latitude === 'number' ||
    typeof feature.addressMeta?.latitude === 'string'
      ? Number(feature.addressMeta.latitude)
      : null

  const latitude = Number.isFinite(geometryLatitude ?? NaN)
    ? (geometryLatitude as number)
    : Number.isFinite(addressLatitude ?? NaN)
      ? (addressLatitude as number)
      : null
  const longitude = Number.isFinite(geometryLongitude ?? NaN)
    ? (geometryLongitude as number)
    : Number.isFinite(addressLongitude ?? NaN)
      ? (addressLongitude as number)
      : null

  return {
    latitude,
    longitude,
  }
}

function getDistanceInKm(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number | null; longitude: number | null },
): number | null {
  if (
    from.latitude === null ||
    from.longitude === null ||
    to.latitude === null ||
    to.longitude === null
  ) {
    return null
  }

  const earthRadiusKm = 6371
  const toRadians = (value: number): number => (value * Math.PI) / 180
  const deltaLatitude = toRadians(to.latitude - from.latitude)
  const deltaLongitude = toRadians(to.longitude - from.longitude)
  const latitudeA = toRadians(from.latitude)
  const latitudeB = toRadians(to.latitude)

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(distanceInKm: number | null): string {
  if (distanceInKm === null) return 'Distance to confirm'
  if (distanceInKm < 1) return `${Math.round(distanceInKm * 1000)} m from previous`
  return `${distanceInKm.toFixed(1)} km from previous`
}

function formatWalkingTime(distanceInKm: number | null): string {
  if (distanceInKm === null) return 'Walk time to confirm'

  const walkingSpeedKmPerHour = 4.8
  const walkingMinutes = Math.max(
    1,
    Math.round((distanceInKm / walkingSpeedKmPerHour) * 60),
  )

  return `${walkingMinutes} min`
}

function formatCoordinateLabel(
  coordinates: { latitude: number | null; longitude: number | null } | null,
): string {
  if (!coordinates) return 'start'
  if (coordinates.latitude === null || coordinates.longitude === null)
    return 'missing coords'
  return `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`
}

function buildDistanceLabel(
  nextCoordinates: { latitude: number | null; longitude: number | null } | null,
  distanceToNextKm: number | null,
): string {
  if (!nextCoordinates) return ''
  return formatWalkingTime(distanceToNextKm)
}

function getMapHref(stop: PlanScheduleStop): string | null {
  if (stop.latitude === null || stop.longitude === null) return null
  return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`
}

async function loadDetailedFeatures(
  features: FeatureFromCollection[],
): Promise<FeatureFromCollection[]> {
  const selectedFeatures = features.slice(0, 8)

  return await Promise.all(
    selectedFeatures.map(async feature => {
      const response = await getFeature({
        ref: feature.id,
        refKey: 'id',
        meta: { profile: 'detail' },
      })

      return (response.data as FeatureFromCollection | null) ?? feature
    }),
  )
}

function toScheduleStops(features: FeatureFromCollection[]): PlanScheduleStop[] {
  const selectedFeatures = features.slice(0, 8)

  return selectedFeatures.map((feature, index) => {
    const country = getCountryValue(feature)
    const coordinates = getCoordinates(feature)
    const nextCoordinates =
      index < selectedFeatures.length - 1
        ? getCoordinates(selectedFeatures[index + 1])
        : null
    const distanceToNextKm = nextCoordinates
      ? getDistanceInKm(coordinates, nextCoordinates)
      : null

    return {
      time: toTimeLabel(index),
      featureId: feature.id,
      title: getI18n(feature, 'title', appCtx.getUserPreferences(), feature.id),
      author: getAuthorValue(feature),
      addressLine: getFirstAddressLine(feature),
      country,
      flag: getCountryFlag(country),
      imageUrl: feature.image
        ? getURLfromImage({ image: feature.image as ImageContextEnvelope })
        : null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      distanceFromPreviousKm: distanceToNextKm,
      distanceLabel: buildDistanceLabel(nextCoordinates, distanceToNextKm),
    }
  })
}

async function loadPlanDemo(): Promise<void> {
  isLoading = true
  errorMessage = ''

  try {
    const seedFeatureResponse = await getFeature({
      ref: 'elnBook00010',
      refKey: 'id',
      meta: { profile: 'detail' },
    })
    const seedFeature = seedFeatureResponse.data

    if (!seedFeature?.layerId) {
      errorMessage = 'Could not resolve the source layer for this Friday.'
      scheduleStops = []
      return
    }

    const [layerResponse, projectResponse, featuresResponse] = await Promise.all([
      getLayer({
        ref: seedFeature.layerId,
        refKey: 'id',
        meta: { profile: 'detail' },
      }),
      getProject({
        ref: seedFeature.projectId,
        refKey: 'id',
        meta: { profile: 'detail' },
      }),
      getFeatures({
        conditions: {
          layerId: seedFeature.layerId,
          isArchived: false,
          isPublished: true,
        },
        pagination: {
          limit: 24,
        },
        meta: { profile: 'list' },
      }),
    ])

    const layer = layerResponse.data as Layer | null
    const project = projectResponse.data as ProjectDetailProfile | null
    const features = (featuresResponse.data as FeatureFromCollection[]).filter(
      feature => {
        if (feature.id === 'elnBook00010') return false

        return Boolean(
          getI18n(feature, 'title', appCtx.getUserPreferences(), '').trim(),
        )
      },
    )

    const projectName = project
      ? getI18n(project as never, 'name', appCtx.getUserPreferences(), 'Project')
      : 'Project'
    const layerName = layer
      ? getI18n(layer, 'name', appCtx.getUserPreferences(), 'Layer')
      : 'Layer'

    headerTitle = `${projectName}`
    layerDescription = layer
      ? getI18n(
          layer,
          'description',
          appCtx.getUserPreferences(),
          'A curated Friday route through this collection.',
        )
      : 'A curated Friday route through this collection.'
    projectImageUrl = project?.image
      ? getURLfromImage({ image: project.image as ImageContextEnvelope })
      : null
    const shuffledFeatures = shuffleFeatures(features)
    const detailedFeatures = await loadDetailedFeatures(shuffledFeatures)
    scheduleStops = toScheduleStops(detailedFeatures)

    if (scheduleStops.length === 0) {
      errorMessage = 'No published stops are available for this layer yet.'
    }
  } catch (error) {
    console.error('Failed to load plan demo panel', error)
    errorMessage = 'Unable to build the demonstration programme right now.'
    scheduleStops = []
  } finally {
    isLoading = false
  }
}

onMount(() => {
  void loadPlanDemo()
})
</script>

<Panel {...panelProps}>
  <Header {...panelProps} title={headerTitle} />

  <div class="relative flex min-h-full flex-col bg-black">
    <section
      class="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(236,72,153,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(180deg,#19161f_0%,#11141a_58%,#000000_100%)] px-4 py-4"
    >
      <div class="space-y-3">
        {#if projectImageUrl}
          <img
            src={projectImageUrl}
            alt={headerTitle}
            class="float-right ml-4 h-36 w-36 rounded-3xl border border-white/15 object-cover ring-1 ring-white/10"
            loading="lazy"
          >
        {/if}

        <div class="min-w-0 space-y-2">
          <p
            class="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#ff69b0]"
          >
            This Friday
          </p>
          <p
            class={`text-sm leading-6 text-white/80 ${!isDescriptionExpanded ? 'line-clamp-4' : ''}`}
          >
            {layerDescription}
          </p>
          <button
            type="button"
            class="ml-auto block text-right text-xs font-medium text-[#ff69b0] transition-colors hover:text-[#ff8bc1]"
            onclick={() => {
              isDescriptionExpanded = !isDescriptionExpanded
            }}
          >
            {isDescriptionExpanded ? 'Read less' : 'Read more'}
          </button>
        </div>

        <div class="clear-both flex flex-wrap gap-2 pt-1">
          <div
            class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/72"
          >
            Free Attendance
          </div>
          <div
            class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/72"
          >
            No Registration Required
          </div>
        </div>
      </div>
    </section>

    {#if isLoading}
      <div
        class="flex flex-1 items-center justify-center px-6 py-12 text-sm text-base-content/60"
      >
        Building a Friday programme from live feature data...
      </div>
    {:else if errorMessage}
      <div
        class="m-4 rounded-3xl border border-warning/30 bg-warning/10 px-4 py-5 text-sm leading-6 text-base-content/80"
      >
        {errorMessage}
      </div>
    {:else}
      <section
        class="flex flex-1 flex-col gap-2 bg-[linear-gradient(180deg,#050608_0%,#000000_100%)] px-3 py-4 pb-20"
      >
        {#each scheduleStops as stop, index (stop.featureId)}
          <div class="relative pl-16">
            <div class="absolute left-0 top-0 flex w-14 flex-col items-center">
              <div
                class="rounded-full border border-[#ff69b0]/20 bg-[#ff69b0]/12 px-2.5 py-1 text-xs font-semibold text-[#ff73b5]"
              >
                {stop.time}
              </div>
              <div class="mt-2 flex min-h-24 w-full flex-1 flex-col items-center">
                <div class="h-12 w-px bg-white/10"></div>
                <div
                  class="flex w-14 flex-col items-center gap-1 text-center text-[10px] font-medium leading-3 text-white/35"
                >
                  <BookOpenIcon class="h-3.5 w-3.5 text-white/25" />
                  <span>15 min</span>
                </div>
                {#if stop.distanceLabel}
                  <div class="mt-2 h-8 w-px bg-white/10"></div>
                  <div
                    class="mt-1 flex w-14 flex-col items-center gap-1 text-center text-[10px] font-medium leading-3 text-white/45"
                  >
                    <FootprintsIcon class="h-3.5 w-3.5 text-white/30" />
                    <span>{stop.distanceLabel}</span>
                  </div>
                {/if}
                {#if index < scheduleStops.length - 1}
                  <div class="mt-2 h-full min-h-6 w-px bg-white/10"></div>
                {/if}
              </div>
            </div>

            <article
              class="group relative cursor-grab overflow-hidden rounded-2xl border border-white/8 bg-[#1a1f26] transition-colors duration-200 hover:border-white/14 active:cursor-grabbing"
            >
              <div class="relative overflow-hidden bg-[#14181d]">
                {#if stop.imageUrl}
                  <img
                    src={stop.imageUrl}
                    alt={stop.title}
                    class="h-28 w-full object-cover"
                    loading="lazy"
                  >
                {:else}
                  <div
                    class="flex h-28 items-center justify-center bg-gradient-to-br from-primary/15 via-base-200 to-secondary/15 text-3xl"
                  >
                    {stop.flag}
                  </div>
                {/if}
              </div>

              <div class="min-w-0 space-y-2 p-2.5">
                <div class="flex items-start gap-2">
                  <h4
                    class="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-5 text-white"
                  >
                    {stop.title}
                  </h4>
                  <div class="ml-auto flex shrink-0 flex-col items-end gap-1">
                    <div
                      class="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/70"
                    >
                      <span>{getCountryBadge(stop.country)}</span
                      ><span class="ml-1">{stop.author}</span>
                    </div>
                  </div>
                </div>

                <div
                  class="flex items-center justify-between gap-3 text-xs text-white/62"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    {#if getMapHref(stop)}
                      <a
                        href={getMapHref(stop) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/48 transition-colors hover:border-[#ff69b0]/35 hover:text-[#ff7aba]"
                        aria-label={`Open ${stop.title} on map`}
                      >
                        <MapPinnedIcon class="h-3.5 w-3.5" />
                      </a>
                    {:else}
                      <div
                        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/24"
                        aria-hidden="true"
                      >
                        <MapPinnedIcon class="h-3.5 w-3.5" />
                      </div>
                    {/if}
                    <p class="truncate">{stop.addressLine}</p>
                  </div>
                  <div class="flex shrink-0 items-center">
                    <GripVerticalIcon
                      class="h-5 w-5 text-white/24 transition-colors group-hover:text-[#ff7aba]/60"
                    />
                  </div>
                </div>
              </div>
            </article>
          </div>
        {/each}
      </section>
    {/if}

    <div
      class="pointer-events-none sticky bottom-0 mt-auto flex justify-end bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.82)_38%,#000000_100%)] px-4 pb-24 pt-8"
    >
      <div class="pointer-events-auto">
        <Button
          text="Add stop"
          iconComponent={PlusIcon}
          color="primary"
          style="soft"
          size="lg"
          modifier="circle"
          onClick={() => {}}
        />
      </div>
    </div>
  </div>
</Panel>
