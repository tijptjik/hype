<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
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
    failed = m.feature_model_template_save_failed()
  } finally {
    busy = false
  }
}
</script>

<div class="grid min-w-0 gap-4" aria-busy={loading || busy}>
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
  <details class="text-muted-foreground text-xs">
    <summary class="cursor-pointer">{m.feature_model_template_scope()}</summary>
    <p class="mt-2">
      {m.feature_model_template_scope_help()}
    </p>
  </details>
  {#if failed}
    <p role="alert" class="text-destructive text-sm">{failed}</p>
    <Button
      type="button"
      text={m.feature_model_reload_templates()}
      style="ghost"
      onClick={() => reload++}
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
        text={selected
          ? m.feature_model_copy_template()
          : m.feature_model_create_template()}
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
        label={m.feature_model_template_name()}
        value={name}
        onValueChange={value => (name = value)}
        disabled={busy}
      />
      <SelectField
        {...typeSelectAppearance}
        contentClass="z-[1010]!"
        label={m.feature_model_language()}
        triggerAttrs={{ 'aria-label': m.feature_model_language() }}
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
      {m.feature_model_save_template_help()}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        text={m.feature_model_save_template()}
        disabled={!valid || busy}
        onClick={save}
      />
      <Button
        type="button"
        text={m.feature_model_cancel_template()}
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
      >{m.feature_model_edit_in_editor()}</a
    >
  {/if}
</div>
