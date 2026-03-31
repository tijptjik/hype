<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import * as ImagePrimitive from './components'
import type { AdminThumbnailProps } from './images.types'

let {
  item,
  fit = 'fit',
  size = 88,
  isActive = false,
  isHighlighted = false,
  highlightClass = 'outline outline-2 outline-accent outline-offset-[-2px]',
  isLoading = false,
  isBlurred = false,
  isGreyscale = false,
  isUploading = false,
  isDeleteMode = false,
  isIntentDisabled = false,
  badgeLabel = null,
  badgeClass = '',
  intentPopoverSide = 'left',
  onIntentChange,
  onSelect,
  onHover,
  onDelete,
  onRetryUpload,
  onLoad,
  onError,
}: AdminThumbnailProps = $props()
let isConfirmingDelete = $state(false)
const dimension = $derived(typeof size === 'number' ? `${size}px` : size)
const thumbnailFit = $derived<'cover'>('cover')
const isUploadError = $derived(item.status?.uploadStatus === 'error')
const uploadErrorMessage = $derived(
  typeof item.status?.uploadErrorMessage === 'string'
    ? item.status.uploadErrorMessage
    : null,
)

function handleSelect(): void {
  if (!isDeleteMode) {
    onSelect?.(item)
    return
  }

  isConfirmingDelete = true
}

async function handleDelete(): Promise<void> {
  await onDelete?.(item)
  isConfirmingDelete = false
}
</script>

<div class="shrink-0">
  <div
    class="relative isolate overflow-hidden rounded-xl"
    style={`width: ${dimension}; height: ${dimension};`}
  >
    <ImagePrimitive.ThumbnailButton
      {item}
      fit={thumbnailFit}
      {size}
      rounded="rounded-none"
      {isActive}
      {isHighlighted}
      {highlightClass}
      isLoading={isLoading || isUploading}
      {isBlurred}
      {isGreyscale}
      onSelect={handleSelect}
      {onHover}
      {onLoad}
      {onError}
    />

    {#if onIntentChange && !isDeleteMode && !isConfirmingDelete && !isUploading && !isUploadError}
      <ImagePrimitive.ThumbnailIntent
        {item}
        disabled={isIntentDisabled}
        {onIntentChange}
        contentSide={intentPopoverSide}
        class="bottom-[10px]"
      />
    {/if}

    {#if badgeLabel || isHighlighted}
      <div
        class={`pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white shadow-[0_8px_20px_rgba(0,0,0,0.32)] ${badgeClass || 'bg-[#2A6FEC]'}`}
        aria-label={badgeLabel ?? m.gallery__highlighted_task_image()}
      >
        <span>{badgeLabel ?? m.gallery__new_badge()}</span>
      </div>
    {/if}

    <ImagePrimitive.ThumbnailOverlays
      {isUploading}
      {isUploadError}
      {uploadErrorMessage}
      isUnpublished={item.isPublished === false}
      {isDeleteMode}
      {isConfirmingDelete}
      onCancelDelete={() => {
        isConfirmingDelete = false
      }}
      onConfirmDelete={handleDelete}
      onRetryUpload={() => onRetryUpload?.(item)}
    />
  </div>
</div>
