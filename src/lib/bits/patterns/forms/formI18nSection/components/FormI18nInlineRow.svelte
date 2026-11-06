<script lang="ts">
// SVELTE
import { tick, type Snippet } from 'svelte'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import XIcon from 'virtual:icons/lucide/x'
import { m } from '#lib/i18n.js'
// COMPONENTS
import { TextArea, TextInput } from '#lib/bits/custom/form/index.js'
import GenAI from '#lib/bits/custom/form/src/input/components/GenAI.svelte'
import FieldError from '#lib/bits/custom/form/src/label/components/Error.svelte'
import MarkdownEditor from '#lib/bits/custom/markdownEditor/MarkdownEditor.svelte'
import { renderMarkdownContent } from '#lib/services/markdown.js'
import HtmlPreview from '#lib/bits/custom/htmlPreview/HtmlPreview.svelte'
// I18N
import { hasMeaningfulText } from '../text'

let {
  preview,
  toolbarActions,
  showPreview = true,
  value,
  label,
  prefix = '',
  multiline = false,
  monospace = false,
  markdown = false,
  editable,
  isGenAI = false,
  showVerification = true,
  renderHtml = multiline,
  attrs,
  issues,
  required,
  onToggle = () => {},
  onStart,
  onCancel,
  onClear,
}: {
  toolbarActions?: Snippet
  preview?: Snippet
  showPreview?: boolean
  value: string
  label: string
  prefix?: string
  multiline?: boolean
  monospace?: boolean
  markdown?: boolean
  editable: boolean
  isGenAI?: boolean
  showVerification?: boolean
  renderHtml?: boolean
  attrs: Record<string, unknown>
  issues: import('$app/server').RemoteFormIssue[] | undefined
  required: boolean
  onToggle?: () => void
  onStart: () => void
  onCancel: () => void
  onClear: () => void
} = $props()
let active = $state(false)
let editHeight = $state(42)
let root: HTMLDivElement
let display: HTMLDivElement
let session = 0
let prefixLabel = $state('')
const displayErrorId = $props.id()

// Retain the label while its column closes so both the text and gutter can fade away.
$effect(() => {
  if (prefix) prefixLabel = prefix
})

async function open(): Promise<void> {
  if (!editable || active) return
  editHeight = display.getBoundingClientRect().height
  onStart()
  active = true
  const token = ++session
  await tick()
  if (active && token === session)
    root
      .querySelector<HTMLInputElement>('input:not([type=hidden]), textarea')
      ?.focus({ preventScroll: true })
}
function close(): void {
  active = false
  session++
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onCancel()
    close()
    void tick().then(() => display?.focus({ preventScroll: true }))
  } else if (event.key === 'Enter' && !multiline) {
    event.preventDefault()
    close()
    void tick().then(() => display?.focus({ preventScroll: true }))
  }
}
$effect(() => {
  if (!editable) close()
})
/** Fit a typed description to its contents without introducing an inner scrollbar.
 * @param event Native input event, forwarded to the registered form control first.
 * @returns Nothing; updates the textarea and its retained height together.
 */
function input(event: Event): void {
  if (typeof attrs.oninput === 'function') attrs.oninput(event)
  if (!multiline) return
  const control = event.currentTarget as HTMLTextAreaElement
  control.style.height = 'auto'
  const style = getComputedStyle(control)
  const height = Math.max(
    40,
    control.scrollHeight +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth),
  )
  editHeight = height + 2
  control.style.height = `${height}px`
}
const editorAttrs = $derived({
  ...attrs,
  ...(multiline
    ? {
        style: `height: ${Math.max(40, editHeight - 2)}px; max-height: none; field-sizing: fixed; overflow-y: hidden;`,
      }
    : {}),
  'aria-label': label,
  onkeydown: keydown,
  oninput: input,
})
</script>

<div
  bind:this={root}
  class="grid min-w-0 items-start transition-[grid-template-columns] duration-200 ease-in-out motion-reduce:transition-none"
  style:grid-template-columns={`${prefix ? '3rem' : '0rem'} minmax(0,1fr)${showVerification ? ' 2.5rem' : ''}`}
  data-inline-locale-row
>
  <!-- A stable prefix track interpolates the value's position instead of inserting a column. -->
  <span
    class="text-muted-foreground flex min-h-[42px] min-w-0 items-center justify-center self-center overflow-hidden pr-2 text-center font-mono text-xs leading-[22px] whitespace-nowrap transition-opacity duration-200 ease-in-out motion-reduce:transition-none"
    style:opacity={prefix ? 1 : 0}
    aria-hidden="true"
    >{prefixLabel}</span
  >
  <div class="group/inline-field relative min-w-0">
    <!-- Keep the bound control mounted and registered in display mode and hidden locales. -->
    <div
      hidden={!active}
      onfocusout={event => {
        if (!markdown && !event.currentTarget.contains(event.relatedTarget as Node))
          close()
      }}
    >
      {#if markdown}
        {#if active}
          <MarkdownEditor
            {value}
            {attrs}
            {label}
            {toolbarActions}
            onDone={close}
            onCancel={keydown}
          />
          {#each issues ?? [] as issue}
            <p class="text-destructive text-sm">{issue.message}</p>
          {/each}
        {:else}
          <textarea {...attrs} {value} hidden aria-label={label}></textarea>
        {/if}
      {:else if multiline}
        <TextArea
          {value}
          {required}
          {issues}
          isEditing={active}
          rows={3}
          {renderHtml}
          textareaAttrs={editorAttrs}
          controlClass="bg-transparent! px-0! [box-shadow:none]!"
          class={String.raw`gap-0! [&_.bits-form\_\_label]:hidden [&_textarea]:min-h-10! [&_textarea]:py-2! [&_textarea]:pr-9! [&_textarea]:pl-[11px]! [&_textarea]:leading-[22px]! ${monospace ? '[&_textarea]:font-mono! [&_textarea]:text-[13px]!' : '[&_textarea]:text-[15px]!'}`}
        />
      {:else}
        <TextInput
          {value}
          {required}
          {issues}
          isEditing={active}
          inputAttrs={editorAttrs}
          controlClass="bg-transparent! px-0! [box-shadow:none]!"
          class="gap-0! [&_.bits-form\_\_label]:hidden"
          inputClass={`h-10! pl-[11px]! pr-9! py-2! leading-[22px]! ${monospace ? 'font-mono! text-[13px]!' : 'text-[15px]!'}`}
        />
      {/if}
    </div>
    <!-- biome-ignore lint/a11y/noStaticElementInteractions: Editable rich values expose keyboard/button semantics; readonly values remain selectable block content. -->
    <!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: Both dynamic roles (button and group) support an accessible label. -->
    <div
      bind:this={display}
      hidden={active}
      role={editable ? 'button' : 'group'}
      tabindex={editable ? 0 : undefined}
      aria-label={label}
      aria-invalid={editable && issues?.length ? 'true' : undefined}
      aria-describedby={editable && issues?.length ? displayErrorId : undefined}
      class="transition-[border-color,background-color] duration-180 motion-reduce:transition-none min-h-[42px] min-w-0 whitespace-normal break-words rounded-md pl-[11px] pr-9 {multiline
        ? 'py-2'
        : 'py-[9px]'} {monospace
        ? 'font-mono text-[13px]'
        : 'text-[15px]'} leading-[22px] {editable
        ? `cursor-text border ${issues?.length ? 'border-error' : 'border-border/30 hover:border-border/60'} hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2`
        : 'border border-transparent'}"
      onclick={() => void open()}
      onkeydown={event => {
        if (
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault()
          void open()
        }
      }}
    >
      <!-- Overlap only the old/new values; prefixes, verification and actions stay mounted. -->
      <div class="grid min-w-0">
        {#key value}
          <div
            class="col-start-1 row-start-1 min-w-0"
            data-inline-value
            transition:fade={{
              duration:
                prefersReducedMotion.current ||
                typeof globalThis.Element?.prototype.animate !== 'function'
                  ? 0
                  : 200,
            }}
          >
            {#if !hasMeaningfulText(value)}
              <span class="text-muted-foreground">—</span>
            {:else if showPreview && preview}
              {@render preview()}
            {:else if markdown}
              <HtmlPreview html={renderMarkdownContent(value)} />
            {:else if renderHtml}
              <HtmlPreview html={value} />
            {:else}
              {value}
            {/if}
          </div>
        {/key}
      </div>
    </div>
    {#if editable && !active && issues?.length}
      <div id={displayErrorId} role="alert"><FieldError {issues} class="px-3" /></div>
    {/if}
    {#if editable && value.length && !(markdown && active)}
      <button
        type="button"
        aria-label={`${m.filters__clear()} ${label}`}
        class="text-muted-foreground hover:text-primary focus-visible:outline-primary absolute top-1 right-1 flex size-8 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/inline-field:opacity-100 group-hover/inline-field:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 [@media(hover:none)]:opacity-100"
        onpointerdown={event => event.preventDefault()}
        onclick={() => {
          onClear()
          if (!active) void tick().then(() => display?.focus({ preventScroll: true }))
        }}
      >
        <XIcon class="size-3.5" />
      </button>
    {/if}
  </div>
  {#if showVerification}
    <div class="ml-2 flex min-h-[42px] items-center justify-center">
      <GenAI {isGenAI} disabled={!editable} {onToggle} />
    </div>
  {/if}
</div>
