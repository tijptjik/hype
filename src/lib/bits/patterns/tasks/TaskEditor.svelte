<script lang="ts">
// I18N
import { formatDistanceToNow } from 'date-fns'
import { getFPI18n, getI18n, m } from '#lib/i18n.js'
// BITS
import * as TaskPrimitive from './components'
import { ResourceViewer } from '#lib/bits/index.js'
// COMPONENTS
// UTILS
import { calculateDistance } from '#lib/map/index.js'
import { getMetadata } from '#lib/api/image.remote.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { THEME_MAP_STYLES } from '#lib/themes/themes.js'
// DOMAIN
import { featureCreationPreview } from '#lib/revisions/featureCreationPreview.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
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

const appCtx = getSurfaceCtx()
const theme = getThemeModel()

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

const preview = $derived(task.creationProposal ? featureCreationPreview(task.creationProposal.content) : task.feature)
const isNewFeature = $derived(task.type === 'newFeature')
const isNewPhoto = $derived(task.type === 'newPhoto')
const isReportedMissing = $derived(task.type === 'reportedMissing')
const isReviewed = $derived(Boolean(task.isReviewed))
// Review must expose submitted text even when the viewer hides generated translations.
const featureTitle = $derived(
  getI18n(preview ?? undefined, 'title', appCtx.getUserPreferences(), '-', true),
)
const featureDescription = $derived(
  getI18n(preview ?? undefined, 'description', appCtx.getUserPreferences(), '-', true),
)
const featureAddress = $derived(
  getI18n(preview ?? undefined, 'displayAddress', appCtx.getUserPreferences(), '-', true),
)
const effectiveLayerId = $derived(task.creationProposal?.scope.layerId ?? task.feature?.layerId ?? null)
// Review maps follow the user's UI palette rather than the submitted project's basemap.
const mapStyleCode = $derived(THEME_MAP_STYLES[theme.selected])
const featureCoordinates = $derived(
  (((task.creationProposal?.content.placement.geometry ?? task.feature?.geometry) as Point | undefined)?.coordinates as
    | [number, number]
    | undefined) ?? null,
)
const featureFields = $derived.by<TaskFieldItem[]>(() => {
  if (task.creationProposal) return Object.entries(task.creationProposal.content.properties).map(([id, property]) => {
    const selection = property.selection
    const definition = selection.definition
    const labels = { i18n: Object.fromEntries(Object.entries(definition.labels).map(([locale, text]) => [locale, { label: text.value }])) }
    const translations = { i18n: Object.fromEntries(Object.entries(property.translations).map(([locale, text]) => [locale, { value: text.value }])) }
    const options = { i18n: Object.fromEntries(Object.entries(definition.selectedOption?.translations ?? {}).map(([locale, text]) => [locale, { value: text.value }])) }
    return {
      label: getI18n(labels, 'label', appCtx.getUserPreferences(), id, true),
      value: getI18n(translations, 'value', appCtx.getUserPreferences(), '', true)
        || getI18n(options, 'value', appCtx.getUserPreferences(), '', true)
        || definition.selectedOption?.value || selection.value || selection.valueJson || '',
    }
  }).filter(item => item.value.trim().length > 0)
  return (task.feature?.properties ?? [])
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
    )
})
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
    imageRevisionId: image.imageRevisionId ?? undefined,
    featureId: task.featureId ?? undefined,
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
      {#if task.identityTransferred && !isReviewed}
        <div class="grid gap-2 border-b border-border p-4 text-sm">
          <p>This task was reassigned in a reviewed merge or split. Its original evidence and contributor are retained.</p>
          {#if isNewFeature}<p>Review any photo proposals first. Completing or rejecting this contribution does not publish or archive the destination Feature.</p>{/if}
          {#if task.revisionReviewRequired && !isNewPhoto}<a class="underline" href="#task-proposal-review">Review photo proposals</a>{/if}
        </div>
      {/if}
      {#if isNewPhoto}
        {#if task.revisionReviewRequired}
          <div class="grid gap-2 border-b border-border p-4 text-sm">
            <p>Review each photo proposal in this task. Accepting a proposal publishes that photo; rejecting it leaves the gallery unchanged. The task completes when every photo has been reviewed.</p>
            <a class="font-medium underline" href="#task-proposal-review">Review photo proposals</a>
          </div>
        {/if}
        <TaskPrimitive.TaskImageEditor readonly={isReviewed || task.revisionReviewRequired || task.identityTransferred} {isReviewed} />
      {:else}
        {#if isNewFeature && task.revisionReviewRequired && !isReviewed && !task.identityTransferred}
          <p class="border-b border-border p-4 text-sm">{task.lifecycleReview ? 'Accepting keeps this Feature unpublished with its submitted photos. Publish it from the regular editor when ready.' : 'Accepting publishes this new Feature and its submitted photos together.'} Rejection retains the submitted evidence.</p>
        {/if}
        <ResourceViewer
          flush
          canEditPresentationMode={!task.revisionReviewRequired && !task.identityTransferred}
          canEditDropzone={isNewFeature && !isReviewed && !task.revisionReviewRequired && !task.identityTransferred}
          hasBottomPadding={isReportedMissing}
          isReadonly={isReviewed || task.revisionReviewRequired || task.identityTransferred}
          prefetchMetadata={isReportedMissing}
        />
      {/if}
    </div>

    {#if isNewFeature}
      <TaskPrimitive.TaskFooter readonly={isReviewed || task.revisionReviewRequired || task.identityTransferred} />
    {/if}
  </TaskPrimitive.TaskMain>

  {#if !isNewPhoto}
    <TaskPrimitive.TaskAside>
      {#if isNewFeature}
        <div class="flex shrink-0 flex-col">
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

          {#if featureFields.length > 0}
            <TaskPrimitive.TaskFields
              title={m.admin__forms_common_fields()}
              items={featureFields}
              class="shrink-0"
            />
          {/if}
        </div>

        {#if featureCoordinates}
          <TaskPrimitive.TaskMap
            coordinates={featureCoordinates}
            addressMeta={task.feature?.addressMeta ?? null}
            {mapStyleCode}
          />
        {/if}
      {:else if isReportedMissing}
        <div class="flex shrink-0 flex-col">
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
