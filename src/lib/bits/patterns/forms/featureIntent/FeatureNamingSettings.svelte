<script lang="ts">
// COMPONENTS
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/index.js'
import { typeInputAppearance, typeSelectAppearance } from './featureTypeEditor.styles'

// I18N
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// API
import { getFeatureNameProperties } from '#lib/api/featureIntents.remote.js'
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
let properties = $state<{ id: string; label: string }[]>([])
let failed = $state(false)
$effect(() => {
  let cancelled = false
  failed = false
  getFeatureNameProperties({ type: scopeType, id: scopeId })
    .then(rows => {
      if (!cancelled) properties = rows
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
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
  return { true: '', false: '', null: '', placement: 'suffix', separator: ' ' }
}
</script>
<section class="grid min-w-0 gap-3" aria-label="Naming rules">
  <h3
    class="text-primary border-border/40 mb-2 w-full border-b pb-2 text-xs font-bold tracking-wider uppercase"
  >
    Naming rules
  </h3>
  <SelectField
    label="Base name"
    triggerAttrs={{ 'aria-label': 'Base name' }}
    value={rule.base}
    isEditing={!disabled}
    {...typeSelectAppearance}
    items={[
      { value: 'feature', label: 'Feature’s own name' },
      { value: 'location', label: 'Linked location name' },
    ]}
    onValueChange={value =>
      onChange({ ...rule, base: value as FeatureNameRule['base'] })}
  />
  <p class="text-muted-foreground text-xs">
    Feature-level overrides take precedence per language. Unset values are distinct from
    false.
  </p>
  {#if failed}
    <p role="alert">Unable to load boolean properties.</p>
  {/if}
  {#each rule.conditions as condition, index}
    <SelectField
      label="Boolean property"
      value={condition.propertyId}
      isEditing={!disabled}
      {...typeSelectAppearance}
      triggerAttrs={{ 'aria-label': 'Boolean property' }}
      items={properties.map(property => ({
        value: property.id,
        label: property.label,
      }))}
      onValueChange={value =>
        onChange({
          ...rule,
          conditions: rule.conditions.map((item, i) =>
            i === index ? { ...item, propertyId: value } : item,
          ),
        })}
    />
    {#each locales as locale}
      {@const text =
        Object.entries(condition.locales).find(
          ([tag]) => canonicalContentTag(tag) === locale,
        )?.[1] ?? emptyCase()}
      <fieldset class="border-border/40 grid min-w-0 gap-3 border-t pt-3">
        <legend class="text-muted-foreground px-1 text-xs">{locale}</legend>
        {#each ['true', 'false', 'null'] as state}
          <TextInput
            label={state === 'null' ? 'Unset' : state}
            value={text[state as 'true']}
            isEditing={!disabled}
            {...typeInputAppearance}
            inputAttrs={{
              'aria-label': state === 'null' ? 'Unset' : state,
              lang: locale,
              dir: 'auto',
            }}
            onValueChange={value => update(index, locale, state, value)}
          />
        {/each}
        <div class="grid min-w-0 grid-cols-2 gap-3">
          <SelectField
            label="Placement"
            triggerAttrs={{ 'aria-label': 'Placement' }}
            value={text.placement}
            isEditing={!disabled}
            {...typeSelectAppearance}
            items={[
              { value: 'suffix', label: 'After name' },
              { value: 'prefix', label: 'Before name' },
            ]}
            onValueChange={value => update(index, locale, 'placement', value)}
          />
          <TextInput
            label="Separator"
            inputAttrs={{ 'aria-label': 'Separator' }}
            value={text.separator}
            isEditing={!disabled}
            {...typeInputAppearance}
            onValueChange={value => update(index, locale, 'separator', value)}
          />
        </div>
        {#each [true, false, null] as value}
          <p class="text-muted-foreground text-xs break-words">
            {String(value)}:
            {generateFeatureName({
              rule,
              locale,
              locationName: 'Example Bakery',
              featureName: 'Example feature',
              properties: { [condition.propertyId]: value },
            })}
          </p>
        {/each}
      </fieldset>
    {/each}
    {#if !disabled}
      <Button
        text="Remove condition"
        style="ghost"
        onClick={() =>
          onChange({
            ...rule,
            conditions: rule.conditions.filter((_, i) => i !== index),
          })}
      />
    {/if}
  {/each}
  {#if !disabled}
    <Button
      text="Add boolean condition"
      style="ghost"
      disabled={!properties.length || rule.conditions.length >= 10}
      onClick={() =>
        onChange({
          ...rule,
          conditions: [
            ...rule.conditions,
            {
              propertyId: properties[0].id,
              locales: Object.fromEntries(locales.map(locale => [locale, emptyCase()])),
            },
          ],
        })}
    />
  {/if}
</section>
