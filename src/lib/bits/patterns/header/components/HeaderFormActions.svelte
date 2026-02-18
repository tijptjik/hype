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
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'

let {
  isEditing = false,
  isTainted = false,
  isSubmitting = false,
  isPublishing = false,
  isDeleting = false,
  isDeleted = false,
  isPublished = false,
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
  {#if isEditing}
    <RotateCcw />
  {:else}
    <Pencil />
  {/if}
{/snippet}

{#snippet saveIcon()}
  <Save />
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

<div class="bits-pattern-header__form-actions">
  {#if isEditing}
    <Button
      text={isDeleting ? m.forms__pending() : deleteLabel}
      color={isDeleted ? 'warning' : 'error'}
      style="ghost"
      icon={deleteIcon}
      {hideLabel}
      disabled={isDeleting || isSubmitting}
      onClick={() => onDeleteToggle?.()}
    />

    <Button
      text={isSubmitting ? m.forms__pending() : m.forms__save()}
      color="success"
      style="ghost"
      icon={saveIcon}
      {hideLabel}
      disabled={!isTainted || isSubmitting}
      onClick={() => onSave?.()}
    />

    <Button
      text={primaryLabel}
      color="neutral"
      style="ghost"
      icon={primaryIcon}
      class="bits-pattern-header__form-action-primary"
      {hideLabel}
      onClick={handlePrimaryAction}
    />
  {:else}
    <Button
      text={primaryLabel}
      color="neutral"
      style="ghost"
      icon={primaryIcon}
      class="bits-pattern-header__form-action-primary"
      {hideLabel}
      onClick={handlePrimaryAction}
    />
  {/if}

  <Button
    text={publishLabel}
    color={isPublished ? 'warning' : 'success'}
    style="ghost"
    icon={publishIcon}
    {hideLabel}
    disabled={isTainted || isSubmitting}
    onClick={() => onPublishToggle?.()}
  />
</div>
