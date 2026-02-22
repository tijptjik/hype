<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// I18N
import { m } from '$lib/i18n'
// ICONS
import Eye from 'virtual:icons/lucide/eye'
import EyeOff from 'virtual:icons/lucide/eye-off'
import Pencil from 'virtual:icons/lucide/pencil'
import RotateCcw from 'virtual:icons/lucide/rotate-ccw'
import Save from 'virtual:icons/lucide/save'
import Trash2 from 'virtual:icons/lucide/trash-2'
import Undo2 from 'virtual:icons/lucide/undo-2'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
import X from 'virtual:icons/lucide/x'
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'

let {
  isEditing = false,
  isTainted = false,
  isSubmitting = false,
  hasIssues = false,
  isPublishing = false,
  isDeleting = false,
  isDeleted = false,
  isPublished = false,
  canEdit = true,
  canPublish = true,
  showDeleteAction = true,
  showPublishAction = true,
  hideLabel = false,
  onEditingToggle,
  onReset,
  onSave,
  onDeleteToggle,
  onPublishToggle,
}: HeaderFormActionsProps = $props()

const primaryLabel = $derived(
  !isEditing ? m.forms__edit() : isTainted ? m.forms__reset() : m.cancel(),
)
const deleteLabel = $derived(isDeleted ? m.forms__restore() : m.forms__delete())
const publishLabel = $derived(isPublished ? m.forms__unpublish() : m.forms__publish())
const publishStatusLabel = $derived(
  isPublished ? m.published() : m.forms__unpublished(),
)
const isInFlight = $derived(isSubmitting || isPublishing || isDeleting)
const isPublishBlocked = $derived((isEditing && isTainted) || isInFlight)

function handlePrimaryAction(): void {
  if (!isEditing) {
    onEditingToggle?.(true)
    return
  }

  if (!isTainted) {
    onEditingToggle?.(false)
    return
  }

  onReset?.()
}
</script>

{#snippet primaryIcon()}
  {#if isEditing && isTainted}
    <RotateCcw />
  {:else if isEditing}
    <X />
  {:else}
    <Pencil />
  {/if}
{/snippet}

{#snippet saveIcon()}
  {#if isSubmitting}
    <LoaderCircle class="animate-spin" />
  {:else}
    <Save />
  {/if}
{/snippet}

{#snippet deleteIcon()}
  {#if isDeleting}
    <LoaderCircle class="animate-spin" />
  {:else if isDeleted}
    <Undo2 />
  {:else}
    <Trash2 />
  {/if}
{/snippet}

{#snippet publishIcon()}
  {#if isPublishing}
    <LoaderCircle class="animate-spin" />
  {:else if isPublished}
    <EyeOff />
  {:else}
    <Eye />
  {/if}
{/snippet}

{#snippet publishStatusIcon()}
  {#if isPublished}
    <Eye />
  {:else}
    <EyeOff />
  {/if}
{/snippet}

<div class="bits-pattern-header__form-actions">
  {#if showDeleteAction && isDeleted}
    <Button
      text={deleteLabel}
      color="warning"
      style="ghost"
      icon={deleteIcon}
      {hideLabel}
      disabled={isInFlight}
      onClick={() => onDeleteToggle?.()}
    />
  {:else if isEditing}
    {#if showDeleteAction}
      <Button
        text={deleteLabel}
        color={isDeleted ? 'warning' : 'error'}
        style="ghost"
        icon={deleteIcon}
        {hideLabel}
        disabled={isInFlight}
        onClick={() => onDeleteToggle?.()}
      />
    {/if}

    {#if canEdit}
      <Button
        text={m.forms__save()}
        color="success"
        style="ghost"
        icon={saveIcon}
        {hideLabel}
        disabled={!isTainted || isInFlight || hasIssues}
        onClick={() => onSave?.()}
      />
    {/if}

    {#if canEdit}
      <Button
        text={primaryLabel}
        color="neutral"
        style="ghost"
        icon={primaryIcon}
        class={hideLabel ? '' : 'bits-pattern-header__form-action-primary'}
        {hideLabel}
        disabled={isInFlight}
        onClick={handlePrimaryAction}
      />
    {/if}
  {:else}
    {#if canEdit}
      <Button
        text={primaryLabel}
        color="neutral"
        style="ghost"
        icon={primaryIcon}
        class={hideLabel ? '' : 'bits-pattern-header__form-action-primary'}
        {hideLabel}
        disabled={isInFlight}
        onClick={handlePrimaryAction}
      />
    {/if}
  {/if}

  {#if !isDeleted && showPublishAction}
    {#if canPublish}
      <Button
        text={publishLabel}
        color={isPublished ? 'warning' : 'success'}
        style="ghost"
        icon={publishIcon}
        {hideLabel}
        disabled={isPublishBlocked}
        onClick={() => onPublishToggle?.()}
      />
    {:else}
      <div class="bits-pattern-header__publish-status" aria-live="polite">
        {@render publishStatusIcon()}
        {#if !hideLabel}
          <span class="bits-pattern-header__publish-status-label"
            >{publishStatusLabel}</span
          >
        {/if}
      </div>
    {/if}
  {/if}
</div>
