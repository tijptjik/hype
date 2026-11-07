<script lang="ts">
// I18N
import { formatDistanceToNow } from 'date-fns'
import { getFPI18n, getI18n, getLocaleKey, m } from '#lib/i18n.js'
// BITS
import * as TaskPrimitive from './components'
import { ResourceViewer } from '#lib/bits/index.js'
// COMPONENTS
import TaskImageReview from './components/TaskImageReview.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
import { FormFeatureVisualSection } from '#lib/bits/custom/form/src/formFeatureVisualSection/index.js'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
// UTILS
import { calculateDistance } from '#lib/utils/geocoding.js'
import { getMetadata } from '#lib/api/image.remote.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
// DOMAIN
import { featureCreationPreview } from '#lib/revisions/featureCreationPreview.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// TYPES
import type { Point } from 'geojson'
import type { TaskEditorProps, TaskFieldItem } from './task.types'

let {
  task,
  assignableLayers = [],
  canReassignLayer = false,
  isLayerBusy = false,
  class: className = '',
  onReassignLayer,
  onImageReviewChange,
  onImageAcceptActionChange,
  onImagesAccepted,
  localeState: controlledLocaleState,
  onLocaleStateChange,
}: TaskEditorProps = $props()

const appCtx = getSurfaceCtx()
const theme = getThemeModel()
let viewportHeight = $state(900)
let viewportWidth = $state(1400)
let visualCollapsed = $state(false)

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

const preview = $derived(
  task.creationProposal
    ? featureCreationPreview(task.creationProposal.content)
    : task.feature,
)
const localeState = $derived(
  controlledLocaleState ??
    restoreProfileLocales([canonicalContentTag(getLocaleKey())], preview?.i18n ?? {}),
)
const shownLocales = $derived(displayedLocales(localeState, localeState.expanded))
const isNewFeature = $derived(task.type === 'newFeature')
const isNewPhoto = $derived(task.type === 'newPhoto')
const isReportedMissing = $derived(task.type === 'reportedMissing')
const isReviewed = $derived(Boolean(task.isReviewed))
// Review exposes submitted translations independently of generated-text preferences.
const featureAddress = $derived(
  getI18n(
    preview ?? undefined,
    'displayAddress',
    appCtx.getUserPreferences(),
    '-',
    true,
  ),
)
const effectiveLayerId = $derived(
  task.creationProposal?.scope.layerId ?? task.feature?.layerId ?? null,
)
// Both review maps follow the user's effective map preference, including independent style choices.
const mapStyleCode = $derived(theme.resolvedMapStyle)
const featureCoordinates = $derived(
  ((
    (task.creationProposal?.content.placement.geometry ?? task.feature?.geometry) as
      | Point
      | undefined
  )?.coordinates as [number, number] | undefined) ?? null,
)
const featureFields = $derived.by<TaskFieldItem[]>(() => {
  if (task.creationProposal)
    return Object.entries(task.creationProposal.content.properties)
      .map(([id, property]) => {
        const selection = property.selection
        const definition = selection.definition
        const labels = {
          i18n: Object.fromEntries(
            Object.entries(definition.labels).map(([locale, text]) => [
              locale,
              { label: text.value },
            ]),
          ),
        }
        const translations = {
          i18n: Object.fromEntries(
            Object.entries(property.translations).map(([locale, text]) => [
              locale,
              { value: text.value },
            ]),
          ),
        }
        const options = {
          i18n: Object.fromEntries(
            Object.entries(definition.selectedOption?.translations ?? {}).map(
              ([locale, text]) => [locale, { value: text.value }],
            ),
          ),
        }
        return {
          label: getI18n(labels, 'label', appCtx.getUserPreferences(), id, true),
          value:
            getI18n(translations, 'value', appCtx.getUserPreferences(), '', true) ||
            getI18n(options, 'value', appCtx.getUserPreferences(), '', true) ||
            definition.selectedOption?.value ||
            selection.value ||
            selection.valueJson ||
            '',
        }
      })
      .filter(item => item.value.trim().length > 0)
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

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return '-'
  }

  // GeoJSON stores longitude first; the geodesic helper accepts latitude first and returns metres.
  const distance = calculateDistance(
    featureCoordinates[1],
    featureCoordinates[0],
    latitude,
    longitude,
  )

  return Number.isFinite(distance)
    ? `${distance.toFixed(0)} ${m.plane_zany_fish_value()}`
    : '-'
})

$effect(() => {
  const image = task.images?.[0]?.image
  if (!image?.publicId || !isReportedMissing) {
    imageMetadata = null
    return
  }

  let cancelled = false
  imageMetadata = null
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
      if (!cancelled) imageMetadata = response?.data ?? null
    })
    .catch(() => {
      if (!cancelled) imageMetadata = null
    })
  return () => {
    cancelled = true
  }
})
</script>

<svelte:window bind:innerHeight={viewportHeight} bind:innerWidth={viewportWidth} />

<TaskPrimitive.TaskRoot
  class={`${className} ${isNewFeature || isNewPhoto || isReportedMissing ? 'p-0!' : ''}`}
  hasAside={false}
>
  {#if isNewFeature || isReportedMissing}
    <section
      class="bg-panel flex min-h-full min-w-0 flex-col"
      aria-label={m.task__feature()}
    >
      <!-- Text keeps its natural height; desktop visuals absorb the remaining review space. -->
      <FormFeatureVisualSection
        class={String.raw`${visualCollapsed ? 'shrink-0' : 'min-[901px]:flex-1'} [&_.bits-feature-visual\_\_map]:p-0! [&_.bits-feature-visual\_\_image]:p-0! max-[900px]:[&_.bits-feature-visual\_\_body]:h-auto! max-[900px]:[&_.bits-feature-visual\_\_image]:flex-none!`}
        expandedHeight={Math.min(
          1200,
          viewportHeight * (viewportWidth <= 900 ? 0.4 : 0.65),
        )}
        minimumHeight={160}
        isCollapsed={visualCollapsed}
        isEditing={false}
        splitResizeLabel={m.feature_visual_resize()}
        showCenterControls={false}
        showNavigationControls={false}
        contributorId={isReportedMissing
          ? task.contributorId
          : (task.feature?.contributorId ?? task.contributorId)}
        createdAt={task.createdAt}
        isIntangible={task.creationProposal?.content.profile.isIntangible ??
          Boolean(task.feature?.isIntangible)}
        isVisitable={task.creationProposal?.content.profile.visitability.isVisitable ??
          task.feature?.isVisitable !== false}
        onCollapse={() => (visualCollapsed = true)}
        onExpand={() => (visualCollapsed = false)}
      >
        {#snippet map()}
          {#if featureCoordinates}
            <div class="flex h-full min-h-0 w-full flex-col">
              <TaskPrimitive.TaskMap
                coordinates={featureCoordinates}
                addressMeta={null}
                {mapStyleCode}
                initialZoom={11}
                showFullscreen={false}
                label="Location context map"
                class="border-border/40 h-32 min-h-0! flex-none! border-b"
              />
              <TaskPrimitive.TaskMap
                coordinates={featureCoordinates}
                addressMeta={task.creationProposal?.content.placement.addressMeta ??
                  task.feature?.addressMeta ??
                  null}
                {mapStyleCode}
                showFullscreen={false}
                expandOnClick
                class="min-h-0!"
              />
            </div>
          {/if}
        {/snippet}
        {#snippet image()}
          <div
            class="relative flex h-[var(--bits-feature-visual-expanded-height)] min-h-0 w-full flex-col overflow-hidden min-[901px]:h-full"
          >
            {#if isNewFeature &&
              task.revisionReviewRequired &&
              !task.identityTransferred}
              {#key task.id}
                <TaskImageReview
                  taskId={task.id}
                  projectId={task.projectId}
                  initialReport={isNewFeature}
                  readonly={isReviewed}
                  reviewAction={task.reviewAction}
                  onChange={onImageReviewChange}
                  onAcceptActionChange={onImageAcceptActionChange}
                  onAccepted={onImagesAccepted}
                />
              {/key}
            {:else}
              <TaskPrimitive.TaskImageEditor
                multilingualExpanded={localeState.expanded}
                onMultilingualExpandedChange={expanded =>
                  onLocaleStateChange?.({ ...localeState, expanded })}
                featureId={task.featureId ?? task.feature?.id}
                layout="top"
                readonly={isReviewed ||
                  task.revisionReviewRequired ||
                  task.identityTransferred}
                intentReadonly={isReviewed ||
                  task.identityTransferred ||
                  !task.featureId}
                researchOutcome={task.reviewAction === 'set-intangible' &&
                task.reviewOutcome === 'accepted'
                  ? 'accepted'
                  : undefined}
                {isReviewed}
              />
            {/if}
          </div>
        {/snippet}
      </FormFeatureVisualSection>

      <div class="shrink-0" data-task-review-details>
        {#if task.identityTransferred && !isReviewed}
          <div class="border-border grid gap-2 border-b p-6 text-sm">
            <p>
              This task was reassigned in a reviewed merge or split. Its original
              evidence and contributor are retained.
            </p>
            <p>
              Review any photo proposals first. Completing or rejecting this
              contribution does not publish or archive the destination Feature.
            </p>
          </div>
        {/if}

        {#if isReportedMissing}
          <div class="grid min-w-0 gap-8 p-6 @min-[48rem]/task:grid-cols-2">
            <section class="min-w-0">
              <h3 class={fieldLabelStyles}>{m.noisy_lime_tuna_charm()}</h3>
              <p class="mt-4 text-base leading-relaxed break-words whitespace-pre-wrap">
                {normalizeDisplayValue(task.message)}
              </p>
            </section>
            <section
              class="border-border bg-foreground/[0.03] min-w-0 rounded-xl border p-6"
            >
              <h3 class={fieldLabelStyles}>{m.house_watery_jaguar_edit()}</h3>
              <p class="mt-4 text-3xl font-semibold tabular-nums">{reportDistance}</p>
              <dl class="border-border/50 mt-5 grid gap-3 border-t pt-4 text-sm">
                <div
                  class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4"
                >
                  <dt class="text-foreground/60">{m.bland_tasty_lizard_rest()}</dt>
                  <dd class="m-0 text-right font-medium tabular-nums">{reportDate}</dd>
                </div>
                <div
                  class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4"
                >
                  <dt class="text-foreground/60">{m.weary_bad_dog_revive()}</dt>
                  <dd class="m-0 text-right font-medium tabular-nums">{captureDate}</dd>
                </div>
              </dl>
            </section>
          </div>
        {:else}
          <div
            class="@min-[48rem]/task:[&>section+section]:border-border/50 grid min-w-0 gap-y-6 py-8 @min-[48rem]/task:grid-cols-3 @min-[48rem]/task:[&>section+section]:border-l"
          >
            <section class="min-w-0 px-6">
              <h3 class={fieldLabelStyles}>{m.feature__title()}</h3>
              <div class="mt-4">
                {#each shownLocales as locale (locale)}
                  <FormI18nInlineRow
                    value={preview?.i18n?.[contentFormKey(locale)]?.title || '-'}
                    prefix={localeState.expanded ? shortLocaleLabel(locale) : ''}
                    label={m.feature__title()}
                    editable={false}
                    showVerification={false}
                    attrs={{}}
                    issues={undefined}
                    required={false}
                    onStart={() => {}}
                    onCancel={() => {}}
                    onClear={() => {}}
                  />
                {/each}
              </div>
            </section>
            <section class="min-w-0 px-6">
              <h3 class={fieldLabelStyles}>{m.feature__description()}</h3>
              <div class="mt-4">
                {#each shownLocales as locale (locale)}
                  <FormI18nInlineRow
                    value={preview?.i18n?.[contentFormKey(locale)]?.description || '-'}
                    prefix={localeState.expanded ? shortLocaleLabel(locale) : ''}
                    label={m.feature__description()}
                    multiline
                    editable={false}
                    showVerification={false}
                    attrs={{}}
                    issues={undefined}
                    required={false}
                    onStart={() => {}}
                    onCancel={() => {}}
                    onClear={() => {}}
                  />
                {/each}
              </div>
            </section>
            <section class="min-w-0 px-6">
              <TaskPrimitive.TaskLayer
                title={m.resource__layer_singular()}
                currentLayerId={effectiveLayerId}
                options={assignableLayers}
                isBusy={isLayerBusy}
                disabled={isReviewed || !canReassignLayer}
                onLayerChange={onReassignLayer}
                class="border-0 bg-transparent py-0"
              />
              <div class="mt-6">
                <h3 class={fieldLabelStyles}>{m.feature__address()}</h3>
                <p
                  class="mt-4 text-base leading-relaxed break-words whitespace-pre-wrap"
                >
                  {featureAddress}
                </p>
              </div>
            </section>
          </div>
        {/if}
        {#if isNewFeature && featureFields.length > 0}
          <TaskPrimitive.TaskFields
            title={m.admin__forms_common_fields()}
            items={featureFields}
          />
        {/if}
      </div>
    </section>
  {:else}
    <TaskPrimitive.TaskMain class={isNewPhoto ? 'rounded-none border-0' : ''}>
      <div class="flex min-h-0 flex-1 flex-col">
        {#if task.identityTransferred && !isReviewed}
          <div class="border-border grid gap-2 border-b p-4 text-sm">
            <p>
              This task was reassigned in a reviewed merge or split. Its original
              evidence and contributor are retained.
            </p>
          </div>
        {/if}
        {#if isNewPhoto}
          {#if !task.revisionReviewRequired && !task.images?.length && !isReviewed}
            <p role="status" class="border-border text-warning border-b p-4 text-sm">
              This task has no attached photo submission. The gallery below contains
              existing Feature images only. There are no new photos to accept.
            </p>
          {/if}
          {#if task.revisionReviewRequired}
            {#key task.id}
              <TaskImageReview
                taskId={task.id}
                projectId={task.projectId}
                initialReport={isNewFeature}
                readonly={isReviewed}
                reviewAction={task.reviewAction}
                onChange={onImageReviewChange}
                onAcceptActionChange={onImageAcceptActionChange}
                onAccepted={onImagesAccepted}
              />
            {/key}
          {:else}
            <TaskPrimitive.TaskImageEditor
              multilingualExpanded={localeState.expanded}
              onMultilingualExpandedChange={expanded =>
                onLocaleStateChange?.({ ...localeState, expanded })}
              featureId={task.featureId ?? task.feature?.id}
              readonly={isReviewed ||
                !task.images?.length ||
                task.revisionReviewRequired ||
                task.identityTransferred}
              researchOutcome={task.reviewAction === 'set-intangible' &&
              task.reviewOutcome === 'accepted'
                ? 'accepted'
                : undefined}
              {isReviewed}
            />
          {/if}
        {:else}
          <ResourceViewer
            flush
            canEditPresentationMode={!task.revisionReviewRequired &&
              !task.identityTransferred}
            canEditDropzone={false}
            hasBottomPadding={isReportedMissing}
            isReadonly={isReviewed ||
              task.revisionReviewRequired ||
              task.identityTransferred}
            prefetchMetadata={isReportedMissing}
          />
        {/if}
      </div>
    </TaskPrimitive.TaskMain>
  {/if}
</TaskPrimitive.TaskRoot>
