<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import { cubicInOut } from 'svelte/easing'
// DRAG AND DROP
import { draggable, droppable, type DragDropState } from '@thisux/sveltednd'
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// TYPES
// ICONS
import PlusIcon from 'virtual:icons/lucide/plus'
import TrashIcon from 'virtual:icons/lucide/trash-2'
import GripIcon from 'virtual:icons/lucide/grip-vertical'
import MinusIcon from 'virtual:icons/lucide/minus'
import CheckIcon from 'virtual:icons/lucide/check'
import XIcon from 'virtual:icons/lucide/x'
// COMPONENTS
import FeatureIntentHelp from './FeatureIntentHelp.svelte'
import FeaturePolicyChoice from './FeaturePolicyChoice.svelte'
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/index.js'
import {
  typeInputAppearance,
  typeReadOnlyInputAppearance,
  typeSelectAppearance,
} from './featureTypeEditor.styles'

// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// API
import { translateContentField } from '#lib/api/translation.remote.js'
import {
  getFeatureNameProperties,
  getFeatureNameFieldsProject,
} from '#lib/api/featureIntents.remote.js'
// DOMAIN
import {
  generateFeatureName,
  type FeatureNameRule,
} from '#lib/features/locationPolicy.js'
let {
  scopeType,
  scopeId,
  rule,
  onChange,
  locales = ['en', 'zh-Hant', 'zh-Hans'],
  disabled = false,
}: {
  scopeType: 'hub' | 'project' | 'layer'
  scopeId: string
  rule: FeatureNameRule
  locales?: string[]
  disabled?: boolean
  onChange: (rule: FeatureNameRule) => void
} = $props()
let properties = $state<
  {
    id: string
    label: string
    component?: string | null
    test?: 'boolean' | 'hasValue'
    examples?: Record<string, string>
  }[]
>([])
let failed = $state(false)
let loading = $state(true)
let reload = $state(0)
let fieldsProjectId = $state<string | null>(null)
// Visible languages belong to the parent's multilingual bar; hidden translations stay in the rule.
const editingLocales = $derived([...new Set(locales.map(canonicalContentTag))])
const uid = $props.id()
const dragGroup = `naming-${uid}`
let ruleKeys = $state<string[]>(
  untrack(() => rule.conditions.map(() => crypto.randomUUID())),
)
// Inheritance resets can replace the rule; keep UI-only keys aligned without persisting them.
$effect(() => {
  if (ruleKeys.length !== rule.conditions.length)
    ruleKeys = rule.conditions.map((_, index) => ruleKeys[index] ?? crypto.randomUUID())
})
let exampleValues = $state<Record<string, string>>({})
const conditionProperties = $derived([
  ...new Set(rule.conditions.map(condition => condition.propertyId)),
])
/** Build preview values from field examples in the title's language.
 * @param locale Content locale. @returns Synthetic values for the selected preview states.
 */
function previewValues(locale: string): Record<string, boolean | string | null> {
  return Object.fromEntries(
    conditionProperties.map(id => [
      id,
      rule.conditions.some(
        condition => condition.propertyId === id && condition.test === 'hasValue',
      )
        ? exampleValues[id] === 'true'
          ? propertyExample(id, locale)
          : ''
        : exampleValues[id] === 'true'
          ? true
          : exampleValues[id] === 'false'
            ? false
            : null,
    ]),
  )
}
$effect(() => {
  reload
  let cancelled = false
  failed = false
  loading = true
  properties = []
  fieldsProjectId = scopeType === 'project' ? scopeId : null
  if (scopeType === 'layer') {
    getFeatureNameFieldsProject({ type: scopeType, id: scopeId })
      .then(id => {
        if (!cancelled) fieldsProjectId = id
      })
      .catch(() => {
        if (!cancelled) fieldsProjectId = null
      })
  }
  getFeatureNameProperties({ type: scopeType, id: scopeId })
    .then(rows => {
      if (!cancelled) {
        properties = rows
        loading = false
      }
    })
    .catch(() => {
      if (!cancelled) {
        failed = true
        loading = false
      }
    })
  return () => {
    cancelled = true
  }
})
const translatedStates = ['true', 'false', 'null'] as const
let translating = $state<string | undefined>()
let translationError = $state('')
let disposed = false
onDestroy(() => {
  disposed = true
})

/** Read a locale fragment while accepting legacy locale aliases.
 * @param condition Rule fragment. @param locale Canonical language tag.
 * @returns Stored text and formatting, or an empty fragment.
 */
function localeCase(
  condition: FeatureNameRule['conditions'][number],
  locale: string,
): ReturnType<typeof emptyCase> {
  return (
    Object.entries(condition.locales).find(
      ([tag]) => canonicalContentTag(tag) === locale,
    )?.[1] ?? emptyCase()
  )
}
const translationSources = $derived(
  editingLocales
    .filter(locale =>
      rule.conditions.some(condition =>
        translatedStates.some(state => localeCase(condition, locale)[state].trim()),
      ),
    )
    .map(locale => {
      const record = getContentLocaleRecord(locale, getLocaleKey())
      return {
        locale,
        label: record.autonym,
        accessibleLabel: m.profile_translate_source({ language: record.name }),
      }
    }),
)
const hasTranslationTargets = $derived(
  translationSources.some(({ locale: source }) =>
    rule.conditions.some(condition =>
      translatedStates.some(
        state =>
          localeCase(condition, source)[state].trim() &&
          editingLocales.some(
            target => target !== source && !localeCase(condition, target)[state].trim(),
          ),
      ),
    ),
  ),
)

/** Fill empty case text across all conditions without overwriting edits made during translation.
 * @param source Selected source language.
 * @returns Completion of the bounded translation batch.
 */
async function translateEmptyCases(source: string): Promise<void> {
  if (disabled || translating) return
  const jobs = rule.conditions.flatMap((condition, index) =>
    translatedStates
      .filter(state => condition.test !== 'hasValue' || state === 'false')
      .flatMap(state => {
        const text = localeCase(condition, source)[state]
        if (!text.trim()) return []
        return editingLocales
          .filter(
            target => target !== source && !localeCase(condition, target)[state].trim(),
          )
          .map(target => ({
            key: ruleKeys[index],
            propertyId: condition.propertyId,
            state,
            text,
            target,
          }))
      }),
  )
  if (!jobs.length) return
  translating = source
  translationError = ''
  let cursor = 0
  const results: { job: (typeof jobs)[number]; text: string }[] = []
  // Limit provider fanout and collect results before applying one coherent draft update.
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (!disposed && cursor < jobs.length) {
        const job = jobs[cursor++]
        try {
          const result = await translateContentField({
            source,
            target: job.target,
            text: job.text,
          })
          if (result.status === 'translated') results.push({ job, text: result.text })
          else translationError = result.message
        } catch {
          translationError = 'Some values could not be translated. Please try again.'
        }
      }
    }),
  )
  if (!disposed && !disabled) {
    const next = structuredClone($state.snapshot(rule))
    let changed = false
    for (const { job, text } of results) {
      const index = ruleKeys.indexOf(job.key)
      const condition = next.conditions[index]
      if (
        !condition ||
        condition.propertyId !== job.propertyId ||
        localeCase(condition, source)[job.state] !== job.text ||
        localeCase(condition, job.target)[job.state].trim()
      )
        continue
      const tag =
        Object.keys(condition.locales).find(
          tag => canonicalContentTag(tag) === job.target,
        ) ?? job.target
      condition.locales[tag] = {
        ...localeCase(condition, job.target),
        [job.state]: text,
      }
      changed = true
    }
    if (changed) onChange(next)
  }
  translating = undefined
}

/** Change one localized rule without mutating inherited configuration. @param index Conditional fragment. @param locale Locale tag. @param key Fragment field. @param value Authored text. @returns Nothing. */
function update(index: number, locale: string, key: string, value: string): void {
  const next = structuredClone($state.snapshot(rule))
  const stored =
    Object.keys(next.conditions[index].locales).find(
      tag => canonicalContentTag(tag) === locale,
    ) ?? locale
  next.conditions[index].locales[stored] = {
    ...emptyCase(),
    ...next.conditions[index].locales[stored],
    [key]: value,
  }
  onChange(next)
}

/** Seed a newly shown language without copying text from another language.
 * @returns An empty conditional fragment with the standard suffix spacing.
 */
function emptyCase(): FeatureNameRule['conditions'][number]['locales'][string] {
  return { true: '', false: '', null: '', placement: 'suffix', separator: ' • ' }
}
// Materialize visible language defaults in the draft so preview and Accept use the displayed controls.
$effect(() => {
  if (disabled) return
  const missing = rule.conditions.some(condition =>
    editingLocales.some(
      locale =>
        !Object.keys(condition.locales).some(
          tag => canonicalContentTag(tag) === locale,
        ),
    ),
  )
  if (!missing) return
  const next = structuredClone($state.snapshot(rule))
  for (const condition of next.conditions) {
    for (const locale of editingLocales) {
      if (
        !Object.keys(condition.locales).some(tag => canonicalContentTag(tag) === locale)
      )
        condition.locales[locale] = emptyCase()
    }
  }
  untrack(() => onChange(next))
})
/** Reorder a complete rule and every locale without changing its text.
 * @param from Current position. @param to New position. @returns Nothing.
 */
function move(from: number, to: number): void {
  if (disabled || from < 0 || to < 0 || to >= rule.conditions.length || from === to)
    return
  const conditions = [...rule.conditions]
  const keys = [...ruleKeys]
  conditions.splice(to, 0, conditions.splice(from, 1)[0])
  keys.splice(to, 0, keys.splice(from, 1)[0])
  ruleKeys = keys
  onChange({ ...rule, conditions })
}
/** Apply only drops from this rule list.
 * @param state Drag state. @param target Destination key. @returns Nothing.
 */
function dropRule(state: DragDropState, target: string): void {
  const to = getDropIndex(state, ruleKeys, target, dragGroup)
  const item = state.draggedItem
  if (to === null || !item || typeof item !== 'object' || !('id' in item)) return
  move(ruleKeys.indexOf(String(item.id)), to)
}
/** Support reordering without a pointer from the same header handle.
 * @param event Keyboard event. @param index Rule position. @returns Nothing.
 */
function reorderKey(event: KeyboardEvent, index: number): void {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  move(index, index + (event.key === 'ArrowUp' ? -1 : 1))
}
/** Add an empty rule for the visible languages, preserving every existing rule.
 * @returns Nothing; unavailable fields and the rule limit disable this action.
 */
function addRule(): void {
  if (
    disabled ||
    loading ||
    failed ||
    !properties.length ||
    rule.conditions.length >= 10
  )
    return
  ruleKeys = [...ruleKeys, crypto.randomUUID()]
  onChange({
    ...rule,
    conditions: [
      ...rule.conditions,
      {
        propertyId: properties[0].id,
        ...(properties[0].test === 'hasValue' ? { test: 'hasValue' as const } : {}),
        locales: Object.fromEntries(
          editingLocales.map(locale => [locale, emptyCase()]),
        ),
      },
    ],
  })
}
/** Remove the selected rule as a whole, including its hidden locale text.
 * @param index Rule position. @returns Nothing.
 */
function removeRule(index: number): void {
  if (disabled) return
  ruleKeys = ruleKeys.filter((_, i) => i !== index)
  onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) })
}
/** Read a saved field value from the authorized project's examples.
 * @param propertyId Selected field. @param locale Content locale. @returns Saved example or an empty string when no populated value exists.
 */
function propertyExample(propertyId: string, locale: string): string {
  const property = properties.find(property => property.id === propertyId)
  const examples = property?.examples ?? {}
  const tag = canonicalContentTag(locale)
  let example =
    Object.entries(examples).find(
      ([key]) => key !== '*' && canonicalContentTag(key) === tag,
    )?.[1] ??
    examples['*'] ??
    ''
  // Multi-value fields store JSON arrays; show just the first saved item.
  try {
    const value: unknown = JSON.parse(example)
    if (Array.isArray(value)) {
      const first: unknown = value[0]
      example =
        typeof first === 'string' || typeof first === 'number' ? String(first) : ''
    }
  } catch {
    // Ordinary text is already suitable for display.
  }
  return property?.component === 'PhoneField'
    ? example.replace(/^\s*\+852\s*/, '')
    : example
}
/** Describe cases using the selected property's condition semantics.
 * @param condition Naming condition. @param state Persisted case key. @returns Visible and accessible input label.
 */
function caseLabel(
  condition: FeatureNameRule['conditions'][number],
  state: string,
): string {
  if (condition.test === 'hasValue')
    return state === 'true' ? 'Has value' : 'Has no value'
  return state === 'true' ? 'True' : state === 'false' ? 'False' : 'Unset'
}
/** Resolve a localized preview name for the selected source.
 * @param locale Content locale. @param source Name source. @returns An example name, with an English fallback.
 */
function sampleName(locale: string, source: 'feature' | 'location'): string {
  const names: Record<string, { feature: string; location: string }> = {
    en: { feature: 'Beautiful Sign', location: 'Hotspot' },
    'zh-Hant': { feature: '美麗招牌', location: '熱門地點' },
    'zh-Hans': { feature: '美丽招牌', location: '热门地点' },
    ja: { feature: '美しい看板', location: '人気スポット' },
    ko: { feature: '아름다운 간판', location: '인기 명소' },
    fr: { feature: 'Belle enseigne', location: 'Lieu prisé' },
    es: { feature: 'Un letrero bonito', location: 'Lugar popular' },
    de: { feature: 'Schönes Schild', location: 'Treffpunkt' },
    pt: { feature: 'Bela placa', location: 'Local popular' },
    it: {
      feature: 'Bella insegna',
      location: 'Luogo popolare',
    },
  }
  const tag = canonicalContentTag(locale)
  return (names[tag] ?? names[tag.split('-')[0]] ?? names.en)[source]
}
</script>

<section
  class="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]"
  aria-label="Naming rules"
>
  <div class="grid min-w-0 gap-4">
    <FeaturePolicyChoice
      label="Start with the name from"
      layout="horizontal"
      value={rule.base}
      {disabled}
      options={[
        {
          value: 'feature',
          scene: 'object',
          title: 'Feature base name',
          description: 'Use the feature’s own name',
        },
        {
          value: 'location',
          scene: 'place',
          title: 'Linked location name',
          description: 'Use the linked place’s name',
        },
      ]}
      onChange={value => onChange({ ...rule, base: value as FeatureNameRule['base'] })}
    />
    {#if loading}
      <span
        role="status"
        aria-label="Loading field values"
        aria-busy="true"
        class="sr-only"
      ></span>
    {:else if failed}
      <p role="alert">Unable to load naming fields.</p>
      <Button text="Retry loading fields" style="ghost" onClick={() => reload++} />
    {:else if !properties.length}
      <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>No boolean, toggle, phone or short-text fields</span>
        <FeatureIntentHelp topic="fields" label="About naming fields" {scopeType} />
        {#if fieldsProjectId}
          <a
            class="text-primary underline underline-offset-2"
            href={`/admin/projects/${encodeURIComponent(fieldsProjectId)}#fields`}
            >Edit fields</a
          >
        {/if}
      </div>
    {/if}
    <div class="flex min-w-0 items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h4 class="text-sm font-medium">Conditions</h4>
        <span class="text-muted-foreground text-xs">{rule.conditions.length}/10</span>
      </div>
      {#if !disabled}
        <button
          type="button"
          aria-label="Add condition"
          class="text-primary hover:bg-primary/5 focus-visible:outline-primary inline-flex shrink-0 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium focus-visible:outline-2 disabled:opacity-40"
          disabled={loading ||
            failed ||
            !properties.length ||
            rule.conditions.length >= 10}
          onclick={addRule}
        >
          <PlusIcon class="size-4" aria-hidden="true" />
          Add condition
        </button>
      {/if}
    </div>
    {#if !rule.conditions.length}
      <p class="text-muted-foreground text-xs">No conditions. Use the name as-is.</p>
    {/if}
    <div class="grid min-w-0 gap-3" data-naming-rule-list>
      {#each rule.conditions as condition, index (ruleKeys[index] ?? index)}
        {@const key = ruleKeys[index] ?? String(index)}
        {@const fieldName =
          properties.find(property => property.id === condition.propertyId)?.label ??
          'Unavailable field'}
        <section
          class="bits-project-field-card min-w-0 before:hidden! after:hidden!"
          aria-label={`Rule ${index + 1}: ${fieldName}`}
          data-naming-rule
          use:draggable={{
            container: `${dragGroup}-${key}`,
            containerGroup: dragGroup,
            dragData: { id: key },
            handle: '[data-rule-drag-handle]',
            disabled: disabled || rule.conditions.length < 2,
            attributes: { draggingClass: 'opacity-50' },
          }}
          use:droppable={{
            container: `${dragGroup}-${key}`,
            containerGroup: dragGroup,
            disabled,
            callbacks: { onDrop: state => dropRule(state, key) },
            attributes: { dragOverClass: 'ring-2 ring-primary/40' },
          }}
        >
          <header
            class="bits-project-field-card__header bits-form__i18n-card border-border/40! grid! grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-none! border-0! border-b! px-3! py-2!"
          >
            <button
              type="button"
              data-rule-drag-handle
              aria-label={`Reorder ${fieldName}`}
              data-tooltip="Drag to reorder. Use Alt + Up or Down with the keyboard."
              disabled={disabled || rule.conditions.length < 2}
              onkeydown={event => reorderKey(event, index)}
              class="text-muted-foreground hover:bg-muted/40 focus-visible:outline-primary flex size-8 touch-none items-center justify-center rounded focus-visible:outline-2 active:cursor-grabbing enabled:cursor-grab disabled:opacity-30"
            >
              <GripIcon class="size-4" />
            </button>
            <SelectField
              label="Property"
              value={condition.propertyId}
              isEditing={!disabled}
              class={String.raw`min-w-0 [&_.bits-form\_\_label]:hidden`}
              {...typeSelectAppearance}
              contentClass={String.raw`${typeSelectAppearance.contentClass} [&_.bits-form\_\_select-viewport]:bg-transparent!`}
              triggerAttrs={{ 'aria-label': 'Rule property' }}
              items={properties.map(property => ({
                value: property.id,
                label: property.label,
              }))}
              onValueChange={value =>
                onChange({
                  ...rule,
                  conditions: rule.conditions.map((item, i) =>
                    i === index
                      ? {
                          ...item,
                          propertyId: value,
                          test:
                            properties.find(property => property.id === value)?.test ??
                            'boolean',
                        }
                      : item,
                  ),
                })}
            />
            <button
              type="button"
              aria-label={`Remove ${fieldName} rule`}
              data-tooltip="Remove rule"
              {disabled}
              onclick={() => removeRule(index)}
              class="text-muted-foreground hover:text-destructive hover:bg-destructive/5 focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2 disabled:opacity-30"
            >
              <TrashIcon class="size-4" />
            </button>
          </header>
          <div class="grid min-w-0 gap-3 p-3">
            {#if !loading &&
              !failed &&
              !properties.some(property => property.id === condition.propertyId)}
              <p role="alert" class="text-sm">
                This field is unavailable. Choose another field or remove the rule.
              </p>
            {/if}
            {#each editingLocales as locale, localeIndex}
              {@const text =
                Object.entries(condition.locales).find(
                  ([tag]) => canonicalContentTag(tag) === locale,
                )?.[1] ?? emptyCase()}
              <fieldset
                class={`grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 ${localeIndex > 0 ? String.raw`[&_.bits-form\_\_label]:hidden` : ''}`}
                aria-label={shortLocaleLabel(locale)}
              >
                <div
                  class="col-start-2 grid min-w-0 gap-2 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
                >
                  <div
                    class={`relative grid min-w-0 gap-2 ${condition.test === 'hasValue' ? 'grid-cols-2' : 'grid-cols-3'}`}
                  >
                    <span
                      class="text-muted-foreground absolute right-full bottom-0 mr-2 flex h-[42px] w-8 items-center justify-center font-mono text-xs"
                      aria-hidden="true"
                      data-rule-locale-label={locale}
                      >{shortLocaleLabel(locale)}</span
                    >

                    {#each condition.test === 'hasValue'
                      ? ['true', 'false']
                      : ['true', 'false', 'null'] as state}
                      {#if condition.test === 'hasValue' && state === 'true'}
                        <div class="grid min-w-0 content-start gap-2">
                          <Label text="Has value" />
                          <p
                            class="min-w-0 py-2 text-sm break-words whitespace-pre-wrap"
                            data-property-example={locale}
                          >
                            {#if propertyExample(condition.propertyId, locale)}
                              <span class="text-muted-foreground">e.g.</span>
                              {propertyExample(condition.propertyId, locale)}
                            {:else}
                              <span class="text-muted-foreground"
                                >No filled-in values yet</span
                              >
                            {/if}
                          </p>
                        </div>
                      {:else}
                        <TextInput
                          label={caseLabel(condition, state)}
                          value={text[state as 'true']}
                          isEditing={!disabled}
                          {...disabled
                            ? typeReadOnlyInputAppearance
                            : typeInputAppearance}
                          inputAttrs={{
                            'aria-label': caseLabel(condition, state),
                            placeholder: '—',
                            lang: locale,
                            dir: 'auto',
                          }}
                          onValueChange={value => update(index, locale, state, value)}
                        />
                      {/if}
                    {/each}
                  </div>
                  <div
                    class="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2"
                  >
                    <SelectField
                      label="Placement"
                      triggerAttrs={{ 'aria-label': 'Placement' }}
                      value={text.placement}
                      isEditing={!disabled}
                      {...typeSelectAppearance}
                      contentClass={String.raw`${typeSelectAppearance.contentClass} [&_.bits-form\_\_select-viewport]:bg-transparent!`}
                      items={[
                        { value: 'suffix', label: 'After name' },
                        { value: 'prefix', label: 'Before name' },
                      ]}
                      onValueChange={value => update(index, locale, 'placement', value)}
                    />
                    <TextInput
                      label="Separator"
                      trimOnBlur={false}
                      inputAttrs={{ 'aria-label': 'Separator' }}
                      value={text.separator}
                      isEditing={!disabled}
                      {...disabled ? typeReadOnlyInputAppearance : typeInputAppearance}
                      onValueChange={value => update(index, locale, 'separator', value)}
                    />
                  </div>
                </div>
              </fieldset>
            {/each}
          </div>
        </section>
      {/each}
    </div>
    <div data-rule-translation-bar>
      <FormI18nSourceBar
        visible={!disabled && editingLocales.length > 1 && rule.conditions.length > 0}
        sources={translationSources}
        label={m.profile_translate_from()}
        busy={Boolean(translating)}
        busySource={translating}
        disabled={disabled || Boolean(translating)}
        hasTargets={hasTranslationTargets}
        onTranslate={source => void translateEmptyCases(source)}
      />
      {#if translationError}
        <p role="alert" class="text-destructive mt-2 text-xs">{translationError}</p>
      {/if}
    </div>
    {#if rule.conditions.length >= 10}
      <p class="text-muted-foreground text-xs">Maximum 10 rules.</p>
    {/if}
  </div>
  <fieldset
    class="border-border/40 bg-muted/20 grid min-w-0 gap-3 rounded-lg border p-4 lg:sticky lg:top-6"
    aria-label="Complete title example"
  >
    <legend class="text-sm font-medium">Preview</legend>
    <div class="flex min-w-0 flex-wrap gap-2 overflow-x-auto" data-preview-fields>
      {#each conditionProperties as propertyId}
        {@const label =
          properties.find(property => property.id === propertyId)?.label ?? propertyId}
        {@const presence = rule.conditions.some(
          condition =>
            condition.propertyId === propertyId && condition.test === 'hasValue',
        )}
        {@const value = exampleValues[propertyId] ?? (presence ? 'false' : 'unset')}
        {@const stateLabel = presence
          ? value === 'true'
            ? 'Has value'
            : 'Has no value'
          : value === 'true'
            ? 'True'
            : value === 'false'
              ? 'False'
              : 'Unset'}
        <button
          type="button"
          class="border-border/60 hover:bg-foreground/5 focus-visible:outline-ring flex min-h-11 min-w-max grow basis-[calc((100%_-_1rem)/3)] items-center gap-2 rounded-md border px-2 py-2 text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Example: ${label}: ${stateLabel}`}
          data-preview-state={value}
          onclick={() =>
            (exampleValues[propertyId] = presence
              ? value === 'true'
                ? 'false'
                : 'true'
              : value === 'unset'
                ? 'true'
                : value === 'true'
                  ? 'false'
                  : 'unset')}
        >
          {#if value === 'true'}
            <CheckIcon class="text-success size-4 shrink-0" aria-hidden="true" />
          {:else if value === 'false'}
            <XIcon class="text-error size-4 shrink-0" aria-hidden="true" />
          {:else}
            <MinusIcon
              class="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          {/if}
          <span class="whitespace-nowrap">{label}</span>
        </button>
      {/each}
    </div>
    <!-- Keep row spacing inside the slide so the preview changes height continuously. -->
    <div class="min-w-0">
      {#each editingLocales as locale, index (locale)}
        <p
          class="min-w-0 text-sm break-words whitespace-pre-wrap"
          class:pt-3={index > 0}
          transition:slide={{
            duration: prefersReducedMotion.current ? 0 : 200,
            easing: cubicInOut,
          }}
          data-title-example={locale}
          aria-live="polite"
        >
          <span class="text-muted-foreground">{shortLocaleLabel(locale)}:</span>
          {generateFeatureName({
            rule,
            locale,
            locationName: sampleName(locale, 'location'),
            featureName: sampleName(locale, 'feature'),
            properties: previewValues(locale),
          }) || 'Name not yet available'}
        </p>
      {/each}
    </div>
  </fieldset>
</section>
