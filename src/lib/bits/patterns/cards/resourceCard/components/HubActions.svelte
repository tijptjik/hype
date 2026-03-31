<script lang="ts">
import { Button } from '$lib/bits/core'
import { Card, Switch } from '$lib/bits/custom'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import type { ResourceCardHubActionsProps } from '../resourceCard.types'

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
}: ResourceCardHubActionsProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
const hasRemoveAction = $derived(typeof onRemove === 'function')
const slotClass = $derived(
  [
    'bits-form__resource-card-hub-actions-slot',
    isRemoving && hasRemoveAction
      ? 'bits-form__resource-card-hub-actions-slot--remove'
      : 'bits-form__resource-card-hub-actions-slot--controls',
  ].join(' '),
)
</script>

<Card.Actions gap={4} class={`bits-form__resource-card-hub-actions ${className}`}>
  <div class={slotClass}>
    {#if hasRemoveAction}
      <div
        class="bits-form__resource-card-hub-actions-slot-content bits-form__resource-card-hub-actions-slot-content--remove"
        aria-hidden={!isRemoving}
      >
        <Button
          text="Remove"
          style="ghost"
          color="error"
          size="md"
          iconComponent={Trash2Icon}
          hideLabel={true}
          onClick={() => onRemove?.()}
          disabled={isDisabled}
        />
      </div>
    {/if}

    <div
      class="bits-form__resource-card-hub-actions-slot-content bits-form__resource-card-hub-actions-slot-content--controls"
      aria-hidden={isRemoving && hasRemoveAction}
    >
      <div class="bits-form__resource-card-hub-actions-controls">
        <Switch
          topText="Hub Only"
          checked={isHubExclusive}
          disabled={isDisabled}
          size="sm"
          onCheckedChange={value => onToggleHubExclusive(value === true)}
        />

        {#if canSetCoreInclusive}
          <Switch
            topText="Core"
            checked={isCoreInclusive}
            disabled={isDisabled}
            size="sm"
            onCheckedChange={value => onToggleCoreInclusive(value === true)}
          />
        {/if}
      </div>
    </div>
  </div>
</Card.Actions>
