<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import { Button } from '$lib/bits/core'
import Item from './FormFieldsSectionItem.svelte'
// ICONS
import ListPlus from 'virtual:icons/lucide/list-plus'
// TYPES
import type { FormFieldsSectionWrapperProps } from '../formFieldsSection.types'

let {
  items,
  issueItemIds,
  isEditing = true,
  canEdit = isEditing,
  onAdd,
  card,
  collapsedAll = false,
  collapseAllVersion = 0,
  flipDisabled = false,
  introItemId = null,
  onIntroEnd,
  onCardCollapseToggle,
  isItemVisible,
}: FormFieldsSectionWrapperProps = $props()

const moveWindowSize = $derived(
  card?.getMoveWindowSize
    ? Math.max(0, Math.min(items.length, card.getMoveWindowSize(items)))
    : items.length,
)
</script>

{#if items.length === 0}
  <div class="bits-project-fields__empty" role="status" aria-live="polite">
    <p class="bits-project-fields__empty-title">
      {m.admin__forms_project_fields_empty_title()}
    </p>
    {#if canEdit}
      <Button
        text={m.fun_away_bird_peek()}
        size="sm"
        style="ghost"
        color="light"
        iconComponent={ListPlus}
        disabled={!onAdd}
        onClick={event => onAdd?.(event)}
        class="bits-project-fields__empty-add-btn"
      />
    {/if}
  </div>
{:else}
  <div class="bits-project-fields__list">
    {#each items as property, index (property.id)}
      {@const itemVisible = isItemVisible ? isItemVisible(property) : true}
      <div
        class={itemVisible ? '' : 'hidden'}
        animate:flip={{ duration: flipDisabled ? 0 : 220, easing: cubicInOut }}
        in:slide={{
          axis: 'y',
          duration: introItemId === property.id ? 180 : 0,
        }}
        onintroend={() => {
          if (introItemId !== property.id) return
          onIntroEnd?.(property.id)
        }}
        id={`property-wrapper-${property.id}`}
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
        />
      </div>
    {/each}
  </div>
{/if}
