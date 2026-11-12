<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
  templateCasesTag,
  templatePairTag,
  templatePropertyTag,
} from '#lib/templates/displayTemplate.js'
// BITS
import { TextInput, TextArea, SelectField } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/index.js'

let {
  value,
  onChange,
  properties,
  disabled = false,
  isEditing = true,
}: {
  value: string
  onChange: (source: string) => void
  properties: { path: string; label: string }[]
  disabled?: boolean
  isEditing?: boolean
} = $props()
let mode = $state<'property' | 'pair' | 'cases'>('property')
let property = $state('source.name')
let second = $state('branch')
let truthy = $state('')
let falsy = $state('')
let missing = $state('')
let samples = $state<Record<string, string>>({})
let sampleStates = $state<Record<string, string>>({})
let selectionStart: number | undefined
let selectionEnd: number | undefined
const uid = $props.id()
const parsed = $derived.by(() => {
  try {
    return { dependencies: parseDisplayTemplate(value).dependencies, error: '' }
  } catch (cause) {
    return {
      dependencies: [],
      error: cause instanceof Error ? cause.message : 'Invalid template',
    }
  }
})
const preview = $derived.by(() => {
  try {
    return renderDisplayTemplate(
      value,
      Object.fromEntries(
        parsed.dependencies.map(path => [
          path,
          sampleStates[path] === 'true'
            ? true
            : sampleStates[path] === 'false'
              ? false
              : sampleStates[path] === 'missing'
                ? undefined
                : samples[path],
        ]),
      ),
    )
  } catch {
    return ''
  }
})
/** Insert the chosen helper at the current selection without losing surrounding text.
 * @returns Nothing; the parent owns the authored expression.
 */
function insert(): void {
  const text =
    mode === 'pair'
      ? templatePairTag(property, second)
      : mode === 'cases'
        ? templateCasesTag(property, truthy, falsy, missing)
        : templatePropertyTag(property)
  const start = selectionStart ?? value.length
  const end = selectionEnd ?? start
  onChange(value.slice(0, start) + text + value.slice(end))
}
</script>

<div class="grid min-w-0 gap-6">
  <TextArea
    id={`${uid}-source`}
    label={m.display_templates_expression()}
    {value}
    {disabled}
    {isEditing}
    rows={4}
    controlClass="font-mono"
    onValueChange={onChange}
    textareaAttrs={{
      onselect: (event: Event) => {
        const element = event.currentTarget as HTMLTextAreaElement
        selectionStart = element.selectionStart
        selectionEnd = element.selectionEnd
      },
    }}
  />
  {#if parsed.error}
    <p role="alert" class="text-destructive text-sm">{parsed.error}</p>
  {/if}
  {#if isEditing}
    <div class="grid min-w-0 gap-4 sm:grid-cols-2">
      <SelectField
        triggerAttrs={{ 'aria-label': m.display_templates_insert() }}
        label={m.display_templates_insert()}
        bind:value={mode}
        {disabled}
        items={[
          { value: 'property', label: m.display_templates_property() },
          { value: 'pair', label: m.display_templates_pair() },
          { value: 'cases', label: m.display_templates_cases() },
        ]}
      />
      <SelectField
        triggerAttrs={{ 'aria-label': m.display_templates_property() }}
        label={m.display_templates_property()}
        bind:value={property}
        {disabled}
        items={properties.map(item => ({ value: item.path, label: item.label }))}
      />
      {#if mode === 'pair'}
        <SelectField
          triggerAttrs={{ 'aria-label': m.display_templates_pair() }}
          label={m.display_templates_pair()}
          bind:value={second}
          {disabled}
          items={properties.map(item => ({ value: item.path, label: item.label }))}
        />
      {:else if mode === 'cases'}
        <TextInput
          id={`${uid}-true`}
          label={m.display_templates_true()}
          bind:value={truthy}
          {disabled}
        />
        <TextInput
          id={`${uid}-false`}
          label={m.display_templates_false()}
          bind:value={falsy}
          {disabled}
        />
        <TextInput
          id={`${uid}-missing`}
          label={m.display_templates_missing()}
          bind:value={missing}
          {disabled}
        />
      {/if}
      <div class="flex items-end">
        <Button
          type="button"
          style="outline"
          {disabled}
          onClick={insert}
          text={m.display_templates_insert()}
        />
      </div>
    </div>
  {/if}
  <details class="border-border rounded-lg border text-sm">
    <summary class="cursor-pointer px-4 py-3 font-medium">
      {m.display_templates_sample()}
    </summary>
    <div class="grid gap-6 p-4 sm:grid-cols-2">
      {#each parsed.dependencies as path (path)}
        <div class="grid min-w-0 gap-2">
          <SelectField
            triggerAttrs={{ 'aria-label': `${path}: ${m.display_templates_cases()}` }}
            label={path}
            value={sampleStates[path] ?? 'text'}
            onValueChange={value => (sampleStates = { ...sampleStates, [path]: value })}
            items={[
              { value: 'text', label: m.display_templates_sample() },
              { value: 'true', label: m.display_templates_true() },
              { value: 'false', label: m.display_templates_false() },
              { value: 'missing', label: m.display_templates_missing() },
            ]}
          />
          {#if !sampleStates[path] || sampleStates[path] === 'text'}
            <TextInput
              id={`${uid}-sample-${path}`}
              label={`${path}: ${m.display_templates_sample()}`}
              value={samples[path] ?? ''}
              onValueChange={value => (samples = { ...samples, [path]: value })}
            />
          {/if}
        </div>
      {/each}
    </div>
  </details>
  <div class="bg-primary/5 border-primary/20 rounded-lg border p-4">
    <span class="text-muted-foreground text-xs font-semibold"
      >{m.display_templates_preview()}</span
    >
    <output class="mt-2 block min-h-6 break-words whitespace-pre-wrap"
      >{preview || '—'}</output
    >
  </div>
</div>
