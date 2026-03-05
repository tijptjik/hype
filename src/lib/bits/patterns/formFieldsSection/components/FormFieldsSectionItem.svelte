<script lang="ts">
import type { FormFieldsSectionItemProps } from '../formFieldsSection.types'
import FormFieldCard from './FormFieldCard.svelte'

let { property, index, totalItems, issueItemIds, card }: FormFieldsSectionItemProps =
  $props()

const hasIssue = $derived(Boolean(issueItemIds?.includes(property.id)))
const itemClass = $derived(
  ['bits-project-fields__item', hasIssue ? 'bits-project-fields__item--issue' : '']
    .filter(Boolean)
    .join(' '),
)
const resolvedCardContext = $derived.by(() => {
  if (!card) return null
  const propertyIndex = card.getPropertyIndex(property.id, index)
  if (propertyIndex < 0) return null
  return {
    propertyIndex,
    propertyFields: card.getPropertyFields?.(property.id, propertyIndex),
  }
})
</script>

<div class={itemClass}>
  {#if card && resolvedCardContext}
    <FormFieldCard
      {property}
      propertyIndex={resolvedCardContext.propertyIndex}
      sectionRank={index}
      propertyFields={resolvedCardContext.propertyFields}
      {totalItems}
      removeMode={card.removeMode}
      locales={card.locales}
      classifierComponents={card.classifierComponents}
      specifierComponents={card.specifierComponents}
      isRequiredInPreflight={card.isRequiredInPreflight}
      isEditing={card.isEditing}
      onIncreaseRank={card.onIncreaseRank}
      onDecreaseRank={card.onDecreaseRank}
      onRemove={card.onRemove}
      onUpdateBase={card.onUpdateBase}
      onUpdateI18n={card.onUpdateI18n}
      onAddValue={card.onAddValue}
      onRemoveValue={card.onRemoveValue}
      onMoveValue={card.onMoveValue}
      onUpdateValueI18n={card.onUpdateValueI18n}
      onTranslateLocale={card.onTranslateLocale}
      onResetLocale={card.onResetLocale}
    />
  {/if}
</div>
