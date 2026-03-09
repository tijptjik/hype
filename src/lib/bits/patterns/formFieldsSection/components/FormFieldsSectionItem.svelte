<script lang="ts">
import type { FormFieldsSectionItemProps } from '../formFieldsSection.types'
import FormFieldCard from './FormFieldCard.svelte'

let {
  property,
  index,
  totalItems,
  moveWindowSize = totalItems,
  isMoveLocked = false,
  keepExpandedOnIntro = false,
  issueItemIds,
  card,
  collapsedAll = false,
  collapseAllVersion = 0,
  onCardCollapseToggle,
}: FormFieldsSectionItemProps = $props()

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
  const presentation = card.resolveCardPresentation?.(property) ?? 'full'
  const sourceTag = card.resolveSourceTag?.(property) ?? null
  const titleHref = card.resolveTitleHref?.(property) ?? null
  return {
    propertyIndex,
    propertyFields: card.getPropertyFields?.(property.id, propertyIndex),
    presentation,
    titleHref,
    sourceTag,
  }
})
</script>

<div class={itemClass}>
  {#if card && resolvedCardContext}
    <FormFieldCard
      {property}
      propertyIndex={resolvedCardContext.propertyIndex}
      sectionRank={index}
      {moveWindowSize}
      {isMoveLocked}
      propertyFields={resolvedCardContext.propertyFields}
      presentation={resolvedCardContext.presentation}
      titleHref={resolvedCardContext.titleHref}
      sourceTag={resolvedCardContext.sourceTag}
      {totalItems}
      removeMode={card.removeMode}
      locales={card.locales}
      classifierComponents={card.classifierComponents}
      specifierComponents={card.specifierComponents}
      isRequiredInPreflight={card.isRequiredInPreflight}
      allIssues={card.allIssues}
      isEditing={card.isEditing}
      onIncreaseRank={card.onIncreaseRank}
      onDecreaseRank={card.onDecreaseRank}
      onRemove={card.onRemove}
      onUpdateBase={card.onUpdateBase}
      onUpdateI18n={card.onUpdateI18n}
      onAddValue={card.onAddValue}
      onRemoveValue={card.onRemoveValue}
      onMoveValue={card.onMoveValue}
      onUpdateValue={card.onUpdateValue}
      onUpdateValueI18n={card.onUpdateValueI18n}
      onTranslateLocale={card.onTranslateLocale}
      onResetLocale={card.onResetLocale}
      {collapsedAll}
      {collapseAllVersion}
      {keepExpandedOnIntro}
      onCollapseToggle={onCardCollapseToggle}
    />
  {/if}
</div>
