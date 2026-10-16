<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import { m } from '#lib/i18n.js'
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '#lib/images/accept.js'
import { Icon } from '#lib/bits/index.js'
import PhotoIcon from 'virtual:icons/proicons/photo'
import UploadIcon from 'virtual:icons/proicons/arrow-upload'
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
let isHoveringDropzone = $state(false)
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
  class={cx(
    'group/gallery-dropzone relative isolate h-full w-full overflow-visible select-none',
    !disabled ? 'cursor-pointer' : '',
    className,
  )}
>
  {@render children?.()}

  {#if !disabled}
    <DropzonePrimitive
      accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT}
      noClick={false}
      multiple={!isSingleUpload}
      disableDefaultStyles={true}
      bind:inputElement
      class={cx('absolute inset-0 z-10', !disabled ? 'cursor-pointer' : '')}
      style={!disabled ? 'cursor: pointer;' : undefined}
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
        'pointer-events-none absolute inset-4 z-70 border-2 border-dashed transition-[background-color,border-color] duration-200',
        rounded,
        disabled
          ? 'border-border bg-transparent'
          : isDragActive
            ? 'border-primary'
            : 'border-transparent group-hover/gallery-dropzone:border-border',
      )}
    ></div>

    {#if showEmptyState}
      <div
        class={cx(
          'pointer-events-none absolute inset-4 z-70 flex items-center justify-center px-6 text-center',
          rounded,
        )}
      >
        <div class="flex max-w-80 flex-col items-center gap-8">
          <div class="space-y-3">
            <p
              class="text-xl font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              {emptyTitle}
            </p>
          </div>

          <div
            class={cx(
              'min-w-52 rounded-full px-6 py-3 text-base bg-accent font-medium shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition-all duration-200',
              disabled
                ? 'bg-base-200 text-muted-foreground'
                : isDragActive
                  ? 'bg-accent text-accent-content'
                  : 'text-accent-content group-hover/gallery-dropzone:bg-accent/90',
            )}
          >
            {isDragActive ? m.dropzone__drop_images() : idleLabel}
          </div>
        </div>
      </div>
    {:else if showPrompt}
      <div
        class={cx(
          'pointer-events-none absolute inset-0 z-70 flex items-center justify-center px-6 transition-all duration-200',
          isDragActive
            ? 'translate-y-0 opacity-100'
            : 'translate-y-2 opacity-0 group-hover/gallery-dropzone:translate-y-0 group-hover/gallery-dropzone:opacity-100',
        )}
      >
        <div
          class={cx(
            'rounded-2xl border px-4 py-3 backdrop-blur-md shadow-[0_18px_40px_rgba(0,0,0,0.24)] transition-[background-color,border-color,color,transform] duration-200',
            isDragActive
              ? 'border-primary bg-base-100 text-base-content'
              : 'border-border bg-base-100 text-base-content',
          )}
        >
          <div class="flex items-center gap-3 text-left">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-base-content"
            >
              <Icon src={isDragActive ? UploadIcon : PhotoIcon} class="h-5.5 w-5.5" />
            </div>
            <div class="space-y-1 leading-none">
              <p
                class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
              >
                {isDragActive ? m.dropzone__drop_images() : promptTitle}
              </p>
              <p class="text-sm leading-6 text-base-content">
                {promptDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
