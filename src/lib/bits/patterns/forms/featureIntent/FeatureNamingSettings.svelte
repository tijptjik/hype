<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  getFeatureNamingTemplates,
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
  rule,
  onChange,
  onEditingChange,
  inheritedRule,
  inheriting = false,
  onUseDefault,
  locales = ['en', 'zh-Hant', 'zh-Hans'],
  disabled = false,
}: {
  scopeType: 'hub' | 'organisation' | 'project' | 'layer'
  scopeId: string
  rule: FeatureNameRule
  inheritedRule?: FeatureNameRule
  inheriting?: boolean
  onUseDefault?: () => void
  locales?: string[]
  disabled?: boolean
  onChange: (rule: FeatureNameRule) => void
  onEditingChange?: (editing: boolean) => void
} = $props()
let templates = $state<DisplayTemplateRecord[]>([])
let fields = $state<{ path: string; label: string }[]>([])
let loading = $state(true)
let failed = $state('')
let busy = $state(false)
let creating = $state(false)
let editingTemplate = $state<DisplayTemplateRecord | null>(null)
let name = $state('')
let expressions = $state<Record<string, string>>({})
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
    return `${template?.name ?? 'Assigned template'} · v${value.registry.version}`
  }
  const base = value.base === 'location' ? 'Linked location name' : 'Feature name'
  return value.conditions.length ? `${base} with naming rules` : base
}
const properties = $derived([...FEATURE_TEMPLATE_FIELDS, ...fields])
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
        label: `Feature property · ${field.label}`,
      }))
    })
    .catch(() => {
      if (!cancelled) failed = 'Unable to load naming templates and properties.'
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
      ? `${selected.name} copy`
      : ''
  const tags = [
    ...new Set([
      ...locales.map(canonicalContentTag),
      ...rule.conditions.flatMap(condition =>
        Object.keys(condition.locales).map(canonicalContentTag),
      ),
    ]),
  ]
  expressions = selected
    ? { ...selected.locales }
    : Object.fromEntries(tags.map(tag => [tag, namingRuleExpression(rule, tag)]))
  locale = Object.keys(expressions)[0] ?? 'en'
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
  }
  try {
    const reference = await publishFeatureNamingTemplate({
      scope: { type: scopeType, id: scopeId },
      id,
      expectedVersion: editingTemplate?.version ?? 0,
      definition,
    })
    onChange({ ...rule, conditions: [], registry: reference })
    creating = false
    await getFeatureNamingTemplates({ type: scopeType, id: scopeId }).refresh()
    reload++
  } catch {
    failed =
      'Unable to save this template. Check that every property is available in this scope.'
  } finally {
    busy = false
  }
}
</script>

<div class="grid min-w-0 gap-4" aria-busy={loading || busy}>
  <SelectField
    {...typeSelectAppearance}
    contentClass="z-[1010]!"
    label="Naming template"
    triggerAttrs={{ 'aria-label': 'Naming template' }}
    value={inheriting
      ? 'scope-default'
      : rule.registry
        ? `${rule.registry.id}:${rule.registry.version}`
        : 'current-rule'}
    disabled={disabled || loading || busy}
    items={[
      {
        value: 'scope-default',
        label: `${ruleLabel(defaultRule)} · inherited default`,
      },
      ...(!inheriting && !rule.registry
        ? [{ value: 'current-rule', label: ruleLabel(rule) }]
        : []),
      ...(rule.registry && !selected
        ? [
            {
              value: `${rule.registry.id}:${rule.registry.version}`,
              label: `Assigned template · v${rule.registry.version}`,
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
  <details class="text-muted-foreground text-xs">
    <summary class="cursor-pointer">Template scope and naming inputs</summary>
    <p class="mt-2">
      Names are optional. Templates using project properties are only available in that
      project. Use a Feature template here, even when all its inputs come from the
      linked Location.
    </p>
  </details>
  {#if failed}
    <p role="alert" class="text-destructive text-sm">{failed}</p>
    <Button
      type="button"
      text="Reload templates"
      style="ghost"
      onClick={() => reload++}
    />
  {/if}
  {#if !disabled && !creating}
    <div class="flex flex-wrap gap-2">
      {#if selected?.canEdit}
        <Button
          type="button"
          text="Edit template"
          style="outline"
          disabled={loading || busy}
          onClick={() => create(true)}
        />
      {/if}
      <Button
        type="button"
        text={selected ? 'Create a template from this one' : 'Create template'}
        style="outline"
        disabled={loading || busy}
        onClick={() => create()}
      />
    </div>
  {/if}
  {#if creating}
    <div class="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <TextInput
        {...typeInputAppearance}
        id={`${uid}-name`}
        name=""
        label="Template name"
        value={name}
        onValueChange={value => (name = value)}
        disabled={busy}
      />
      <SelectField
        {...typeSelectAppearance}
        contentClass="z-[1010]!"
        label="Language"
        triggerAttrs={{ 'aria-label': 'Language' }}
        value={locale}
        items={Object.keys(expressions).map(tag => ({ value: tag, label: tag }))}
        onValueChange={value => (locale = value)}
        disabled={busy}
      />
    </div>
    <DisplayTemplateEditor
      value={expressions[locale] ?? ''}
      onChange={value => (expressions = { ...expressions, [locale]: value })}
      {properties}
      {locale}
      disabled={busy}
    />
    <p class="text-muted-foreground text-xs">
      Save the template, then accept it here. Existing assignments keep their accepted
      version.
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        text="Save template"
        disabled={!valid || busy}
        onClick={save}
      />
      <Button
        type="button"
        text="Cancel template"
        style="ghost"
        disabled={busy}
        onClick={() => (creating = false)}
      />
    </div>
  {:else if selected}
    <DisplayTemplateEditor
      value={selected.locales[locale] ?? Object.values(selected.locales)[0] ?? ''}
      onChange={() => {}}
      {properties}
      {locale}
      isEditing={false}
    />
    <a
      class="text-sm underline"
      href={`/admin/templates?${new URLSearchParams({ ...(selected.organisationId ? { organisation: selected.organisationId } : {}), scope: scopeType, scopeId, template: selected.id })}`}
      >Edit in template editor</a
    >
  {/if}
</div>
