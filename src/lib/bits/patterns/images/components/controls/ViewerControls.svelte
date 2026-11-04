<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { cx } from '#lib/bits/utils.js'
import { Button, Swap } from '#lib/bits/index.js'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '#lib/images/accept.js'
import {
  VIEWER_CONTROLS_BUTTON_CLASSES,
  VIEWER_CONTROLS_EDIT_GROUP_CLASSES,
  VIEWER_CONTROLS_ROOT_CLASSES,
  VIEWER_CONTROLS_ROTATE_BUTTON_CLASSES,
  VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES,
  VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES,
  viewerControlsEditActionsClass,
  viewerControlsEditButtonClass,
} from './ViewerControls.styles'
// ICONS
import LoaderCircleIcon from 'virtual:icons/proicons/spinner'
import RotateCcwIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import RotateCwIcon from 'virtual:icons/proicons/arrow-clockwise'
import SquarePenIcon from 'virtual:icons/proicons/compose'
import EyeIcon from 'virtual:icons/proicons/eye'
import EyeOffIcon from 'virtual:icons/proicons/eye-off'
import ReplaceIcon from 'virtual:icons/proicons/arrow-swap'
import DownloadIcon from 'virtual:icons/proicons/cloud-arrow-down'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import ShrinkIcon from 'virtual:icons/proicons/full-screen-minimize'
import Trash2Icon from 'virtual:icons/proicons/delete'

let {
  isPublished = false,
  presentationMode = 'contain',
  canMutate = false,
  canRotate = false,
  canEdit = false,
  canReplace = false,
  canDelete = false,
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
  onRotateLeft,
  onRotateRight,
  onTogglePublished,
  onPresentationModeChange,
  onReplaceFiles,
  onDelete,
  onDownload,
}: {
  isPublished?: boolean
  presentationMode?: 'cover' | 'contain'
  canMutate?: boolean
  canRotate?: boolean
  canEdit?: boolean
  canReplace?: boolean
  canDelete?: boolean
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
  onPresentationModeChange?: (mode: 'cover' | 'contain') => void | Promise<void>
  onReplaceFiles?: (files: FileList | File[]) => void
  onDelete?: () => void | Promise<void>
  onDownload?: () => void
} = $props()

let inputEl = $state<HTMLInputElement>()
let isEditExpanded = $state(false)
let isPresentationModePending = $state(false)
const shouldShowEditButton = $derived(
  showEditButton || Boolean(onRotateLeft && onRotateRight),
)

$effect(() => {
  if (!shouldShowEditButton || !canEdit || !canRotate) {
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
const isCoverPresentationMode = $derived(presentationMode === 'cover')

async function handlePresentationModeChange(nextChecked: boolean): Promise<void> {
  if (!onPresentationModeChange || disabled || isPresentationModePending) return

  isPresentationModePending = true

  try {
    await onPresentationModeChange(nextChecked ? 'cover' : 'contain')
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
  {#if showPublishedToggle}
    <Swap
      checked={isPublished}
      disabled={disabled || !canMutate}
      class={disabled || !canMutate
        ? VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES
        : VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES}
      label={isPublished ? m.gallery__unpublish_image() : m.gallery__publish_image()}
      size="sm"
      variant="transparent"
      onColor="success"
      offColor="dark"
      onIcon={EyeIcon}
      offIcon={EyeOffIcon}
      onCheckedChange={() => {
        onTogglePublished?.()
      }}
    />
  {/if}

  {#if showPresentationModeToggle}
    <Swap
      checked={isCoverPresentationMode}
      disabled={disabled || isPresentationModePending || !canMutate}
      class={disabled || isPresentationModePending || !canMutate
        ? VIEWER_CONTROLS_TOGGLE_DISABLED_CLASSES
        : VIEWER_CONTROLS_TOGGLE_ENABLED_CLASSES}
      label={isCoverPresentationMode
        ? m.gallery__set_image_to_fill_mode()
        : m.gallery__set_image_to_fit_mode()}
      size="sm"
      variant="transparent"
      onColor="dark"
      offColor="dark"
      onIcon={ExpandIcon}
      offIcon={ShrinkIcon}
      onCheckedChange={value => {
        void handlePresentationModeChange(value)
      }}
    />
  {/if}

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
      text={m.forms__delete()}
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
        disabled={disabled || isEditBusy || !canEdit || !canRotate}
        onClick={() => {
          if (disabled || isEditBusy || !canEdit || !canRotate) return
          isEditExpanded = !isEditExpanded
        }}
        attrs={{ 'aria-expanded': isEditExpanded }}
        iconComponent={isEditBusy ? LoaderCircleIcon : SquarePenIcon}
        iconClasses={isEditBusy ? 'h-5.5 w-5.5 animate-spin' : 'h-5.5 w-5.5'}
      />

      <div
        class={viewerControlsEditActionsClass({
          isEditExpanded,
          canRotate,
        })}
        aria-hidden={!isEditExpanded || !canRotate}
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
      </div>
    </div>
  {/if}
</div>
