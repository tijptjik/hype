<script lang="ts">
// SVELTE
import { tick } from 'svelte'
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
import { TextInput, TextArea } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/index.js'

let {
  value,
  onChange,
  properties,
  locale = 'en',
  disabled = false,
  isEditing = true,
}: {
  value: string
  onChange: (source: string) => void
  properties: TemplateProperty[]
  locale?: string
  disabled?: boolean
  isEditing?: boolean
} = $props()
let activeStart = $state<number | null>(null)
let sourceElement: HTMLTextAreaElement | undefined
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
          templatePreviewValue(
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
const activeComponent = $derived(
  parsed.components.find(component => component.start === activeStart),
)
const fields = $derived(
  activeComponent ? componentFields(activeComponent.expression) : [],
)
const componentKinds = [
  'property',
  'pair',
  'join',
  'optional',
  'cases',
  'fallback',
] as const
const componentLabels = {
  property: 'Property',
  pair: 'Pair',
  join: 'Join',
  optional: 'Optional text',
  cases: 'Cases',
  fallback: 'Fallback',
}

/** Track cursor selection and expose the component containing it.
 * @param event Selection, pointer or keyboard event from the expression. @returns Nothing.
 */
function selectComponent(event: Event): void {
  const element = event.currentTarget as HTMLTextAreaElement
  sourceElement = element
  selectionStart = element.selectionStart
  selectionEnd = element.selectionEnd
  activeStart =
    parsed.components.find(
      component =>
        element.selectionStart >= component.start &&
        element.selectionStart < component.end,
    )?.start ?? null
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
    kind === 'pair' || kind === 'join'
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
  selectionEnd = start + text.length
  await tick()
  sourceElement ??= document.getElementById(`${uid}-source`) as HTMLTextAreaElement
  sourceElement?.focus()
  sourceElement?.setSelectionRange(start, start + text.length)
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
  selectionStart = activeComponent.start
  selectionEnd = activeComponent.start + text.length
}
</script>

<div class="grid min-w-0 gap-4">
  {#if isEditing}
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
  <TextArea
    name=""
    id={`${uid}-source`}
    label={m.display_templates_expression()}
    {value}
    {disabled}
    {isEditing}
    rows={4}
    controlClass="font-mono bg-transparent! border-border/30!"
    onValueChange={onChange}
    textareaAttrs={{
      onselect: selectComponent,
      onclick: selectComponent,
      onkeyup: selectComponent,
      oninput: selectComponent,
    }}
  />
  {#if parsed.error}
    <p role="alert" class="text-destructive text-sm">{parsed.error}</p>
  {/if}
  {#if isEditing && activeComponent}
    <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2" aria-label="Component fields">
      <legend class="mb-3 text-sm font-medium">Component fields</legend>
      {#each fields as field, index (`${activeComponent.start}:${field.path.join('.')}`)}
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
  {/if}
  <div class="border-border rounded-lg border p-4">
    <span class="text-muted-foreground text-xs font-semibold"
      >{m.display_templates_preview()}</span
    >
    <p class="text-muted-foreground mt-1 text-xs">
      Example values are generated automatically; saved examples are used when
      available.
    </p>
    <output class="mt-2 block min-h-6 break-words whitespace-pre-wrap"
      >{preview || '—'}</output
    >
  </div>
</div>
