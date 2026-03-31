<script lang="ts">
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '$lib/images/accept'
import { Button } from '$lib/bits/core/button'
import { cx } from '$lib/bits/utils'
// I18N
import { m } from '$lib/i18n'
// ICONS
import CloudUploadIcon from 'virtual:icons/lucide/cloud-upload'
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import XIcon from 'virtual:icons/lucide/x'

let {
  class: className = '',
  isProcessingUploads = false,
  isDeleteMode = false,
  disabled = false,
  disableDeleteMode = disabled,
  disableUpload = disabled,
  variant = 'floating',
  uploadSelectionMode = 'multiple',
  onToggleDeleteMode,
  onAddFiles,
}: {
  class?: string
  isProcessingUploads?: boolean
  isDeleteMode?: boolean
  disabled?: boolean
  disableDeleteMode?: boolean
  disableUpload?: boolean
  variant?: 'floating' | 'footer'
  uploadSelectionMode?: 'single' | 'multiple'
  onToggleDeleteMode?: () => void
  onAddFiles?: (files: FileList | File[]) => void
} = $props()

let inputEl = $state<HTMLInputElement>()
const allowsMultiple = $derived(uploadSelectionMode === 'multiple')

function handleChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  if (!input.files?.length) return
  const files = allowsMultiple ? Array.from(input.files) : [input.files[0]]
  onAddFiles?.(files)
  input.value = ''
}

const wrapperClass = $derived(
  cx(
    variant === 'footer'
      ? 'bits-theme bits-admin-menu bits-admin-menu--wide justify-center'
      : 'flex w-fit items-center justify-center gap-2',
  ),
)

const iconButtonClass = $derived(
  cx(
    variant === 'footer'
      ? 'bits-admin-menu__button disabled:cursor-default disabled:opacity-35'
      : 'bits-admin-menu__button inline-flex h-11 w-11 items-center justify-center rounded-xl bg-black/60 text-white shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition hover:bg-black/75 disabled:cursor-default disabled:opacity-35',
  ),
)

const uploadButtonLabel = $derived(m.gallery__upload_images())
const deleteModeButtonLabel = $derived(
  isDeleteMode ? m.gallery__cancel_delete_mode() : m.gallery__enable_delete_mode(),
)
</script>

<input
  bind:this={inputEl}
  type="file"
  accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE}
  multiple={allowsMultiple}
  class="sr-only"
  onchange={handleChange}
>

<nav class={cx(wrapperClass, className)} aria-label={m.gallery__thumbnail_controls()}>
  <div class="bits-admin-menu__viewport overflow-visible">
    <div class="bits-admin-menu__track">
      <div class="bits-admin-menu__page">
        <div class="bits-admin-menu__list">
          <div class="bits-admin-menu__item">
            <Button
              text={uploadButtonLabel}
              color="neutral"
              style="ghost"
              size="lg"
              modifier="circle"
              hideLabel={true}
              hideLabelInstantly={true}
              disabled={disableUpload || isDeleteMode}
              iconComponent={isProcessingUploads ? LoaderCircleIcon : CloudUploadIcon}
              class={iconButtonClass}
              onClick={() => inputEl?.click()}
            />
          </div>

          <div class="bits-admin-menu__item">
            <Button
              text={deleteModeButtonLabel}
              iconComponent={isDeleteMode ? XIcon : Trash2Icon}
              color="neutral"
              style="ghost"
              size="lg"
              modifier="circle"
              hideLabel={true}
              hideLabelInstantly={true}
              disabled={disableDeleteMode}
              class={cx(
                  'bits-admin-menu__button',
                  iconButtonClass,
                  isDeleteMode ? 'text-error hover:bg-error/12 hover:text-error' : '',
                )}
              onClick={() => onToggleDeleteMode?.()}
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</nav>
