<script lang="ts">
import { draggable, droppable } from '@thisux/sveltednd'
// ICONS
import Trash2 from 'virtual:icons/lucide/trash-2'
// TYPES
import type { FormFieldPropertyValueItemProps } from '../formFieldsSection.types'

let {
  isEditing = false,
  optionRemoveMode = false,
  valueId,
  propertyId,
  onRemove,
  draggableConfig,
  droppableConfig,
  content,
}: FormFieldPropertyValueItemProps = $props()
</script>

<div
  class={`bits-project-field-card__value-item ${!isEditing ? 'bits-project-field-card__value-item--readonly' : ''}`}
  use:draggable={draggableConfig}
  use:droppable={droppableConfig}
>
  {@render content()}

  {#if isEditing && optionRemoveMode}
    <button
      type="button"
      class="bits-project-field-card__value-remove"
      onclick={() => onRemove(propertyId, valueId)}
    >
      <Trash2 />
    </button>
  {/if}
</div>
