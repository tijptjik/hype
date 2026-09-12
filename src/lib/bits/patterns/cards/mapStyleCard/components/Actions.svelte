<script lang="ts">
import { Button } from '$lib/bits/core'
import { Card } from '$lib/bits/custom'
import Trash2Icon from 'virtual:icons/proicons/delete'

import type { MapStyleCardActionsProps } from '../mapStyleCard.types'

let {
  isRemoving = false,
  isEditing = true,
  isSubmitting = false,
  onRemove,
  class: className = '',
}: MapStyleCardActionsProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
</script>

<Card.Actions padding="md" class={`bits-map-style-card__actions ${className}`}>
  {#if isRemoving}
    <div class="flex items-center">
      <Button
        text="Clear style"
        style="ghost"
        color="error"
        size="sm"
        iconComponent={Trash2Icon}
        onClick={() => onRemove()}
        disabled={isDisabled}
        class="bits-map-style-card__remove-btn"
      />
    </div>
  {/if}
</Card.Actions>
