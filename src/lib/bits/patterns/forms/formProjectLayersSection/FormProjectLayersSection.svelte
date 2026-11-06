<script lang="ts">
// THIRD-PARTY
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
import EyeIcon from 'virtual:icons/proicons/eye'
import LayersIcon from 'virtual:icons/proicons/layers'

// SERVICES
import { getDropIndex } from '#lib/client/services/dragDrop.js'

// BITS COMPONENTS
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { Card, SectionHeader, Switch } from '#lib/bits/custom/index.js'
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'

// I18N
import { m } from '#lib/i18n.js'

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
  <SectionHeader icon={LayersIcon} {title} description={subtitle} />

  {#if issues.length > 0}
    <div
      class="border-error/40 bg-error/10 mx-6 flex flex-col gap-1.5 rounded-lg border px-4 py-3.5"
      role="alert"
    >
      {#each issues as issue (issue)}
        <p class="text-foreground text-sm leading-5 font-medium">
          {issue}
        </p>
      {/each}
    </div>
  {/if}

  <!-- Each row owns half of the visible gap so dropping on the line remains hittable. -->
  <div
    class="mx-6 flex min-h-0 w-auto min-w-0 flex-col gap-0! py-1.5 [--bits-dnd-gap:0px]"
  >
    {#each items as item (item.id)}
      <div
        data-dnd-item
        data-dnd-active={dndState.isDragging}
        class="before:bg-foreground! after:bg-foreground! relative py-1.5 before:top-0! after:bottom-0!"
        class:cursor-grab={!isDisabled}
        use:draggable={{
          container: `${container}-${item.id}`,
          containerGroup: container,
          dragData: { id: item.id },
          disabled: isDisabled,
          handle: '.bits-card__drag-handle',
          interactive: ['a', 'button', 'input', 'label'],
          attributes: { draggingClass: 'opacity-55' },
        }}
        use:droppable={{
          container: `${container}-${item.id}`,
          containerGroup: container,
          disabled: isDisabled,
          callbacks: { onDrop: state => handleDrop(state, item.id) },
        }}
      >
        <!-- Raise the grip above the full-width layer link so it receives pointer input. -->
        <ResourceCard.Root
          isDraggable={!isDisabled}
          reserveDragSpace={true}
          class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden [&>span]:z-3 [&>span]:cursor-grab [&>span]:active:cursor-grabbing"
        >
          <!-- biome-ignore lint/a11y/useAnchorContent: ResourceCard.Body renders the layer name and the link has an explicit accessible label. -->
          <a
            href={`/admin/layers/${encodeURIComponent(item.id)}`}
            aria-label={item.layerName}
            class="focus-visible:outline-primary flex min-w-0 flex-1 items-center rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ResourceCard.Body code={item.projectNameShort} name={item.layerName} />
          </a>
          <Card.Actions
            padding="md"
            bg="none"
            class="bits-form__parent-resource-actions-rail border-border/60 w-auto! min-w-0! border-l"
          >
            <div class="bits-form__parent-resource-actions">
              <SimpleTooltip disabled={dndState.isDragging}>
                {#snippet trigger()}
                  <label
                    for={`${instanceId}-${item.id}-visible`}
                    class="bits-form__parent-resource-default"
                  >
                    <span
                      class="bits-form__parent-resource-default-icon [&_svg]:size-4"
                    >
                      <EyeIcon />
                    </span>
                    <span
                      class="bits-form__parent-resource-default-label sr-only sm:not-sr-only"
                      >{m.default_enabled()}</span
                    >
                    <Switch
                      id={`${instanceId}-${item.id}-visible`}
                      checked={item.isDefaultVisible}
                      disabled={isDisabled}
                      size="sm"
                      onCheckedChange={value =>
                        onToggleDefault(item.id, value === true)}
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
