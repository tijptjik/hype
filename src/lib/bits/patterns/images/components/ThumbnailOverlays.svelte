<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core/button'
import { m } from '$lib/i18n'
import * as OverlayPrimitive from './thumbnailOverlays'
// ICONS
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import RefreshCwIcon from 'virtual:icons/lucide/refresh-cw'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
// TYPES
import type { AdminStateOverlayProps } from './imagePrimitives.types'

let {
  isUploading = false,
  isUploadError = false,
  uploadErrorMessage = null,
  isUnpublished = false,
  isDeleteMode = false,
  isConfirmingDelete = false,
  onCancelDelete,
  onConfirmDelete,
  onRetryUpload,
}: AdminStateOverlayProps = $props()
</script>

{#if isUploadError}
  <OverlayPrimitive.Root
    class="bg-[linear-gradient(180deg,rgba(57,12,12,0.68)_0%,rgba(32,8,8,0.86)_100%)]"
  >
    <div class="space-y-1 text-center">
      <OverlayPrimitive.Title text={m.gallery__upload_failed()} />
      <OverlayPrimitive.Message
        class="line-clamp-3"
        text={uploadErrorMessage ?? m.gallery__upload_retry_message()}
      />
    </div>
    <Button
      text={m.retry()}
      color="dark"
      style="soft"
      size="sm"
      iconComponent={RefreshCwIcon}
      iconClasses="h-4 w-4"
      onClick={() => onRetryUpload?.()}
    />
  </OverlayPrimitive.Root>
{/if}

{#if isUnpublished && !isDeleteMode && !isConfirmingDelete && !isUploadError}
  <div
    class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[inherit]"
  >
    <span class="text-white/50"> <EyeOffIcon class="h-20 w-20 opacity-70" /> </span>
  </div>
{/if}

{#if isDeleteMode && !isConfirmingDelete}
  <OverlayPrimitive.IconOnly iconComponent={Trash2Icon} />
{/if}

{#if isConfirmingDelete}
  <OverlayPrimitive.Root>
    <div class="space-y-1 text-center">
      <OverlayPrimitive.Title text={m.gallery__delete_image_confirm_title()} />
      <OverlayPrimitive.Message text={m.gallery__delete_image_confirm_description()} />
    </div>
    <OverlayPrimitive.Actions>
      <Button
        text={m.cancel()}
        color="dark"
        style="soft"
        size="sm"
        onClick={() => onCancelDelete?.()}
      />
      <Button
        text={m.forms__delete()}
        color="error"
        size="sm"
        onClick={() => onConfirmDelete?.()}
      />
    </OverlayPrimitive.Actions>
  </OverlayPrimitive.Root>
{/if}
