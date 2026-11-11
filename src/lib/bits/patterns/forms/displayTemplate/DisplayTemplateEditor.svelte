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
import { Button } from '#lib/bits/core/index.js'

let {
  value,
  onChange,
  properties,
  disabled = false,
}: {
  value: string
  onChange: (source: string) => void
  properties: { path: string; label: string }[]
  disabled?: boolean
} = $props()
let mode = $state<'property' | 'pair' | 'cases'>('property')
let property = $state('source.name')
let second = $state('branch')
let truthy = $state('')
let falsy = $state('')
let missing = $state('')
let samples = $state<Record<string, string>>({})
let sampleStates = $state<Record<string, string>>({})
let textarea: HTMLTextAreaElement
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
  const start = textarea?.selectionStart ?? value.length
  const end = textarea?.selectionEnd ?? start
  onChange(value.slice(0, start) + text + value.slice(end))
}
</script>

<div class="space-y-3">
  <label class="grid gap-2 text-sm" for={`${uid}-source`}>
    {m.display_templates_expression()}
    <textarea
      bind:this={textarea}
      id={`${uid}-source`}
      {disabled}
      {value}
      oninput={event => onChange(event.currentTarget.value)}
      rows="4"
      class="border-input bg-background w-full rounded-md border p-3 font-mono text-sm"
      aria-invalid={Boolean(parsed.error)}
      aria-describedby={parsed.error ? `${uid}-error` : undefined}
    ></textarea>
  </label>
  {#if parsed.error}
    <p id={`${uid}-error`} role="alert" class="text-destructive text-sm">
      {parsed.error}
    </p>
  {/if}
  <div class="flex flex-wrap items-end gap-2">
    <select
      aria-label={m.display_templates_insert()}
      bind:value={mode}
      {disabled}
      class="border-input bg-background rounded-md border p-2 text-sm"
    >
      <option value="property">{m.display_templates_property()}</option>
      <option value="pair">{m.display_templates_pair()}</option>
      <option value="cases">{m.display_templates_cases()}</option>
    </select>
    <select
      aria-label={m.display_templates_property()}
      bind:value={property}
      {disabled}
      class="border-input bg-background min-w-0 rounded-md border p-2 text-sm"
    >
      {#each properties as item (item.path)}
        <option value={item.path}>{item.label}</option>
      {/each}
    </select>
    {#if mode === 'pair'}
      <select
        aria-label={m.display_templates_pair()}
        bind:value={second}
        {disabled}
        class="border-input bg-background min-w-0 rounded-md border p-2 text-sm"
      >
        {#each properties as item (item.path)}
          <option value={item.path}>{item.label}</option>
        {/each}
      </select>
    {:else if mode === 'cases'}
      <label class="grid gap-1 text-xs"
        >{m.display_templates_true()}<input
          bind:value={truthy}
          {disabled}
          class="border-input bg-background w-32 rounded-md border p-2 text-sm"
        ></label
      >
      <label class="grid gap-1 text-xs"
        >{m.display_templates_false()}<input
          bind:value={falsy}
          {disabled}
          class="border-input bg-background w-32 rounded-md border p-2 text-sm"
        ></label
      >
      <label class="grid gap-1 text-xs"
        >{m.display_templates_missing()}<input
          bind:value={missing}
          {disabled}
          class="border-input bg-background w-32 rounded-md border p-2 text-sm"
        ></label
      >
    {/if}
    <Button
      type="button"
      style="outline"
      {disabled}
      onClick={insert}
      text={m.display_templates_insert()}
    />
  </div>
  <details class="rounded-md border p-3 text-sm">
    <summary>{m.display_templates_sample()}</summary>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      {#each parsed.dependencies as path (path)}
        <label class="grid min-w-0 gap-1 break-words"
          >{path}<select
            aria-label={`${path}: ${m.display_templates_cases()}`}
            value={sampleStates[path] ?? 'text'}
            onchange={event =>
              (sampleStates = { ...sampleStates, [path]: event.currentTarget.value })}
            class="border-input bg-background rounded-md border p-2"
          >
            <option value="text">{m.display_templates_sample()}</option>
            <option value="true">{m.display_templates_true()}</option>
            <option value="false">{m.display_templates_false()}</option>
            <option value="missing">{m.display_templates_missing()}</option>
          </select><input
            value={samples[path] ?? ''}
            oninput={event =>
              (samples = { ...samples, [path]: event.currentTarget.value })}
            class="border-input bg-background min-w-0 rounded-md border p-2"
          ></label
        >
      {/each}
    </div>
  </details>
  <div class="space-y-1 text-sm">
    <span class="text-muted-foreground">{m.display_templates_preview()}</span
    ><output class="block min-h-5 break-words whitespace-pre-wrap">{preview}</output>
  </div>
</div>
