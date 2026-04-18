<script lang="ts">
// I18N
import { formatDistanceToNow } from 'date-fns'
import { getFPI18n, getI18n, m } from '$lib/i18n'
// BITS
import * as TaskPrimitive from './components'
import { ResourceViewer } from '$lib/bits'
// COMPONENTS
// UTILS
import { calculateDistance } from '$lib/map'
import { getMetadata } from '$lib/api/server/image.remote'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { Point } from 'geojson'
import type { TaskEditorProps, TaskFieldItem, TaskDescriptorItem } from './task.types'

let {
  task,
  assignableLayers = [],
  canReassignLayer = false,
  isLayerBusy = false,
  class: className = '',
  onReassignLayer,
}: TaskEditorProps = $props()

const appCtx = getAppCtx()

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return formatDistanceToNow(date, { addSuffix: true })
}

function normalizeDisplayValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return '-'
  return value.trim().length > 0 ? value : '-'
}

let imageMetadata = $state<{
  latitude?: string | null
  longitude?: string | null
  capturedAt?: string | null
} | null>(null)

const isNewFeature = $derived(task.type === 'newFeature')
const isNewPhoto = $derived(task.type === 'newPhoto')
const isReportedMissing = $derived(task.type === 'reportedMissing')
const isReviewed = $derived(Boolean(task.isReviewed))
const featureTitle = $derived(
  getI18n(task.feature, 'title', appCtx.getUserPreferences()) || '-',
)
const featureDescription = $derived(
  getI18n(task.feature, 'description', appCtx.getUserPreferences()) || '-',
)
const featureAddress = $derived(
  getI18n(task.feature, 'displayAddress', appCtx.getUserPreferences()) || '-',
)
const effectiveLayerId = $derived(task.feature?.layerId ?? task.layerId ?? null)
const selectedAssignableLayer = $derived(
  assignableLayers.find(layer => layer.id === effectiveLayerId) ??
    (effectiveLayerId ? appCtx.cache.layer.get(effectiveLayerId) : null) ??
    null,
)
const mapStyleCode = $derived(
  appCtx.cache.project.get(
    selectedAssignableLayer?.projectId ??
      task.feature?.projectId ??
      task.projectId ??
      '',
  )?.mapStyle?.code ??
    task.project?.mapStyle?.code ??
    null,
)
const featureCoordinates = $derived(
  ((task.feature?.geometry as Point | undefined)?.coordinates as
    | [number, number]
    | undefined) ?? null,
)
const featureFields = $derived.by<TaskFieldItem[]>(() =>
  (task.feature?.properties ?? [])
    .filter(property => Boolean(property.property))
    .map(property => {
      const value = getFPI18n(property, appCtx.getUserPreferences()) ?? ''
      return {
        label:
          getI18n(property.property, 'label', appCtx.getUserPreferences()) ||
          property.propertyId,
        value,
      }
    })
    .filter(
      item =>
        item.value.trim().length > 0 &&
        item.value !== '-' &&
        item.value !== m.great_crazy_squid_promise(),
    ),
)
const reportDate = $derived(formatRelativeDate(task.createdAt))
const captureDate = $derived(formatRelativeDate(imageMetadata?.capturedAt))
const reportDistance = $derived.by(() => {
  if (!featureCoordinates || !imageMetadata?.latitude || !imageMetadata?.longitude) {
    return '-'
  }

  const latitude = Number.parseFloat(imageMetadata.latitude)
  const longitude = Number.parseFloat(imageMetadata.longitude)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '-'
  }

  const distance = calculateDistance(
    featureCoordinates[0],
    featureCoordinates[1],
    latitude,
    longitude,
  )

  return Number.isFinite(distance)
    ? `${distance.toFixed(0)} ${m.plane_zany_fish_value()}`
    : '-'
})

const newFeatureDescriptors = $derived<TaskDescriptorItem[]>([
  {
    label: m.feature__title(),
    value: featureTitle,
  },
  {
    label: m.feature__description(),
    value: featureDescription,
    wrap: true,
  },
  {
    label: m.feature__address(),
    value: featureAddress,
    wrap: true,
  },
])

const missingReportDescriptors = $derived([
  {
    title: m.away_honest_anaconda_honor(),
    items: [
      {
        label: m.noisy_lime_tuna_charm(),
        value: normalizeDisplayValue(task.message),
        wrap: true,
      },
      {
        label: m.bland_tasty_lizard_rest(),
        value: normalizeDisplayValue(reportDate),
      },
    ],
  },
  {
    title: m.true_equal_polecat_surge(),
    items: [
      {
        label: m.weary_bad_dog_revive(),
        value: normalizeDisplayValue(captureDate),
      },
      {
        label: m.house_watery_jaguar_edit(),
        value: normalizeDisplayValue(reportDistance),
      },
    ],
  },
  {
    title: m.loose_grassy_snake_hug(),
    items: [
      {
        label: m.male_silly_jannes_feel(),
        value: featureAddress,
        wrap: true,
      },
    ],
  },
] satisfies Array<{ title: string; items: TaskDescriptorItem[] }>)

$effect(() => {
  const image = task.images?.[0]?.image
  if (!image?.publicId || !isReportedMissing) {
    imageMetadata = null
    return
  }

  void getMetadata({
    publicId: image.publicId,
    env: image.env ?? undefined,
    profile: 'basic',
    meta: {
      isAdminRequest: true,
    },
  })
    .then(response => {
      imageMetadata = response?.data ?? null
    })
    .catch(() => {
      imageMetadata = null
    })
})
</script>

<TaskPrimitive.TaskRoot class={className} hasAside={!isNewPhoto}>
  <TaskPrimitive.TaskMain>
    <div class="min-h-0 flex-1">
      {#if isNewPhoto}
        <TaskPrimitive.TaskImageEditor readonly={isReviewed} {isReviewed} />
      {:else}
        <ResourceViewer
          canEditPresentationMode={true}
          canEditDropzone={isNewFeature && !isReviewed}
          hasBottomPadding={isReportedMissing}
          isReadonly={isReviewed}
          prefetchMetadata={isReportedMissing}
        />
      {/if}
    </div>

    {#if isNewFeature}
      <TaskPrimitive.TaskFooter readonly={isReviewed} />
    {/if}
  </TaskPrimitive.TaskMain>

  {#if !isNewPhoto}
    <TaskPrimitive.TaskAside>
      {#if isNewFeature}
        <div class="flex min-h-0 max-h-[66%] flex-col gap-3 overflow-auto">
          <TaskPrimitive.TaskDescriptors
            title={m.task__feature()}
            items={newFeatureDescriptors}
            class="shrink-0"
          >
            {#if canReassignLayer}
              <TaskPrimitive.TaskLayer
                title={m.resource__layer_singular()}
                currentLayerId={effectiveLayerId}
                options={assignableLayers}
                isBusy={isLayerBusy}
                disabled={isReviewed}
                onLayerChange={onReassignLayer}
                class="border-0 bg-transparent py-0"
              />
            {/if}
          </TaskPrimitive.TaskDescriptors>

          <TaskPrimitive.TaskFields
            title={m.admin__forms_common_fields()}
            items={featureFields}
            emptyLabel={m.bland_sad_goat_gasp()}
            class="shrink-0"
          />
        </div>

        {#if featureCoordinates}
          <TaskPrimitive.TaskMap
            coordinates={featureCoordinates}
            addressMeta={task.feature?.addressMeta ?? null}
            {mapStyleCode}
          />
        {/if}
      {:else if isReportedMissing}
        <div class="flex max-h-[75%] shrink-0 flex-col gap-3 overflow-hidden">
          {#each missingReportDescriptors as descriptor (descriptor.title)}
            <TaskPrimitive.TaskDescriptors
              title={descriptor.title}
              items={descriptor.items}
              class="max-h-full shrink-0"
            />
          {/each}
        </div>

        {#if featureCoordinates}
          <TaskPrimitive.TaskMap
            coordinates={featureCoordinates}
            addressMeta={task.feature?.addressMeta ?? null}
            {mapStyleCode}
            class="min-h-[14rem] flex-1"
          />
        {/if}
      {/if}
    </TaskPrimitive.TaskAside>
  {/if}
</TaskPrimitive.TaskRoot>
