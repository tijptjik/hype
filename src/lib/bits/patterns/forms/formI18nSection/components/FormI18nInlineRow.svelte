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

let { value, label, prefix = '', multiline = false, editable, isGenAI, attrs, issues, required, onToggle, onStart, onCancel, onClear }: {
  value: string; label: string; prefix?: string; multiline?: boolean; editable: boolean; isGenAI: boolean
  attrs: Record<string, unknown>; issues: import('$app/server').RemoteFormIssue[] | undefined; required: boolean
  onToggle: () => void; onStart: () => void; onCancel: () => void; onClear: () => void
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
  if (active && token === session) root.querySelector<HTMLInputElement>('input:not([type=hidden]), textarea')?.focus({ preventScroll: true })
}
function close(): void { active = false; session++ }
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); onCancel(); close(); void tick().then(() => display?.focus({ preventScroll: true }))
  } else if (event.key === 'Enter' && !multiline) {
    event.preventDefault(); close(); void tick().then(() => display?.focus({ preventScroll: true }))
  }
}
$effect(() => { if (!editable) close() })
const editorAttrs = $derived({ ...attrs, ...(multiline ? { style: `height: ${Math.max(40, editHeight - 2)}px; max-height: none; field-sizing: fixed;` } : {}), 'aria-label': label, onkeydown: keydown })
</script>

<div bind:this={root} class="grid min-w-0 items-start gap-2 {prefix ? 'grid-cols-[2.5rem_minmax(0,1fr)_2rem]' : 'grid-cols-[minmax(0,1fr)_2rem]'}" data-inline-locale-row>
  {#if prefix}<span class="flex min-h-[42px] min-w-0 items-center justify-center self-center break-words text-center font-mono text-xs leading-[22px] text-muted-foreground" aria-hidden="true">{prefix}</span>{/if}
  <div class="group/inline-field relative min-w-0">
    <!-- Keep the bound control mounted and registered in display mode and hidden locales. -->
    <div hidden={!active} onfocusout={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close() }}>
      {#if multiline}
        <TextArea {value} {required} {issues} isEditing={active} rows={3} renderHtml={true} textareaAttrs={editorAttrs} controlClass="bg-transparent! px-0! [box-shadow:none]!" class="gap-0! [&_.bits-form\_\_label]:hidden [&_textarea]:pl-[11px]! [&_textarea]:pr-9! [&_textarea]:min-h-10! [&_textarea]:py-2! [&_textarea]:text-[15px]! [&_textarea]:leading-[22px]!" />
      {:else}
        <TextInput {value} {required} {issues} isEditing={active} inputAttrs={editorAttrs} controlClass="bg-transparent! px-0! [box-shadow:none]!" class="gap-0! [&_.bits-form\_\_label]:hidden" inputClass="h-10! pl-[11px]! pr-9! py-2! text-[15px]! leading-[22px]!" />
      {/if}
    </div>
    <div bind:this={display} hidden={active} role={editable ? 'button' : undefined} tabindex={editable ? 0 : undefined} aria-label={label} aria-readonly={!editable}
      class="min-h-[42px] min-w-0 whitespace-normal break-words rounded-md pl-[11px] pr-9 {multiline ? 'py-2' : 'py-[9px]'} text-[15px] leading-[22px] {editable ? 'cursor-text border border-border/30 hover:border-border/60 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2' : 'border border-transparent'}"
      onclick={() => void open()} onkeydown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void open() } }}>
      <!-- Overlap only the old/new values; prefixes, verification and actions stay mounted. -->
      <div class="grid min-w-0">
        {#key value}
          <div class="col-start-1 row-start-1 min-w-0" data-inline-value
            transition:fade={{ duration: prefersReducedMotion.current || typeof globalThis.Element?.prototype.animate !== 'function' ? 0 : 200 }}>
            {#if !hasMeaningfulText(value)}<span class="text-muted-foreground">—</span>
            {:else if multiline}<HtmlPreview html={value} />
            {:else}{value}{/if}
          </div>
        {/key}
      </div>
    </div>
    {#if editable && value.length}
      <button type="button" aria-label={`${m.filters__clear()} ${label}`} title={m.filters__clear()}
        class="absolute right-1 top-1 flex size-8 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover/inline-field:opacity-100 group-focus-within/inline-field:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary [@media(hover:none)]:opacity-100"
        onpointerdown={event => event.preventDefault()}
        onclick={() => { onClear(); if (!active) void tick().then(() => display?.focus({ preventScroll: true })) }}><XIcon class="size-3.5" /></button>
    {/if}
  </div>
  <div class="flex min-h-[42px] items-center justify-center"><GenAI {isGenAI} disabled={!editable} onToggle={onToggle} /></div>
</div>
