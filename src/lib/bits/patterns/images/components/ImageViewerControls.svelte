<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { cx } from '$lib/bits/utils'
import { Tooltip as TooltipPrimitive } from 'bits-ui'
import { Button, SimpleTooltip, Swap } from '$lib/bits'
// LIB
import { SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE } from '$lib/images/accept'
// ICONS
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import RotateCcwIcon from 'virtual:icons/lucide/rotate-ccw'
import RotateCwIcon from 'virtual:icons/lucide/rotate-cw'
import SquarePenIcon from 'virtual:icons/lucide/square-pen'
import EyeIcon from 'virtual:icons/lucide/eye'
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import DownloadIcon from 'virtual:icons/lucide/cloud-download'
import ExpandIcon from 'virtual:icons/lucide/expand'
import ShrinkIcon from 'virtual:icons/lucide/shrink'
import Trash2Icon from 'virtual:icons/lucide/trash-2'

let {
  isPublished = false,
  presentationMode = 'contain',
  canMutate = false,
  canRotate = false,
  canEdit = false,
  canReplace = false,
  canDelete = false,
  canDownload = false,
  isEditBusy = false,
  disabled = false,
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
  isEditBusy?: boolean
  disabled?: boolean
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

$effect(() => {
  if (!canEdit || disabled || !canRotate) {
    isEditExpanded = false
  }
})

function handleChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  if (!input.files?.length) return
  onReplaceFiles?.(input.files)
  input.value = ''
}

const buttonClass =
  '[--btn-transparent-active-fg:var(--color-white)] [--btn-transparent-fg:var(--color-white)] [--btn-transparent-hover-fg:var(--color-white)] bg-black/70 transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-black/85'
const disabledToggleClass =
  'cursor-not-allowed opacity-45 transition-[background-color,color,opacity,transform] duration-200 ease-out'
const enabledToggleClass =
  'transition-[background-color,color,opacity,transform] duration-200 ease-out'
const editButtonClass = $derived(
  cx(
    buttonClass,
    isEditExpanded && !disabled && !isEditBusy && canRotate
      ? 'text-primary'
      : 'text-white',
  ),
)
const isCoverPresentationMode = $derived(presentationMode === 'cover')
const tooltipDelayDuration = 500
const tooltipSkipDelayDuration = 200

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

<TooltipPrimitive.Provider
  delayDuration={tooltipDelayDuration}
  skipDelayDuration={tooltipSkipDelayDuration}
>
  <div
    class={cx(
      'absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black p-2 shadow-[0_10px_30px_rgba(0,0,0,0.25)]',
      offsetClass,
    )}
  >
    {#if showPublishedToggle}
      <SimpleTooltip withProvider={false}>
        {#snippet trigger()}
          <Swap
            checked={isPublished}
            disabled={disabled || !canMutate}
            class={disabled || !canMutate ? disabledToggleClass : enabledToggleClass}
            label={isPublished
              ? m.gallery__unpublish_image()
              : m.gallery__publish_image()}
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
        {/snippet}
        <span
          >{canMutate
            ? isPublished
              ? m.gallery__unpublish_image()
              : m.gallery__publish_image()
            : m.gallery__wait_for_image_save()}</span
        >
      </SimpleTooltip>
    {/if}

    {#if showPresentationModeToggle}
      <SimpleTooltip withProvider={false}>
        {#snippet trigger()}
          <Swap
            checked={isCoverPresentationMode}
            disabled={disabled || isPresentationModePending || !canMutate}
            class={disabled || isPresentationModePending || !canMutate
              ? disabledToggleClass
              : enabledToggleClass}
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
        {/snippet}
        <span
          >{canMutate
            ? isCoverPresentationMode
              ? m.gallery__set_image_to_fill_mode()
              : m.gallery__set_image_to_fit_mode()
            : m.gallery__wait_for_image_save()}</span
        >
      </SimpleTooltip>
    {/if}

    {#if showReplaceButton}
      <SimpleTooltip withProvider={false}>
        {#snippet trigger()}
          <Button
            text={m.gallery__replace_image()}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={buttonClass}
            disabled={disabled || !canReplace}
            onClick={() => inputEl?.click()}
            iconComponent={ReplaceIcon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/snippet}
        <span
          >{canReplace
            ? m.gallery__replace_image()
            : m.gallery__wait_for_image_save()}</span
        >
      </SimpleTooltip>
    {/if}

    {#if showDeleteButton}
      <SimpleTooltip withProvider={false}>
        {#snippet trigger()}
          <Button
            text={m.forms__delete()}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={buttonClass}
            disabled={disabled || !canDelete}
            onClick={() => {
              void onDelete?.()
            }}
            iconComponent={Trash2Icon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/snippet}
        <span>{canDelete ? m.forms__delete() : m.gallery__wait_for_image_save()}</span>
      </SimpleTooltip>
    {/if}

    {#if showDownloadButton}
      <SimpleTooltip withProvider={false}>
        {#snippet trigger()}
          <Button
            text={m.gallery__download_raw_image()}
            style="transparent"
            modifier="circle"
            hideLabel={true}
            class={buttonClass}
            disabled={disabled || !canDownload}
            onClick={() => onDownload?.()}
            iconComponent={DownloadIcon}
            iconClasses="h-[22px] w-[22px]"
          />
        {/snippet}
        <span
          >{canDownload
            ? m.gallery__download_raw_image()
            : m.gallery__wait_for_image_save()}</span
        >
      </SimpleTooltip>
    {/if}

    {#if onRotateLeft && onRotateRight}
      <div class="flex items-center gap-2">
        <SimpleTooltip withProvider={false}>
          {#snippet trigger()}
            <Button
              text={isEditExpanded
                ? m.gallery__hide_image_edit_controls()
                : m.gallery__show_image_edit_controls()}
              style="transparent"
              modifier="circle"
              hideLabel={true}
              class={editButtonClass}
              disabled={disabled || isEditBusy || !canRotate}
              onClick={() => {
                if (disabled || isEditBusy || !canRotate) return
                isEditExpanded = !isEditExpanded
              }}
              attrs={{ 'aria-expanded': isEditExpanded }}
              iconComponent={isEditBusy ? LoaderCircleIcon : SquarePenIcon}
              iconClasses={isEditBusy ? 'h-5.5 w-5.5 animate-spin' : 'h-5.5 w-5.5'}
            />
          {/snippet}
          <span
            >{canRotate
              ? isEditExpanded
                ? m.gallery__hide_image_edit_controls()
                : m.gallery__show_image_edit_controls()
              : m.gallery__wait_for_image_save()}</span
          >
        </SimpleTooltip>

        <div
          class={cx(
            'flex items-center gap-2 overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out',
            isEditExpanded && canRotate
              ? 'max-w-28 translate-x-0 opacity-100'
              : 'max-w-0 translate-x-2 opacity-0',
          )}
          aria-hidden={!isEditExpanded || !canRotate}
        >
          <SimpleTooltip withProvider={false}>
            {#snippet trigger()}
              <Button
                text={m.gallery__rotate_image_left()}
                style="transparent"
                modifier="circle"
                hideLabel={true}
                disabled={disabled || isEditBusy || !isEditExpanded}
                onClick={() => onRotateLeft?.()}
                iconComponent={RotateCcwIcon}
                iconClasses="h-[22px] w-[22px]"
                class="[--btn-transparent-active-fg:var(--color-white)] [--btn-transparent-fg:var(--color-white)] [--btn-transparent-hover-fg:var(--color-white)] transition-[background-color,color,opacity,transform] duration-200 ease-out"
              />
            {/snippet}
            <span>{m.gallery__rotate_image_left()}</span>
          </SimpleTooltip>

          <SimpleTooltip withProvider={false}>
            {#snippet trigger()}
              <Button
                text={m.gallery__rotate_image_right()}
                style="transparent"
                modifier="circle"
                hideLabel={true}
                disabled={disabled || isEditBusy || !isEditExpanded}
                onClick={() => onRotateRight?.()}
                iconComponent={RotateCwIcon}
                iconClasses="h-[22px] w-[22px]"
                class="[--btn-transparent-active-fg:var(--color-white)] [--btn-transparent-fg:var(--color-white)] [--btn-transparent-hover-fg:var(--color-white)] transition-[background-color,color,opacity,transform] duration-200 ease-out"
              />
            {/snippet}
            <span>{m.gallery__rotate_image_right()}</span>
          </SimpleTooltip>
        </div>
      </div>
    {/if}
  </div>
</TooltipPrimitive.Provider>
