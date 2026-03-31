<script lang="ts">
import { SimpleTooltip } from '$lib/bits/core'
import { Card, SectionHeader, Switch } from '$lib/bits/custom'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import { m } from '$lib/i18n'
import EyeIcon from 'virtual:icons/lucide/eye'
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

let draggedLayerId = $state<string | null>(null)

const isDisabled = $derived(!isEditing || isSubmitting)

function handleDragStart(layerId: string): void {
  if (isDisabled) return
  draggedLayerId = layerId
}

function handleDragEnd(): void {
  draggedLayerId = null
}

function handleDrop(targetLayerId: string): void {
  if (isDisabled || !draggedLayerId || draggedLayerId === targetLayerId) return
  onMove(draggedLayerId, targetLayerId)
  draggedLayerId = null
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

  <div class="flex min-h-0 w-2xl flex-col gap-3">
    {#each items as item (item.id)}
      <div
        class="cursor-grab"
        class:opacity-55={draggedLayerId === item.id}
        draggable={!isDisabled}
        ondragstart={() => handleDragStart(item.id)}
        ondragend={handleDragEnd}
        ondragover={event => event.preventDefault()}
        ondrop={() => handleDrop(item.id)}
      >
        <ResourceCard.Root isDraggable={!isDisabled} reserveDragSpace={true}>
          <ResourceCard.Body code={item.projectNameShort} name={item.layerName} />
          <Card.Actions
            padding="md"
            bg="panel"
            class="bits-form__parent-resource-actions-rail"
          >
            <div class="bits-form__parent-resource-actions">
              <SimpleTooltip>
                {#snippet trigger()}
                  <label class="bits-form__parent-resource-default">
                    <span class="bits-form__parent-resource-default-icon">
                      <EyeIcon />
                    </span>
                    <span class="bits-form__parent-resource-default-label"
                      >{m.default_enabled()}</span
                    >
                    <Switch
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
