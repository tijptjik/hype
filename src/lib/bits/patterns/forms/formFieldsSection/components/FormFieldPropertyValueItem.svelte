<script lang="ts">
// THIRD-PARTY
import { draggable, droppable, dndState } from '@thisux/sveltednd'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
// ICONS
import Trash2 from 'virtual:icons/proicons/delete'
// TYPES
import type { FormFieldPropertyValueItemProps } from '../formFieldsSection.types'

let {
  isEditing = false,
  optionRemoveMode = false,
  isPlaceholder = false,
  hasIssues = false,
  valueId,
  propertyId,
  onRemove,
  draggableConfig,
  droppableConfig,
  content,
  class: className = '',
}: FormFieldPropertyValueItemProps = $props()
</script>

<div
  data-dnd-item
  data-dnd-active={dndState.isDragging}
  style="--bits-dnd-border-width: 1px"
  class={`bits-project-field-card__value-item relative ${!isEditing ? 'bits-project-field-card__value-item--readonly' : ''} ${isPlaceholder ? 'bits-project-field-card__value-item--placeholder' : ''} ${hasIssues ? 'bits-project-field-card__value-item--issue' : ''} ${className}`}
  aria-invalid={hasIssues}
  use:draggable={draggableConfig}
  use:droppable={droppableConfig}
>
  {@render content()}

  {#if isEditing && optionRemoveMode}
    <Button
      text={m.admin__forms_common_remove()}
      hideLabel
      hideLabelInstantly
      style="ghost"
      color="error"
      size="sm"
      modifier="square"
      iconComponent={Trash2}
      class="absolute top-1 right-1 [&_svg]:size-4"
      onClick={() => onRemove(propertyId, valueId)}
    />
  {/if}
</div>
