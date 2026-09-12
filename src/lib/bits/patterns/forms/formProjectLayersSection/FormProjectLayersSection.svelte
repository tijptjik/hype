<script lang="ts">
// THIRD-PARTY
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
import EyeIcon from 'virtual:icons/lucide/eye'

// SERVICES
import { getDropIndex } from '$lib/client/services/dragDrop'

// BITS COMPONENTS
import { SimpleTooltip } from '$lib/bits/core'
import { Card, SectionHeader, Switch } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'

// I18N
import { m } from '$lib/i18n'

// TYPES
import type { FormProjectLayersSectionProps } from './formProjectLayersSection.types'

let {
  title,
  subtitle,
  issues = [],
  items,
  isEditing = true,
  isSubmitting = false,
  onToggleDefault,
  onMove,
  class: className = '',
}: FormProjectLayersSectionProps = $props()

const instanceId = $props.id()
const container = `project-layers-${instanceId}`
const isDisabled = $derived(!isEditing || isSubmitting)

/**
 * Move an existing layer within this section after a valid drop.
 * @param state - The library's current drag state.
 * @param targetLayerId - The layer receiving the drop.
 * @returns Nothing.
 */
function handleDrop(state: DragDropState, targetLayerId: string): void {
  if (isDisabled) return
  const ids = items.map(item => item.id)
  const destination = getDropIndex(state, ids, targetLayerId, container)
  if (destination === null) return
  const item = state.draggedItem
  if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
    onMove(item.id, ids[destination])
  }
}
</script>

<section class={`bits-form__section flex min-h-0 flex-col gap-4 ${className}`}>
  <SectionHeader {title} description={subtitle} />

  {#if issues.length > 0}
    <div
      class="flex flex-col gap-1.5 rounded-[0.875rem] border border-[color:color-mix(in_oklab,var(--color-error)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-error)_12%,transparent)] px-4 py-3.5"
      role="alert"
    >
      {#each issues as issue (issue)}
        <p
          class="text-sm leading-[1.4] text-[var(--color-error-content,var(--color-base-content))]"
        >
          {issue}
        </p>
      {/each}
    </div>
  {/if}

  <div
    class="flex min-h-0 w-2xl flex-col [--bits-dnd-gap:0.75rem] gap-[var(--bits-dnd-gap)]"
  >
    {#each items as item (item.id)}
      <div
        data-dnd-item
        data-dnd-active={dndState.isDragging}
        class:cursor-grab={!isDisabled}
        use:draggable={{
          container: `${container}-${item.id}`,
          containerGroup: container,
          dragData: { id: item.id },
          disabled: isDisabled,
          interactive: ['button', 'input', 'label'],
          attributes: { draggingClass: 'opacity-55' },
        }}
        use:droppable={{
          container: `${container}-${item.id}`,
          containerGroup: container,
          disabled: isDisabled,
          callbacks: { onDrop: state => handleDrop(state, item.id) },
        }}
      >
        <ResourceCard.Root isDraggable={!isDisabled} reserveDragSpace={true}>
          <ResourceCard.Body code={item.projectNameShort} name={item.layerName} />
          <Card.Actions
            padding="md"
            bg="panel"
            class="bits-form__parent-resource-actions-rail"
          >
            <div class="bits-form__parent-resource-actions">
              <SimpleTooltip disabled={dndState.isDragging}>
                {#snippet trigger()}
                  <label
                    for={`${instanceId}-${item.id}-visible`}
                    class="bits-form__parent-resource-default"
                  >
                    <span class="bits-form__parent-resource-default-icon">
                      <EyeIcon />
                    </span>
                    <span class="bits-form__parent-resource-default-label"
                      >{m.default_enabled()}</span
                    >
                    <Switch
                      id={`${instanceId}-${item.id}-visible`}
                      checked={item.isDefaultVisible}
                      disabled={isDisabled}
                      size="sm"
                      onCheckedChange={value => onToggleDefault(item.id, value === true)}
                    />
                  </label>
                {/snippet}
                {m.admin__forms_layer_visible_by_default()}
              </SimpleTooltip>
            </div>
          </Card.Actions>
        </ResourceCard.Root>
      </div>
    {/each}
  </div>
</section>
