<script lang="ts">
import * as ImagePrimitive from './components'
import type { AdminThumbnailProps } from './images.types'

let {
  item,
  fit = 'fit',
  size = 88,
  isActive = false,
  isLoading = false,
  isBlurred = false,
  isGreyscale = false,
  isUploading = false,
  isDeleteMode = false,
  onIntentChange,
  onSelect,
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
      isLoading={isLoading || isUploading}
      {isBlurred}
      {isGreyscale}
      onSelect={handleSelect}
      {onLoad}
      {onError}
    />

    {#if !isDeleteMode && !isConfirmingDelete && !isUploading && !isUploadError}
      <ImagePrimitive.ThumbnailIntentSelector
        {item}
        {onIntentChange}
        class="bottom-[10px]"
      />
    {/if}

    <ImagePrimitive.AdminStateOverlay
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
