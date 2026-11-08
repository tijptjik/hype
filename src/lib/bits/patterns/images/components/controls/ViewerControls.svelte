<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { cx } from '#lib/bits/utils.js'
import { Button } from '#lib/bits/core/button/index.js'
import ImagePresentationPicker from './ImagePresentationPicker.svelte'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '#lib/images/accept.js'
import {
  VIEWER_CONTROLS_BUTTON_CLASSES,
  VIEWER_CONTROLS_EDIT_GROUP_CLASSES,
  VIEWER_CONTROLS_ROOT_CLASSES,
  VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES,
  VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES,
  VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES,
  viewerControlsEditButtonClass,
  viewerControlsEditActionsClass,
} from './ViewerControls.styles'
// ICONS
import LoaderCircleIcon from 'virtual:icons/proicons/spinner'
import RotateCcwIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import RotateCwIcon from 'virtual:icons/proicons/arrow-clockwise'
import SquarePenIcon from 'virtual:icons/proicons/compose'
import EyeIcon from 'virtual:icons/proicons/eye'
import EyeOffIcon from 'virtual:icons/proicons/eye-off'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import DownloadIcon from 'virtual:icons/proicons/cloud-arrow-down'
import Trash2Icon from 'virtual:icons/proicons/delete'
// TYPES
import type { ImagePresentation } from '#lib/images/presentation.js'

let {
  isPublished = false,
  presentationMode = 'contain',
  canMutate = false,
  canRotate = false,
  canEdit = false,
  canReplace = false,
  canDelete = false,
  deleteLabel = m.forms__delete(),
  canDownload = false,
  showEditButton = false,
  isEditBusy = false,
  disabled = false,
  freezeInteractions = false,
  offsetClass = 'bottom-4',
  showPublishedToggle = true,
  showPresentationModeToggle = true,
  showReplaceButton = true,
  showDeleteButton = false,
  showDownloadButton = true,
  intentControls,
  textControls,
  onRotateLeft,
  onRotateRight,
  onTogglePublished,
  onPresentationModeChange,
  onReplaceFiles,
  onDelete,
  onDownload,
}: {
  intentControls?: Snippet
  textControls?: Snippet
  isPublished?: boolean
  presentationMode?: ImagePresentation
  canMutate?: boolean
  canRotate?: boolean
  canEdit?: boolean
  canReplace?: boolean
  canDelete?: boolean
  deleteLabel?: string
  canDownload?: boolean
  showEditButton?: boolean
  isEditBusy?: boolean
  disabled?: boolean
  freezeInteractions?: boolean
  offsetClass?: string
  showPublishedToggle?: boolean
  showPresentationModeToggle?: boolean
  showReplaceButton?: boolean
  showDeleteButton?: boolean
  showDownloadButton?: boolean
  onRotateLeft?: () => void | Promise<void>
  onRotateRight?: () => void | Promise<void>
  onTogglePublished?: () => void
  onPresentationModeChange?: (mode: ImagePresentation) => void | Promise<void>
  onReplaceFiles?: (files: FileList | File[]) => void
  onDelete?: () => void | Promise<void>
  onDownload?: () => void
} = $props()

let inputEl = $state<HTMLInputElement>()
let isEditExpanded = $state(false)
let isPresentationModePending = $state(false)
const shouldShowEditButton = $derived(
  showEditButton || Boolean(onRotateLeft && onRotateRight) || canDownload || canReplace,
)

$effect(() => {
  if (!shouldShowEditButton) {
    isEditExpanded = false
  }
})

function handleChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  if (!input.files?.length) return
  onReplaceFiles?.(input.files)
  input.value = ''
}
const editButtonClass = $derived(
  viewerControlsEditButtonClass({
    isEditExpanded,
    disabled,
    isEditBusy,
    canRotate,
  }),
)
/**
 * Saves one presentation choice while blocking duplicate changes until it settles.
 * @param nextMode - Mode selected in the presentation menu.
 * @returns Completion after the owning editor has saved or recovered the change.
 */
async function handlePresentationModeChange(
  nextMode: ImagePresentation,
): Promise<void> {
  if (!onPresentationModeChange || disabled || isPresentationModePending) return

  isPresentationModePending = true

  try {
    await onPresentationModeChange(nextMode)
  } finally {
    isPresentationModePending = false
  }
}
</script>

<input
  bind:this={inputEl}
  type="file"
  accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE}
  class="sr-only"
  onchange={handleChange}
>

<div
  class={cx(
    VIEWER_CONTROLS_ROOT_CLASSES,
    freezeInteractions && 'pointer-events-none',
    offsetClass,
  )}
  aria-busy={freezeInteractions}
>
  {@render intentControls?.()}

  {#if showPresentationModeToggle}
    <ImagePresentationPicker
      value={presentationMode}
      disabled={disabled || !canMutate}
      busy={isPresentationModePending}
      onValueChange={handlePresentationModeChange}
    />
  {/if}

  {@render textControls?.()}

  {#if shouldShowEditButton}
    <div class={VIEWER_CONTROLS_EDIT_GROUP_CLASSES}>
      <Button
        text={isEditExpanded
          ? m.gallery__hide_image_edit_controls()
          : m.gallery__show_image_edit_controls()}
        style="transparent"
        modifier="circle"
        hideLabel={true}
        class={editButtonClass}
        disabled={disabled || isEditBusy}
        onClick={() => {
          if (disabled || isEditBusy) return
          isEditExpanded = !isEditExpanded
        }}
        attrs={{ 'aria-expanded': isEditExpanded }}
        iconComponent={isEditBusy ? LoaderCircleIcon : SquarePenIcon}
        iconClasses={isEditBusy ? 'h-5.5 w-5.5 animate-spin' : 'h-5.5 w-5.5'}
      />

      <div
        class={viewerControlsEditActionsClass({ isEditExpanded })}
        inert={!isEditExpanded}
        aria-hidden={!isEditExpanded}
      >
        <Button
          text={m.gallery__rotate_image_left()}
          style="transparent"
          modifier="circle"
          hideLabel={true}
          disabled={disabled || isEditBusy || !canRotate || !isEditExpanded}
          onClick={() => onRotateLeft?.()}
          iconComponent={RotateCcwIcon}
          iconClasses="h-[22px] w-[22px]"
          class={VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES}
        />

        <Button
          text={m.gallery__rotate_image_right()}
          style="transparent"
          modifier="circle"
          hideLabel={true}
          disabled={disabled || isEditBusy || !canRotate || !isEditExpanded}
          onClick={() => onRotateRight?.()}
          iconComponent={RotateCwIcon}
          iconClasses="h-[22px] w-[22px]"
          class={VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES}
        />
        {#if showReplaceButton}
          <Button
            text={m.gallery__replace_image()}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={VIEWER_CONTROLS_BUTTON_CLASSES}
            disabled={disabled || !canReplace}
            onClick={() => inputEl?.click()}
            iconComponent={ReplaceIcon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/if}

        {#if showDeleteButton}
          <Button
            text={deleteLabel}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={VIEWER_CONTROLS_BUTTON_CLASSES}
            disabled={disabled || !canDelete}
            onClick={() => {
              void onDelete?.()
            }}
            iconComponent={Trash2Icon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/if}

        {#if showDownloadButton}
          <Button
            text={m.gallery__download_raw_image()}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={VIEWER_CONTROLS_BUTTON_CLASSES}
            disabled={disabled || !canDownload}
            onClick={() => onDownload?.()}
            iconComponent={DownloadIcon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/if}
      </div>
    </div>
  {/if}
</div>
