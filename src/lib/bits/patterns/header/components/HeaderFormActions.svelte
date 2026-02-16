<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Eye from 'virtual:icons/lucide/eye'
import EyeOff from 'virtual:icons/lucide/eye-off'
import Pencil from 'virtual:icons/lucide/pencil'
import RotateCcw from 'virtual:icons/lucide/rotate-ccw'
import Save from 'virtual:icons/lucide/save'
import Trash2 from 'virtual:icons/lucide/trash-2'
import Undo2 from 'virtual:icons/lucide/undo-2'
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'

let {
  isEditing = false,
  isTainted = false,
  isDeleted = false,
  isPublished = false,
  hideLabel = false,
  onEditingToggle,
  onReset,
  onSave,
  onDeleteToggle,
  onPublishToggle,
}: HeaderFormActionsProps = $props()

const primaryLabel = $derived(!isEditing ? 'Edit' : isTainted ? 'Reset' : 'Cancel')
const deleteLabel = $derived(isDeleted ? 'Restore' : 'Delete')
const publishLabel = $derived(isPublished ? 'Unpublish' : 'Publish')

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
  {#if isDeleted}
    <Undo2 />
  {:else}
    <Trash2 />
  {/if}
{/snippet}

{#snippet publishIcon()}
  {#if isPublished}
    <EyeOff />
  {:else}
    <Eye />
  {/if}
{/snippet}

<div class="bits-pattern-header__form-actions">
  <Button
    text={primaryLabel}
    color="neutral"
    style="ghost"
    icon={primaryIcon}
    {hideLabel}
    onClick={handlePrimaryAction}
  />

  {#if isEditing}
    <Button
      text={deleteLabel}
      color={isDeleted ? 'warning' : 'error'}
      style="ghost"
      icon={deleteIcon}
      {hideLabel}
      onClick={() => onDeleteToggle?.()}
    />

    <Button
      text="Save"
      color="neutral"
      style="ghost"
      icon={saveIcon}
      {hideLabel}
      disabled={!isTainted}
      onClick={() => onSave?.()}
    />
  {/if}

  <Button
    text={publishLabel}
    color={isPublished ? 'warning' : 'success'}
    style="ghost"
    icon={publishIcon}
    {hideLabel}
    onClick={() => onPublishToggle?.()}
  />
</div>
