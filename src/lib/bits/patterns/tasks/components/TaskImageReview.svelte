<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// API
import { getImageIntentOptions } from '#lib/api/image.remote.js'
import {
  DEFAULT_IMAGE_INTENTS,
  type ImageIntentDefinition,
} from '#lib/images/intents.js'
import {
  getTaskImageReviews,
  saveTaskImageReview,
  replaceTaskReviewImage,
  acceptTaskImageReview,
} from '#lib/api/taskImageReview.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// BITS COMPONENTS
import UserAttributionCard from '#lib/bits/patterns/cards/userAttributionCard/UserAttributionCard.svelte'
import ImageMetadataCard from '#lib/bits/patterns/images/components/ImageMetadataCard.svelte'
import { IMAGE_METADATA_BUTTON_CLASSES } from '#lib/bits/patterns/images/components/imageChrome.styles.js'
import CameraIcon from 'virtual:icons/proicons/camera'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/image.js'
import ImageEditor from '#lib/bits/patterns/images/ImageEditor.svelte'
import FeatureGalleryRevisionEditor from '#lib/bits/patterns/revisionHistory/FeatureGalleryRevisionEditor.svelte'
// IMAGE ORDER
import {
  orderGalleryForReview,
  type GallerySortMode,
} from '#lib/images/galleryOrder.js'
import { taskPhotoDecisionLabel } from '#lib/images/taskReviewOutcome.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type { ImageReviewPreview as FeatureImageReview } from '#lib/db/services/featureImageReview.js'
import type { ViewerRenderable } from '#lib/bits/patterns/images/images.types.js'
import type { Intent } from '#lib/db/zod/schema/image.types.js'
import type { ImagePresentation } from '#lib/images/presentation.js'
import type { z } from 'zod'
import type { ImageReviewPatchSchema } from '#lib/db/services/featureImageReview.js'

let {
  taskId,
  initialReport,
  readonly = false,
  reviewAction,
  onChange,
  onAcceptActionChange,
  onAccepted,
}: {
  taskId: string
  initialReport?: boolean
  readonly?: boolean
  reviewAction?: string | null
  onAcceptActionChange?: (
    action:
      | {
          taskId: string
          disabled: boolean
          accept: (mode?: 'acceptAll' | 'acceptClassified') => Promise<void>
        }
      | undefined,
  ) => void
  onAccepted?: () => Promise<void>
  onChange?: (
    value:
      | { taskId: string; reviewId: string | null; proposalVersion: string }
      | undefined,
    busy: boolean,
  ) => void
} = $props()
let intentOptions = $state<ImageIntentDefinition[]>([...DEFAULT_IMAGE_INTENTS])
let reviews = $state<FeatureImageReview[]>([])
let activeId = $state<string | null>(null)
let galleryWidth = $state(0)
const original = false
let busy = $state(true)
let pendingRotation = $state<{
  imageId: string
  rotation: number
  initialRotation: number
} | null>(null)
let rotationTimer: ReturnType<typeof setTimeout> | undefined
let pendingIntent = $state<{
  proposalId: string
  imageId: string
  intent: Intent
} | null>(null)
let message = $state('')
let textOpen = $state(false)
let metadataOpen = $state(false)
const locale = $derived(getLocaleKey())
const pendingReviews = $derived(reviews.filter(r => r.status === 'submitted'))
const review = $derived(
  pendingReviews.find(
    r => activeId && (r.imageIds ?? r.content.gallery.order).includes(activeId),
  ) ??
    pendingReviews[0] ??
    reviews[0],
)
// The side gallery combines all submissions with their existing-image context.
const galleryOwners = $derived.by(() => {
  const owners = new Map<string, FeatureImageReview>()
  for (const candidate of reviews)
    for (const id of candidate.content.gallery.order)
      if (!owners.has(id)) owners.set(id, candidate)
  for (const candidate of [
    ...reviews.filter(r => r.status !== 'submitted'),
    ...pendingReviews,
  ])
    for (const id of candidate.imageIds ?? candidate.content.gallery.order)
      owners.set(id, candidate)
  return owners
})
const activeOwner = $derived((activeId && galleryOwners.get(activeId)) || review)
const entry = $derived(
  activeId ? activeOwner?.content.gallery.entries[activeId] : undefined,
)
const metadata = $derived(
  activeId
    ? original
      ? activeOwner?.images[activeId]?.originalMetadata
      : activeOwner?.images[activeId]?.metadata
    : undefined,
)
const activeImage = $derived(activeId ? activeOwner?.images[activeId] : undefined)
const displayMetadata = $derived(
  ImageMetadataFullSchema.safeParse(metadata ?? {}).data ?? null,
)
// Outcome views display decision evidence, not pending-review conflict actions.
const hasPendingConflict = $derived(
  !readonly && review?.status === 'submitted' && review.stale,
)
// Editing availability stays stable while a save temporarily locks its controls.
const reviewEditable = $derived(
  !readonly && !original && !review?.stale && review?.status === 'submitted',
)
const canReview = $derived(reviewEditable && !busy)
const isSubmittedImage = $derived(
  Boolean(activeId && (!review?.imageIds || review.imageIds.includes(activeId))),
)
const canSave = $derived(canReview && isSubmittedImage)
// Keep selection and acceptance stable while the modal owns an isolated text draft.
const textDirty = $derived(textOpen)
const canEdit = $derived(canSave && !textDirty && !pendingRotation)
const canAccept = $derived(
  !readonly &&
    !busy &&
    !textDirty &&
    !pendingRotation &&
    pendingReviews.length > 0 &&
    pendingReviews.every(r => !r.stale && r.featureId),
)
const hasExistingImages = $derived(
  Boolean(
    review?.imageIds &&
      review.content.gallery.order.some(id => !review.imageIds!.includes(id)),
  ),
)
const items = $derived.by<ViewerRenderable[]>(() => {
  if (!review) return []
  const gallery = original ? review.submitted.gallery : review.content.gallery
  return orderGalleryForReview(
    [...galleryOwners].map(([id, review]) => {
      const item = review.content.gallery.entries[id]
      // Mirror the server's exclusive Featured selection across the whole preview.
      const pending = pendingIntent
      const intent =
        pending?.imageId === id
          ? pending.intent
          : pending?.intent === 'canonical' && item.intent === 'canonical'
            ? 'general'
            : item.intent
      const src = url(item.imageRevisionId, review.featureId)
      return {
        id,
        src,
        thumbnailSrc: src,
        renderKey: item.imageRevisionId,
        rotationDegrees:
          pendingRotation?.imageId === id
            ? pendingRotation.rotation - pendingRotation.initialRotation
            : 0,
        animateRotation: true,
        createdAt: review.images[id]?.createdAt,
        galleryPosition: gallery.order.indexOf(id),
        presentationMode: ((original
          ? review.images[id]?.originalMetadata
          : review.images[id]?.metadata
        )?.presentationMode ?? 'contain') as ImagePresentation,
        meta: {
          intentOptions,
          intentReadonly: Boolean(review.imageIds && !review.imageIds.includes(id)),
        },
        intent,
        alt: item.alt[locale] ?? '',
        status: { kind: 'persisted' as const },
        isPublished: item.isPublished && !review.excluded.includes(id),
      }
    }),
    gallery.sortMode,
    review.intentOrder ?? intentOptions.map(intent => intent.id),
  )
})

/** Build an exact private revision preview URL. */
function url(id: string, featureId: string | null, raw = false): string {
  const params = new URLSearchParams(raw ? {} : { t: 'c_fit,w_1200,h_1200' })
  if (featureId) params.set('feature', featureId)
  return `/api/images/revisions/${encodeURIComponent(id)}?${params}`
}

/** Read remote HTTP errors as well as native browser errors.
 * @param cause Serialized remote or local failure.
 * @param fallback Message for failures without a public explanation.
 * @returns The server's public explanation, when available.
 */
function failureMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === 'object') {
    if (
      'body' in cause &&
      cause.body &&
      typeof cause.body === 'object' &&
      'message' in cause.body &&
      typeof cause.body.message === 'string'
    )
      return cause.body.message
    if ('message' in cause && typeof cause.message === 'string') return cause.message
  }
  return fallback
}

function notify(): void {
  const creation =
    reviews.find(r => initialReport && r.initialProposal) ??
    reviews.find(r => !r.featureId)
  onChange?.(
    creation
      ? {
          taskId,
          reviewId: creation.reviewId,
          proposalVersion: creation.proposalVersion,
        }
      : undefined,
    busy || textDirty || Boolean(pendingRotation),
  )
}

async function load(): Promise<void> {
  busy = true
  notify()
  try {
    intentOptions = (
      await refreshRemoteQuery(
        getImageIntentOptions({
          ctxType: 'task',
          ctxId: taskId,
          meta: { isAdminRequest: true },
        }),
      )
    ).intents
    reviews = await refreshRemoteQuery(
      getTaskImageReviews({ taskId, meta: { isAdminRequest: true } }),
    )
    // Start on new evidence; browsing context never hides another submission.
    if (!activeId || !galleryOwners.has(activeId))
      activeId =
        pendingReviews[0]?.imageIds?.[0] ??
        pendingReviews[0]?.content.gallery.order[0] ??
        items[0]?.id ??
        null
  } catch (cause) {
    message = failureMessage(cause, 'Could not load images.')
  } finally {
    busy = false
    notify()
  }
}

function tokens(target = review) {
  if (!target) throw new Error('Review is unavailable')
  return {
    taskId,
    proposalId: target.proposalId,
    proposalVersion: target.proposalVersion,
    expectedReviewId: target.reviewId,
    expectedRevisionId: target.currentRevisionId,
    expectedGeneration: target.currentGeneration,
    meta: { isAdminRequest: true as const },
  }
}

async function save(
  patch: z.infer<typeof ImageReviewPatchSchema>,
  file?: File,
  refresh = false,
  throwOnError = false,
): Promise<void> {
  if (
    (review?.imageIds && !review.imageIds.includes(patch.imageId)) ||
    (!canSave && !(refresh && !readonly && !busy && review?.status === 'submitted'))
  ) {
    if (throwOnError) throw new Error('This review is no longer editable.')
    return
  }
  busy = true
  message = ''
  notify()
  try {
    const input = { ...tokens(), patch, refresh }
    let updated: FeatureImageReview | null
    if (file) {
      if (file.size > 20 * 1024 * 1024)
        throw new Error('Replacement must be at most 20 MB')
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(
          file.type,
        )
      )
        throw new Error('Unsupported image type')
      updated = await replaceTaskReviewImage({
        ...input,
        bytes: encoded,
        mediaType: file.type as 'image/jpeg',
      })
    } else updated = await saveTaskImageReview(input)
    if (!updated)
      throw new Error(
        'The image review is unavailable. Reload images before continuing.',
      )
    if (updated)
      reviews = reviews.map(r => (r.proposalId === updated.proposalId ? updated : r))
  } catch (cause) {
    message = failureMessage(
      cause,
      'Could not save this image change. Reload images and try again.',
    )
    if (throwOnError) throw cause
  } finally {
    busy = false
    notify()
  }
}

/** Show the new intent in every image control while saving the exact review patch.
 * @param imageId Image selected by either its thumbnail or the main toolbar.
 * @param intent Requested classification.
 * @returns Completion after server reconciliation; failures restore the saved value.
 */
async function setIntent(imageId: string, intent: Intent): Promise<void> {
  const target = galleryOwners.get(imageId)
  if (
    readonly ||
    busy ||
    textDirty ||
    pendingRotation ||
    !target ||
    target.stale ||
    target.status !== 'submitted' ||
    (target.imageIds && !target.imageIds.includes(imageId))
  )
    return
  // A thumbnail selector edits its own submission, including touch without hover.
  activeId = imageId
  const pending = { proposalId: target.proposalId, imageId, intent }
  pendingIntent = pending
  try {
    await save({ imageId, intent })
  } finally {
    // The saved snapshot remains authoritative; removing the overlay also rolls back failures.
    pendingIntent = null
  }
}

/** Saves the pending submission order without reordering existing accepted images.
 * @param mode Pending gallery sorting mode. @param ids Visible proposal image order.
 * @returns Completion after the immutable review snapshot is saved.
 */
async function sortReview(mode: GallerySortMode, ids: string[]): Promise<void> {
  if (!activeId || !review) throw new Error('Sort one photo proposal at a time.')
  const visible = new Set(ids)
  const order = [...review.content.gallery.order.filter(id => !visible.has(id)), ...ids]
  await save({ imageId: activeId, order, sortMode: mode }, undefined, false, true)
}

/** Preview accumulated turns and save once the reviewer stops rotating.
 * @param delta Signed turn in degrees.
 * @returns Nothing; saving runs after 750 milliseconds of inactivity.
 */
function rotate(delta: number): void {
  if (!activeId || !canSave || textDirty) return
  const initialRotation =
    pendingRotation?.initialRotation ?? Number(metadata?.renderRotation ?? 0)
  // Keep preview angles unbounded so crossing a full turn never reverses animation.
  const rotation = (pendingRotation?.rotation ?? initialRotation) + delta
  pendingRotation = { imageId: activeId, rotation, initialRotation }
  clearTimeout(rotationTimer)
  rotationTimer = setTimeout(() => {
    void flushRotation()
  }, 750)
}

/** Save the selected image's accumulated rotation while keeping task actions locked.
 * @returns Completion after the exact rotation is saved or its error displayed.
 */
async function flushRotation(): Promise<void> {
  const pending = pendingRotation
  if (!pending) return
  try {
    await save({
      imageId: pending.imageId,
      rotation: (((pending.rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270,
    })
  } finally {
    pendingRotation = null
    notify()
  }
}
onDestroy(() => clearTimeout(rotationTimer))

async function accept(
  mode: 'acceptAll' | 'acceptClassified' = 'acceptAll',
): Promise<void> {
  if (!canAccept) return
  busy = true
  notify()
  try {
    const result = await acceptTaskImageReview({
      ...tokens(pendingReviews[0]),
      mode,
      reviews: pendingReviews.map(row => {
        const { taskId: _task, meta: _meta, ...token } = tokens(row)
        return token
      }),
    })
    message =
      result.status === 'accepted'
        ? 'Reviewed images accepted.'
        : 'The Feature changed. Refresh and review before accepting.'
    await load()
    if (result.status === 'accepted') await onAccepted?.()
  } catch (cause) {
    message = failureMessage(cause, 'Could not accept image review.')
  } finally {
    busy = false
    notify()
  }
}

$effect(() => notify())
// The task header owns acceptance; keep both actions tied to every pending submission.
$effect(() => {
  onAcceptActionChange?.(
    !initialReport && pendingReviews.length > 0
      ? { taskId, disabled: !canAccept, accept }
      : undefined,
  )
})
onMount(() => {
  void load()
})
</script>

<div bind:clientWidth={galleryWidth} class="flex min-h-0 flex-1 flex-col">
  {#if message || hasPendingConflict}
    <div
      role="status"
      class="text-warning flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
    >
      <span
        >{message ||
          'The Feature changed. Compare your edits with the current version before continuing.'}</span
      >
      <button
        type="button"
        class="underline"
        disabled={busy || textDirty || Boolean(pendingRotation)}
        onclick={() => {
          message = ''
          void load()
        }}
      >
        Reload images
      </button>
      {#if hasPendingConflict && activeId && isSubmittedImage}
        <button
          type="button"
          class="underline"
          disabled={busy || readonly || textDirty}
          onclick={() => void save({ imageId: activeId! }, undefined, true)}
        >
          Compare with current Feature
        </button>
      {/if}
    </div>
  {/if}
  <div
    class="min-h-0 flex-1"
    data-task-image-loading={busy && items.length === 0 ? true : undefined}
  >
    <!-- Keep the editor mounted so image evidence can expand its thumbnail strip. -->
    <ImageEditor
      isLoading={busy && items.length === 0}
      sortScope={review?.proposalId}
      sortMode={(original ? review?.submitted.gallery : review?.content.gallery)
        ?.sortMode ?? 'automatic'}
      showSortControls={reviewEditable &&
        !hasExistingImages &&
        pendingReviews.length <= 1}
      canSort={canEdit && !hasExistingImages && pendingReviews.length <= 1}
      onSortChange={sortReview}
      layout={initialReport ? 'top' : galleryWidth < 640 ? 'bottom' : 'sidebar'}
      {items}
      {activeId}
      fit="fit"
      class="min-h-0 flex-1"
      isReadonly={!canEdit}
      canMutateActiveImage={canEdit}
      canRotateActiveImage={canSave && !textDirty}
      canEditActiveImage={canEdit}
      canReplaceActiveImage={canEdit}
      canDeleteActiveImage={false}
      canDownloadActiveImage={Boolean(entry)}
      isEditBusy={busy}
      isPublished={entry?.isPublished ?? false}
      presentationMode={(metadata?.presentationMode ?? 'contain') as ImagePresentation}
      isIntentDisabled={!canEdit}
      disableHoverPreview={busy || textDirty || Boolean(pendingRotation)}
      onActiveIdChange={id => {
        if (!busy && !textDirty && !pendingRotation) activeId = id
      }}
      highlightClass=""
      getIsHighlighted={item =>
        pendingReviews.some(row =>
          (row.imageIds ?? row.content.gallery.order).includes(item.id),
        )}
      getBadgeLabel={item =>
        taskPhotoDecisionLabel(galleryOwners.get(item.id), item.id, reviewAction)}
      getBadgeClass={item => {
        const label = taskPhotoDecisionLabel(
          galleryOwners.get(item.id),
          item.id,
          reviewAction,
        )
        return label === 'ACCEPTED'
          ? 'bg-emerald-600'
          : label === 'REJECTED'
            ? 'bg-rose-600'
            : undefined
      }}
      onRotateLeft={() => rotate(-90)}
      onRotateRight={() => rotate(90)}
      onPresentationModeChange={mode =>
        activeId ? save({ imageId: activeId, presentationMode: mode }) : undefined}
      onIntentChange={(item, intent) => setIntent(item.id, intent)}
      onReplaceFiles={files => {
        const file = Array.from(files)[0]
        if (file && activeId) void save({ imageId: activeId }, file)
      }}
      onDownload={() => {
        if (entry) {
          const a = document.createElement('a')
          a.href = url(
            (
              (original ? review.submitted.gallery.entries[activeId!] : undefined) ??
              entry
            ).imageRevisionId,
            review.featureId,
            true,
          )
          a.download = 'image'
          a.click()
        }
      }}
    >
      {#snippet leftRail(_item)}
        {#if activeImage?.contributorId}
          <UserAttributionCard
            userId={activeImage.contributorId}
            date={activeImage.createdAt}
            type="imageContributor"
            openDirection="right"
            isOpen={false}
            class="[&_.bits-feature-attribution__avatar]:h-9 [&_.bits-feature-attribution__avatar]:w-9 [&:not(:hover):not(:has(:focus-visible))_.bits-feature-attribution-shell__panel]:pointer-events-none! [&:not(:hover):not(:has(:focus-visible))_.bits-feature-attribution-shell__panel]:opacity-0!"
          />
        {/if}
      {/snippet}
      {#snippet rightRail(_item)}
        {#if activeImage}
          <!-- Show the inspected revision's metadata without fetching mutable image metadata. -->
          <div class="relative">
            <button
              type="button"
              class={IMAGE_METADATA_BUTTON_CLASSES}
              aria-label={m.image__metadata_open()}
              aria-expanded={metadataOpen}
              onclick={() => (metadataOpen = !metadataOpen)}
            >
              <CameraIcon class="h-[22px] w-[22px]" />
            </button>
            {#if metadataOpen}
              <section
                class="absolute right-0 bottom-12"
                aria-label={m.image__metadata_open()}
              >
                <ImageMetadataCard metadata={displayMetadata} loading={false} />
              </section>
            {/if}
          </div>
        {/if}
      {/snippet}
      {#snippet textControls()}
        <FeatureGalleryRevisionEditor
          imageId={activeId}
          isDirty={!canSave || Boolean(pendingRotation)}
          hasText={Boolean(
            entry &&
              [...Object.values(entry.caption), ...Object.values(entry.alt)].some(
                text => text.trim(),
              ),
          )}
          onOpenChange={open => (textOpen = open)}
          source={{
            load: async () => ({
              enabled: canSave && !pendingRotation,
              gallery: $state.snapshot(review.content.gallery),
              comparisonRevisionId: review.reviewId ?? '',
              locales: [locale],
            }),
            save: (imageId, text) => save({ imageId, ...text }, undefined, false, true),
          }}
          onSaved={() => {}}
        />
      {/snippet}
    </ImageEditor>
  </div>
</div>
