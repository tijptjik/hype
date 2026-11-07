<script lang="ts">
// I18N
import { formatDistanceToNow } from 'date-fns'
import { getFPI18n, getI18n, getLocaleKey, m } from '#lib/i18n.js'
// BITS
import * as TaskPrimitive from './components'
import { ResourceViewer } from '#lib/bits/index.js'
// COMPONENTS
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
import { calculateDistance } from '#lib/map/index.js'
import { getMetadata } from '#lib/api/image.remote.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
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

<svelte:window bind:innerHeight={viewportHeight} bind:innerWidth={viewportWidth} />

<TaskPrimitive.TaskRoot
  class={`${className} ${isNewFeature || isNewPhoto ? 'p-0!' : ''}`}
  hasAside={isReportedMissing}
>
  {#if isNewFeature}
    <section class="bg-panel min-w-0" aria-label={m.task__feature()}>
      <!-- Stacked profile panes use content height instead of a percentage flex basis. -->
      <FormFeatureVisualSection
        class={String.raw`[&_.bits-feature-visual\_\_map]:p-0! [&_.bits-feature-visual\_\_image]:p-0! max-[900px]:[&_.bits-feature-visual\_\_body]:h-auto! max-[900px]:[&_.bits-feature-visual\_\_image]:flex-none!`}
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
        contributorId={task.feature?.contributorId ?? task.contributorId}
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
            <TaskPrimitive.TaskImageEditor
              multilingualExpanded={localeState.expanded}
              onMultilingualExpandedChange={expanded => onLocaleStateChange?.({ ...localeState, expanded })}
              featureId={task.featureId ?? task.feature?.id}
              layout="top"
              readonly={isReviewed ||
                task.revisionReviewRequired ||
                task.identityTransferred}
              intentReadonly={isReviewed || task.identityTransferred || !task.featureId}
              {isReviewed}
            />
          </div>
        {/snippet}
      </FormFeatureVisualSection>

      {#if task.identityTransferred && !isReviewed}
        <div class="border-border grid gap-2 border-b p-6 text-sm">
          <p>
            This task was reassigned in a reviewed merge or split. Its original evidence
            and contributor are retained.
          </p>
          <p>
            Review any photo proposals first. Completing or rejecting this contribution
            does not publish or archive the destination Feature.
          </p>
          {#if task.revisionReviewRequired}
            <a class="underline" href="#task-proposal-review">Review photo proposals</a>
          {/if}
        </div>
      {/if}

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
        </section>
      </div>
      <section class="border-border/50 border-t px-6 py-8">
        <h3 class={fieldLabelStyles}>{m.feature__address()}</h3>
        <p class="mt-4 text-base leading-relaxed break-words whitespace-pre-wrap">
          {featureAddress}
        </p>
      </section>
      {#if featureFields.length > 0}
        <TaskPrimitive.TaskFields
          title={m.admin__forms_common_fields()}
          items={featureFields}
        />
      {/if}
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
            {#if task.revisionReviewRequired && !isNewPhoto}
              <a class="underline" href="#task-proposal-review"
                >Review photo proposals</a
              >
            {/if}
          </div>
        {/if}
        {#if isNewPhoto}
          {#if task.revisionReviewRequired}
            <div class="border-border grid gap-2 border-b p-4 text-sm">
              <p>
                Review each photo proposal in this task. Accepting a proposal publishes
                that photo; rejecting it leaves the gallery unchanged. The task
                completes when every photo has been reviewed.
              </p>
              <a class="font-medium underline" href="#task-proposal-review"
                >Review photo proposals</a
              >
            </div>
          {/if}
          <TaskPrimitive.TaskImageEditor
              featureId={task.featureId ?? task.feature?.id}
              multilingualExpanded={localeState.expanded}
              onMultilingualExpandedChange={expanded => onLocaleStateChange?.({ ...localeState, expanded })}
            readonly={isReviewed ||
              task.revisionReviewRequired ||
              task.identityTransferred}
            {isReviewed}
          />
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

    {#if !isNewPhoto}
      <TaskPrimitive.TaskAside>
        {#if isReportedMissing}
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
  {/if}
</TaskPrimitive.TaskRoot>
