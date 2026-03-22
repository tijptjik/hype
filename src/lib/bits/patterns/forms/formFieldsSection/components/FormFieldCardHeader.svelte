<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronUp from 'virtual:icons/lucide/chevron-up'
import CopyCheck from 'virtual:icons/lucide/copy-check'
import Languages from 'virtual:icons/lucide/languages'
import Plus from 'virtual:icons/lucide/plus'
import Trash2 from 'virtual:icons/lucide/trash-2'
// COMPONENTS
import { Button, DestructiveDialog, SimpleTooltip } from '$lib/bits/core'
import Switch from '$lib/bits/custom/switch/Switch.svelte'
// TYPES
import type { Id } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Component } from 'svelte'

let {
  property,
  presentation = 'full',
  titleHref = null,
  sourceTag = null,
  sectionRank = 0,
  moveWindowSize,
  isMoveLocked = false,
  totalItems,
  isEditing = true,
  removeMode,
  collapsed = false,
  onIncreaseRank,
  onDecreaseRank,
  onRemove,
  onToggleCollapse,
  onToggleIsEnabled,
  onToggleIsTranslatable,
  onToggleIsDefaultEnabled,
}: {
  property: Property
  presentation?: 'full' | 'header'
  titleHref?: string | null
  sourceTag?: {
    label?: string
    title?: string
    tone: 'global' | 'hub' | 'org' | 'project'
    iconComponent?: Component
  } | null
  sectionRank?: number
  moveWindowSize?: number
  isMoveLocked?: boolean
  totalItems: number
  isEditing?: boolean
  removeMode: boolean
  collapsed?: boolean
  onIncreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onDecreaseRank: (event: Event, propertyId: Id) => void | Promise<void>
  onRemove: (event: Event, propertyId: Id) => void | Promise<void>
  onToggleCollapse: () => void
  onToggleIsEnabled: (propertyId: Id, value: boolean) => void
  onToggleIsTranslatable: (propertyId: Id, value: boolean) => void
  onToggleIsDefaultEnabled: (propertyId: Id, value: boolean) => void
} = $props()

const resolvedMoveWindowSize = $derived(
  typeof moveWindowSize === 'number' ? moveWindowSize : totalItems,
)
const isRankMoveLocked = $derived(
  isMoveLocked || sectionRank >= Math.max(0, resolvedMoveWindowSize),
)
const canIncreaseRank = $derived(!isRankMoveLocked && sectionRank > 0)
const canDecreaseRank = $derived(
  !isRankMoveLocked && sectionRank < Math.max(0, resolvedMoveWindowSize) - 1,
)
const isProjectScopedCard = $derived(property.scope === 'project')
const isInheritedHeaderCard = $derived(
  !isProjectScopedCard && presentation === 'header',
)
const showTranslatableToggle = $derived(
  presentation === 'full' &&
    (property.type === 'specifier' || property.type === 'classifier') &&
    property.component !== 'RangeField' &&
    property.component !== 'ToggleField',
)
const inheritedEnabled = $derived(
  typeof (property as Property & { isEnabled?: boolean }).isEnabled === 'boolean'
    ? Boolean((property as Property & { isEnabled?: boolean }).isEnabled)
    : Boolean(property.isDefaultEnabled),
)
const showDefaultEnabledToggle = $derived(
  presentation === 'full' || (isInheritedHeaderCard && inheritedEnabled),
)
const showAddToProjectAction = $derived(isInheritedHeaderCard && !inheritedEnabled)
const showHeaderActionOverlay = $derived(removeMode || showAddToProjectAction)
const canCollapse = $derived(presentation === 'full')
const translatableHint = $derived(m.admin__forms_property_support_localisation())
const defaultEnabledHint = $derived(
  isProjectScopedCard
    ? m.admin__forms_property_default_enabled_in_layers()
    : m.admin__forms_property_default_enabled_in_projects(),
)
const canShowRemoveAction = $derived(
  presentation === 'full' || (isInheritedHeaderCard && inheritedEnabled),
)
const sourceTagLabelClass = $derived(
  [
    'bits-project-field-card__source-tag',
    `bits-project-field-card__source-tag--${sourceTag?.tone ?? 'project'}`,
  ]
    .filter(Boolean)
    .join(' '),
)
const sourceTagIconClass = $derived(
  [
    'bits-project-field-card__source-icon-wrap',
    `bits-project-field-card__source-icon-wrap--${sourceTag?.tone ?? 'project'}`,
  ]
    .filter(Boolean)
    .join(' '),
)
let isDeleteConfirmOpen = $state(false)

function openDeleteConfirm(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  isDeleteConfirmOpen = true
}

async function handleDeleteConfirm(event: MouseEvent): Promise<void> {
  await onRemove(event, property.id)
}

function handleAddToProject(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  onToggleIsEnabled(property.id, true)
}
</script>

<header
  class="bits-project-field-card__header bits-form__i18n-card border-glass-100 py-4"
>
  <div class="bits-project-field-card__header-left-rail">
    {#if sourceTag}
      {#if sourceTag.iconComponent}
        <SimpleTooltip disabled={!sourceTag.title}>
          {#snippet trigger()}
            <span class={sourceTagIconClass} aria-label={sourceTag.title}>
              <sourceTag.iconComponent class="bits-project-field-card__source-icon" />
            </span>
          {/snippet}
          {sourceTag.title}
        </SimpleTooltip>
      {/if}
      {#if sourceTag.label}
        <SimpleTooltip disabled={!sourceTag.title}>
          {#snippet trigger()}
            <span class={sourceTagLabelClass} aria-label={sourceTag.title}>
              {sourceTag.label}
            </span>
          {/snippet}
          {sourceTag.title}
        </SimpleTooltip>
      {/if}
    {/if}
  </div>

  <div class="bits-project-field-card__title-wrap">
    {#if canCollapse}
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
    {:else}
      <div
        class="bits-project-field-card__title-pill bits-project-field-card__title-pill--static"
      >
        {#if titleHref}
          <a href={titleHref} class="bits-project-field-card__title-link">
            <h3 class="bits-project-field-card__title">
              {property.i18n?.en?.label || property.key || m.admin__forms_property_untitled()}
            </h3>
          </a>
        {:else}
          <h3 class="bits-project-field-card__title">
            {property.i18n?.en?.label || property.key || m.admin__forms_property_untitled()}
          </h3>
        {/if}
      </div>
    {/if}
  </div>

  <div class="bits-project-field-card__header-right-rail pr-2">
    {#if showTranslatableToggle}
      <div
        class="bits-project-field-card__toggle bits-project-field-card__toggle--inline"
        aria-label={m.admin__forms_property_translatable()}
        transition:fade={{ duration: 180 }}
      >
        <SimpleTooltip disabled={!translatableHint}>
          {#snippet trigger()}
            <span aria-label={translatableHint}>
              <Languages
                class="bits-project-field-card__toggle-icon"
                aria-hidden="true"
              />
            </span>
          {/snippet}
          {translatableHint}
        </SimpleTooltip>
        <Switch
          checked={Boolean(property.isTranslatable)}
          disabled={!isEditing}
          color="light"
          size="sm"
          onCheckedChange={nextValue =>
              onToggleIsTranslatable(property.id, Boolean(nextValue))}
        />
      </div>
    {/if}
    {#if showDefaultEnabledToggle}
      <div
        class="bits-project-field-card__toggle bits-project-field-card__toggle--inline"
        aria-label={m.default_enabled()}
        transition:fade={{ duration: 180 }}
      >
        <SimpleTooltip disabled={!defaultEnabledHint}>
          {#snippet trigger()}
            <span aria-label={defaultEnabledHint}>
              <CopyCheck
                class="bits-project-field-card__toggle-icon"
                aria-hidden="true"
              />
            </span>
          {/snippet}
          {defaultEnabledHint}
        </SimpleTooltip>
        <Switch
          checked={Boolean(property.isDefaultEnabled)}
          disabled={!isEditing}
          color="light"
          size="sm"
          onCheckedChange={nextValue =>
            onToggleIsDefaultEnabled(property.id, Boolean(nextValue))}
        />
      </div>
    {/if}
    {#if isEditing}
      <div
        class="bits-project-field-card__header-actions-shell bits-project-field-card__header-actions-shell--visible"
      >
        <div class="bits-project-field-card__header-actions pr-2">
          <div
            class={`bits-project-field-card__header-actions-rank ${showHeaderActionOverlay ? 'bits-project-field-card__header-actions-rank--hidden' : ''}`}
          >
            <Button
              text={m.admin__forms_common_move_up()}
              hideLabel={true}
              modifier="square"
              size="sm"
              style="ghost"
              color="light"
              iconComponent={ChevronUp}
              disabled={showHeaderActionOverlay || !canIncreaseRank}
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
              disabled={showHeaderActionOverlay || !canDecreaseRank}
              onClick={event => onDecreaseRank(event, property.id)}
              class="bits-project-field-card__icon-btn"
            />
          </div>
          <div
            class={`bits-project-field-card__header-actions-remove-overlay ${showHeaderActionOverlay ? 'bits-project-field-card__header-actions-remove-overlay--active' : ''}`}
          >
            {#if showAddToProjectAction}
              <Button
                text={m.admin__forms_property_add_to_project()}
                hideLabel={true}
                style="ghost"
                modifier="circle"
                color="success"
                iconComponent={Plus}
                onClick={handleAddToProject}
                class="bits-project-field-card__icon-btn bits-project-field-card__icon-btn--round"
              />
            {:else if canShowRemoveAction}
              <Button
                text={m.admin__forms_common_remove()}
                hideLabel={true}
                style="ghost"
                modifier="circle"
                color="dark"
                iconComponent={Trash2}
                onClick={openDeleteConfirm}
                class="bits-project-field-card__icon-btn bits-project-field-card__icon-btn--round"
              />
            {:else}
              <span
                class="bits-project-field-card__icon-btn bits-project-field-card__icon-btn--placeholder"
                aria-hidden="true"
              ></span>
            {/if}
          </div>
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
