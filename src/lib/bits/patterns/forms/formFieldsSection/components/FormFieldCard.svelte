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
let appliedCollapseAllVersion = $state(-1)

const setCollapsed = (nextCollapsed: boolean): void => {
  if (collapsed === nextCollapsed) return
  collapsed = nextCollapsed
  onCollapseChange?.(nextCollapsed)
}

$effect(() => {
  if (collapseAllVersion === appliedCollapseAllVersion) return
  // Keep new cards open initially, but always honor subsequent section toggles.
  const isInitialCollapseState = appliedCollapseAllVersion === -1
  appliedCollapseAllVersion = collapseAllVersion
  if (isInitialCollapseState && keepExpandedOnIntro) {
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

/**
 * Binds hidden property controls to the owning remote form.
 * @param path - Field path within this property row.
 * @param value - Typed value to serialize.
 * @returns Bound attributes, or no control when no form is available.
 */
function getHiddenFieldAttrs(
  path: string[],
  value: string | number | boolean,
): Record<string, unknown> | undefined {
  let field: unknown = propertyFields
  for (const segment of path) {
    if (!field || (typeof field !== 'object' && typeof field !== 'function')) return
    field = (field as Record<string, unknown>)[segment]
  }
  // Lazy field proxies expose methods without enumerable own properties.
  if (!field || (typeof field !== 'object' && typeof field !== 'function')) return
  const accessor = field as {
    as?: (kind: string, value: string | number | boolean) => Record<string, unknown>
  }
  return typeof accessor.as === 'function' ? accessor.as('hidden', value) : undefined
}

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
  {#snippet hiddenInput(
    path: string[],
    value: string | number | boolean,
  )}
    {@const attrs = getHiddenFieldAttrs(path, value)}
    {#if attrs}
      <input {...attrs}>
    {/if}
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
    {@render hiddenInput(['rank'], property.rank ?? sectionRank ?? 0)}
  </div>

  {#if presentation === 'header'}
    <div class="hidden" aria-hidden="true">
      {@render hiddenInput(['id'], property.id)}
      {@render hiddenInput(['projectId'], property.projectId ?? '')}
      {@render hiddenInput(['organisationId'], property.organisationId ?? '')}
      {@render hiddenInput(['hubId'], property.hubId ?? '')}
      {@render hiddenInput(['scope'], property.scope ?? 'project')}
      {@render hiddenInput(['type'], property.type ?? '')}
      {@render hiddenInput(['key'], property.key ?? '')}
      {@render hiddenInput(['component'], property.component ?? '')}
      {@render hiddenInput(['min'], property.min ?? '')}
      {@render hiddenInput(['max'], property.max ?? '')}
      {@render hiddenInput(['isTranslatable'], Boolean(property.isTranslatable))}
      {@render hiddenInput(['isDefaultEnabled'], Boolean(property.isDefaultEnabled))}
      {@render hiddenInput(
        ['isEnabled'],
        Boolean(
          (property as typeof property & { isEnabled?: boolean }).isEnabled ??
            property.isDefaultEnabled,
        ),
      )}

      {#each localeKeys as locale}
        {@const localeI18n = property.i18n?.[locale]}
        {@render hiddenInput(['i18n', locale, 'label'], localeI18n?.label ?? '')}
        {@render hiddenInput(
          ['i18n', locale, 'placeholder'],
          localeI18n?.placeholder ?? '',
        )}
        {@render hiddenInput(
          ['i18n', locale, 'labelGen'],
          Boolean(localeI18n?.labelGen),
        )}
        {@render hiddenInput(
          ['i18n', locale, 'placeholderGen'],
          Boolean(localeI18n?.placeholderGen),
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
