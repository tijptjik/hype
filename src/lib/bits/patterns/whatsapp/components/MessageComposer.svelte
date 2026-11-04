<script lang="ts">
// ICONS
import FileIcon from 'virtual:icons/lucide/file'
import ImageIcon from 'virtual:icons/lucide/image'
import ImagesIcon from 'virtual:icons/lucide/images'
import LoaderCircleIcon from 'virtual:icons/lucide/loader-circle'
import MicIcon from 'virtual:icons/lucide/mic'
import PaperclipIcon from 'virtual:icons/lucide/paperclip'
import SendIcon from 'virtual:icons/lucide/send'
import SquareIcon from 'virtual:icons/lucide/square'
import StickerIcon from 'virtual:icons/lucide/sticker'
import XIcon from 'virtual:icons/lucide/x'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Dropdown from '#lib/bits/core/dropdown/Dropdown.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
// COMPONENTS
import EmojiPicker from './EmojiPicker.svelte'
import MediaPicker from '#lib/bits/patterns/messaging/MediaPicker.svelte'
// TYPES
import type { DropdownItem } from '#lib/bits/core/dropdown/dropdown.types.js'
import type { WhatsAppConsoleModel } from '../whatsapp.types.js'
let { model, recipientLocked = false, compact = false, disabled = false }: { disabled?: boolean; model: WhatsAppConsoleModel; recipientLocked?: boolean; compact?: boolean } = $props()
let imageInput: HTMLInputElement
let fileInput: HTMLInputElement
let dragging = $state(false)
let stickerInput: HTMLInputElement
let messageInput = $state<HTMLTextAreaElement>()
let messageWidth = $state(0)
const canSubmit = $derived(!disabled && !model.busy && !model.recording && model.status.connected && model.attempt?.state !== 'submitted' && model.attempt?.state !== 'uncertain')

/** Ctrl+Enter follows the same guarded submit path as the Send button; Enter stays multiline. */
function onMessageKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || !event.ctrlKey || event.shiftKey || event.altKey || event.isComposing) return
  event.preventDefault()
  if (!event.repeat && canSubmit) (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit()
}

const locked = $derived(disabled || Boolean(model.requestId) || model.busy || model.recording)
const attachments = $derived(model.attachments ?? (model.attachment ? [model.attachment] : []))
const sendLabel = $derived(model.busy ? 'Working…' : model.requestId ? 'Check / retry same request' : 'Send message')
const attachmentItems: DropdownItem[] = $derived([
  { label: 'Photo or video', icon: ImageIcon, disabled: locked || !model.status.connected, onSelect: () => imageInput.click() },
  { label: 'Document', icon: FileIcon, disabled: locked || !model.status.connected, onSelect: () => fileInput.click() },
  ...(model.mediaPicker ? [
    { label: 'GIFs', icon: ImagesIcon, disabled: locked, onSelect: () => model.mediaPicker?.show('gif') },
    { label: 'Stickers', icon: StickerIcon, disabled: locked, onSelect: () => model.mediaPicker?.show('sticker') },
  ] : [
    { label: 'Sticker', icon: StickerIcon, disabled: locked || !model.status.connected, onSelect: () => stickerInput.click() },
  ]),
])

// Grow multiline drafts and emoji insertions within the bar, including after a width change.
$effect(() => {
  const text = model.text
  messageWidth
  if (!messageInput) return
  messageInput.style.height = text ? '0px' : ''
  if (text) messageInput.style.height = `${messageInput.scrollHeight}px`
})

/** Stage the explicitly selected file, resetting selection so it can be retried. */
function pick(input: HTMLInputElement, sticker = false): void {
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (sticker && files[0]) void model.upload(files[0], true)
  else if (model.uploadFiles) void model.uploadFiles(files)
  else if(files[0]) void model.upload(files[0])
}
/** Paste/drop stages files for review; it never sends on drop. */
function stageFiles(files: File[]): void { if (!locked && model.status.connected) void model.uploadFiles?.(files) }
</script>

<form aria-label="Message composer" aria-busy={disabled || model.busy} ondragover={event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragging=true}}} ondragleave={()=>dragging=false} ondrop={event=>{event.preventDefault();dragging=false;stageFiles(Array.from(event.dataTransfer?.files??[]))}} onpaste={event=>{const files=Array.from(event.clipboardData?.files??[]);if(files.length){event.preventDefault();stageFiles(files)}}} class={`flex min-w-0 shrink-0 flex-col gap-2 border-t border-border bg-panel ${compact ? 'p-2' : 'p-3 sm:p-4'}`} onsubmit={(event) => { event.preventDefault(); if (canSubmit) void model.send() }}>
  {#if disabled}<p role="status" class="text-xs text-muted-foreground">Preparing forward…</p>{/if}
  {#if !recipientLocked}<TextInputField id={`${model.viewId ?? 'whatsapp'}-recipient`} label="Recipient" bind:value={model.to} readonly={Boolean(model.requestId)} placeholder={model.platform === 'telegram' ? '@username, +852… or a chat ID' : '+852… or a group address'} inputAttrs={{ autocomplete: 'off' }} required />{/if}
  {#if model.reply}
    <div class="flex items-start justify-between gap-3 rounded-lg border-l-2 border-primary bg-surface p-3 text-sm">
      <div class="min-w-0"><p class="font-medium">{model.replySelection ? 'Quoting' : 'Replying to'} {model.reply.fromMe ? 'You' : model.displayName(model.reply.sender, model.reply.senderName)}</p><p class="line-clamp-3 break-words text-muted-foreground">{model.replySelection?.text || model.reply.content?.text || model.reply.text || model.reply.content?.kind}</p></div>
      <Button text="Cancel reply" style="ghost" disabled={Boolean(model.requestId)} onClick={() => model.quote(null)} />
    </div>
  {/if}
  {#if dragging}<p role="status" class="rounded-lg border-2 border-dashed border-primary p-3 text-sm">Drop files to attach</p>{/if}
  {#if attachments.length}<div class="flex max-h-36 flex-col gap-2 overflow-y-auto">
  {#each attachments as item (item.id)}
    <div class="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm"><span class="min-w-0 break-words">{item.name}</span><Button text={`Remove ${item.name}`} iconComponent={XIcon} hideLabel size="sm" attrs={{'aria-label':`Remove ${item.name}`,title:`Remove ${item.name}`}} style="ghost" disabled={locked} onClick={() => model.removeQueuedAttachment ? model.removeQueuedAttachment(item.id) : model.removeAttachment()} /></div>
  {/each}
  </div>{/if}
  <input class="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" bind:this={imageInput} onchange={() => pick(imageInput)} aria-label="Choose image" />
  <input class="hidden" type="file" accept="image/webp" bind:this={stickerInput} onchange={() => pick(stickerInput, true)} aria-label="Choose sticker" />
  <input class="hidden" type="file" multiple bind:this={fileInput} onchange={() => pick(fileInput)} aria-label="Choose attachments" />
  <div class="flex min-w-0 items-end gap-1 rounded-xl border border-border bg-surface p-1 focus-within:border-primary/50">
    <Dropdown
      ariaLabel="Attach files"
      disabled={locked || (!model.status.connected && !model.mediaPicker)}
      triggerIcon={PaperclipIcon}
      triggerIconClass="size-5"
      triggerClass="shrink-0 rounded-lg border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-35"
      contentSide="top"
      contentAlign="start"
      contentClass="max-h-[var(--bits-dropdown-menu-content-available-height)] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border-border bg-panel p-1.5 shadow-xl"
      itemClass="rounded-lg py-3 whitespace-normal"
      items={attachmentItems}
    />
    <label for={`${model.viewId ?? 'whatsapp'}-message`} class="sr-only">Message</label>
    <textarea
      id={`${model.viewId ?? 'whatsapp'}-message`}
      bind:this={messageInput}
      bind:clientWidth={messageWidth}
      bind:value={model.text}
      readonly={locked || Boolean(model.attachment && !['image','video','document','sticker'].includes(model.attachment.content.kind))}
      rows="1"
      maxlength="16384"
      aria-keyshortcuts="Control+Enter"
      onkeydown={onMessageKeydown}
      placeholder={messageWidth > 0 && messageWidth < 150 ? 'Message…' : 'Write a message…'}
      class="max-h-36 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-sm leading-5 text-base-content outline-none placeholder:text-muted-foreground"
    ></textarea>
    <div class="flex h-11 shrink-0 items-center"><EmojiPicker iconOnly disabled={locked} onSelect={(emoji) => { model.text += emoji }} /></div>
    {#if model.recording}
      <Button text="Stop recording" iconComponent={SquareIcon} modifier="circle" class="size-11 shrink-0" style="soft" color="error" attrs={{ title: 'Stop recording' }} onClick={() => model.stopRecording()} />
      <Button text="Cancel recording" iconComponent={XIcon} modifier="circle" class="size-11 shrink-0" style="ghost" attrs={{ title: 'Cancel recording' }} onClick={() => model.stopRecording(true)} />
    {:else}
      <Button text="Record voice" iconComponent={MicIcon} modifier="circle" class="size-11 shrink-0" style="ghost" disabled={locked || model.callBusy || !model.status.connected} attrs={{ title: 'Record voice' }} onClick={() => void model.record()} />
      <!-- Optically center the diagonal plane; keep the pending spinner at the geometric center. -->
      <Button text={sendLabel} iconComponent={model.busy ? LoaderCircleIcon : SendIcon} iconClasses={model.busy ? 'animate-spin' : '-translate-x-px translate-y-px'} hideLabel hideLabelInstantly modifier="circle" class="size-11 shrink-0" type="submit" style="none" color="primary" disabled={!canSubmit} attrs={{ title: `${sendLabel} (Ctrl+Enter)` }} />
    {/if}
  </div>
  {#if model.recording}<span role="status" class="px-2 text-sm text-muted-foreground">Recording · {model.recordingSeconds}s</span>{/if}
</form>
{#if model.mediaPicker}<MediaPicker model={model.mediaPicker} disabled={locked || !model.status.connected} onUploadSticker={() => stickerInput.click()} />{/if}
