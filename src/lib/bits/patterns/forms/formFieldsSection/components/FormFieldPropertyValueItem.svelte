<script lang="ts">
// THIRD-PARTY
import { draggable, dndState } from '@thisux/sveltednd'
// DRAG PREVIEW
import { optionDragPreview } from './optionDragPreview.js'
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
const isDragSource = $derived(
  dndState.isDragging && dndState.sourceContainer === draggableConfig.container,
)
const dropPosition = $derived(
  dndState.isDragging &&
    !isDragSource &&
    dndState.sourceContainerGroup === droppableConfig.containerGroup &&
    dndState.targetContainer === droppableConfig.container
    ? dndState.dropPosition
    : null,
)
</script>

<div
  data-dnd-item
  data-dnd-active={dndState.isDragging}
  data-option-drag-source={isDragSource}
  data-option-drop-position={dropPosition ?? undefined}
  class={`bits-project-field-card__value-item group/option relative ${!isEditing ? 'bits-project-field-card__value-item--readonly' : ''} ${isPlaceholder ? 'bits-project-field-card__value-item--placeholder' : ''} ${hasIssues ? 'bits-project-field-card__value-item--issue' : ''} ${className}`}
  aria-invalid={hasIssues}
  use:draggable={draggableConfig}
  use:optionDragPreview={{ config: draggableConfig, active: isDragSource }}
>
  {@render content()}
  {#if dropPosition}
    <div
      data-option-drop-indicator={dropPosition}
      aria-hidden="true"
      class="bg-primary pointer-events-none absolute z-20 rounded-full"
    ></div>
  {/if}

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
