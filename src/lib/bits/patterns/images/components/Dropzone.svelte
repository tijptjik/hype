<script lang="ts">
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '$lib/images/accept'
import Icon from '$lib/components/common/Icon.svelte'
import PhotoIcon from 'virtual:icons/lucide/image'
import UploadIcon from 'virtual:icons/lucide/upload'
import DropzonePrimitive from 'svelte-file-dropzone'
import type { Snippet } from 'svelte'

let {
  children,
  disabled = false,
  hasItems = false,
  rounded = 'rounded-2xl',
  class: className = '',
  showPrompt = true,
  showEmptyState = false,
  uploadSelectionMode = 'multiple',
  inputElement = $bindable<HTMLInputElement | undefined>(undefined),
  onFiles,
}: {
  children?: Snippet
  disabled?: boolean
  hasItems?: boolean
  rounded?: string
  class?: string
  showPrompt?: boolean
  showEmptyState?: boolean
  uploadSelectionMode?: 'single' | 'multiple'
  inputElement?: HTMLInputElement | undefined
  onFiles?: (acceptedFiles: File[], fileRejections: File[]) => void | Promise<void>
} = $props()

let isDragActive = $state(false)
const isSingleUpload = $derived(uploadSelectionMode === 'single')
const emptyTitle = m.gallery__empty_upload_title()
const idleLabel = $derived(
  isSingleUpload ? m.gallery__select_image() : m.gallery__select_images(),
)
const promptTitle = $derived(
  isSingleUpload ? m.gallery__upload_image() : m.gallery__upload_images(),
)
const promptDescription = m.gallery__empty_upload_description()

async function handleFiles(event: CustomEvent): Promise<void> {
  isDragActive = false
  const acceptedFiles = event.detail.acceptedFiles ?? []
  const fileRejections = event.detail.fileRejections ?? []
  await onFiles?.(acceptedFiles, fileRejections)
}
</script>

<div
  class={cx('group/gallery-dropzone relative isolate h-full w-full overflow-visible', className)}
>
  {@render children?.()}

  {#if !disabled}
    <DropzonePrimitive
      accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT}
      noClick={false}
      multiple={!isSingleUpload}
      disableDefaultStyles={true}
      bind:inputElement
      class="absolute inset-0 z-10"
      on:dragenter={() => {
        isDragActive = true
      }}
      on:dragleave={() => {
        isDragActive = false
      }}
      on:drop={handleFiles}
      on:select={handleFiles}
    >
      <div class="sr-only" aria-hidden="true"></div>
    </DropzonePrimitive>
  {/if}

  {#if !disabled || showEmptyState}
    <div
      class={cx(
        'pointer-events-none absolute inset-4 z-[70] border-2 border-dashed transition-[background-color,border-color] duration-200',
        rounded,
        disabled
          ? 'border-black/10 bg-transparent'
          : isDragActive
          ? 'border-white/45'
          : 'border-transparent group-hover/gallery-dropzone:border-white/20',
      )}
    ></div>

    {#if showEmptyState}
      <div
        class={cx(
          'pointer-events-none absolute inset-4 z-[70] flex items-center justify-center px-6 text-center',
          rounded,
        )}
      >
        <div class="flex max-w-80 flex-col items-center gap-8">
          <div class="space-y-3">
            <p class="text-xl font-semibold uppercase tracking-[0.18em] text-white/75">
              {emptyTitle}
            </p>
          </div>

          <div
            class={cx(
              'min-w-52 rounded-full px-6 py-3 text-base bg-accent/80 font-medium shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition-all duration-200',
              disabled
                ? 'bg-base-200 text-white/45'
                : isDragActive
                  ? 'bg-accent text-white/85'
                  : 'text-white/75 group-hover/gallery-dropzone:bg-accent/80 group-hover/gallery-dropzone:text-white/85',
            )}
          >
            {isDragActive ? m.dropzone__drop_images() : idleLabel}
          </div>
        </div>
      </div>
    {:else if showPrompt}
      <div
        class={cx(
          'pointer-events-none absolute inset-0 z-[70] flex items-center justify-center px-6 transition-all duration-200',
          isDragActive
            ? 'translate-y-0 opacity-100'
            : 'translate-y-2 opacity-0 group-hover/gallery-dropzone:translate-y-0 group-hover/gallery-dropzone:opacity-100',
        )}
      >
        <div
          class={cx(
            'rounded-2xl border px-4 py-3 backdrop-blur-md shadow-[0_18px_40px_rgba(0,0,0,0.24)] transition-[background-color,border-color,color,transform] duration-200',
            isDragActive
              ? 'border-white/16 bg-base-100/95 text-white/85'
              : 'border-white/10 bg-base-200/92 text-white/75 group-hover/gallery-dropzone:border-white/14 group-hover/gallery-dropzone:bg-base-100/95 group-hover/gallery-dropzone:text-white/85',
          )}
        >
          <div class="flex items-center gap-3 text-left">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6"
            >
              <Icon src={isDragActive ? UploadIcon : PhotoIcon} class="h-5.5 w-5.5" />
            </div>
            <div class="space-y-0.5 leading-none">
              <p class="text-[0.98rem] font-semibold tracking-[0.01em]">
                {isDragActive ? m.dropzone__drop_images() : promptTitle}
              </p>
              <p
                class="text-[0.82rem] text-white/68 group-hover/gallery-dropzone:text-white/76"
              >
                {promptDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
