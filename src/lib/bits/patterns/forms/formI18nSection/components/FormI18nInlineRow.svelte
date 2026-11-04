<script lang="ts">
// SVELTE
import { tick } from 'svelte'
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import XIcon from 'virtual:icons/lucide/x'
import { m } from '#lib/i18n.js'
// COMPONENTS
import { TextArea, TextInput } from '#lib/bits/custom/form/index.js'
import GenAI from '#lib/bits/custom/form/src/input/components/GenAI.svelte'
import HtmlPreview from '#lib/bits/custom/htmlPreview/HtmlPreview.svelte'
// I18N
import { hasMeaningfulText } from '../text'

let {
  value,
  label,
  prefix = '',
  multiline = false,
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
  value: string
  label: string
  prefix?: string
  multiline?: boolean
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
  class="grid min-w-0 items-start gap-2 {showVerification
    ? prefix
      ? 'grid-cols-[2.5rem_minmax(0,1fr)_2rem]'
      : 'grid-cols-[minmax(0,1fr)_2rem]'
    : prefix
      ? 'grid-cols-[2.5rem_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)]'}"
  data-inline-locale-row
>
  {#if prefix}
    <span
      class="text-muted-foreground flex min-h-[42px] min-w-0 items-center justify-center self-center text-center font-mono text-xs leading-[22px] break-words"
      aria-hidden="true"
      >{prefix}</span
    >
  {/if}
  <div class="group/inline-field relative min-w-0">
    <!-- Keep the bound control mounted and registered in display mode and hidden locales. -->
    <div
      hidden={!active}
      onfocusout={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) close()
      }}
    >
      {#if multiline}
        <TextArea
          {value}
          {required}
          {issues}
          isEditing={active}
          rows={3}
          {renderHtml}
          textareaAttrs={editorAttrs}
          controlClass="bg-transparent! px-0! [box-shadow:none]!"
          class="gap-0! [&_.bits-form\_\_label]:hidden [&_textarea]:min-h-10! [&_textarea]:py-2! [&_textarea]:pr-9! [&_textarea]:pl-[11px]! [&_textarea]:text-[15px]! [&_textarea]:leading-[22px]!"
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
          inputClass="h-10! pl-[11px]! pr-9! py-2! text-[15px]! leading-[22px]!"
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
      class="min-h-[42px] min-w-0 whitespace-normal break-words rounded-md pl-[11px] pr-9 {multiline
        ? 'py-2'
        : 'py-[9px]'} text-[15px] leading-[22px] {editable
        ? 'cursor-text border border-border/30 hover:border-border/60 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2'
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
            {:else if renderHtml}
              <HtmlPreview html={value} />
            {:else}
              {value}
            {/if}
          </div>
        {/key}
      </div>
    </div>
    {#if editable && value.length}
      <button
        type="button"
        aria-label={`${m.filters__clear()} ${label}`}
        title={m.filters__clear()}
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
    <div class="flex min-h-[42px] items-center justify-center">
      <GenAI {isGenAI} disabled={!editable} {onToggle} />
    </div>
  {/if}
</div>
