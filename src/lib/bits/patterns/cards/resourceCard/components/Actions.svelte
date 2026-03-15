<script lang="ts">
import { Button } from '$lib/bits/core'
import { Switch } from '$lib/bits/custom'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import type { ResourceCardActionsProps } from '../resourceCard.types'

let {
  isRemoving = false,
  isEditing = true,
  isSubmitting = false,
  canSetCoreInclusive = false,
  isHubExclusive,
  isCoreInclusive,
  onToggleHubExclusive,
  onToggleCoreInclusive,
  onRemove,
  class: className = '',
}: ResourceCardActionsProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
</script>

<div class={className}>
  {#if isRemoving}
    <div class="bits-form__parent-resource-item-remove">
      <Button
        text="Remove"
        style="ghost"
        color="error"
        size="sm"
        iconComponent={Trash2Icon}
        onClick={() => onRemove()}
        disabled={isDisabled}
        class="bits-form__parent-resource-remove-btn"
      />
    </div>
  {:else}
    <div class="bits-form__parent-resource-item-flags">
      <label class="bits-form__parent-resource-flag">
        <span class="bits-form__parent-resource-flag-label">Hub Only</span>
        <Switch
          checked={isHubExclusive}
          disabled={isDisabled}
          size="sm"
          onCheckedChange={value => onToggleHubExclusive(value === true)}
        />
      </label>

      {#if canSetCoreInclusive}
        <label class="bits-form__parent-resource-flag">
          <span class="bits-form__parent-resource-flag-label">Core</span>
          <Switch
            checked={isCoreInclusive}
            disabled={isDisabled}
            size="sm"
            onCheckedChange={value => onToggleCoreInclusive(value === true)}
          />
        </label>
      {/if}
    </div>
  {/if}
</div>
