<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronUp from 'virtual:icons/lucide/chevron-up'
import Languages from 'virtual:icons/lucide/languages'
import Trash2 from 'virtual:icons/lucide/trash-2'
// COMPONENTS
import { Button, DestructiveDialog } from '$lib/bits/core'
import Switch from '$lib/bits/custom/switch/Switch.svelte'
// TYPES
import type { Id, Property } from '$lib/types'

let {
  property,
  totalItems,
  isEditing = true,
  removeMode,
  collapsed = false,
  onIncreaseRank,
  onDecreaseRank,
  onRemove,
  onToggleCollapse,
  onToggleIsTranslatable,
}: {
  property: Property
  totalItems: number
  isEditing?: boolean
  removeMode: boolean
  collapsed?: boolean
  onIncreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onDecreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onRemove: (event: Event, propertyId: Id) => void | Promise<void>
  onToggleCollapse: () => void
  onToggleIsTranslatable: (propertyId: Id, value: boolean) => void
} = $props()

const canIncreaseRank = $derived(property.rank > 0)
const canDecreaseRank = $derived(property.rank < totalItems - 1)
let isDeleteConfirmOpen = $state(false)

function openDeleteConfirm(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  isDeleteConfirmOpen = true
}

async function handleDeleteConfirm(event: MouseEvent): Promise<void> {
  await onRemove(event, property.id)
}
</script>

<header class="bits-project-field-card__header">
  <div class="bits-project-field-card__title-wrap">
    <div class="bits-project-field-card__title-row">
      <button
        type="button"
        class="bits-project-field-card__title-pill"
        onclick={onToggleCollapse}
      >
        <h3 class="bits-project-field-card__title">
          {property.i18n?.en?.label || property.key || m.admin__forms_property_untitled()}
        </h3>
        <ChevronDown
          class={`bits-project-field-card__collapse-icon ${collapsed ? 'bits-project-field-card__collapse-icon--collapsed' : ''}`}
        />
      </button>
      {#if property.type === 'specifier'}
        <div
          class="bits-project-field-card__toggle bits-project-field-card__toggle--inline"
          aria-label={m.admin__forms_property_translatable()}
          transition:fade={{ duration: 180 }}
        >
          <Languages class="bits-project-field-card__toggle-icon" />
          <Switch
            checked={Boolean(property.isTranslatable)}
            disabled={!isEditing}
            onCheckedChange={nextValue =>
                onToggleIsTranslatable(property.id, Boolean(nextValue))}
          />
        </div>
      {/if}
      {#if isEditing && removeMode}
        <div transition:fade={{ duration: 180 }}>
          <Button
            text={m.admin__forms_common_remove()}
            hideLabel={true}
            style="ghost"
            modifier="square"
            color="dark"
            iconComponent={Trash2}
            onClick={openDeleteConfirm}
            class="bits-project-field-card__icon-btn"
          />
        </div>
      {/if}
    </div>
  </div>

  <div class="bits-project-field-card__header-right-rail pr-2">
    {#if isEditing}
      <div
        class="bits-project-field-card__header-actions-shell bits-project-field-card__header-actions-shell--visible"
        transition:fade={{ duration: 180 }}
      >
        <div class="bits-project-field-card__header-actions pr-2">
          <Button
            text={m.admin__forms_common_move_up()}
            hideLabel={true}
            modifier="square"
            size="sm"
            style="ghost"
            color="light"
            iconComponent={ChevronUp}
            disabled={!canIncreaseRank}
            onClick={event => onIncreaseRank(event, property.id)}
            class="bits-project-field-card__icon-btn"
          />
          <Button
            text={m.admin__forms_common_move_down()}
            hideLabel={true}
            modifier="square"
            size="sm"
            style="ghost"
            color="light"
            iconComponent={ChevronDown}
            disabled={!canDecreaseRank}
            onClick={event => onDecreaseRank(event, property.id)}
            class="bits-project-field-card__icon-btn"
          />
        </div>
      </div>
    {/if}
  </div>
</header>

{#snippet confirmTitle()}
  {m.red_formal_jackal_mix()}
{/snippet}

{#snippet confirmDescription()}
  {m.warm_calm_badger_bask()}
{/snippet}

<DestructiveDialog
  bind:open={isDeleteConfirmOpen}
  title={confirmTitle}
  description={confirmDescription}
  onConfirm={handleDeleteConfirm}
/>
