<script lang="ts">
// SVELTE
import { tick, untrack, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// API
import {
  getFeatureNamingTemplates,
  getFeatureNamingExamples,
  getFeatureNameProperties,
  publishFeatureNamingTemplate,
} from '#lib/api/featureIntents.remote.js'
// COMPONENTS
import DisplayTemplateEditor from '../displayTemplate/DisplayTemplateEditor.svelte'
import { typeInputAppearance, typeSelectAppearance } from './featureTypeEditor.styles'
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  DisplayTemplateDefinitionSchema,
  type DisplayTemplateRecord,
} from '#lib/templates/registry.js'
import {
  FEATURE_TEMPLATE_FIELDS,
  namingRuleExpression,
} from '#lib/templates/namingRule.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'

let {
  scopeType,
  scopeId,
  featureType,
  rule,
  onChange,
  onEditingChange,
  onSaved,
  footer,
  inheritedRule,
  inheriting = false,
  onUseDefault,
  locales = ['en', 'zh-Hant', 'zh-Hans'],
  disabled = false,
}: {
  scopeType: 'hub' | 'organisation' | 'project' | 'layer'
  scopeId: string
  featureType?: string
  rule: FeatureNameRule
  inheritedRule?: FeatureNameRule
  inheriting?: boolean
  onUseDefault?: () => void
  locales?: string[]
  disabled?: boolean
  onChange: (rule: FeatureNameRule) => void
  onEditingChange?: (editing: boolean) => void
  onSaved?: (rule: FeatureNameRule) => void
  footer?: Snippet<[Snippet, boolean]>
} = $props()
let templates = $state<DisplayTemplateRecord[]>([])
let fields = $state<{ path: string; label: string }[]>([])
let loading = $state(true)
let failed = $state('')
let busy = $state(false)
let creating = $state(false)
let askingLLM = $state(false)
let textMode = $state(false)
let editorScroll: HTMLDivElement | undefined
let editingTemplate = $state<DisplayTemplateRecord | null>(null)
let name = $state('')
let expressions = $state<Record<string, string>>({})
let sharedExpression = $state('')
let customLocales = $state<string[]>([])
const languageNames: Record<string, string> = {
  en: 'English',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
}

/** Update one custom expression or every language still using the shared expression.
 * @param source Edited expression. @returns Nothing.
 */
function updateExpression(source: string): void {
  if (isCustom) expressions = { ...expressions, [locale]: source }
  else {
    sharedExpression = source
    expressions = Object.fromEntries(
      Object.entries(expressions).map(([tag, current]) => [
        tag,
        customLocales.includes(tag) ? current : source,
      ]),
    )
  }
}

/** Reconnect the selected language to the shared expression.
 * @returns Nothing.
 */
function useShared(): void {
  customLocales = customLocales.filter(tag => tag !== locale)
  expressions = { ...expressions, [locale]: sharedExpression }
}

/** Move between locale tabs with standard tab keyboard controls.
 * @param event Keyboard event. @returns Nothing.
 */
function switchLanguage(event: KeyboardEvent): void {
  const index = languageTabs.indexOf(locale)
  const next =
    event.key === 'ArrowRight'
      ? (index + 1) % languageTabs.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + languageTabs.length) % languageTabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? languageTabs.length - 1
            : -1
  if (next < 0) return
  event.preventDefault()
  locale = languageTabs[next]
  const tabs = (
    event.currentTarget as HTMLElement
  ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[next]?.focus()
}
let locale = $state<string>(untrack(() => canonicalContentTag(locales[0] ?? 'en')))
const uid = $props.id()
let reload = $state(0)
// A parent cannot accept a naming selection while its template draft is still unsaved.
$effect(() => {
  onEditingChange?.(creating || busy)
})
const selected = $derived(
  templates.find(
    item => item.id === rule.registry?.id && item.version === rule.registry?.version,
  ),
)
const languageTabs = $derived(
  creating
    ? Object.keys(expressions)
    : [
        ...new Set([
          ...['en', 'zh-Hant', 'zh-Hans'],
          ...locales.map(canonicalContentTag),
          ...Object.keys(selected?.locales ?? {}),
        ]),
      ],
)
const isCustom = $derived(customLocales.includes(locale))
const defaultRule = $derived(
  inheritedRule ?? { base: rule.base, conditions: rule.conditions },
)
/** Describe the effective rule without treating a built-in name source as an empty selection.
 * @param value Effective naming rule. @returns Human-readable selected option.
 */
function ruleLabel(value: FeatureNameRule): string {
  if (value.registry) {
    const template = templates.find(
      item =>
        item.id === value.registry?.id && item.version === value.registry?.version,
    )
    return `${template?.name ?? m.feature_model_assigned_template()} · v${value.registry.version}`
  }
  const base =
    value.base === 'location'
      ? m.feature_model_linked_name()
      : m.feature_model_feature_name()
  return value.conditions.length ? m.feature_model_with_rules({ name: base }) : base
}
const properties = $derived([
  ...FEATURE_TEMPLATE_FIELDS.map(field => ({
    ...field,
    label:
      (
        {
          'feature.name': m.feature_model_feature_name(),
          'location.name': m.feature_model_linked_name(),
          'brand.name': m.feature_model_field_brand(),
          'group.name': m.feature_model_field_group(),
          'format.name': m.feature_model_field_format(),
          branch: m.feature_model_field_branch(),
          address: m.feature_model_field_address(),
          accessHint: m.feature_model_field_access(),
          phoneNumber: m.feature_model_field_phone(),
          website: m.feature_model_field_website(),
        } as Record<string, string>
      )[field.path] ?? field.label,
  })),
  ...fields,
])
const valid = $derived(
  DisplayTemplateDefinitionSchema.safeParse({
    name,
    code: 'draft',
    target: 'feature',
    locales: expressions,
  }).success,
)

$effect(() => {
  reload
  const scope = { type: scopeType, id: scopeId }
  let cancelled = false
  loading = true
  failed = ''
  templates = []
  fields = []
  Promise.all([getFeatureNamingTemplates(scope), getFeatureNameProperties(scope)])
    .then(([rows, available]) => {
      if (cancelled) return
      templates = rows
      fields = available.map(field => ({
        ...field,
        path: `properties.${field.id}`,
        label: m.feature_model_property_label({ name: field.label }),
      }))
    })
    .catch(() => {
      if (!cancelled) failed = m.feature_model_templates_load_failed()
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})

/** Start an independent reusable definition, retaining all existing translations.
 * @param editExisting Publish a new version of the selected identity instead of copying it.
 * @returns Nothing; the parent rule remains untouched until publication succeeds.
 */
function create(editExisting = false): void {
  editingTemplate = editExisting ? (selected ?? null) : null
  name = editingTemplate
    ? editingTemplate.name
    : selected
      ? m.feature_model_copy_name({ name: selected.name })
      : ''
  const tags = [
    ...new Set([
      ...['en', 'zh-Hant', 'zh-Hans'],
      ...locales.map(canonicalContentTag),
      ...Object.keys(selected?.locales ?? {}).map(canonicalContentTag),
      ...rule.conditions.flatMap(condition =>
        Object.keys(condition.locales).map(canonicalContentTag),
      ),
    ]),
  ]
  const existing = selected
    ? Object.fromEntries(
        Object.entries(selected.locales).map(([tag, source]) => [
          canonicalContentTag(tag),
          source,
        ]),
      )
    : Object.fromEntries(tags.map(tag => [tag, namingRuleExpression(rule, tag)]))
  sharedExpression =
    selected?.localeSync?.sharedExpression ??
    Object.values(existing)[0] ??
    '{{ feature.name }}'
  customLocales = selected?.localeSync
    ? selected.localeSync.customLocales.map(canonicalContentTag)
    : Object.keys(existing).filter(tag => existing[tag] !== sharedExpression)
  expressions = Object.fromEntries(
    tags.map(tag => [
      tag,
      customLocales.includes(tag) ? existing[tag] : sharedExpression,
    ]),
  )
  locale = Object.keys(expressions)[0] ?? 'en'
  askingLLM = false
  textMode = false
  creating = true
}

/** Publish a reusable template and select its immutable version.
 * @returns Completion after publication or an actionable error.
 */
async function save(): Promise<void> {
  if (!valid || busy) return
  busy = true
  failed = ''
  const id = editingTemplate?.id ?? crypto.randomUUID()
  const definition = {
    name: name.trim(),
    code: editingTemplate?.code ?? `naming-${id}`,
    target: 'feature' as const,
    locales: { ...expressions },
    localeSync: { sharedExpression, customLocales: [...customLocales] },
  }
  try {
    const reference = await publishFeatureNamingTemplate({
      scope: { type: scopeType, id: scopeId },
      id,
      expectedVersion: editingTemplate?.version ?? 0,
      definition,
    })
    const savedRule = { ...rule, conditions: [], registry: reference }
    onChange(savedRule)
    if (onSaved) {
      onSaved(savedRule)
      return
    }
    creating = false
    await getFeatureNamingTemplates({ type: scopeType, id: scopeId }).refresh()
    reload++
  } catch {
    failed = m.feature_model_template_save_failed()
  } finally {
    busy = false
  }
}
</script>

<div
  bind:this={editorScroll}
  class="min-h-0 overflow-y-auto px-4 py-4 sm:px-5"
  data-naming-scroll
>
  <div class="grid min-w-0 gap-4" aria-busy={loading || busy}>
    {#if !creating}
      <SelectField
        {...typeSelectAppearance}
        contentClass="z-[1010]!"
        label={m.feature_model_naming_template()}
        triggerAttrs={{ 'aria-label': m.feature_model_naming_template() }}
        value={inheriting
          ? 'scope-default'
          : rule.registry
            ? `${rule.registry.id}:${rule.registry.version}`
            : 'current-rule'}
        disabled={disabled || loading || busy}
        items={[
          {
            value: 'scope-default',
            label: m.feature_model_inherited_option({ name: ruleLabel(defaultRule) }),
          },
          ...(!inheriting && !rule.registry
            ? [{ value: 'current-rule', label: ruleLabel(rule) }]
            : []),
          ...(rule.registry && !selected
            ? [
                {
                  value: `${rule.registry.id}:${rule.registry.version}`,
                  label: `${m.feature_model_assigned_template()} · v${rule.registry.version}`,
                },
              ]
            : []),
          ...templates.map(item => ({
            value: `${item.id}:${item.version}`,
            label: `${item.name} · v${item.version}`,
          })),
        ]}
        onValueChange={value => {
          if (value === 'scope-default') {
            if (onUseDefault) onUseDefault()
            else onChange(structuredClone($state.snapshot(defaultRule)))
            creating = false
            return
          }
          const chosen = templates.find(item => `${item.id}:${item.version}` === value)
          const { registry: _registry, ...fallback } = rule
          onChange(
            chosen
              ? { ...fallback, registry: { id: chosen.id, version: chosen.version } }
              : fallback,
          )
          creating = false
        }}
      />
    {/if}
    {#if failed}
      <p role="alert" class="text-destructive text-sm">{failed}</p>
      <Button
        type="button"
        text={m.feature_model_reload_templates()}
        style="ghost"
        onClick={() => reload++}
      />
    {/if}
    {#if creating}
      <div class="grid min-w-0 gap-3">
        <TextInput
          {...typeInputAppearance}
          id={`${uid}-name`}
          name=""
          label={m.feature_model_template_name()}
          value={name}
          onValueChange={value => (name = value)}
          disabled={busy}
        />
      </div>
      {@render languageControls()}
      <DisplayTemplateEditor
        bind:askingLLM
        bind:textMode
        showLLMButton={false}
        {expressionActions}
        exampleScope={{ type: scopeType, id: scopeId }}
        loadExamples={input =>
          getFeatureNamingExamples({
            ...input,
            scope: { type: scopeType, id: scopeId },
            ...(featureType ? { featureType } : {}),
          })}
        value={expressions[locale] ?? ''}
        onChange={updateExpression}
        {properties}
        {locale}
        disabled={busy}
      />
    {:else if selected}
      {@render languageControls()}
      {#if selected.locales[locale] !== undefined}
        <DisplayTemplateEditor
          exampleScope={{ type: scopeType, id: scopeId }}
          loadExamples={input =>
            getFeatureNamingExamples({
              ...input,
              scope: { type: scopeType, id: scopeId },
              ...(featureType ? { featureType } : {}),
            })}
          value={selected.locales[locale]}
          onChange={() => {}}
          {properties}
          {locale}
          isEditing={false}
        />
      {:else}
        <p class="text-muted-foreground text-sm">
          No expression for this language. Features keep their provided names.
        </p>
      {/if}
      <a
        class="text-sm underline"
        href={`/admin/templates?${new URLSearchParams({ ...(selected.organisationId ? { organisation: selected.organisationId } : {}), scope: scopeType, scopeId, template: selected.id })}`}
        >{m.feature_model_edit_in_editor()}</a
      >
    {/if}
  </div>
</div>
{#snippet expressionActions()}
  {#if isCustom}
    <button
      type="button"
      disabled={busy}
      onclick={useShared}
      class="hover:bg-muted rounded px-2 py-1 text-xs underline"
    >
      Use shared expression
    </button>
    <span class="text-muted-foreground text-xs">Copy from:</span>
    {#each Object.keys(expressions).filter(tag => tag !== locale) as tag}
      <button
        type="button"
        disabled={busy}
        onclick={() => (expressions = { ...expressions, [locale]: expressions[tag] })}
        class="hover:bg-muted rounded px-2 py-1 text-xs underline"
      >
        {languageNames[tag] ?? tag}
      </button>
    {/each}
  {:else}
    <span class="text-muted-foreground text-xs">Shared expression</span>
    <button
      type="button"
      disabled={busy}
      onclick={() => (customLocales = [...customLocales, locale])}
      class="hover:bg-muted rounded px-2 py-1 text-xs underline"
    >
      Customize this language
    </button>
  {/if}
{/snippet}
{#snippet languageControls()}
  <div
    role="tablist"
    aria-label="Template language"
    class="border-border/30 flex flex-wrap gap-1 border-b pb-2"
  >
    {#each languageTabs as tag, index}
      {@const previous = languageTabs[index - 1]}
      {@const sources = creating ? expressions : (selected?.locales ?? {})}
      {#if index > 0 &&
        sources[tag] !== undefined &&
        sources[tag] === sources[previous]}
        <span
          role="img"
          aria-label="Same expression"
          title="These languages have the same expression"
          class="text-muted-foreground self-center px-1"
          >=</span
        >
      {/if}
      <button
        type="button"
        role="tab"
        aria-selected={locale === tag}
        tabindex={locale === tag ? 0 : -1}
        disabled={busy}
        onclick={() => (locale = tag)}
        onkeydown={switchLanguage}
        class="hover:bg-muted aria-selected:bg-muted aria-selected:text-foreground text-muted-foreground rounded-md px-3 py-2 text-sm focus-visible:outline-2"
      >
        {languageNames[tag] ?? tag}
      </button>
    {/each}
  </div>
{/snippet}
{#snippet templateActions()}
  {#if creating}
    <div class="mr-auto">
      <Button
        type="button"
        text={askingLLM ? 'Back to expression' : 'Ask your LLM'}
        style="outline"
        class="mr-auto h-auto! min-h-11 py-2"
        labelClasses="max-w-none! whitespace-normal!"
        disabled={busy}
        onClick={async () => {
          askingLLM = !askingLLM
          if (!askingLLM) textMode = true
          await tick()
          editorScroll?.scrollTo({ top: 0 })
        }}
      />
    </div>
    <Button
      type="button"
      class="h-auto! min-h-11 py-2"
      labelClasses="max-w-none! whitespace-normal! break-words"
      text={m.cancel()}
      style="ghost"
      disabled={busy}
      onClick={() => (creating = false)}
    />
    <Button
      type="button"
      class="h-auto! min-h-11 py-2"
      labelClasses="max-w-none! whitespace-normal! break-words"
      text={m.feature_model_save_template()}
      disabled={!valid || busy}
      onClick={save}
    />
  {/if}
  {#if !disabled && !creating}
    <div class="flex flex-wrap gap-2">
      {#if selected?.canEdit}
        <Button
          type="button"
          text={m.feature_model_edit_template()}
          style="outline"
          disabled={loading || busy}
          onClick={() => create(true)}
        />
      {/if}
      <Button
        type="button"
        class="h-auto! min-h-11 py-2"
        labelClasses="max-w-none! whitespace-normal! break-words"
        text={selected
          ? m.feature_model_copy_template()
          : m.feature_model_create_template()}
        style="outline"
        disabled={loading || busy}
        onClick={() => create()}
      />
    </div>
  {/if}
{/snippet}
{#if footer}
  {@render footer(templateActions, creating)}
{:else}
  {@render templateActions()}
{/if}
