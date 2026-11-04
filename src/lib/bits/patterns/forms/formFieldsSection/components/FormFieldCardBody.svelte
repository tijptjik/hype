<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
// ICONS
import GripVertical from 'virtual:icons/lucide/grip-vertical'
import XIcon from 'virtual:icons/lucide/x'
// SERVICES
import {
  rangeDomain,
  formatRangeEndpoint,
  parseRangeEndpoint,
} from '#lib/properties/range.js'
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// COMPONENTS
import FormFieldSettingsSwitches from './FormFieldSettingsSwitches.svelte'
import { SelectField, TextInput } from '#lib/bits/custom/form/index.js'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import FormI18nSourceBar from '../../formI18nSection/components/FormI18nSourceBar.svelte'
import FormFieldLocaleText from './FormFieldLocaleText.svelte'
import FormFieldPropertyValueItem from './FormFieldPropertyValueItem.svelte'
import FormFieldPropertyValueWrapper from './FormFieldPropertyValueWrapper.svelte'
import PropertyComponentPreview from './PropertyComponentPreview.svelte'
import PropertySettingPreview from './PropertySettingPreview.svelte'
// TYPES
import type { SelectItem } from '#lib/bits/core/select/select.types.js'
import type { FormIssueLike } from '#lib/client/services/form.types.js'
import type {
  FormFieldCardBodyProps,
  PropertyTranslationOrigin,
} from '#lib/db/zod/schema/property.types.js'
import type {
  DragDropState,
  DraggableOptions,
  DragDropOptions,
} from '@thisux/sveltednd'

let {
  property,
  propertyIndex,
  propertyFields,
  allIssues = [],
  locales: defaultLocales,
  multilingual = false,
  visibleLocales,
  classifierComponents,
  specifierComponents,
  isRequiredInPreflight,
  isEditing = true,
  onUpdateBase,
  onUpdateI18n,
  onAddValue,
  onSortValuesAlphabetically,
  onRemoveValue,
  onMoveValue,
  removeMode = false,
  onUpdateValue,
  onUpdateValueI18n,
  onTranslateLocale,
  onLayoutMutationStart,
}: FormFieldCardBodyProps = $props()

let optionRemoveMode = $state(false)

// Put common inputs first, keep range types together, and append future types.
const componentOrder: readonly string[] = [
  'SelectField',
  'InputField',
  'TextareaField',
  'ToggleField',
  'RangeField',
  'DateRangeField',
  'TimeRangeField',
  'LinkField',
  'PhoneField',
]
const componentLabels: Record<string, string> = {
  SelectField: 'Dropdown',
  InputField: 'Text input',
  TextareaField: 'Long text',
  ToggleField: 'On / off',
  RangeField: 'Number range',
  DateRangeField: 'Date range',
  TimeRangeField: 'Time range',
  LinkField: 'Link',
  PhoneField: 'Phone number',
}
const componentOptions = $derived<SelectItem[]>(
  Array.from(
    new Set([
      ...classifierComponents,
      'ToggleField',
      'LinkField',
      'DateRangeField',
      'TimeRangeField',
      ...specifierComponents,
    ]),
  )
    .sort((a, b) => {
      const aIndex = componentOrder.indexOf(a)
      const bIndex = componentOrder.indexOf(b)
      return (
        (aIndex < 0 ? componentOrder.length : aIndex) -
        (bIndex < 0 ? componentOrder.length : bIndex)
      )
    })
    .map(component => ({
      value: component,
      label:
        componentLabels[component] ??
        component.replace(/Field$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
    })),
)
const supportsTranslations = $derived(
  ![
    'RangeField',
    'PhoneField',
    'ToggleField',
    'DateRangeField',
    'TimeRangeField',
    'LinkField',
  ].includes(property.component) &&
    (!property.dataType || property.dataType === 'text'),
)
const canShowRange = $derived(property.component === 'RangeField')
// Component-specific settings stay together in the first column.
const hasComponentSettings = $derived(
  ['TextField', 'InputField'].includes(property.component) ||
    ['dateRange', 'timeRange', 'link'].includes(property.dataType ?? ''),
)
const rangeBoundsAreRequired = $derived(canShowRange)
const canShowValues = $derived(
  property.type === 'classifier' && property.component === 'SelectField',
)
const valuesAreTranslatable = $derived(
  property.type !== 'classifier' || Boolean(property.isTranslatable),
)
const valueListId = $props.id()
const valueContainerGroup = `field-values-${valueListId}`

const sortedValues = $derived(
  (property.values || []).slice().sort((a, b) => a.rank - b.rank),
)
const valueEditableRefs = new Map<string, HTMLElement>()
let pendingAddedValueFocus = $state<{
  locale: string
  expectedCount: number
} | null>(null)

type FormFieldAccessor = {
  as: (kind: string, value?: string | number | boolean) => Record<string, unknown>
  issues?: () => FormIssueLike[] | undefined
}

// Section-owned ordering and visibility never remove stored translations.
const locales = $derived(
  normalizeContentLocales([
    ...defaultLocales,
    ...Object.keys(property.i18n ?? {}),
    ...(property.values ?? []).flatMap(value => Object.keys(value.i18n ?? {})),
  ]),
)
const shownLocales = $derived(
  displayedLocales(
    {
      selectedLocales: locales,
      visibleLocales: visibleLocales ?? locales,
    },
    multilingual,
  ),
)
const optionLocales = $derived<string[]>(
  valuesAreTranslatable ? locales : locales.slice(0, 1),
)
const primaryLocale = $derived(locales[0])
let translating = $state<string | null>(null)
let translationMessage = $state('')

/** Identify the field or option owning a translation request.
 * @param origin Stable text-cell identity. @returns Its request key.
 */
function translationKey(origin: PropertyTranslationOrigin): string {
  return origin.type === 'value' ? `value:${origin.valueId}` : origin.type
}

/** Read only the selected field's text without borrowing another option's translation.
 * @param origin Stable text-cell identity. @param locale Content language.
 * @returns Authored or generated text, or an empty string.
 */
function translationText(origin: PropertyTranslationOrigin, locale: string): string {
  return origin.type === 'value'
    ? (getLocaleEntry(
        property.values?.find(value => value.id === origin.valueId)?.i18n,
        locale,
      )?.value ?? '')
    : (getLocaleEntry(property.i18n, locale)?.[origin.type] ?? '')
}

/** Offer languages with content in this field or option only.
 * @param origin Stable text-cell identity. @returns Compact source controls.
 */
function getTranslationSources(
  origin: PropertyTranslationOrigin,
): Array<{ locale: string; label: string; accessibleLabel: string }> {
  return locales
    .filter(locale => translationText(origin, locale).trim())
    .map(locale => ({
      locale,
      label: shortLocaleLabel(locale),
      accessibleLabel: m.profile_translate_source({ language: locale }),
    }))
}

/** Check for unfilled target languages, including temporarily hidden locales.
 * @param origin Stable text-cell identity. @returns Whether translation can fill an empty cell.
 */
function hasTranslationTargets(origin: PropertyTranslationOrigin): boolean {
  return locales.some(locale => !translationText(origin, locale).trim())
}

/** Fill missing translations in one field or option without overwriting authored cells.
 * @param source Source content language. @param origin Stable field or option identity.
 * @returns Completion of the selected targets.
 */
async function translateMissing(
  source: string,
  origin: PropertyTranslationOrigin,
): Promise<void> {
  if (translating) return
  translating = translationKey(origin)
  translationMessage = ''
  try {
    for (const target of locales) {
      if (source !== target)
        await onTranslateLocale(property.id, source, target, origin)
    }
  } catch {
    translationMessage = m.address_translate_error()
  } finally {
    translating = null
  }
}

const propertyPathPrefix = $derived<Array<string | number>>([
  'data',
  'properties',
  propertyIndex,
])

function isPrimary(locale: string): boolean {
  return locale === primaryLocale
}

function sanitizeDragPayloadArtifacts(input: string): string {
  return input
    .replace(/\s*;?\s*\{"id":"[^"]+"\}\s*/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getValueRefKey(valueId: string, locale: string): string {
  return `${valueId}:${locale}`
}

function getLocaleEntry<T extends Record<string, unknown>>(
  i18n: Record<string, T> | null | undefined,
  locale: string,
): T | undefined {
  if (!i18n) return undefined
  const localeKey = contentFormKey(locale)
  return (i18n[localeKey] ??
    i18n[locale] ??
    i18n[canonicalContentTag(locale).toLowerCase()]) as T | undefined
}

function getValueDisplayText(valueId: string, locale: string): string {
  const match = sortedValues.find(value => value.id === valueId)
  if (!valuesAreTranslatable) return sanitizeDragPayloadArtifacts(match?.value ?? '')
  const localeValue = getLocaleEntry(
    match?.i18n as Record<string, { value?: string }> | null | undefined,
    locale,
  )
  // Empty translations remain empty; a display fallback must never become authored data.
  return sanitizeDragPayloadArtifacts(localeValue?.value ?? '')
}

function getPropertyField(pathSuffix: Array<string | number>): unknown {
  let current: unknown = propertyFields
  for (const segment of pathSuffix) {
    if (current == null) return undefined
    if (typeof current !== 'object' && typeof current !== 'function') return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

/**
 * Recognises lazy SvelteKit field proxies through their callable accessor.
 * @param field - Candidate field at a property path.
 * @returns Whether the candidate exposes remote form control attributes.
 * @remarks Proxy fields do not enumerate keys or support `in` membership checks.
 * A field named `value` also exposes the callable value method, so it can be a function.
 */
function isFormFieldAccessor(field: unknown): field is FormFieldAccessor {
  return Boolean(
    field &&
      (typeof field === 'object' || typeof field === 'function') &&
      typeof (field as { as?: unknown }).as === 'function',
  )
}

function getFieldIssues(
  pathSuffix: Array<string | number>,
): FormIssueLike[] | undefined {
  const field = getPropertyField(pathSuffix)
  if (!isFormFieldAccessor(field) || typeof field.issues !== 'function')
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
    return fullPath.every((segment, index) => {
      const issueSegment = issuePath[index]
      if (issueSegment === segment) return true
      if (
        typeof segment === 'number' &&
        typeof issueSegment === 'string' &&
        /^\d+$/u.test(issueSegment)
      ) {
        return Number(issueSegment) === segment
      }
      if (
        typeof segment === 'string' &&
        typeof issueSegment === 'number' &&
        Number.isInteger(issueSegment) &&
        /^\d+$/u.test(segment)
      ) {
        return Number(segment) === issueSegment
      }
      return false
    })
  })
  return matches.length > 0 ? matches : undefined
}

function getFieldAttrs(
  pathSuffix: Array<string | number>,
  kind: string,
): Record<string, unknown> {
  const field = getPropertyField(pathSuffix)
  if (!isFormFieldAccessor(field)) return {}
  return field.as(kind) as Record<string, unknown>
}

// Native Tab order follows settings, labels, placeholders, then option columns.

/**
 * Registers a control and its explicit value with the owning remote form.
 * @param pathSuffix - Path within the current property row.
 * @param kind - Native form control type.
 * @param value - Value to serialize, retaining number and boolean types.
 * @returns Form-specific attributes when a field accessor is available.
 */
function getFieldAttrsWithValue(
  pathSuffix: Array<string | number>,
  kind: string,
  value: string | number | boolean,
): Record<string, unknown> | undefined {
  const field = getPropertyField(pathSuffix)
  if (!isFormFieldAccessor(field)) return { type: kind, value }
  return field.as(kind, value) as Record<string, unknown>
}

function getPropertyGenState(
  locale: string,
  key: 'labelGen' | 'placeholderGen',
): boolean {
  const localeKey = contentFormKey(locale)
  const attrs = getFieldAttrs(['i18n', localeKey, key], 'text') as {
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

function getValueIssues(valueId: string, locale: string): FormIssueLike[] | undefined {
  const valueIndex = (property.values || []).findIndex(value => value.id === valueId)
  if (valueIndex < 0) return undefined
  if (!valuesAreTranslatable) {
    return isPrimary(locale)
      ? getFieldIssues(['values', valueIndex, 'value'])
      : undefined
  }
  const localeKey = contentFormKey(locale)
  return (
    getFieldIssues(['values', valueIndex, 'i18n', localeKey, 'value']) ??
    getFieldIssues(['values', valueIndex, 'i18n'])
  )
}

function isFieldRequired(pathSuffix: Array<string | number>): boolean {
  return isRequiredInPreflight([...propertyPathPrefix, ...pathSuffix])
}

const keyAttrs = $derived(getFieldAttrs(['key'], 'text'))
const keyInputAttrs = $derived(keyAttrs)
const keyIssues = $derived(getFieldIssues(['key']))
const getPropertyLocaleFieldAttrs = $derived(
  (locale: string, field: 'label' | 'placeholder') =>
    getFieldAttrs(['i18n', contentFormKey(locale), field], 'text'),
)
const componentAttrs = $derived(
  getFieldAttrs(['component'], 'select') as { name?: string; value?: string },
)
const componentName = $derived(componentAttrs.name ?? '')
const componentIssues = $derived(getFieldIssues(['component']))
const minAttrs = $derived(getFieldAttrs(['min'], 'number'))
const minIssues = $derived(getFieldIssues(['min']))
const maxAttrs = $derived(getFieldAttrs(['max'], 'number'))
const maxIssues = $derived(getFieldIssues(['max']))
const propertyRootIssues = $derived([
  ...(getFieldIssues([]) ?? []),
  ...(getFieldIssues(['i18n']) ?? []),
])

function onValueBlur(event: FocusEvent, valueId: string, locale: string): void {
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
  onUpdateValueI18n(
    property.id,
    valueId,
    canonicalContentTag(locale),
    'value',
    nextValue,
  )
}

function onValueInput(event: Event, valueId: string, locale: string): void {
  if (!isEditing) return
  const target = event.currentTarget as HTMLElement
  const rawValue = target.textContent ?? ''
  const nextValue = sanitizeDragPayloadArtifacts(rawValue)
  if (!valuesAreTranslatable) {
    if (!isPrimary(locale)) return
    onUpdateValue(property.id, valueId, 'value', nextValue)
    return
  }
  onUpdateValueI18n(
    property.id,
    valueId,
    canonicalContentTag(locale),
    'value',
    nextValue,
  )
}

/** Clear one option cell while retaining its identity and every other language.
 * @param valueId Stable option identity. @param locale Cell language.
 * @returns Resolves after restoring keyboard focus to the emptied editor.
 */
async function clearOptionValue(valueId: string, locale: string): Promise<void> {
  if (!isEditing) return
  const editor = valueEditableRefs.get(getValueRefKey(valueId, locale))
  // Active contenteditable controls deliberately ignore reactive text updates.
  if (editor) editor.textContent = ''
  if (valuesAreTranslatable) {
    onUpdateValueI18n(property.id, valueId, canonicalContentTag(locale), 'value', '')
  } else if (isPrimary(locale)) {
    onUpdateValue(property.id, valueId, 'value', '')
  }
  await tick()
  editor?.focus({ preventScroll: true })
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

/**
 * Reorder only values belonging to this field using the indicated drop edge.
 * @param state - The active drag state.
 * @param targetId - The option receiving the drop.
 * @returns Nothing.
 */
function onValueDrop(state: DragDropState<{ id: string }>, targetId: string): void {
  if (isValueDnDDisabled()) return
  const nextIndex = getDropIndex(
    state,
    sortedValues.map(value => value.id),
    targetId,
    valueContainerGroup,
  )
  if (nextIndex === null) return
  onLayoutMutationStart?.()
  onMoveValue(property.id, state.draggedItem.id, nextIndex)
}

function isValueDnDDisabled(): boolean {
  return !isEditing || removeMode || optionRemoveMode
}

function getValueDraggableConfig(valueId: string): DraggableOptions<{ id: string }> {
  return {
    container: `${valueContainerGroup}-${valueId}`,
    containerGroup: valueContainerGroup,
    direction: 'horizontal',
    dragData: { id: valueId },
    handle: '[data-option-drag-handle]',
    disabled: isValueDnDDisabled(),
    interactive: [
      '.bits-project-field-card__value-editable',
      '[data-option-translations]',
    ],
    attributes: {
      draggingClass: 'bits-project-field-card__value-item--dragging',
    },
  }
}

function getValueDroppableConfig(valueId: string): DragDropOptions<{ id: string }> {
  return {
    container: `${valueContainerGroup}-${valueId}`,
    containerGroup: valueContainerGroup,
    direction: 'horizontal',
    disabled: isValueDnDDisabled(),
    callbacks: {
      onDrop: state => onValueDrop(state, valueId),
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

function resolveAdjacentValueEditable(
  valueId: string,
  locale: string,
  direction: 1 | -1,
): HTMLElement | null {
  const localeIndex = optionLocales.indexOf(locale)
  const valueIndex = sortedValues.findIndex(value => value.id === valueId)
  if (localeIndex < 0 || valueIndex < 0) return null

  let nextLocaleIndex = localeIndex
  let nextValueIndex = valueIndex

  while (true) {
    if (direction === 1) {
      if (nextLocaleIndex + 1 < optionLocales.length) {
        nextLocaleIndex += 1
      } else if (nextValueIndex + 1 < sortedValues.length) {
        nextValueIndex += 1
        nextLocaleIndex = 0
      } else {
        return null
      }
    } else {
      if (nextLocaleIndex - 1 >= 0) {
        nextLocaleIndex -= 1
      } else if (nextValueIndex - 1 >= 0) {
        nextValueIndex -= 1
        nextLocaleIndex = optionLocales.length - 1
      } else {
        return null
      }
    }

    const nextValue = sortedValues[nextValueIndex]
    const nextLocale = optionLocales[nextLocaleIndex]
    if (!nextValue || !nextLocale) return null

    const target = valueEditableRefs.get(getValueRefKey(nextValue.id, nextLocale))
    if (target && !target.closest('[hidden], [inert], [aria-hidden="true"]'))
      return target
  }
}

async function onValueEnter(event: KeyboardEvent, locale: string): Promise<void> {
  if (!isEditing) return
  if (event.key !== 'Enter') return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

  preventDefaultAndPropagation(event)
  onLayoutMutationStart?.()
  pendingAddedValueFocus = {
    locale,
    expectedCount: (property.values || []).length + 1,
  }
  await tick()
  onAddValue(property.id)
}

function onValueTab(event: KeyboardEvent, valueId: string, locale: string): void {
  if (!isEditing) return
  if (event.key !== 'Tab') return
  // Nonempty cells expose their clear button as the next native keyboard stop.
  if (!event.shiftKey && getValueDisplayText(valueId, locale).length) return

  const target = resolveAdjacentValueEditable(valueId, locale, event.shiftKey ? -1 : 1)
  if (!target) return

  preventDefaultAndPropagation(event)
  target.focus()
  queueMicrotask(() => selectAllEditableContent(target))
}

function bindValueEditable(
  node: HTMLElement,
  params: { valueId: string; locale: string; text: string },
): {
  update: (next: { valueId: string; locale: string; text: string }) => void
  destroy: () => void
} {
  let current = params
  let currentKey = getValueRefKey(current.valueId, current.locale)
  valueEditableRefs.set(currentKey, node)
  node.textContent = current.text

  return {
    update(next) {
      valueEditableRefs.delete(currentKey)
      current = next
      currentKey = getValueRefKey(current.valueId, current.locale)
      valueEditableRefs.set(currentKey, node)
      if (document.activeElement !== node) {
        node.textContent = current.text
      }
    },
    destroy() {
      valueEditableRefs.delete(currentKey)
    },
  }
}

function toggleOptionRemoveMode(): void {
  onLayoutMutationStart?.()
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

$effect(() => {
  const pending = pendingAddedValueFocus
  if (!pending) return
  if (sortedValues.length < pending.expectedCount) return

  const newestValue = sortedValues[sortedValues.length - 1]
  if (!newestValue) {
    pendingAddedValueFocus = null
    return
  }

  const key = getValueRefKey(newestValue.id, pending.locale)
  const node = valueEditableRefs.get(key)
  if (!node) return

  pendingAddedValueFocus = null
  queueMicrotask(() => {
    node.focus()
    selectAllEditableContent(node)
  })
})
</script>

{#snippet componentPreview(component: string)}
  <PropertyComponentPreview {component} />
{/snippet}
{#snippet settingPreview(value: string)}
  <PropertySettingPreview {value} />
{/snippet}

<div class="bits-theme min-w-0 px-6 py-4" data-property-editor>
  <!-- Settings are independent of the ordered locale rows in the two text columns. -->
  <div class="mt-4 grid min-w-0 gap-6 lg:grid-cols-3 lg:gap-0" data-property-columns>
    <section
      class="grid min-w-0 content-start gap-3 lg:pr-6"
      aria-label="Field settings"
      data-property-settings
    >
      <!-- Register custom hidden controls with this property row's remote fields. -->
      <input {...getFieldAttrsWithValue(['id'], 'hidden', property.id ?? '')}>
      <input {...getFieldAttrsWithValue(['type'], 'hidden', property.type ?? '')}>
      <input
        {...getFieldAttrsWithValue(['scope'], 'hidden', property.scope ?? 'project')}
      >
      <input {...getFieldAttrsWithValue(['hubId'], 'hidden', property.hubId ?? '')}>
      <input
        {...getFieldAttrsWithValue(
          ['isDefaultEnabled'],
          'hidden',
          Boolean(property.isDefaultEnabled),
        )}
      >
      <input
        {...getFieldAttrsWithValue(
          ['isTranslatable'],
          'hidden',
          Boolean(property.isTranslatable),
        )}
      >

      <TextInput
        label={m.admin__forms_property_name_api()}
        required={isFieldRequired(['key'])}
        value={(keyInputAttrs as { value?: string }).value ?? property.key ?? ''}
        issues={keyIssues}
        {isEditing}
        inputAttrs={keyInputAttrs}
        onValueChange={value => onUpdateBase(property.id, 'key', value)}
      />

      {#each ['dataType', 'cardinality', 'presentation', 'audience'] as key}
        <input
          {...getFieldAttrsWithValue(
            [key],
            'hidden',
            property[key as 'dataType'] ??
              (key === 'dataType' || key === 'presentation'
                ? 'text'
                : key === 'cardinality'
                  ? 'one'
                  : 'public'),
          )}
        >
      {/each}
      <SelectField
        value={property.component}
        displayClass="bg-foreground/4 border-foreground/10"
        items={componentOptions}
        itemPreview={componentPreview}
        contentClass="max-h-[calc(100dvh-2rem)] w-[var(--bits-select-anchor-width)] max-w-[calc(100vw-2rem)]"
        label={m.admin__forms_property_component()}
        required={isFieldRequired(['component'])}
        placeholder={m.admin__forms_property_component()}
        issues={componentIssues}
        {isEditing}
        name={componentName}
        onValueChange={value => {
          onLayoutMutationStart?.()
          onUpdateBase(property.id, 'component', value)
          if (
            (value === 'RangeField' || value === 'PhoneField') &&
            property.isTranslatable
          ) {
            onUpdateBase(property.id, 'isTranslatable', false)
          }
        }}
      />
      <input
        {...getFieldAttrsWithValue(
          ['dateResolution'],
          'hidden',
          property.dateResolution ?? 'day',
        )}
      >
      <input
        {...getFieldAttrsWithValue(
          ['timeMaxHour'],
          'hidden',
          property.timeMaxHour ?? 24,
        )}
      >
      {#if hasComponentSettings}
        <div class="grid min-w-0 gap-3">
          {#if property.component === 'TextField' ||
            property.component === 'InputField'}
            <SelectField
              label="Data type"
              value={property.dataType ?? 'text'}
              items={[
                { value: 'text', label: 'Text' },
                { value: 'number', label: 'Number' },
                { value: 'date', label: 'Date' },
                { value: 'boolean', label: 'Boolean' },
              ]}
              itemPreview={settingPreview}
              {isEditing}
              contentClass="w-[var(--bits-select-anchor-width)]"
              onValueChange={value => onUpdateBase(property.id, 'dataType', value)}
            />
          {/if}
          {#if property.dataType === 'dateRange'}
            <SelectField
              label="Resolution"
              value={property.dateResolution ?? 'day'}
              items={['decade', 'year', 'month', 'day'].map(value => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
              itemPreview={settingPreview}
              {isEditing}
              contentClass="w-[var(--bits-select-anchor-width)]"
              onValueChange={value =>
                onUpdateBase(property.id, 'dateResolution', value)}
            />
            <div class="grid min-w-0 grid-cols-2 gap-3">
              {#each ['min', 'max'] as bound}
                <input
                  {...getFieldAttrsWithValue(
                    [bound],
                    'hidden',
                    rangeDomain(property)[bound as 'min'],
                  )}
                >
                <TextInput
                  label={bound === 'min' ? 'Min' : 'Max'}
                  required={true}
                  {isEditing}
                  inputType={property.dateResolution === 'day'
                    ? 'date'
                    : property.dateResolution === 'month'
                      ? 'month'
                      : 'text'}
                  value={formatRangeEndpoint(
                    property,
                    rangeDomain(property)[bound as 'min'],
                  )}
                  inputClass="min-w-0 w-full"
                  issues={getFieldIssues([bound])}
                  inputAttrs={{
                    onchange: (event: Event) => {
                      const input = event.currentTarget as HTMLInputElement
                      try {
                        onUpdateBase(
                          property.id,
                          bound as 'min' | 'max',
                          parseRangeEndpoint(property, input.value),
                        )
                        input.setCustomValidity('')
                      } catch (error) {
                        input.setCustomValidity(
                          error instanceof Error ? error.message : 'Invalid date',
                        )
                        input.reportValidity()
                      }
                    },
                  }}
                />
              {/each}
            </div>
          {:else if property.dataType === 'timeRange'}
            <SelectField
              label="Service day"
              value={String(property.timeMaxHour ?? 24)}
              items={[
                { value: '24', label: '24 hours' },
                { value: '36', label: '36 hours' },
              ]}
              itemPreview={settingPreview}
              {isEditing}
              contentClass="w-[var(--bits-select-anchor-width)]"
              onValueChange={value =>
                onUpdateBase(property.id, 'timeMaxHour', Number(value))}
            />
            <div class="grid min-w-0 grid-cols-2 gap-3">
              <TextInput label="Min" value="00:00" readonly={true} {isEditing} />
              <TextInput
                label="Max"
                value={`${property.timeMaxHour ?? 24}:00`}
                readonly={true}
                {isEditing}
              />
            </div>
          {/if}
          {#if property.dataType === 'link'}
            <SelectField
              label="Cardinality"
              value={property.cardinality ?? 'one'}
              items={[
                { value: 'one', label: 'One' },
                { value: 'many', label: 'Many' },
              ]}
              itemPreview={settingPreview}
              {isEditing}
              contentClass="w-[var(--bits-select-anchor-width)]"
              onValueChange={value => onUpdateBase(property.id, 'cardinality', value)}
            />
            <SelectField
              label="Link text"
              value={property.presentation ?? 'labelledLinks'}
              items={[
                { value: 'numberedReferences', label: 'As Footnotes' },
                { value: 'labelledLinks', label: 'Display text' },
              ]}
              itemPreview={settingPreview}
              {isEditing}
              contentClass="w-[var(--bits-select-anchor-width)]"
              onValueChange={value => onUpdateBase(property.id, 'presentation', value)}
            />
          {/if}
        </div>
      {/if}

      {#if canShowRange}
        <div class="bits-project-field-card__range-row">
          <TextInput
            label={m.admin__forms_property_minimum()}
            inputType="number"
            value={(minAttrs as { value?: string }).value ??
              (property.min == null ? '' : String(property.min))}
            required={rangeBoundsAreRequired}
            issues={minIssues}
            {isEditing}
            inputAttrs={minAttrs}
          />
          <TextInput
            label={m.admin__forms_property_maximum()}
            inputType="number"
            value={(maxAttrs as { value?: string }).value ??
              (property.max == null ? '' : String(property.max))}
            required={rangeBoundsAreRequired}
            issues={maxIssues}
            {isEditing}
            inputAttrs={maxAttrs}
          />
        </div>
      {/if}
      <!-- Shared definition settings apply to every language. -->
      <FormFieldSettingsSwitches
        propertyId={property.id}
        showTranslations={supportsTranslations}
        isTranslatable={Boolean(property.isTranslatable)}
        isPublic={property.audience !== 'internal'}
        {isEditing}
        onTranslationsChange={value => {
          onLayoutMutationStart?.()
          onUpdateBase(property.id, 'isTranslatable', value)
        }}
        onAudienceChange={value =>
          onUpdateBase(property.id, 'audience', value ? 'public' : 'internal')}
      />
    </section>
    {#each ['label', 'placeholder'] as const as field}
      {@const label =
        field === 'label'
          ? m.admin__forms_property_name_ui()
          : m.admin__forms_property_input_placeholder()}
      <section
        class="border-border/50 min-w-0 border-t pt-4 lg:border-t-0 lg:border-l lg:px-6 lg:pt-0"
        aria-label={label}
        data-property-text-column={field}
      >
        <h4 class="mb-3 text-sm font-bold text-[var(--form-label)]">{label}</h4>
        <FormI18nSourceBar
          visible={multilingual &&
            isEditing &&
            getTranslationSources({ type: field }).length > 0}
          sources={getTranslationSources({ type: field })}
          label={m.address_translate_from()}
          busy={translating === field}
          disabled={translating !== null || !hasTranslationTargets({ type: field })}
          onTranslate={source => void translateMissing(source, { type: field })}
        />
        <!-- Keep controls mounted while each language reveals its content and spacing. -->
        <div class="-mb-2 grid">
          {#each locales as locale (locale)}
            {@const key = contentFormKey(locale)}
            {@const genKey = field === 'label' ? 'labelGen' : 'placeholderGen'}
            {@const gen = getPropertyGenState(locale, genKey)}
            {@const value =
              (getPropertyLocaleFieldAttrs(key, field) as { value?: string }).value ??
              getLocaleEntry(property.i18n, locale)?.[field] ??
              ''}
            <div
              class="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none"
              style:grid-template-rows={shownLocales.includes(locale) ? '1fr' : '0fr'}
              style:opacity={shownLocales.includes(locale) ? 1 : 0}
              aria-hidden={!shownLocales.includes(locale)}
              inert={!shownLocales.includes(locale)}
              data-property-locale={locale}
            >
              <div class="min-h-0 overflow-hidden">
                <div class="pb-2">
                  <input
                    {...getFieldAttrsWithValue(['i18n', key, genKey], 'hidden', gen)}
                  >
                  <FormFieldLocaleText
                    {value}
                    {gen}
                    {locale}
                    label={`${label} ${locale}`}
                    prefix={multilingual ? shortLocaleLabel(locale) : ''}
                    attrs={getPropertyLocaleFieldAttrs(key, field)}
                    issues={getFieldIssues(['i18n', key, field])}
                    required={isFieldRequired(['i18n', key, field])}
                    {isEditing}
                    onValue={text => onUpdateI18n(property.id, locale, field, text)}
                    onGen={next => onUpdateI18n(property.id, locale, genKey, next)}
                  />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  {#if canShowValues}
    <!-- One draggable option column retains all locale cells and its stable identity. -->
    <div class="mt-6 min-w-0" data-property-options>
      <FormFieldPropertyValueWrapper
        {isEditing}
        {optionRemoveMode}
        onAdd={() => {
          onLayoutMutationStart?.()
          onAddValue(property.id)
        }}
        onSort={() => {
          onLayoutMutationStart?.()
          onSortValuesAlphabetically(property.id, primaryLocale)
        }}
        onToggleRemoveMode={toggleOptionRemoveMode}
      >
        {#snippet rows()}
          <section
            class="min-w-0 overflow-x-auto overscroll-x-contain pb-2"
            data-property-options-scroll
            aria-label="Dropdown options"
          >
            <div
              class="grid w-max min-w-full auto-cols-[minmax(16rem,20rem)] grid-flow-col items-stretch gap-x-3 transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none"
              style:grid-template-rows={`auto ${optionLocales.map(locale => (!valuesAreTranslatable || shownLocales.includes(locale) ? 'minmax(0, 1fr)' : 'minmax(0, 0fr)')).join(' ')}`}
            >
              {#each sortedValues as value, valueIndex (value.id)}
                {@const formValueIndex = (property.values || []).findIndex(
                  candidate => candidate.id === value.id,
                )}
                {@const resolvedValueIndex =
                  formValueIndex >= 0 ? formValueIndex : valueIndex}
                <!-- Only the grip owns touch reordering; option bodies keep native panning. -->
                <FormFieldPropertyValueItem
                  {isEditing}
                  {optionRemoveMode}
                  class="row-span-full grid! h-auto! grid-rows-subgrid items-stretch!"
                  hasIssues={optionLocales.some(locale =>
                    Boolean(getValueIssues(value.id, locale)?.length),
                  )}
                  valueId={value.id}
                  propertyId={property.id}
                  onRemove={(propertyId, valueId) => {
                    onLayoutMutationStart?.()
                    onRemoveValue(propertyId, valueId)
                  }}
                  draggableConfig={getValueDraggableConfig(value.id)}
                  droppableConfig={getValueDroppableConfig(value.id)}
                >
                  {#snippet content()}
                    <input
                      {...getFieldAttrsWithValue(
                        ['values', resolvedValueIndex, 'id'],
                        'hidden',
                        value.id,
                      )}
                    >
                    <input
                      {...getFieldAttrsWithValue(
                        ['values', resolvedValueIndex, 'rank'],
                        'hidden',
                        valueIndex,
                      )}
                    >
                    <div
                      class="border-border/40 flex min-w-0 items-stretch border-b"
                      class:pr-8={optionRemoveMode}
                      data-option-header
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2 pb-2 text-left"
                        class:cursor-grab={!isValueDnDDisabled()}
                        class:select-none={!isValueDnDDisabled()}
                        data-option-drag-handle
                        class:touch-none={!isValueDnDDisabled()}
                        disabled={isValueDnDDisabled()}
                        aria-label={`Reorder option ${valueIndex + 1}`}
                        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                        onkeydown={event => {
                          if (
                            event.altKey &&
                            ['ArrowLeft', 'ArrowRight'].includes(event.key)
                          ) {
                            event.preventDefault()
                            const nextIndex =
                              valueIndex + (event.key === 'ArrowLeft' ? -1 : 1)
                            if (nextIndex >= 0 && nextIndex < sortedValues.length) {
                              onLayoutMutationStart?.()
                              onMoveValue(property.id, value.id, nextIndex)
                            }
                          }
                        }}
                      >
                        <GripVertical class="text-muted-foreground size-4 shrink-0" />
                        <span
                          class="text-muted-foreground shrink-0 text-xs font-semibold"
                          >Option {valueIndex + 1}</span
                        >
                      </button>
                      <div class="ml-auto min-w-0 pb-2" data-option-translations>
                        <FormI18nSourceBar
                          compact
                          visible={multilingual &&
                            valuesAreTranslatable &&
                            isEditing &&
                            getTranslationSources({ type: 'value', valueId: value.id })
                              .length > 0}
                          sources={getTranslationSources({
                            type: 'value',
                            valueId: value.id,
                          })}
                          label={m.address_translate_from()}
                          busy={translating ===
                            translationKey({ type: 'value', valueId: value.id })}
                          disabled={optionRemoveMode ||
                            translating !== null ||
                            !hasTranslationTargets({
                              type: 'value',
                              valueId: value.id,
                            })}
                          onTranslate={source =>
                            void translateMissing(source, {
                              type: 'value',
                              valueId: value.id,
                            })}
                        />
                      </div>
                    </div>
                    {#each optionLocales as locale (locale)}
                      {@const showCoreFields = isPrimary(locale)}
                      {@const valueDisplayText = getValueDisplayText(value.id, locale)}
                      <div
                        class="min-h-0 overflow-hidden transition-opacity duration-200 ease-in-out motion-reduce:transition-none"
                        style:opacity={!valuesAreTranslatable ||
                        shownLocales.includes(locale)
                          ? 1
                          : 0}
                        aria-hidden={valuesAreTranslatable &&
                          !shownLocales.includes(locale)}
                        inert={valuesAreTranslatable && !shownLocales.includes(locale)}
                        data-option-locale={locale}
                      >
                        <div
                          class="grid min-h-10 min-w-0 items-start gap-2 pt-3 {multilingual &&
                          valuesAreTranslatable
                            ? 'grid-cols-[2.5rem_minmax(0,1fr)]'
                            : 'grid-cols-1'}"
                        >
                          {#if multilingual && valuesAreTranslatable}
                            <span
                              class="text-muted-foreground py-2 text-center font-mono text-xs"
                              >{shortLocaleLabel(locale)}</span
                            >
                          {/if}
                          {#if valuesAreTranslatable}
                            <input
                              {...getFieldAttrsWithValue(
                                [
                                  'values',
                                  resolvedValueIndex,
                                  'i18n',
                                  contentFormKey(locale),
                                  'valueGen',
                                ],
                                'hidden',
                                Boolean(getLocaleEntry(value.i18n, locale)?.valueGen),
                              )}
                            >
                            <input
                              {...getFieldAttrsWithValue(
                                [
                                  'values',
                                  resolvedValueIndex,
                                  'i18n',
                                  contentFormKey(locale),
                                  'value',
                                ],
                                'hidden',
                                valueDisplayText,
                              )}
                            >
                          {:else if showCoreFields}
                            <input
                              {...getFieldAttrsWithValue(
                                ['values', resolvedValueIndex, 'value'],
                                'hidden',
                                valueDisplayText,
                              )}
                            >
                          {/if}

                          {#if valuesAreTranslatable || showCoreFields}
                            <div class="group/option-value relative min-w-0">
                              <!-- biome-ignore lint/a11y/useSemanticElements: Contenteditable preserves the existing inline selection and paste behavior. -->
                              <div
                                class={`bits-project-field-card__value-editable focus-override pr-9! empty:before:opacity-50 empty:before:content-[attr(data-placeholder)] ${!isEditing ? 'bits-project-field-card__value-editable--readonly' : ''}`}
                                role="textbox"
                                aria-label={`Option ${valueIndex + 1} ${locale}`}
                                data-placeholder="Option label"
                                aria-readonly={!isEditing}
                                contenteditable={isEditing ? 'plaintext-only' : false}
                                tabindex={isEditing ? 0 : -1}
                                use:bindValueEditable={{
                                  valueId: value.id,
                                  locale,
                                  text: valueDisplayText,
                                }}
                                onbeforeinput={preventDropBeforeInput}
                                onkeydown={event => {
                                  onValueTab(event, value.id, locale)
                                  void onValueEnter(event, locale)
                                }}
                                oninput={event => onValueInput(event, value.id, locale)}
                                ondragover={preventNativeDropOver}
                                ondrop={preventNativeDropInsert}
                                onfocus={onValueFocus}
                                ondblclick={onValueDoubleClick}
                                onblur={event => onValueBlur(event, value.id, locale)}
                              ></div>
                              {#if isEditing && valueDisplayText.length}
                                <button
                                  type="button"
                                  aria-label={`${m.filters__clear()} Option ${valueIndex + 1} ${locale}`}
                                  class="text-muted-foreground hover:text-primary focus-visible:outline-primary absolute top-0 right-0 flex size-8 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/option-value:opacity-100 group-hover/option-value:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 [@media(hover:none)]:opacity-100"
                                  onpointerdown={event => event.preventDefault()}
                                  onclick={() =>
                                    void clearOptionValue(value.id, locale)}
                                >
                                  <XIcon class="size-3.5" aria-hidden="true" />
                                </button>
                              {/if}
                            </div>
                          {:else}
                            <div
                              class="bits-project-field-card__value-placeholder"
                              aria-hidden="true"
                            ></div>
                          {/if}
                          {#if getValueIssues(value.id, locale)?.length}
                            <div class="bits-form__error">
                              {getValueIssues(value.id, locale)
                                ?.map(issue => issue.message)
                                .join(' ')}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  {/snippet}
                </FormFieldPropertyValueItem>
              {/each}
            </div>
          </section>
        {/snippet}
      </FormFieldPropertyValueWrapper>
    </div>
  {/if}
  {#if translationMessage}
    <p role="alert" class="text-error mt-2 text-sm">{translationMessage}</p>
  {/if}
  {#if propertyRootIssues.length > 0}
    <div class="bits-form__error">
      {propertyRootIssues.map(issue => issue.message).join(' ')}
    </div>
  {/if}
</div>
