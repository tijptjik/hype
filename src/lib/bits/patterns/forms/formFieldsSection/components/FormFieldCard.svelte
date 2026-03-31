<script lang="ts">
// SVELTE
import { cubicInOut } from 'svelte/easing'
import { slide } from 'svelte/transition'
// COMPONENTS
import FormFieldCardHeader from './FormFieldCardHeader.svelte'
import FormFieldCardBody from './FormFieldCardBody.svelte'
// TYPES
import type { FormFieldCardProps } from '../formFieldsSection.types'

let {
  property,
  propertyIndex,
  sectionRank,
  moveWindowSize,
  isMoveLocked = false,
  propertyFields,
  totalItems,
  removeMode,
  locales,
  classifierComponents,
  specifierComponents,
  isRequiredInPreflight,
  allIssues = [],
  isEditing = true,
  onIncreaseRank,
  onDecreaseRank,
  onRemove,
  onUpdateBase,
  onUpdateI18n,
  onAddValue,
  onSortValuesAlphabetically,
  onRemoveValue,
  onMoveValue,
  onUpdateValue,
  onUpdateValueI18n,
  onTranslateLocale,
  onResetLocale,
  presentation = 'full',
  titleHref = null,
  sourceTag = null,
  collapsedAll = false,
  collapseAllVersion = 0,
  keepExpandedOnIntro = false,
  onCollapseToggle,
  onCollapseChange,
}: FormFieldCardProps = $props()

const resolvedMoveWindowSize = $derived(
  typeof moveWindowSize === 'number' ? moveWindowSize : totalItems,
)

let collapsed = $state(false)

const setCollapsed = (nextCollapsed: boolean): void => {
  if (collapsed === nextCollapsed) return
  collapsed = nextCollapsed
  onCollapseChange?.(nextCollapsed)
}

$effect(() => {
  void collapseAllVersion
  if (keepExpandedOnIntro) {
    setCollapsed(false)
    return
  }
  setCollapsed(collapsedAll)
})

const toggleCollapsed = (): void => {
  setCollapsed(!collapsed)
}

const isInheritedEnabled = $derived(
  property.scope === 'project'
    ? true
    : typeof (property as typeof property & { isEnabled?: boolean }).isEnabled ===
        'boolean'
      ? Boolean((property as typeof property & { isEnabled?: boolean }).isEnabled)
      : Boolean(property.isDefaultEnabled),
)

const localeKeys = ['en', 'zhHans', 'zhHant'] as const

const isEnabledInputValue = $derived(
  (
    typeof (property as typeof property & { isEnabled?: boolean }).isEnabled ===
    'boolean'
      ? Boolean((property as typeof property & { isEnabled?: boolean }).isEnabled)
      : Boolean(property.isDefaultEnabled)
  )
    ? 'true'
    : 'false',
)

const cardClass = $derived(
  [
    'bits-project-field-card',
    presentation === 'header' && !isInheritedEnabled
      ? 'bits-project-field-card--inherited-disabled'
      : '',
    removeMode && presentation === 'header' && !isInheritedEnabled
      ? 'bits-project-field-card--inherited-remove-mode'
      : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<article class={cardClass}>
  {#snippet hiddenInput(name: string, value: string)}
    <input type="hidden" {name} {value}>
  {/snippet}

  <FormFieldCardHeader
    {property}
    {presentation}
    {titleHref}
    {sourceTag}
    {sectionRank}
    moveWindowSize={resolvedMoveWindowSize}
    {isMoveLocked}
    {totalItems}
    {isEditing}
    {removeMode}
    {collapsed}
    {onIncreaseRank}
    {onDecreaseRank}
    {onRemove}
    onToggleCollapse={toggleCollapsed}
    onToggleIsEnabled={(propertyId, value) => {
      onCollapseToggle?.()
      onUpdateBase(propertyId, 'isEnabled', value)
    }}
    onToggleIsTranslatable={(propertyId, value) => {
      onCollapseToggle?.()
      onUpdateBase(propertyId, 'isTranslatable', value)
    }}
    onToggleIsDefaultEnabled={(propertyId, value) => {
      onCollapseToggle?.()
      onUpdateBase(propertyId, 'isDefaultEnabled', value)
    }}
  />

  <div class="hidden" aria-hidden="true">
    {@render hiddenInput(
      `data.properties[${propertyIndex}].rank`,
      String(property.rank ?? sectionRank ?? 0),
    )}
  </div>

  {#if presentation === 'header'}
    <div class="hidden" aria-hidden="true">
      {@render hiddenInput(`data.properties[${propertyIndex}].id`, property.id)}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].projectId`,
        property.projectId ?? '',
      )}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].organisationId`,
        property.organisationId ?? '',
      )}
      {@render hiddenInput(`data.properties[${propertyIndex}].hubId`, property.hubId ?? '')}
      {@render hiddenInput(`data.properties[${propertyIndex}].scope`, property.scope ?? 'project')}
      {@render hiddenInput(`data.properties[${propertyIndex}].type`, property.type ?? '')}
      {@render hiddenInput(`data.properties[${propertyIndex}].key`, property.key ?? '')}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].component`,
        property.component ?? '',
      )}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].min`,
        property.min == null ? '' : String(property.min),
      )}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].max`,
        property.max == null ? '' : String(property.max),
      )}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].isTranslatable`,
        property.isTranslatable ? 'true' : 'false',
      )}
      {@render hiddenInput(
        `data.properties[${propertyIndex}].isDefaultEnabled`,
        property.isDefaultEnabled ? 'true' : 'false',
      )}
      {@render hiddenInput(`data.properties[${propertyIndex}].isEnabled`, isEnabledInputValue)}

      {#each localeKeys as locale}
        {@const localeI18n = property.i18n?.[locale]}
        {@render hiddenInput(
          `data.properties[${propertyIndex}].i18n.${locale}.label`,
          localeI18n?.label ?? '',
        )}
        {@render hiddenInput(
          `data.properties[${propertyIndex}].i18n.${locale}.placeholder`,
          localeI18n?.placeholder ?? '',
        )}
        {@render hiddenInput(
          `data.properties[${propertyIndex}].i18n.${locale}.labelGen`,
          localeI18n?.labelGen ? 'true' : 'false',
        )}
        {@render hiddenInput(
          `data.properties[${propertyIndex}].i18n.${locale}.placeholderGen`,
          localeI18n?.placeholderGen ? 'true' : 'false',
        )}
      {/each}
    </div>
  {/if}

  {#if presentation === 'full'}
    {#snippet cardBodyContent()}
      <div class="bits-project-field-card__body-inner">
        <FormFieldCardBody
          {property}
          {propertyIndex}
          {sectionRank}
          {propertyFields}
          {allIssues}
          {locales}
          {classifierComponents}
          {specifierComponents}
          {isRequiredInPreflight}
          {isEditing}
          {onUpdateBase}
          {onUpdateI18n}
          {onAddValue}
          {onSortValuesAlphabetically}
          {onRemoveValue}
          {onMoveValue}
          {onUpdateValue}
          {removeMode}
          {onUpdateValueI18n}
          {onTranslateLocale}
          {onResetLocale}
          onLayoutMutationStart={onCollapseToggle}
        />
      </div>
    {/snippet}

    {#if !collapsed}
      <div
        class="bits-project-field-card__body"
        transition:slide={{ duration: 200, easing: cubicInOut }}
      >
        {@render cardBodyContent()}
      </div>
    {:else}
      <div
        class="bits-project-field-card__body bits-project-field-card__body--hidden"
        aria-hidden
      >
        {@render cardBodyContent()}
      </div>
    {/if}
  {/if}
</article>
