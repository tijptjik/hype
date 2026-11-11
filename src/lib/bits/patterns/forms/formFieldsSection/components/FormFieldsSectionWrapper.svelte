<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { tick } from 'svelte'
// DRAG AND DROP
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
import { getDropIndex } from '#lib/client/services/dragDrop.js'
import { cubicInOut } from 'svelte/easing'
import { fade, slide } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import EmptyState from '#lib/bits/custom/emptyState/EmptyState.svelte'
import Item from './FormFieldsSectionItem.svelte'
import Loading from './FormFieldsSectionLoading.svelte'
// ICONS
import ListPlus from 'virtual:icons/lucide/list-plus'
// TYPES
import type { FormFieldsSectionWrapperProps } from '../formFieldsSection.types'

let {
  items,
  isLoading = false,
  loadingItems = [],
  issueItemIds,
  isEditing = true,
  canEdit = isEditing,
  disableEmptyAdd = false,
  onAdd,
  card,
  collapsedAll = false,
  collapseAllVersion = 0,
  flipDisabled = false,
  introItemId = null,
  onIntroEnd,
  onCardCollapseToggle,
  onCollapseChange,
  isItemVisible,
}: FormFieldsSectionWrapperProps = $props()

const moveWindowSize = $derived(
  card?.getMoveWindowSize
    ? Math.max(0, Math.min(items.length, card.getMoveWindowSize(items)))
    : items.length,
)
const dragId = $props.id()
const dragGroup = `property-fields-${dragId}`
let isReordering = $state(false)

/** Locate the active insertion gap without changing the target property's appearance.
 * @param propertyId Definition owning the padded drop zone.
 * @returns The active insertion side, or null for other rows and the drag source.
 */
function fieldDropPosition(propertyId: string): 'before' | 'after' | null {
  const container = `${dragGroup}-${propertyId}`
  return dndState.isDragging &&
    dndState.sourceContainerGroup === dragGroup &&
    dndState.sourceContainer !== container &&
    dndState.targetContainer === container
    ? dndState.dropPosition
    : null
}

/**
 * Respect the editable rank window and inherited-field locks for drag targets.
 * @param index Index in the displayed field list.
 * @returns Whether this position can participate in a reorder.
 */
function canReorder(index: number): boolean {
  return Boolean(
    isEditing &&
      canEdit &&
      card &&
      !card.removeMode &&
      index >= 0 &&
      index < moveWindowSize &&
      !card.isMoveLocked?.(items[index]),
  )
}

/**
 * Prevent keyboard reorders from crossing the same boundaries as pointer drops.
 * @param event Captured key event from a field handle.
 * @param index Current field position.
 * @returns Nothing; suppresses invalid rank commands.
 */
function guardReorderKey(event: KeyboardEvent, index: number): void {
  if (
    !event.altKey ||
    !(event.target instanceof Element) ||
    !event.target.closest('[data-property-drag-handle]')
  )
    return
  const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (
    direction &&
    (isReordering || !canReorder(index) || !canReorder(index + direction))
  ) {
    event.preventDefault()
    event.stopPropagation()
  }
}

/**
 * Apply a same-list drop through the existing rank callbacks.
 * @param state Drag state, including the insertion edge.
 * @param targetId Target definition ID.
 * @returns Resolves after every rank step has updated the form.
 */
async function onFieldDrop(state: DragDropState, targetId: string): Promise<void> {
  if (isReordering || !card) return
  const dragged = state.draggedItem
  if (
    !dragged ||
    typeof dragged !== 'object' ||
    !('id' in dragged) ||
    typeof dragged.id !== 'string'
  )
    return
  const ids = items.map(item => item.id)
  const nextIndex = getDropIndex(state, ids, targetId, dragGroup)
  const fromIndex = ids.indexOf(dragged.id)
  const targetIndex = ids.indexOf(targetId)
  if (nextIndex === null || !canReorder(fromIndex) || !canReorder(targetIndex)) return
  // Never cross a locked or inherited boundary while moving between positions.
  for (
    let i = Math.min(fromIndex, nextIndex);
    i <= Math.max(fromIndex, nextIndex);
    i++
  ) {
    if (!canReorder(i)) return
  }
  const move = nextIndex < fromIndex ? card.onIncreaseRank : card.onDecreaseRank
  isReordering = true
  try {
    onCardCollapseToggle?.()
    for (let i = 0; i < Math.abs(nextIndex - fromIndex); i++) {
      await move(new Event('reorder'), dragged.id)
      await tick()
    }
  } finally {
    isReordering = false
  }
}
</script>

<!-- Keep outgoing and incoming states in the same cell while their fades overlap. -->
<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] items-start">
  {#if isLoading}
    <section
      class="bits-theme bits-form__section col-start-1 row-start-1 min-h-64 min-w-0"
      role="status"
      aria-live="polite"
      aria-busy="true"
      in:fade={{ duration: 140 }}
      out:fade={{ duration: 120 }}
    >
      <Loading
        items={loadingItems}
        locales={card?.locales}
        multilingual={card?.multilingual}
        visibleLocales={card?.visibleLocales}
      />
    </section>
  {:else if items.length === 0}
    <div
      class="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col self-stretch"
      role="status"
      aria-live="polite"
      in:fade={{ duration: 140 }}
      out:fade={{ duration: 120 }}
    >
      <EmptyState
        title={m.admin__forms_project_fields_empty_title()}
        description={m.admin__forms_project_fields_empty_description()}
        class="bits-theme bits-form__section bits-project-fields__empty"
        titleClass="bits-project-fields__empty-title"
        descriptionClass="bits-project-fields__empty-description"
        actions={canEdit ? emptyActions : undefined}
      />
      {#snippet emptyActions()}
        <Button
          text={m.fun_away_bird_peek()}
          color="primary"
          iconComponent={ListPlus}
          disabled={disableEmptyAdd || !onAdd}
          onClick={event => onAdd?.(event)}
          class="bits-project-fields__empty-add-btn"
        />
      {/snippet}
    </div>
  {:else}
    <div
      class="col-start-1 row-start-1 flex min-w-0 flex-col"
      in:fade={{ duration: 160 }}
      out:fade={{ duration: 120 }}
    >
      {#each items as property, index (property.id)}
        {@const itemVisible = isItemVisible ? isItemVisible(property) : true}
        {@const dropPosition = fieldDropPosition(property.id)}
        <div
          class={`relative py-1.5 before:hidden! after:hidden! ${itemVisible ? '' : 'hidden'}`}
          data-property-drop-zone={property.id}
          data-dnd-active={dndState.isDragging &&
            dndState.sourceContainerGroup === dragGroup}
          animate:flip={{ duration: flipDisabled ? 0 : 220, easing: cubicInOut }}
          in:slide={{
            axis: 'y',
            duration: introItemId === property.id ? 180 : 0,
          }}
          onintroend={() => {
            if (introItemId !== property.id) return
            onIntroEnd?.(property.id)
          }}
          onkeydowncapture={event => guardReorderKey(event, index)}
          id={`property-wrapper-${property.id}`}
          use:draggable={{
            container: `${dragGroup}-${property.id}`,
            containerGroup: dragGroup,
            dragData: { id: property.id },
            handle: '[data-property-drag-handle]',
            disabled: !canReorder(index) || isReordering,
            attributes: { draggingClass: 'opacity-50' },
          }}
          use:droppable={{
            container: `${dragGroup}-${property.id}`,
            containerGroup: dragGroup,
            disabled: !canReorder(index) || isReordering,
            callbacks: { onDrop: state => onFieldDrop(state, property.id) },
            attributes: { dragOverClass: 'outline-none' },
          }}
        >
          <Item
            {property}
            {index}
            totalItems={items.length}
            {moveWindowSize}
            isMoveLocked={card?.isMoveLocked?.(property) ?? false}
            keepExpandedOnIntro={introItemId === property.id}
            {issueItemIds}
            {card}
            {collapsedAll}
            {collapseAllVersion}
            {onCardCollapseToggle}
            {onCollapseChange}
          />
          {#if dropPosition}
            <!-- A shared boundary is the exact centre of the 12px space between cards. -->
            <div
              data-property-drop-indicator={dropPosition}
              aria-hidden="true"
              class={`bg-primary pointer-events-none absolute inset-x-0 z-20 h-0.5 rounded-full ${dropPosition === 'before' ? '-top-px' : '-bottom-px'}`}
            ></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
