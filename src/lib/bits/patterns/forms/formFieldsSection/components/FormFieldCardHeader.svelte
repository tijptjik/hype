<script lang="ts">
// SVELTE
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import GripVertical from 'virtual:icons/lucide/grip-vertical'
import CopyCheck from 'virtual:icons/lucide/copy-check'
import Plus from 'virtual:icons/proicons/add'
import Trash2 from 'virtual:icons/proicons/delete'
// COMPONENTS
import { Button, DestructiveDialog, SimpleTooltip } from '#lib/bits/core/index.js'
// TYPES
import type { Id } from '#lib/types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
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
const defaultEnabledHint = $derived(
  // Inherited header cards edit project defaults for layers, regardless of origin.
  isProjectScopedCard || isInheritedHeaderCard
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
// Equal side tracks keep the title centred even when only one rail has content.
let leftRailWidth = $state(0)
let rightRailWidth = $state(0)
const sideRailWidth = $derived(Math.max(leftRailWidth, rightRailWidth))

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
/**
 * Keep rank changes accessible without exposing separate arrow controls.
 * @param event Keyboard event from the drag handle.
 * @returns Nothing; invokes the existing guarded rank action.
 */
function onReorderKey(event: KeyboardEvent): void {
  if (!event.altKey || !isEditing || showHeaderActionOverlay) return
  if (event.key === 'ArrowUp' && canIncreaseRank) {
    event.preventDefault()
    void onIncreaseRank(event, property.id)
  } else if (event.key === 'ArrowDown' && canDecreaseRank) {
    event.preventDefault()
    void onDecreaseRank(event, property.id)
  }
}
</script>

<header
  style:grid-template-columns={`${sideRailWidth}px minmax(0, 1fr) ${sideRailWidth}px`}
  class="bits-project-field-card__header bits-form__i18n-card border-glass-100 grid! items-center gap-2 px-3! py-2!"
>
  <div
    bind:clientWidth={leftRailWidth}
    class="bits-project-field-card__header-left-rail static! w-max transform-none! justify-self-start"
  >
    {#if isEditing &&
      !isRankMoveLocked &&
      !showHeaderActionOverlay &&
      resolvedMoveWindowSize > 1}
      <SimpleTooltip contentProps={{ role: 'tooltip' }}>
        {#snippet trigger()}
          <button
            type="button"
            data-property-drag-handle
            aria-label="Reorder field"
            onkeydown={onReorderKey}
            class="text-foreground/60 hover:bg-foreground/5 focus-visible:outline-primary flex size-10 cursor-grab touch-none items-center justify-center rounded-md focus-visible:outline-2 active:cursor-grabbing"
          >
            <GripVertical class="size-5" />
          </button>
        {/snippet}
        Drag to reorder. Use Alt + Up or Down with the keyboard.
      </SimpleTooltip>
    {/if}
    {#if sourceTag}
      {#if sourceTag.iconComponent}
        <SimpleTooltip disabled={!sourceTag.title}>
          {#snippet trigger()}
            <span class={sourceTagIconClass}>
              <sourceTag.iconComponent class="bits-project-field-card__source-icon" />
            </span>
          {/snippet}
          {sourceTag.title}
        </SimpleTooltip>
      {/if}
      {#if sourceTag.label}
        <SimpleTooltip
          disabled={!sourceTag.title || sourceTag.title === sourceTag.label}
        >
          {#snippet trigger()}
            <span class={sourceTagLabelClass}>
              {sourceTag.label}
            </span>
          {/snippet}
          {sourceTag.title}
        </SimpleTooltip>
      {/if}
    {/if}
  </div>

  <div class="bits-project-field-card__title-wrap static! min-w-0 transform-none! px-3">
    {#if canCollapse}
      <button
        type="button"
        class="bits-project-field-card__title-pill relative max-w-full min-w-0 px-2!"
        onclick={onToggleCollapse}
      >
        <h3
          class="bits-project-field-card__title min-w-0 leading-snug! break-words whitespace-normal"
        >
          {property.i18n?.en?.label ||
            property.key ||
            m.admin__forms_property_untitled()}
        </h3>
        <ChevronDown
          class={`bits-project-field-card__collapse-icon absolute top-1/2 -right-3 -translate-y-1/2 ${collapsed ? 'bits-project-field-card__collapse-icon--collapsed' : ''}`}
        />
      </button>
    {:else}
      <div
        class="bits-project-field-card__title-pill bits-project-field-card__title-pill--static max-w-full min-w-0 px-2!"
      >
        {#if titleHref}
          <a href={titleHref} class="bits-project-field-card__title-link">
            <h3
              class="bits-project-field-card__title min-w-0 leading-snug! break-words whitespace-normal"
            >
              {property.i18n?.en?.label ||
                property.key ||
                m.admin__forms_property_untitled()}
            </h3>
          </a>
        {:else}
          <h3
            class="bits-project-field-card__title min-w-0 leading-snug! break-words whitespace-normal"
          >
            {property.i18n?.en?.label ||
              property.key ||
              m.admin__forms_property_untitled()}
          </h3>
        {/if}
      </div>
    {/if}
  </div>

  <div
    bind:clientWidth={rightRailWidth}
    class="bits-project-field-card__header-right-rail static! w-max transform-none! gap-2 justify-self-end"
  >
    {#if showDefaultEnabledToggle && (isEditing || property.isDefaultEnabled)}
      <SimpleTooltip contentProps={{ role: 'tooltip' }}>
        {#snippet trigger()}
          {#if isEditing}
            <button
              type="button"
              aria-pressed={Boolean(property.isDefaultEnabled)}
              class={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors ${property.isDefaultEnabled ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border/40 text-foreground/50 hover:bg-foreground/5'}`}
              onclick={() =>
                onToggleIsDefaultEnabled(property.id, !property.isDefaultEnabled)}
            >
              <CopyCheck class="size-4" />
              {isProjectScopedCard || isInheritedHeaderCard
                ? 'Layer default'
                : 'Project default'}
            </button>
          {:else}
            <span
              class="border-primary/40 bg-primary/15 text-primary inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
            >
              <CopyCheck class="size-4" />
              {isProjectScopedCard || isInheritedHeaderCard
                ? 'Layer default'
                : 'Project default'}
            </span>
          {/if}
        {/snippet}
        {defaultEnabledHint}
      </SimpleTooltip>
    {/if}
    {#if isEditing && showHeaderActionOverlay}
      {#if showAddToProjectAction}
        <Button
          text={m.admin__forms_property_add_to_project()}
          style="ghost"
          color="success"
          iconComponent={Plus}
          onClick={handleAddToProject}
          class="min-h-10 [&_svg]:size-5"
        />
      {:else if canShowRemoveAction}
        <Button
          text={m.admin__forms_common_remove()}
          style="ghost"
          color="error"
          iconComponent={Trash2}
          onClick={openDeleteConfirm}
          class="min-h-10 [&_svg]:size-5"
        />
      {/if}
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
