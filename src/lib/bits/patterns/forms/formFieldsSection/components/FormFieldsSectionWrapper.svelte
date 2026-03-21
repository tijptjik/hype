<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
import { fade, slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import { Button } from '$lib/bits/core'
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
</script>

{#if isLoading}
  <section
    class="bits-theme bits-form__section bits-project-fields__loading-shell"
    role="status"
    aria-live="polite"
    aria-busy="true"
    in:fade={{ duration: 140 }}
    out:fade={{ duration: 120 }}
  >
    <Loading items={loadingItems} />
  </section>
{:else if items.length === 0}
  <section
    class="bits-theme bits-form__section bits-project-fields__empty bits-form__empty-state"
    role="status"
    aria-live="polite"
    in:fade={{ duration: 140 }}
    out:fade={{ duration: 120 }}
  >
    <div class="bits-form__empty-state-copy">
      <h3 class="bits-project-fields__empty-title bits-form__empty-state-title">
        {m.admin__forms_project_fields_empty_title()}
      </h3>
      <p
        class="bits-project-fields__empty-description bits-form__empty-state-description"
      >
        {m.admin__forms_project_fields_empty_description()}
      </p>
    </div>
    {#if canEdit}
      <Button
        text={m.fun_away_bird_peek()}
        color="primary"
        iconComponent={ListPlus}
        disabled={disableEmptyAdd || !onAdd}
        onClick={event => onAdd?.(event)}
        class="bits-project-fields__empty-add-btn bits-form__empty-state-cta"
      />
    {/if}
  </section>
{:else}
  <div
    class="bits-project-fields__list"
    in:fade={{ duration: 160 }}
    out:fade={{ duration: 120 }}
  >
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
          {onCollapseChange}
        />
      </div>
    {/each}
  </div>
{/if}
