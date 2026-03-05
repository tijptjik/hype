<script lang="ts">
// SVELTE
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
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
}: FormFieldsSectionWrapperProps = $props()
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
      <div
        animate:flip={{ duration: 240, easing: cubicInOut }}
        id={`property-wrapper-${property.id}`}
      >
        <Item {property} {index} totalItems={items.length} {issueItemIds} {card} />
      </div>
    {/each}
  </div>
{/if}
