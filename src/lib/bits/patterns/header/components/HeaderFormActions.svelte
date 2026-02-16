<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Eye from 'virtual:icons/lucide/eye'
import EyeOff from 'virtual:icons/lucide/eye-off'
import RotateCcw from 'virtual:icons/lucide/rotate-ccw'
import Save from 'virtual:icons/lucide/save'
import Trash2 from 'virtual:icons/lucide/trash-2'
import Undo2 from 'virtual:icons/lucide/undo-2'
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'

let {
  isTainted = false,
  isDeleted = false,
  isPublished = false,
  hideLabel = false,
  onReset,
  onSave,
  onDeleteToggle,
  onPublishToggle,
}: HeaderFormActionsProps = $props()

const deleteLabel = $derived(isDeleted ? 'Restore' : 'Delete')
const publishLabel = $derived(isPublished ? 'Unpublish' : 'Publish')
</script>

{#snippet resetIcon()}
  <RotateCcw />
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
    text="Reset"
    color="neutral"
    style="ghost"
    icon={resetIcon}
    {hideLabel}
    disabled={!isTainted}
    onClick={() => onReset?.()}
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

  <Button
    text={deleteLabel}
    color={isDeleted ? 'warning' : 'error'}
    style="ghost"
    icon={deleteIcon}
    {hideLabel}
    onClick={() => onDeleteToggle?.()}
  />

  <Button
    text={publishLabel}
    color={isPublished ? 'warning' : 'success'}
    style="ghost"
    icon={publishIcon}
    {hideLabel}
    onClick={() => onPublishToggle?.()}
  />
</div>
