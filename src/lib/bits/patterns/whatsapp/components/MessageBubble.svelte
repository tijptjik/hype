<script lang="ts">
// SVELTE
import { onMount, tick, untrack } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
// COMPONENTS
import EmojiPicker from './EmojiPicker.svelte'
import MessageText from './MessageText.svelte'
import MessageMedia from './MessageMedia.svelte'
import MediaSkeleton from '#lib/bits/patterns/messaging/MediaSkeleton.svelte'
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
import ClockIcon from 'virtual:icons/lucide/clock-3'
import AlertIcon from 'virtual:icons/lucide/circle-alert'
import EditIcon from 'virtual:icons/lucide/pencil'
import ForwardIcon from 'virtual:icons/lucide/forward'
import CopyIcon from 'virtual:icons/lucide/copy'
import DeleteIcon from 'virtual:icons/lucide/trash-2'
import ReplyIcon from 'virtual:icons/lucide/reply'
// STYLES
import {
  messageActionsClass,
  messageActionButtonClass,
} from './MessageBubble.styles.js'
// FORMATTING
import { messageMediaKey } from '#lib/messaging/message-key.js'
import { quotedPreview } from '#lib/messaging/quoted-message.js'
import { selectedTextQuote } from '#lib/messaging/selected-quote.js'
import type { TextQuote } from '#lib/messaging/types.js'
import { messageClockTime } from './message-time.js'
// TYPES
import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'
interface Props {
  attachmentPending?: boolean
  showHeader?: boolean
  showTime?: boolean
  sendState?: 'pending' | 'submitted' | 'uncertain' | 'failed'
  transitionName?: string
  organisationName?: string
  platformLabel?: string
  message: WhatsAppMessage
  now: number
  displayName: string
  username?: string | null
  photo?: string | null
  quoteName?: string
  reactions: { emoji: string; count: number }[]
  disabled: boolean
  reactionDisabled?: boolean
  mediaUrl?: string
  mediaError?: string
  onLoadMedia: () => Promise<void>
  onOpenQuote?: () => Promise<void>
  quoteLoading?: boolean
  highlighted?: boolean
  onDelete?: () => Promise<void>
  onForward?: () => void
  onEdit?: (text: string) => Promise<void>
  onReply: (selection?: TextQuote) => void
  quoteOriginal?: WhatsAppMessage | null
  onLoadQuote?: () => Promise<WhatsAppMessage | null>
  onReact: (emoji: string) => void
}
let {
  attachmentPending = false,
  showTime = true,
  showHeader = true,
  sendState,
  transitionName,
  platformLabel = 'WhatsApp',
  organisationName,
  message,
  now,
  displayName,
  username,
  photo,
  quoteName,
  quoteOriginal,
  onLoadQuote,
  reactions,
  disabled,
  onEdit,
  onDelete,
  onForward,
  onReply,
  onReact,
  mediaUrl,
  mediaError,
  onLoadMedia,
  onOpenQuote,
  quoteLoading = false,
  highlighted = false,
  reactionDisabled = false,
}: Props = $props()
let bubble = $state<HTMLElement>()
let messageBody = $state<HTMLElement>()
let selectionQuote = $state<TextQuote | null>(null)
let previewLoading = $state(false)
const previewText = $derived(quotedPreview(message, quoteOriginal))
const replyLabel = $derived(selectionQuote ? 'Reply to selected text' : 'Reply')

// Resolve missing previews only near the visible timeline; this never navigates or marks read.
$effect(() => {
  const element = bubble,
    source = message.content?.quoted,
    original = quoteOriginal
  if (
    !element ||
    !source ||
    original ||
    (source.text && source.sender) ||
    typeof IntersectionObserver === 'undefined'
  )
    return
  const load = untrack(() => onLoadQuote)
  if (!load) return
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      previewLoading = true
      void load()
        .catch(() => {})
        .finally(() => {
          previewLoading = false
        })
    },
    { root: element.closest('[role="log"]'), rootMargin: '80px' },
  )
  observer.observe(element)
  return () => observer.disconnect()
})
onMount(() => {
  if (platformLabel !== 'Telegram') return
  const update = () => {
    selectionQuote =
      messageBody && !message.deleted && !message.content?.viewOnce
        ? selectedTextQuote(
            messageBody,
            message.content?.text || message.text || '',
            window.getSelection(),
          )
        : null
  }
  document.addEventListener('selectionchange', update)
  return () => document.removeEventListener('selectionchange', update)
})
let reactionOpen = $state(false)
let confirmingDelete = $state(false)
let actionError = $state('')
let deleting = $state(false)
let editing = $state(false)
let editText = $state('')
let editError = $state('')
let saving = $state(false)
let editInput = $state<HTMLTextAreaElement>()
/** Keep inline text and failures visible until the provider confirms the edit. */
async function saveEdit(): Promise<void> {
  if (
    !onEdit ||
    saving ||
    disabled ||
    !editText.trim() ||
    editText === (message.content?.text || message.text || '')
  )
    return
  saving = true
  editError = ''
  try {
    await onEdit(editText)
    editing = false
  } catch (cause) {
    editError = cause instanceof Error ? cause.message : 'Unable to edit message'
  } finally {
    saving = false
  }
}
const deliveryLabel = $derived(
  sendState === 'pending'
    ? 'Sending'
    : sendState === 'failed'
      ? 'Not sent'
      : sendState === 'uncertain'
        ? 'Delivery uncertain'
        : message.delivery === 'read'
          ? 'Read'
          : message.delivery === 'delivered'
            ? 'Delivered'
            : message.delivery === 'sent' || sendState === 'submitted'
              ? `Sent to ${platformLabel === 'Telegram' ? 'Telegram cloud' : 'WhatsApp'}`
              : 'Submitted; delivery not confirmed',
)
const kind = $derived(message.content?.kind ?? (message.text ? 'text' : 'unsupported'))
const canEdit = $derived(
  Boolean(onEdit && message.fromMe && !message.deleted && kind === 'text'),
)
const canForward = $derived(
  Boolean(onForward && !message.deleted && !message.content?.viewOnce),
)
const copyText = $derived(message.content?.text || message.text || '')
const canCopy = $derived(
  Boolean(copyText && !message.deleted && !message.content?.viewOnce),
)
const canDelete = $derived(Boolean(onDelete && message.fromMe && !message.deleted))
const actionCount = $derived(
  2 + Number(canEdit) + Number(canForward) + Number(canCopy) + Number(canDelete),
)
// Use the provider account identity; operator attribution stays on hover.
const authorName = $derived(
  displayName || (message.fromMe ? organisationName || 'Shared account' : ''),
)
const authorPhoto = $derived(photo)
const authorUsername = $derived(message.fromMe ? undefined : username)
const operatorDetail = $derived(
  message.fromMe
    ? message.operator?.name || message.operator?.username || 'Operator not recorded'
    : undefined,
)
</script>

{#snippet metadata()}
  <span class="flex items-center gap-1.5"
    ><span class="flex items-center gap-1">
      {#if message.editedAt}
        <span
          role="img"
          aria-label="Edited"
          title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
          class="inline-flex text-muted-foreground"
          ><EditIcon class="size-3" aria-hidden="true" /></span
        >
      {/if}
      {#if showTime}
        <time
          class="whitespace-nowrap text-[11px] text-muted-foreground"
          datetime={new Date(message.timestamp).toISOString()}
          title={new Date(message.timestamp).toLocaleString()}
          >{messageClockTime(message.timestamp)}</time
        >
      {/if}
    </span>
    {#if message.fromMe && !message.deleted}
      <span
        role="img"
        aria-label={deliveryLabel}
        title={deliveryLabel}
        class="inline-flex shrink-0 {message.delivery === 'read'
          ? 'text-sky-600 dark:text-sky-400'
          : 'text-muted-foreground'}"
      >
        {#if sendState === 'failed' || sendState === 'uncertain'}
          <AlertIcon class="size-3.5 text-error" aria-hidden="true" />
        {:else if sendState === 'pending'}
          <CheckIcon
            class="size-3.5 opacity-40 motion-safe:animate-pulse"
            aria-hidden="true"
          />
        {:else if message.delivery || sendState === 'submitted'}
          <CheckIcon class="size-3.5" aria-hidden="true" />
        {:else}
          <ClockIcon class="size-3.5" aria-hidden="true" />
        {/if}
      </span>
    {/if}
  </span>
{/snippet}

<div
  class="flex min-w-0 {showHeader ? '' : '-mt-2'} {message.fromMe
    ? 'justify-end'
    : 'justify-start'}"
>
  <article
    bind:this={bubble}
    data-message-key={messageMediaKey(message)}
    data-quote-target={highlighted ? '' : undefined}
    style={`--message-actions-width: ${actionCount * 2.25 + 0.875}rem`}
    tabindex="-1"
    onpointerdown={event => {
      if (event.pointerType === 'touch')
        event.currentTarget.focus({ preventScroll: true })
    }}
    class="group/message relative flex min-w-0 max-w-[min(36rem,85%,calc(100%-var(--message-actions-width)))] flex-col gap-2 rounded-2xl border p-3 text-sm shadow-sm outline-none {highlighted
      ? 'ring-2 ring-primary'
      : ''} {message.fromMe
      ? 'bg-[var(--chat-outgoing-fill,var(--theme-raised))] border-[var(--chat-outgoing-border,var(--theme-border))]'
      : 'bg-panel border-border'}"
    aria-label={`Message from ${authorName}`}
  >
    {#if showHeader}
      <header
        title={operatorDetail}
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 text-xs"
      >
        <Avatar name={authorName} src={authorPhoto} class="size-8!" />
        <div class="min-w-0 leading-4">
          <span
            class="break-words font-medium text-base-content [overflow-wrap:anywhere]"
            >{authorName}</span
          >
          {#if authorUsername}
            <p class="text-muted-foreground [overflow-wrap:anywhere]">
              @{authorUsername.replace(/^@/, '')}
            </p>
          {/if}
        </div>
      </header>
    {/if}
    {#if message.content?.quoted && !message.deleted}
      <blockquote
        class="min-w-0 rounded-lg border-l-2 border-[var(--chat-quote-border,var(--theme-primary))] bg-[var(--chat-quote-fill,var(--theme-surface))] text-xs"
      >
        {#if onOpenQuote}
          <button
            type="button"
            aria-label="Show quoted message"
            aria-busy={quoteLoading}
            title="Go to the original message"
            disabled={quoteLoading}
            class="block w-full min-w-0 rounded-lg p-3 text-left transition-colors hover:bg-[var(--chat-quote-hover,var(--theme-raised))] focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60"
            onclick={() => void onOpenQuote?.()}
          >
            <span class="mb-1 block break-words font-medium"
              >Reply to
              {quoteName ||
                message.content.quoted.senderName ||
                message.content.quoted.sender ||
                'message'}</span
            >
            <span class="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              >{previewLoading && !quoteOriginal && !message.content.quoted.text
                ? 'Loading original…'
                : previewText}</span
            >
          </button>
        {:else}
          <div class="p-3">
            <p class="mb-1 break-words font-medium">
              Reply to
              {quoteName ||
                message.content.quoted.senderName ||
                message.content.quoted.sender ||
                'message'}
            </p>
            <MessageText
              text={previewLoading && !quoteOriginal && !message.content.quoted.text
                ? 'Loading original…'
                : previewText}
            />
          </div>
        {/if}
      </blockquote>
    {/if}
    {#if message.deleted}
      <p class="text-muted-foreground">Message deleted</p>
    {:else if message.content?.viewOnce}
      <p class="text-muted-foreground">View-once {kind} · Open in {platformLabel}</p>
    {:else}
      {#if attachmentPending}
        <div class="w-80 max-w-full">
          <MediaSkeleton label="Restoring attachment preview" />
        </div>
      {:else if ['image', 'sticker', 'audio', 'video', 'document'].includes(kind)}
        {#if message.content}
          <MessageMedia
            content={message.content}
            revision={message.editedAt ?? 0}
            url={mediaUrl}
            error={mediaError}
            onLoad={onLoadMedia}
            {transitionName}
          />
        {/if}
      {:else if kind !== 'text'}
        <p class="text-muted-foreground">Unsupported message</p>
      {/if}
      {#if editing}
        <form
          class="flex min-w-0 flex-col gap-2"
          aria-label="Edit message"
          onsubmit={event => {
            event.preventDefault()
            void saveEdit()
          }}
        >
          <textarea
            bind:this={editInput}
            aria-label="Edit message text"
            aria-keyshortcuts="Control+Enter"
            class="min-h-20 w-full rounded-lg border border-border bg-panel p-2"
            maxlength="16384"
            bind:value={editText}
            disabled={saving}
            onkeydown={event => {
              if (event.key === 'Enter' && event.ctrlKey && !event.isComposing) {
                event.preventDefault()
                void saveEdit()
              }
            }}
          ></textarea>
          <div class="flex gap-2">
            <Button
              text={saving ? 'Saving…' : 'Save edit'}
              type="submit"
              disabled={disabled ||
                saving ||
                !editText.trim() ||
                editText === (message.content?.text || message.text || '')}
            /><Button
              text="Cancel edit"
              style="ghost"
              disabled={saving}
              onClick={() => {
                editing = false
                editError = ''
              }}
            />
          </div>
          {#if editError}
            <p role="alert" class="text-sm">{editError}</p>
          {/if}
        </form>
      {:else if message.content?.text || message.text}
        <div bind:this={messageBody} class="min-w-0 max-w-full" data-selectable-message>
          <MessageText
            text={message.content?.text || message.text || ''}
            trailing={reactions.length ? undefined : metadata}
          />
        </div>
      {/if}
    {/if}
    {#if confirmingDelete}
      <fieldset
        class="flex flex-col gap-2 rounded-lg border border-border p-2"
        aria-label="Confirm message deletion"
      >
        <p>Delete this message for everyone?</p>
        <div class="flex gap-2">
          <Button
            text={deleting ? 'Deleting…' : 'Delete for everyone'}
            color="error"
            disabled={deleting}
            onClick={async () => {
              deleting = true
              try {
                await onDelete?.()
                confirmingDelete = false
              } catch (cause) {
                actionError = cause instanceof Error ? cause.message : 'Delete failed'
              } finally {
                deleting = false
              }
            }}
          /><Button
            text="Cancel"
            style="ghost"
            disabled={deleting}
            onClick={() => (confirmingDelete = false)}
          />
        </div>
      </fieldset>
    {/if}
    {#if actionError}
      <p role="alert" class="text-xs">{actionError}</p>
    {/if}
    {#if (editing ||
      message.deleted ||
      message.content?.viewOnce ||
      !(message.content?.text || message.text)) &&
      (showTime || message.editedAt || message.fromMe) &&
      !reactions.length}
      <div class="flex justify-end">{@render metadata()}</div>
    {/if}
    {#if reactions.length}
      <div class="flex items-end justify-between gap-3">
        <section class="flex min-w-0 flex-wrap gap-1" aria-label="Reactions">
          {#each reactions as reaction}
            <span class="rounded-full border border-border bg-surface px-2 py-1"
              >{reaction.emoji}
              <span class="text-xs text-muted-foreground">{reaction.count}</span></span
            >
          {/each}
        </section>
        <div class="shrink-0">{@render metadata()}</div>
      </div>
    {/if}
    {#if !sendState}
      <div
        class={`${messageActionsClass} ${message.fromMe ? 'right-full translate-x-2 pr-2' : 'left-full -translate-x-2 pl-2'}`}
        data-open={reactionOpen || selectionQuote ? '' : undefined}
      >
        <fieldset
          aria-label="Message actions"
          class="flex w-max shrink-0 flex-row flex-nowrap items-center gap-1 rounded-full border border-border bg-panel p-1 shadow-sm"
        >
          <Button
            text={replyLabel}
            iconComponent={ReplyIcon}
            hideLabel
            hideLabelInstantly
            modifier="circle"
            style="ghost"
            size="sm"
            class={messageActionButtonClass}
            attrs={{
              title: replyLabel,
              onpointerdown: (event: PointerEvent) => {
                if (selectionQuote) event.preventDefault()
              },
            }}
            disabled={disabled || message.deleted || message.content?.viewOnce}
            onClick={() => {
              onReply(selectionQuote ?? undefined)
              if (selectionQuote) window.getSelection()?.removeAllRanges()
            }}
          />
          <EmojiPicker
            label="React"
            iconOnly
            bind:open={reactionOpen}
            disabled={disabled || message.deleted || reactionDisabled}
            onSelect={onReact}
            removable
          />
          {#if canEdit}
            <Button
              text="Edit message"
              iconComponent={EditIcon}
              hideLabel
              hideLabelInstantly
              modifier="circle"
              style="ghost"
              size="sm"
              class={messageActionButtonClass}
              attrs={{ 'aria-label': 'Edit message', title: 'Edit message' }}
              disabled={disabled || editing}
              onClick={async () => {
                editText = copyText
                editError = ''
                editing = true
                await tick()
                editInput?.focus()
              }}
            />
          {/if}
          {#if canForward}
            <Button
              text="Forward…"
              iconComponent={ForwardIcon}
              hideLabel
              hideLabelInstantly
              modifier="circle"
              style="ghost"
              size="sm"
              class={messageActionButtonClass}
              attrs={{ 'aria-label': 'Forward…', title: 'Forward message' }}
              {disabled}
              onClick={() => onForward?.()}
            />
          {/if}
          {#if canCopy}
            <Button
              text="Copy text"
              iconComponent={CopyIcon}
              hideLabel
              hideLabelInstantly
              modifier="circle"
              style="ghost"
              size="sm"
              class={messageActionButtonClass}
              attrs={{ 'aria-label': 'Copy text', title: 'Copy text' }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(copyText)
                } catch {
                  actionError = 'Could not copy text'
                }
              }}
            />
          {/if}
          {#if canDelete}
            <Button
              text="Delete for everyone…"
              iconComponent={DeleteIcon}
              hideLabel
              hideLabelInstantly
              modifier="circle"
              style="ghost"
              color="error"
              size="sm"
              class={messageActionButtonClass}
              attrs={{
                'aria-label': 'Delete for everyone…',
                title: 'Delete for everyone',
              }}
              disabled={disabled || deleting}
              onClick={() => {
                actionError = ''
                confirmingDelete = true
              }}
            />
          {/if}
        </fieldset>
      </div>
    {/if}
  </article>
</div>
