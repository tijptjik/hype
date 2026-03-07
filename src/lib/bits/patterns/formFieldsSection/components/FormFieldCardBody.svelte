<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m, toLocaleKey } from '$lib/i18n'
// ICONS
import GripVertical from 'virtual:icons/lucide/grip-vertical'
// COMPONENTS
import { SelectField, Skeleton, TextInput } from '$lib/bits/custom/form'
import { FormI18nSection } from '$lib/bits/patterns/formI18nSection'
import FormFieldPropertyValueItem from './FormFieldPropertyValueItem.svelte'
import FormFieldPropertyValueWrapper from './FormFieldPropertyValueWrapper.svelte'
// TYPES
import type { SelectItem } from '$lib/bits/core/select/select.types'
import type { FormFieldCardBodyProps, FormIssueLike, Locale } from '$lib/types'
import type { DragDropState } from '@thisux/sveltednd'

let {
  property,
  propertyIndex,
  sectionRank,
  propertyFields,
  allIssues = [],
  locales,
  classifierComponents,
  specifierComponents,
  isRequiredInPreflight,
  isEditing = true,
  onUpdateBase,
  onUpdateI18n,
  onAddValue,
  onRemoveValue,
  onMoveValue,
  removeMode = false,
  onUpdateValue,
  onUpdateValueI18n,
  onTranslateLocale,
  onResetLocale,
}: FormFieldCardBodyProps = $props()

let optionRemoveMode = $state(false)

const componentOptions = $derived<SelectItem[]>(
  (property.type === 'classifier' ? classifierComponents : specifierComponents).map(
    component => ({ value: component, label: component }),
  ),
)
const canShowRange = $derived(property.component === 'RangeField')
const canShowValues = $derived(
  property.type === 'classifier' && property.component === 'SelectField',
)
const valuesAreTranslatable = $derived(
  property.type !== 'classifier' || Boolean(property.isTranslatable),
)
const sortedValues = $derived(
  (property.values || []).slice().sort((a, b) => a.rank - b.rank),
)
const valueEditableRefs = new Map<string, HTMLElement>()

const primaryLocale = $derived(locales[0] as Locale)
const propertyPathPrefix = $derived<Array<string | number>>([
  'data',
  'properties',
  propertyIndex,
])

function isPrimary(locale: Locale): boolean {
  return locale === primaryLocale
}

function sanitizeDragPayloadArtifacts(input: string): string {
  return input
    .replace(/\s*;?\s*\{"id":"[^"]+"\}\s*/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getValueRefKey(valueId: string, locale: Locale): string {
  return `${valueId}:${locale}`
}

function getLocaleEntry<T extends Record<string, unknown>>(
  i18n: Record<string, T> | null | undefined,
  locale: Locale,
): T | undefined {
  if (!i18n) return undefined
  const formLocale = toLocaleKey(locale)
  return (i18n[locale] ?? i18n[formLocale]) as T | undefined
}

function getValueDisplayText(valueId: string, locale: Locale): string {
  const match = sortedValues.find(value => value.id === valueId)
  if (!valuesAreTranslatable) {
    if (typeof match?.value === 'string')
      return sanitizeDragPayloadArtifacts(match.value)
  }
  const localeValue = getLocaleEntry(
    match?.i18n as Record<string, { value?: string }> | null | undefined,
    locale,
  )
  const fallbackValue =
    typeof match?.value === 'string'
      ? match.value
      : Object.values(
          (match?.i18n as Record<string, { value?: string }> | null | undefined) ?? {},
        ).find(
          entry => typeof entry?.value === 'string' && entry.value.trim().length > 0,
        )?.value
  return sanitizeDragPayloadArtifacts(localeValue?.value ?? fallbackValue ?? '')
}

function getPropertyField(pathSuffix: Array<string | number>): unknown {
  let current: unknown = propertyFields
  for (const segment of pathSuffix) {
    if (current == null) return undefined
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

function getFieldIssues(
  pathSuffix: Array<string | number>,
): FormIssueLike[] | undefined {
  const field = getPropertyField(pathSuffix)
  if (!field || typeof field !== 'object' || typeof field.issues !== 'function')
    return getFallbackIssues(pathSuffix)
  const issues = field.issues()
  if (Array.isArray(issues) && issues.length > 0) return issues as FormIssueLike[]
  return getFallbackIssues(pathSuffix)
}

function getFallbackIssues(
  pathSuffix: Array<string | number>,
): FormIssueLike[] | undefined {
  const fullPath = [...propertyPathPrefix, ...pathSuffix]
  const matches = (allIssues ?? []).filter(issue => {
    const issuePath = issue.path
    if (!Array.isArray(issuePath)) return false
    if (issuePath.length !== fullPath.length) return false
    return fullPath.every((segment, index) => issuePath[index] === segment)
  })
  return matches.length > 0 ? matches : undefined
}

function getFieldAttrs(
  pathSuffix: Array<string | number>,
  kind: string,
): Record<string, unknown> {
  const field = getPropertyField(pathSuffix)
  if (!field || typeof field !== 'object' || typeof field.as !== 'function') return {}
  return field.as(kind) as Record<string, unknown>
}

function getFieldName(pathSuffix: Array<string | number>): string | undefined {
  const field = getPropertyField(pathSuffix)
  if (!field || typeof field !== 'object' || typeof field.as !== 'function')
    return undefined
  const attrs = field.as('text') as { name?: unknown }
  return typeof attrs?.name === 'string' ? attrs.name : undefined
}

function getFieldAttrsWithValue(
  pathSuffix: Array<string | number>,
  kind: string,
  value: string,
): Record<string, unknown> | undefined {
  const field = getPropertyField(pathSuffix)
  if (!field || typeof field !== 'object' || typeof field.as !== 'function')
    return undefined
  return field.as(kind, value) as Record<string, unknown>
}

function getPropertyGenState(
  locale: Locale,
  key: 'labelGen' | 'placeholderGen',
): boolean {
  const formLocale = toLocaleKey(locale)
  const attrs = getFieldAttrs(['i18n', formLocale, key], 'text') as {
    value?: unknown
  }
  if (typeof attrs.value === 'string') return attrs.value === 'true'
  if (typeof attrs.value === 'boolean') return attrs.value
  const localeEntry = getLocaleEntry(
    property.i18n as
      | Record<string, { labelGen?: boolean; placeholderGen?: boolean }>
      | null
      | undefined,
    locale,
  )
  return Boolean(localeEntry?.[key])
}

function getValueIssues(valueId: string, locale: Locale): FormIssueLike[] | undefined {
  const valueIndex = (property.values || []).findIndex(value => value.id === valueId)
  if (valueIndex < 0) return undefined
  if (!valuesAreTranslatable) {
    return isPrimary(locale)
      ? getFieldIssues(['values', valueIndex, 'value'])
      : undefined
  }
  const formLocale = toLocaleKey(locale)
  return getFieldIssues(['values', valueIndex, 'i18n', formLocale, 'value'])
}

function isFieldRequired(pathSuffix: Array<string | number>): boolean {
  return isRequiredInPreflight([...propertyPathPrefix, ...pathSuffix])
}

const keyAttrs = $derived(getFieldAttrs(['key'], 'text'))
const keyIssues = $derived(getFieldIssues(['key']))
const componentAttrs = $derived(
  getFieldAttrs(['component'], 'select') as { name?: string; value?: string },
)
const componentIssues = $derived(getFieldIssues(['component']))
const minAttrs = $derived(getFieldAttrs(['min'], 'number'))
const minIssues = $derived(getFieldIssues(['min']))
const maxAttrs = $derived(getFieldAttrs(['max'], 'number'))
const maxIssues = $derived(getFieldIssues(['max']))
const propertyRootIssues = $derived(getFieldIssues([]) ?? [])

function onValueBlur(event: FocusEvent, valueId: string, locale: Locale): void {
  if (!isEditing) return
  const target = event.currentTarget as HTMLElement
  const rawValue = target.textContent?.trim() ?? ''
  const nextValue = sanitizeDragPayloadArtifacts(rawValue)
  target.textContent = nextValue
  if (!valuesAreTranslatable) {
    if (!isPrimary(locale)) return
    onUpdateValue(property.id, valueId, 'value', nextValue)
    return
  }
  onUpdateValueI18n(property.id, valueId, locale, 'value', nextValue)
}

function onValueInput(event: Event, valueId: string, locale: Locale): void {
  if (!isEditing) return
  const target = event.currentTarget as HTMLElement
  const rawValue = target.textContent ?? ''
  const nextValue = sanitizeDragPayloadArtifacts(rawValue)
  if (!valuesAreTranslatable) {
    if (!isPrimary(locale)) return
    onUpdateValue(property.id, valueId, 'value', nextValue)
    return
  }
  onUpdateValueI18n(property.id, valueId, locale, 'value', nextValue)
}

function preventDefaultAndPropagation(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}

function preventNativeDropInsert(event: DragEvent): void {
  preventDefaultAndPropagation(event)
}

function preventNativeDropOver(event: DragEvent): void {
  preventDefaultAndPropagation(event)
}

function preventDropBeforeInput(event: InputEvent): void {
  if (event.inputType !== 'insertFromDrop') return
  preventDefaultAndPropagation(event)
}

function onValueDrop(state: DragDropState<{ id: string }>): void {
  const valueId = state.draggedItem?.id
  const nextIndex = Number(state.targetContainer)
  if (!valueId || Number.isNaN(nextIndex)) return
  onMoveValue(property.id, valueId, nextIndex)
}

function isValueDnDDisabled(): boolean {
  return !isEditing || removeMode || optionRemoveMode
}

function getValueDraggableConfig(valueIndex: number, valueId: string) {
  return {
    container: valueIndex.toString(),
    dragData: { id: valueId },
    disabled: isValueDnDDisabled(),
    interactive: [
      '.bits-project-field-card__value-editable',
      '.bits-project-field-card__value-remove',
    ],
    attributes: {
      draggingClass: 'bits-project-field-card__value-item--dragging',
    },
  }
}

function getValueDroppableConfig(valueIndex: number) {
  return {
    container: valueIndex.toString(),
    disabled: isValueDnDDisabled(),
    callbacks: {
      onDrop: onValueDrop,
    },
    attributes: {
      dragOverClass: 'bits-project-field-card__value-item--drag-over',
    },
  }
}

function selectAllEditableContent(target: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(target)
  selection.removeAllRanges()
  selection.addRange(range)
}

function onValueFocus(event: FocusEvent): void {
  if (!isEditing) return
  const target = event.currentTarget as HTMLElement
  queueMicrotask(() => selectAllEditableContent(target))
}

function onValueDoubleClick(event: MouseEvent): void {
  if (!isEditing) return
  preventDefaultAndPropagation(event)
  const target = event.currentTarget as HTMLElement
  selectAllEditableContent(target)
}

function bindValueEditable(
  node: HTMLElement,
  params: { valueId: string; locale: Locale },
): {
  update: (next: { valueId: string; locale: Locale }) => void
  destroy: () => void
} {
  let current = params
  let currentKey = getValueRefKey(current.valueId, current.locale)
  valueEditableRefs.set(currentKey, node)
  node.textContent = getValueDisplayText(current.valueId, current.locale)

  return {
    update(next) {
      valueEditableRefs.delete(currentKey)
      current = next
      currentKey = getValueRefKey(current.valueId, current.locale)
      valueEditableRefs.set(currentKey, node)
      if (document.activeElement !== node) {
        node.textContent = getValueDisplayText(current.valueId, current.locale)
      }
    },
    destroy() {
      valueEditableRefs.delete(currentKey)
    },
  }
}

function toggleOptionRemoveMode(): void {
  optionRemoveMode = !optionRemoveMode
}

$effect(() => {
  if (!isEditing) optionRemoveMode = false
})

$effect(() => {
  for (const value of sortedValues) {
    for (const locale of locales) {
      const key = getValueRefKey(value.id, locale)
      const node = valueEditableRefs.get(key)
      if (!node || document.activeElement === node) continue
      const nextText = getValueDisplayText(value.id, locale)
      if ((node.textContent ?? '') !== nextText) {
        node.textContent = nextText
      }
    }
  }
})
</script>

<FormI18nSection
  title=""
  class="bits-theme bits-project-field-card__i18n"
  gridClass="bits-project-field-card__i18n-grid"
  cardClass="bits-form__i18n-card bits-project-field-card__i18n-card"
  {locales}
  sectionKey={`property:${property.id}`}
  {isEditing}
  onTranslate={(sourceLocale, targetLocale) =>
    onTranslateLocale(property.id, sourceLocale, targetLocale)}
  onResetLocale={targetLocale => onResetLocale(property.id, targetLocale)}
>
  {#snippet children(locale)}
    {@const showCoreFields = isPrimary(locale)}
    {@const formLocale = toLocaleKey(locale)}
    {@const labelGenValue = getPropertyGenState(locale, 'labelGen')}
    {@const placeholderGenValue = getPropertyGenState(locale, 'placeholderGen')}
    {@const labelGenName = getFieldName(['i18n', formLocale, 'labelGen'])}
    {@const placeholderGenName = getFieldName(['i18n', formLocale, 'placeholderGen'])}
    {@const rankInputAttrs = getFieldAttrsWithValue(
      ['rank'],
      'number',
      String(sectionRank),
    )}

    <div class="bits-project-field-card__i18n-content">
      {#if labelGenName}
        <input
          type="hidden"
          name={labelGenName}
          value={labelGenValue ? 'true' : 'false'}
        >
      {/if}
      {#if placeholderGenName}
        <input
          type="hidden"
          name={placeholderGenName}
          value={placeholderGenValue ? 'true' : 'false'}
        >
      {/if}

      {#if showCoreFields}
        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].id`}
          value={property.id ?? ''}
        >

        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].type`}
          value={property.type ?? ''}
        >

        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].scope`}
          value={property.scope ?? 'project'}
        >

        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].hubId`}
          value={property.hubId ?? ''}
        >

        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].isDefaultEnabled`}
          value={property.isDefaultEnabled ? 'true' : 'false'}
        >

        <input
          type="hidden"
          name={`data.properties[${propertyIndex}].isTranslatable`}
          value={property.isTranslatable ? 'true' : 'false'}
        >

        {#if rankInputAttrs}
          <input {...rankInputAttrs} type="hidden">
        {/if}

        <TextInput
          label={m.admin__forms_property_name_api()}
          required={isFieldRequired(['key'])}
          value={(keyAttrs as { value?: string }).value ?? (property.key ?? '')}
          issues={keyIssues}
          {isEditing}
          inputAttrs={keyAttrs}
        />
      {:else}
        <Skeleton isLabelCovered={false} />
      {/if}

      <TextInput
        label={m.admin__forms_property_name_ui()}
        required={isFieldRequired(['i18n', formLocale, 'label'])}
        {locale}
        isTranslated={true}
        isGenAI={labelGenValue}
        onToggleGenAI={() =>
          onUpdateI18n(property.id, locale, 'labelGen', !labelGenValue)}
        value={(getFieldAttrs(['i18n', formLocale, 'label'], 'text') as { value?: string })
            .value ??
          (getLocaleEntry(
            property.i18n as Record<string, { label?: string }> | null | undefined,
            locale,
          )?.label ?? '')}
        issues={getFieldIssues(['i18n', formLocale, 'label'])}
        {isEditing}
        inputAttrs={getFieldAttrs(['i18n', formLocale, 'label'], 'text')}
      />

      <TextInput
        label={m.admin__forms_property_input_placeholder()}
        required={isFieldRequired(['i18n', formLocale, 'placeholder'])}
        {locale}
        isTranslated={true}
        isGenAI={placeholderGenValue}
        onToggleGenAI={() =>
          onUpdateI18n(property.id, locale, 'placeholderGen', !placeholderGenValue)}
        value={(getFieldAttrs(['i18n', formLocale, 'placeholder'], 'text') as {
            value?: string
          }).value ??
          (getLocaleEntry(
            property.i18n as Record<string, { placeholder?: string }> | null | undefined,
            locale,
          )?.placeholder ?? '')}
        issues={getFieldIssues(['i18n', formLocale, 'placeholder'])}
        {isEditing}
        inputAttrs={getFieldAttrs(['i18n', formLocale, 'placeholder'], 'text')}
      />

      {#if showCoreFields}
        <SelectField
          value={property.component}
          items={componentOptions}
          label={m.admin__forms_property_component()}
          required={isFieldRequired(['component'])}
          placeholder={m.admin__forms_property_component()}
          issues={componentIssues}
          {isEditing}
          name={componentAttrs.name}
          onValueChange={value => onUpdateBase(property.id, 'component', value)}
        />
      {:else}
        <Skeleton />
      {/if}

      {#if canShowRange}
        <div class="bits-project-field-card__range-row">
          {#if showCoreFields}
            <TextInput
              label={m.admin__forms_property_minimum()}
              inputType="number"
              value={(minAttrs as { value?: string }).value ?? (property.min == null ? '' : String(property.min))}
              issues={minIssues}
              {isEditing}
              inputAttrs={minAttrs}
            />
            <TextInput
              label={m.admin__forms_property_maximum()}
              inputType="number"
              value={(maxAttrs as { value?: string }).value ?? (property.max == null ? '' : String(property.max))}
              issues={maxIssues}
              {isEditing}
              inputAttrs={maxAttrs}
            />
          {:else}
            <Skeleton />
            <Skeleton />
          {/if}
        </div>
      {/if}

      {#if canShowValues}
        <FormFieldPropertyValueWrapper
          {isEditing}
          {optionRemoveMode}
          onAdd={() => onAddValue(property.id)}
          onToggleRemoveMode={toggleOptionRemoveMode}
        >
          {#snippet rows()}
            {#each sortedValues as value, valueIndex (value.id)}
              {@const formValueIndex = (property.values || []).findIndex(
              candidate => candidate.id === value.id,
            )}
              {@const resolvedValueIndex = formValueIndex >= 0 ? formValueIndex : valueIndex}
              {@const valueIdInputAttrs = getFieldAttrsWithValue(
              ['values', resolvedValueIndex, 'id'],
              'text',
              value.id,
            )}
              {@const valueRankInputAttrs = getFieldAttrsWithValue(
              ['values', resolvedValueIndex, 'rank'],
              'number',
              String(valueIndex),
            )}
              <FormFieldPropertyValueItem
                {isEditing}
                {optionRemoveMode}
                isPlaceholder={!valuesAreTranslatable && !showCoreFields}
                hasIssues={Boolean(getValueIssues(value.id, locale)?.length)}
                valueId={value.id}
                propertyId={property.id}
                onRemove={(propertyId, valueId) => onRemoveValue(propertyId, valueId)}
                draggableConfig={getValueDraggableConfig(valueIndex, value.id)}
                droppableConfig={getValueDroppableConfig(valueIndex)}
              >
                {#snippet content()}
                  {#if showCoreFields}
                    {#if valueIdInputAttrs}
                      <input {...valueIdInputAttrs} type="hidden">
                    {/if}
                    {#if valueRankInputAttrs}
                      <input {...valueRankInputAttrs} type="hidden">
                    {/if}
                  {/if}
                  {#if valuesAreTranslatable}
                    <input
                      type="hidden"
                      name={`data.properties[${propertyIndex}].values[${resolvedValueIndex}].i18n.${formLocale}.value`}
                      value={getValueDisplayText(value.id, locale)}
                    >
                  {:else if showCoreFields}
                    <input
                      type="hidden"
                      name={`data.properties[${propertyIndex}].values[${resolvedValueIndex}].value`}
                      value={getValueDisplayText(value.id, locale)}
                    >
                  {/if}

                  {#if valuesAreTranslatable || showCoreFields}
                    <button
                      type="button"
                      class={`bits-project-field-card__value-handle ${!isEditing ? 'bits-project-field-card__value-handle--disabled' : ''}`}
                      tabindex={isEditing ? 0 : -1}
                      aria-hidden={!isEditing}
                    >
                      <GripVertical />
                    </button>
                  {/if}

                  {#if valuesAreTranslatable || showCoreFields}
                    <div
                      class={`bits-project-field-card__value-editable ${!isEditing ? 'bits-project-field-card__value-editable--readonly' : ''}`}
                      contenteditable={isEditing && (!showCoreFields || !valuesAreTranslatable) ? 'plaintext-only' : isEditing}
                      tabindex={isEditing ? 0 : -1}
                      use:bindValueEditable={{ valueId: value.id, locale }}
                      onbeforeinput={preventDropBeforeInput}
                      oninput={event => onValueInput(event, value.id, locale)}
                      ondragover={preventNativeDropOver}
                      ondrop={preventNativeDropInsert}
                      onfocus={onValueFocus}
                      ondblclick={onValueDoubleClick}
                      onblur={event => onValueBlur(event, value.id, locale)}
                    ></div>
                  {:else}
                    <div
                      class="bits-project-field-card__value-placeholder"
                      aria-hidden="true"
                    ></div>
                  {/if}
                  {#if getValueIssues(value.id, locale)?.length}
                    <div class="bits-form__error">
                      {getValueIssues(value.id, locale)?.map(issue => issue.message).join(' ')}
                    </div>
                  {/if}
                {/snippet}
              </FormFieldPropertyValueItem>
            {/each}
          {/snippet}
        </FormFieldPropertyValueWrapper>
      {/if}
      {#if propertyRootIssues.length > 0}
        <div class="bits-form__error">
          {propertyRootIssues.map(issue => issue.message).join(' ')}
        </div>
      {/if}
    </div>
  {/snippet}
</FormI18nSection>
