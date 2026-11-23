<script lang="ts">
// SVELTE
import { tick, untrack, type Snippet } from 'svelte'
import CodeIcon from 'virtual:icons/lucide/code'
import BlocksIcon from 'virtual:icons/lucide/blocks'
import { animateSection } from './animateSection.js'
import { namingPrompt } from '#lib/templates/namingPrompt.js'
// TYPES
import type { FeatureIntentScope } from '#lib/db/services/featureIntentPolicy.js'
import type { FeatureNamingExample } from '#lib/db/services/featureNamingExamples.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import InfoIcon from 'virtual:icons/lucide/info'
import XIcon from 'virtual:icons/lucide/x'
// ICONS
import TextIcon from 'virtual:icons/proicons/text'
import CheckIcon from 'virtual:icons/proicons/checkmark'
import PhoneIcon from 'virtual:icons/proicons/call'
import GlobeIcon from 'virtual:icons/proicons/globe'
// DOMAIN
import {
  describeTemplateProperty,
  templatePreviewValue,
  type TemplateProperty,
} from '#lib/templates/propertyPresentation.js'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import {
  type TemplateValues,
  parseDisplayTemplate,
  renderDisplayTemplate,
  templateCasesTag,
  templatePairTag,
  templatePropertyTag,
} from '#lib/templates/displayTemplate.js'
import {
  componentFields,
  expressionSource,
  updateComponentField,
  type TemplateComponentField,
} from '#lib/templates/componentEditor.js'
import { typeInputAppearance } from '../featureIntent/featureTypeEditor.styles'
// BITS
import { TextInput } from '#lib/bits/custom/form/index.js'
import { Checkbox } from '#lib/bits/custom/index.js'
import { Button } from '#lib/bits/core/index.js'

let {
  value,
  onChange,
  properties,
  locale = 'en',
  disabled = false,
  isEditing = true,
  askingLLM = $bindable(false),
  textMode = $bindable(false),
  showLLMButton = true,
  expressionActions,
  exampleScope,
  loadExamples,
  allowSequence = false,
  previewValues,
}: {
  allowSequence?: boolean
  previewValues?: TemplateValues
  value: string
  onChange: (source: string) => void
  properties: TemplateProperty[]
  locale?: string
  disabled?: boolean
  isEditing?: boolean
  askingLLM?: boolean
  textMode?: boolean
  showLLMButton?: boolean
  expressionActions?: Snippet
  exampleScope?: FeatureIntentScope
  loadExamples?: (input: {
    paths: string[]
    locale: string
  }) => Promise<FeatureNamingExample[]>
} = $props()
let copyStatus = $state('')

/** Copy the generated prompt without sending any data to another service.
 * @returns Completion with an accessible success or manual-copy message.
 */
async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(llmPrompt)
    copyStatus = 'Copied'
  } catch {
    copyStatus = 'Select the text below and copy it manually.'
  }
}

let activeStart = $state<number | null>(null)
let expressionElement: HTMLFieldSetElement | undefined
let selectionStart: number | undefined
let selectionEnd: number | undefined
const uid = $props.id()
const parsed = $derived.by(() => {
  try {
    return { ...parseDisplayTemplate(value), error: '' }
  } catch (cause) {
    return {
      dependencies: [],
      components: [],
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
          previewValues && Object.hasOwn(previewValues, path)
            ? previewValues[path]
            : templatePreviewValue(
                properties.find(property => property.path === path) ?? {
                  path,
                  label: path.split('.').at(-1) ?? path,
                },
                locale,
              ),
        ]),
      ),
    )
  } catch {
    return ''
  }
})
let examples = $state<FeatureNamingExample[]>([])
const llmPrompt = $derived(
  namingPrompt({ locale, expression: value, properties, examples }),
)
let exampleSource = $state(value)
let loadedKey = $state('')
const examplePaths = $derived.by(() => {
  try {
    return parseDisplayTemplate(exampleSource).dependencies
  } catch {
    return []
  }
})
let examplesLoading = $state(false)
let examplesFailed = $state(false)
let examplesRetry = $state(0)
const dependencyKey = $derived(JSON.stringify([...parsed.dependencies].sort()))
const queryKey = $derived(
  askingLLM
    ? JSON.stringify(
        [...new Set(properties.map(property => property.path))].sort().slice(0, 64),
      )
    : dependencyKey,
)
$effect(() => {
  const scope = exampleScope
  const load = loadExamples
  const paths: string[] = JSON.parse(queryKey)
  const language = locale
  const invalid = Boolean(parsed.error)
  examplesRetry
  examplesFailed = false
  examplesLoading = Boolean(scope && load && !invalid)
  if (!scope || !load || invalid) return
  let cancelled = false
  // Refresh only when selected inputs, language or scope change, not while typing a separator.
  const timer = setTimeout(() => {
    untrack(() => load({ paths, locale: language }))
      .then(rows => {
        if (!cancelled) {
          examples = rows
          loadedKey = JSON.stringify(paths)
          exampleSource = untrack(() => value)
        }
      })
      .catch(() => {
        if (!cancelled) examplesFailed = true
      })
      .finally(() => {
        if (!cancelled) examplesLoading = false
      })
  }, 250)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
})
$effect(() => {
  if (queryKey === loadedKey && !parsed.error) exampleSource = value
})

/** Render the draft against one saved record without applying its custom-title override.
 * @param example Saved inputs from one feature. @returns Proposed generated name.
 */
function exampleName(example: FeatureNamingExample): string {
  try {
    return renderDisplayTemplate(exampleSource, example.values)
  } catch {
    return ''
  }
}
/** Show a selected input's friendly label and origin.
 * @param path Template input. @returns Display label distinguishing similarly named inputs.
 */
function inputLabel(path: string): string {
  const info = describeTemplateProperty(
    properties.find(property => property.path === path) ?? { path, label: path },
  )
  return `${info.name} · ${info.source}`
}
const activeComponent = $derived(
  parsed.components.find(component => component.start === activeStart),
)
const fields = $derived(
  activeComponent ? componentFields(activeComponent.expression) : [],
)
const componentKinds = $derived([
  'property',
  'pair',
  'join',
  'optional',
  'cases',
  'fallback',
  ...(allowSequence ? ['sequence' as const] : []),
] as const)
const componentLabels = {
  property: 'Property',
  pair: 'Pair',
  join: 'Join',
  optional: 'Optional text',
  cases: 'Cases',
  fallback: 'Fallback',
  sequence: 'Sequence',
}

const activeHelp = $derived.by(() => {
  const expression = activeComponent?.expression
  if (!expression)
    return 'Select a component block to choose its options. The options stay visible while you edit text around it.'
  if (expression.kind === 'literal')
    return 'This block contains fixed text that will appear in every generated name. Edit that text below.'
  const kind = expression.kind === 'call' ? expression.name : expression.kind
  return {
    sequence: 'Choose the number of digits and whether to pad the sequence with zeros.',
    property:
      'Choose one property below. Its value will appear here in the name. If the record has no value for that property, this component adds no text.',
    pair: 'Choose a first property and a second property, then type the separator to place between them (for example, a space or “ - ”). Both values must be present; if either is missing, the whole pair is left out.',
    join: 'Choose a first property and a second property, then type the separator to place between them. Missing values are skipped, and the separator appears only when both values are present.',
    optional:
      'Choose a property, then enter any text to put before it (Prefix) or after it (Suffix). For example, use “ (” and “)” to put a branch in brackets. If the value is missing, the surrounding text is left out too.',
    cases:
      'Choose a property, then enter the text for each situation: true or present, false, and missing. A missing value is different from a value set to false.',
    fallback:
      'Choose the property to try first, then the fallback to use if the first has no value. If both are missing, this component adds no text. For a combined component, configure its first and second properties and separator before choosing the fallback.',
  }[kind]
})

// Keep plain text editable between fixed components without exposing template syntax.
const segments = $derived.by(() => {
  const items: { start: number; end: number; token: boolean; text: string }[] = []
  let end = 0
  for (const component of parsed.components) {
    items.push({
      start: end,
      end: component.start,
      token: false,
      text: value.slice(end, component.start),
    })
    items.push({
      start: component.start,
      end: component.end,
      token: true,
      text: value.slice(component.start, component.end),
    })
    end = component.end
  }
  items.push({ start: end, end: value.length, token: false, text: value.slice(end) })
  return items
})

/** Retain the selected component while moving the insertion point into plain text.
 * @param event Text input selection. @param start Segment offset. @returns Nothing.
 */
function selectText(event: Event, start: number): void {
  const element = event.currentTarget as HTMLInputElement
  selectionStart = start + (element.selectionStart ?? 0)
  selectionEnd = start + (element.selectionEnd ?? 0)
}

/** Edit text between components while retaining the selected block's options.
 * @param start Segment start. @param end Segment end. @param text Replacement text.
 * @returns Nothing.
 */
function editText(start: number, end: number, text: string): void {
  if (activeStart !== null && activeStart >= end)
    activeStart += text.length - (end - start)
  onChange(value.slice(0, start) + text + value.slice(end))
  selectionStart = start + text.length
  selectionEnd = selectionStart
}

/** Select a fixed block and insert subsequent components after it.
 * @param start Block start. @param end Block end. @returns Nothing.
 */
function selectBlock(start: number, end: number): void {
  activeStart = start
  selectionStart = end
  selectionEnd = end
}

/** Remove exactly one component, preserving surrounding text.
 * @param start Block start. @param end Block end. @returns Nothing.
 */
function removeBlock(start: number, end: number): void {
  if (activeStart === start) activeStart = null
  else if (activeStart !== null && activeStart > start) activeStart -= end - start
  onChange(value.slice(0, start) + value.slice(end))
  selectionStart = start
  selectionEnd = start
}

let draggedStart = $state<number | null>(null)
let dropStart = $state<number | null>(null)

/** Move a component to another position, retaining the text between positions.
 * @param from Original component offset. @param to Target component offset.
 * @returns Nothing.
 */
function moveBlock(from: number, to: number): void {
  if (disabled || !isEditing || from === to) return
  const blocks = parsed.components
  const source = blocks.findIndex(block => block.start === from)
  const target = blocks.findIndex(block => block.start === to)
  if (source < 0 || target < 0) return
  const tokens = blocks.map(block => value.slice(block.start, block.end))
  const [moved] = tokens.splice(source, 1)
  tokens.splice(target, 0, moved)
  let next = ''
  let end = 0
  blocks.forEach((block, index) => {
    next += value.slice(end, block.start)
    if (index === target) activeStart = next.length
    next += tokens[index]
    end = block.end
  })
  const movedStart = activeStart
  onChange(next + value.slice(end))
  void tick().then(() => {
    expressionElement
      ?.querySelector<HTMLButtonElement>(`[data-component-start="${movedStart}"]`)
      ?.focus()
  })
  selectionStart = undefined
  selectionEnd = undefined
}

/** Offer the same ordering operation without dragging.
 * @param event Keyboard event. @param start Selected component offset.
 * @returns Nothing.
 */
function moveWithKeyboard(event: KeyboardEvent, start: number): void {
  if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  const index = parsed.components.findIndex(block => block.start === start)
  const target = parsed.components[index + (event.key === 'ArrowLeft' ? -1 : 1)]
  if (target) moveBlock(start, target.start)
}

/** Insert the chosen helper at the current selection without losing surrounding text.
 * @param kind Component to insert. @returns Completion after restoring the text selection.
 */
async function insert(kind: (typeof componentKinds)[number]): Promise<void> {
  const property = properties[0]?.path ?? 'source.name'
  const second =
    properties.find(item => item.path === 'branch')?.path ??
    properties[1]?.path ??
    property
  const text =
    kind === 'sequence'
      ? '{{ sequence(3, true) }}'
      : kind === 'pair' || kind === 'join'
        ? templatePairTag(property, second).replace('pair(', `${kind}(`)
        : kind === 'cases'
          ? templateCasesTag(property, '', '', '')
          : kind === 'optional'
            ? `{{ optional(${property}, "", "") }}`
            : kind === 'fallback'
              ? `{{ ${property} ?? ${second} }}`
              : templatePropertyTag(property)
  const start = Math.min(selectionStart ?? value.length, value.length)
  const end = Math.min(selectionEnd ?? start, value.length)
  onChange(value.slice(0, start) + text + value.slice(end))
  activeStart = start
  selectionStart = start
  selectionStart = start + text.length
  selectionEnd = start + text.length
  await tick()
  expressionElement
    ?.querySelector<HTMLButtonElement>(`[data-component-start="${start}"]`)
    ?.focus()
}

/** Update a selected component in place, preserving surrounding authored text.
 * @param field Constituent field. @param next New value. @returns Nothing.
 */
function updateField(field: TemplateComponentField, next: string): void {
  if (!activeComponent) return
  const text = `{{ ${expressionSource(updateComponentField(activeComponent.expression, field.path, next))} }}`
  onChange(
    value.slice(0, activeComponent.start) + text + value.slice(activeComponent.end),
  )
  selectionStart = activeComponent.start + text.length
  selectionEnd = selectionStart
}
</script>

<div class="grid min-w-0 gap-4">
  {#if isEditing && showLLMButton}
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        style="outline"
        size="sm"
        text={askingLLM ? 'Back to expression' : 'Ask your LLM'}
        {disabled}
        onClick={() => {
          askingLLM = !askingLLM
          copyStatus = ''
          if (!askingLLM) textMode = true
        }}
      />
    </div>
  {/if}
  {#if askingLLM}
    <p class="text-muted-foreground text-sm">
      Copy this prompt into your preferred LLM. It includes available fields and saved
      record examples. Nothing is sent automatically. Paste its final expression into
      the Expression text view when you return.
    </p>
    {#if examplesLoading}
      <p role="status" class="text-muted-foreground text-xs">
        Loading examples for all available fields…
      </p>
    {/if}
    {#if examplesFailed}
      <p role="alert" class="text-muted-foreground text-xs">
        Examples could not be refreshed. The prompt may contain only earlier examples.
      </p>
    {/if}
    <Button
      type="button"
      text="Copy prompt"
      style="outline"
      size="sm"
      disabled={examplesLoading}
      onClick={copyPrompt}
    />
    {#if copyStatus}
      <p role="status" class="text-xs">{copyStatus}</p>
    {/if}
    <textarea
      aria-label="LLM naming prompt"
      readonly
      value={llmPrompt}
      class="border-border/50 min-h-96 w-full resize-y rounded-md border bg-transparent p-3 font-mono text-sm"
    />
  {:else}
    {#if isEditing && !textMode}
      <div class="flex items-center gap-2">
        <h4 class="text-sm font-medium">Components to add</h4>
        <SimpleTooltip
          showArrow
          contentClass="w-[32rem] max-w-[calc(100vw-2rem)] max-h-[80dvh] overflow-y-auto p-4 text-left"
          triggerProps={{ 'aria-label': 'About template components', role: 'button' }}
        >
          {#snippet trigger()}
            <InfoIcon class="text-muted-foreground size-4" />
          {/snippet}
          <div class="border-border/50 flex items-center gap-2.5 border-b pb-3">
            <InfoIcon class="text-primary size-5" />
            <h3 class="text-[15px] font-semibold">Build a name with components</h3>
          </div>
          <p class="text-muted-foreground mt-4 text-sm leading-relaxed">
            Add a component, select its block, then choose its options below. You can
            type spaces or other text between blocks. The preview shows how they fit
            together.
          </p>
          <ul class="mt-4 space-y-3 text-sm">
            {#if allowSequence}
              <li>
                <strong>Sequence</strong>
                <p class="text-muted-foreground">
                  Use the entry number within this session. Number of digits sets the
                  minimum width when Zero-padded is enabled, so 7 becomes 007 with three
                  digits. With padding disabled it stays 7. Larger numbers always appear
                  in full.
                </p>
              </li>
            {/if}
            <li>
              <strong>Property</strong>
              <p class="text-muted-foreground">
                Use one value, such as a feature name, location name or branch.
              </p>
            </li>
            <li>
              <strong>Pair</strong>
              <p class="text-muted-foreground">
                Combine two values with a separator. If either is missing, show nothing.
              </p>
            </li>
            <li>
              <strong>Join</strong>
              <p class="text-muted-foreground">
                Combine the available values with a separator. Skip missing values.
              </p>
            </li>
            <li>
              <strong>Optional text</strong>
              <p class="text-muted-foreground">
                Add text before or after a value only when that value exists.
              </p>
            </li>
            <li>
              <strong>Cases</strong>
              <p class="text-muted-foreground">
                Choose different text when a value is true or present, false, or
                missing.
              </p>
            </li>
            <li>
              <strong>Fallback</strong>
              <p class="text-muted-foreground">
                Use the first value if available; otherwise use the second.
              </p>
            </li>
          </ul>
        </SimpleTooltip>
      </div>
      <fieldset class="flex flex-wrap gap-2" aria-label="Insert component">
        {#each componentKinds as kind}
          <Button
            type="button"
            style="outline"
            size="sm"
            {disabled}
            text={componentLabels[kind]}
            attrs={{ 'aria-label': `Insert ${componentLabels[kind]}` }}
            onClick={() => insert(kind)}
          />
        {/each}
      </fieldset>
    {/if}
    <div use:animateSection>
      <div class="grid min-w-0 gap-2">
        <h4 id={`${uid}-expression-label`} class="text-sm font-medium">
          {m.display_templates_expression()}
        </h4>
        <div class="border-border/30 relative min-w-0 rounded-md border">
          {#if isEditing}
            <button
              type="button"
              {disabled}
              aria-label={textMode ? 'Show blocks' : 'Edit expression as text'}
              title={textMode ? 'Show blocks' : 'Edit expression as text'}
              onclick={() => (textMode = !textMode)}
              class="bg-panel hover:bg-muted absolute top-2 right-2 z-10 rounded p-1.5"
            >
              {#if textMode}
                <BlocksIcon class="size-4" />
              {:else}
                <CodeIcon class="size-4" />
              {/if}
            </button>
          {/if}
          {#if textMode && isEditing}
            <textarea
              aria-labelledby={`${uid}-expression-label`}
              {value}
              {disabled}
              spellcheck={false}
              class="min-h-24 w-full resize-y rounded-md bg-transparent p-3 pr-12 font-mono text-sm"
              oninput={event => {
                activeStart = null
                selectionStart = undefined
                selectionEnd = undefined
                onChange(event.currentTarget.value)
              }}
            />
          {:else}
            <fieldset
              bind:this={expressionElement}
              aria-labelledby={`${uid}-expression-label`}
              title="Drag blocks to reorder, or select a block and press Alt + Left or Right."
              class="flex min-h-24 min-w-0 flex-wrap content-start items-center gap-2 rounded-md p-3 pr-12"
            >
              {#each segments as segment, index}
                {#if segment.token}
                  <span
                    class="group border-border/50 bg-muted has-aria-pressed:border-primary relative inline-flex max-w-full items-center rounded-md border"
                  >
                    <button
                      type="button"
                      data-component-start={segment.start}
                      draggable={isEditing && !disabled}
                      class:ring-2={dropStart === segment.start}
                      ondragstart={event => {
                        draggedStart = segment.start
                        event.dataTransfer?.setData('text/plain', segment.text)
                        if (event.dataTransfer)
                          event.dataTransfer.effectAllowed = 'move'
                      }}
                      ondragover={event => {
                        if (draggedStart === null || disabled) return
                        event.preventDefault()
                        dropStart = segment.start
                      }}
                      ondragleave={() => (dropStart = null)}
                      ondrop={event => {
                        event.preventDefault()
                        if (draggedStart !== null)
                          moveBlock(draggedStart, segment.start)
                        draggedStart = null
                        dropStart = null
                      }}
                      ondragend={() => {
                        draggedStart = null
                        dropStart = null
                      }}
                      onkeydown={event => moveWithKeyboard(event, segment.start)}
                      disabled={disabled || !isEditing}
                      aria-pressed={activeStart === segment.start}
                      aria-label={`Select ${parsed.components.find(component => component.start === segment.start)?.expression.kind === 'sequence' ? 'Sequence' : segment.text}`}
                      onclick={() => selectBlock(segment.start, segment.end)}
                      class="focus-visible:outline-primary min-w-0 rounded-md px-2 py-1.5 text-left font-mono text-sm break-words focus-visible:outline-2"
                    >
                      {parsed.components.find(
                        component => component.start === segment.start,
                      )?.expression.kind === 'sequence'
                        ? 'Sequence'
                        : segment.text}
                    </button>
                    {#if isEditing}
                      <button
                        type="button"
                        {disabled}
                        aria-label={`Remove ${segment.text}`}
                        onclick={() => removeBlock(segment.start, segment.end)}
                        class="from-muted via-muted absolute inset-y-0 right-0 flex w-10 items-center justify-end rounded-r-md bg-linear-to-l from-65% via-80% to-transparent pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <XIcon class="size-3.5" />
                      </button>
                    {/if}
                  </span>
                {:else if isEditing}
                  <input
                    aria-label={`Text ${index + 1}`}
                    value={segment.text}
                    {disabled}
                    style={`width: calc(${Math.max(1, segment.text.length)}ch + 1rem); max-width: 100%`}
                    class={`focus-visible:outline-primary min-w-0 rounded border px-2 py-1.5 font-mono text-sm focus-visible:outline-2 ${segment.text.length ? 'border-border/40 bg-transparent' : 'bg-foreground/5 border-transparent'}`}
                    title={segment.text.length ? 'Literal text' : 'Insert text'}
                    oninput={event =>
                      editText(segment.start, segment.end, event.currentTarget.value)}
                    onclick={event => selectText(event, segment.start)}
                    onkeyup={event => selectText(event, segment.start)}
                    onselect={event => selectText(event, segment.start)}
                  >
                {:else if segment.text.length}
                  <span
                    class="border-border/40 rounded border bg-transparent px-2 py-1.5 font-mono text-sm whitespace-pre-wrap"
                    >{segment.text}</span
                  >
                {/if}
              {/each}
            </fieldset>
          {/if}
          {#if isEditing && expressionActions}
            <div class="flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
              {@render expressionActions()}
            </div>
          {/if}
        </div>
      </div>
    </div>
    {#if parsed.error}
      <p role="alert" class="text-destructive text-sm">{parsed.error}</p>
    {/if}
    {#if isEditing && !textMode}
      <div use:animateSection>
        <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2" aria-label="Options">
          <legend class="mb-3 text-sm font-medium">Options</legend>
          <p class="text-muted-foreground col-span-full text-sm leading-relaxed">
            {activeHelp}
          </p>
          {#each fields as field, index (`${activeComponent?.start}:${field.path.join('.')}`)}
            {#if field.kind === 'property'}
              <fieldset class="col-span-full min-w-0">
                <legend class="text-muted-foreground mb-2 text-xs font-medium">
                  {field.label}
                </legend>
                <div class="flex flex-wrap gap-2">
                  {#each properties as property (property.path)}
                    {@const info = describeTemplateProperty(property)}
                    {@const Icon =
                      info.type === 'boolean'
                        ? CheckIcon
                        : info.type === 'phone'
                          ? PhoneIcon
                          : info.type === 'url'
                            ? GlobeIcon
                            : TextIcon}
                    <button
                      type="button"
                      {disabled}
                      aria-pressed={field.value === property.path}
                      onclick={() => updateField(field, property.path)}
                      class="border-border/30 hover:border-border/60 aria-pressed:border-primary flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-left disabled:opacity-50"
                    >
                      <Icon class="size-4 shrink-0" aria-hidden="true" />
                      <span class="min-w-0 break-words">
                        <span class="block text-sm font-medium">{info.name}</span>
                        <span class="text-muted-foreground block text-xs"
                          >{info.source}</span
                        >
                      </span>
                      <span class="sr-only">{info.type}</span>
                    </button>
                  {/each}
                </div>
              </fieldset>
            {:else if field.kind === 'boolean'}
              <Checkbox
                id={`${uid}-component-${index}`}
                rightText={field.label}
                checked={field.value === 'true'}
                {disabled}
                onCheckedChange={next => updateField(field, String(next))}
              />
            {:else if field.kind === 'number'}
              <label class="grid gap-2 text-sm" for={`${uid}-component-${index}`}>
                {field.label}
                <input
                  id={`${uid}-component-${index}`}
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={field.value}
                  {disabled}
                  class="border-border/50 w-full rounded-md border bg-transparent px-3 py-2"
                  oninput={event => updateField(field, event.currentTarget.value)}
                >
              </label>
            {:else}
              <TextInput
                id={`${uid}-component-${index}`}
                name=""
                label={field.label}
                value={field.value}
                trimOnBlur={false}
                {disabled}
                {...typeInputAppearance}
                onValueChange={next => updateField(field, next)}
              />
            {/if}
          {/each}
        </fieldset>
      </div>
    {/if}
    <div use:animateSection>
      <div class="grid gap-2">
        <h4 class="text-sm font-medium">{m.display_templates_preview()}</h4>
        {#if exampleScope}
          {#if examplesLoading && !examples.length}
            <p role="status" class="text-muted-foreground text-sm">
              Finding saved examples…
            </p>
          {:else if examplesFailed && !examples.length}
            <p role="alert" class="text-muted-foreground text-sm">
              Could not load saved examples.
            </p>
            <Button
              type="button"
              text="Retry examples"
              style="ghost"
              onClick={() => examplesRetry++}
            />
          {:else if !examples.length}
            <p class="text-muted-foreground text-sm">
              No saved examples are available for this feature type here.
            </p>
          {:else}
            <p class="text-muted-foreground text-xs">
              Real saved features from this scope, using values in the selected
              language. This previews the template, without changing their saved names
              or custom titles.
            </p>
            {#if examplesLoading}
              <span role="status" class="text-muted-foreground text-xs"
                >Updating examples…</span
              >
            {:else if examplesFailed}
              <p role="alert" class="text-muted-foreground text-xs">
                Could not refresh examples. Showing the previous preview.
              </p>
              <Button
                type="button"
                text="Retry examples"
                style="ghost"
                onClick={() => examplesRetry++}
              />
            {/if}
            {#each examples as example (example.id)}
              <div class="border-border/30 grid gap-2 border-t pt-3">
                <p class="text-muted-foreground text-xs">Example: {example.title}</p>
                <output class="block min-h-6 break-words whitespace-pre-wrap"
                  >{exampleName(example) || 'No name generated'}</output
                >
                <dl class="grid gap-1 text-xs">
                  {#each examplePaths as path (path)}
                    <div class="grid min-w-0 gap-1 sm:grid-cols-2">
                      <dt class="text-muted-foreground break-words">
                        {inputLabel(path)}
                      </dt>
                      <dd class="break-words">
                        {example.missing.includes(path)
                          ? 'This value is missing'
                          : String(example.values[path])}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </div>
            {/each}
          {/if}
        {:else}
          {#if !previewValues}
            <p class="text-muted-foreground mt-1 text-xs">
              Illustrative values. Open this template from a feature naming setting to
              preview real saved features.
            </p>
          {/if}
          <output class="mt-2 block min-h-6 break-words whitespace-pre-wrap"
            >{preview || '—'}</output
          >
        {/if}
      </div>
    </div>
  {/if}
</div>
