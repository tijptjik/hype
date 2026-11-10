<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import XIcon from 'virtual:icons/lucide/x'
// MESSAGING
import { preserveMessageAnchor } from '#lib/messaging/scroll-anchor.js'
import { sameMessageGroup } from '#lib/messaging/message-group.js'
import { messageMediaKey } from '#lib/messaging/message-key.js'
// COMPONENTS
import * as WhatsApp from './index.js'
import CatalogSendBubble from '#lib/bits/patterns/messaging/CatalogSendBubble.svelte'
import PendingSendBubble from '#lib/bits/patterns/messaging/PendingSendBubble.svelte'
import MessagingContactStatus from '#lib/bits/patterns/messaging/MessagingContactStatus.svelte'
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
// TYPES
import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'
import type { WhatsAppConsoleModel } from '../whatsapp.types.js'

let {
  model,
  recipientLocked = false,
  organisationName,
  displayName,
  username,
  photo,
  hypeLinked,
  isGroup = false,
  onForward,
  composerDisabled = false,
  fill = true,
}: {
  model: WhatsAppConsoleModel
  organisationName?: string
  recipientLocked?: boolean
  displayName?: string
  username?: string | null
  photo?: string | null
  hypeLinked?: boolean
  isGroup?: boolean
  onForward?: (message: WhatsAppMessage) => void
  composerDisabled?: boolean
  fill?: boolean
} = $props()
// One clock updates relative timestamps for the entire conversation.
let now = $state(Date.now())
onMount(() => {
  const timer = setInterval(() => {
    now = Date.now()
  }, 30_000)
  return () => clearInterval(timer)
})
const platformLabel = $derived(model.platformLabel ?? 'WhatsApp')
const isTelegram = $derived(model.platform === 'telegram')
// Pending sends share the same account profile cache as native outgoing messages.
const selfSender = $derived(
  model.status.identity?.id ||
    model.messages.findLast(message => message.fromMe)?.sender,
)
const selfProfile = $derived(
  selfSender
    ? (model.profiles[model.canonicalChat(selfSender)] ?? model.profiles[selfSender])
    : undefined,
)
const timeline = $derived(
  model.messages
    .filter(
      message =>
        model.canonicalChat(message.chat) === model.canonicalChat(model.selectedChat) &&
        !['protocol', 'reaction'].includes(message.content?.kind ?? ''),
    )
    .toSorted(
      (a, b) =>
        a.timestamp - b.timestamp ||
        (isTelegram ? Number(a.id) - Number(b.id) : a.sequence - b.sequence),
    ),
)
let log = $state<HTMLDivElement>()
let scrollAnchor: ReturnType<typeof preserveMessageAnchor> | undefined
$effect(() => {
  if (!log || typeof ResizeObserver === 'undefined') return
  const anchor = preserveMessageAnchor(
    log,
    () => atBottom && !query && !quoteLoading && !quoteScroll,
  )
  scrollAnchor = anchor
  return () => {
    anchor.destroy()
    if (scrollAnchor === anchor) scrollAnchor = undefined
  }
})
let query = $state('')
let searchOpen = $state(false)
let searchInput = $state<HTMLInputElement>()
const searchId = $props.id()
let searching = $state(false)
let matches = $state<WhatsAppMessage[]>([])
let searchError = $state('')
let atBottom = $state(true)
let previousChat = ''
let previousModel: WhatsAppConsoleModel | undefined
let quoteLoading = $state('')
let quoteError = $state('')
let highlightedMessage = $state('')
let quoteNavigation = 0
let quoteScroll = false
let quoteScrollTimer: ReturnType<typeof setTimeout> | undefined
let highlightTimer: ReturnType<typeof setTimeout> | undefined
let previousTop = 0
const visible = $derived(
  searchOpen && query.trim()
    ? matches.toSorted((a, b) => a.timestamp - b.timestamp)
    : timeline,
)
$effect(() => {
  const chat = model.selectedChat
  if (chat !== previousChat || model !== previousModel) {
    previousChat = chat
    previousModel = model
    quoteNavigation++
    quoteLoading = ''
    quoteError = ''
    highlightedMessage = ''
    quoteScroll = false
    clearTimeout(quoteScrollTimer)
    clearTimeout(highlightTimer)
    query = ''
    searchOpen = false
    atBottom = true
    void tick().then(() => {
      if (log) {
        log.scrollTop = log.scrollHeight
        previousTop = log.scrollTop
      }
    })
  }
})
$effect(() => {
  const text = query.trim(),
    chat = model.selectedChat,
    currentModel = model
  matches = []
  searchError = ''
  if (!searchOpen || !text) {
    searching = false
    return
  }
  if (!currentModel.searchMessages) {
    searching = false
    searchError = 'Search is unavailable for this conversation'
    return
  }
  searching = true
  let cancelled = false
  const timer = setTimeout(() => {
    void currentModel.searchMessages!(text)
      .then(rows => {
        if (!cancelled && currentModel === model && chat === model.selectedChat)
          matches = rows
      })
      .catch(() => {
        if (!cancelled) searchError = 'Unable to search saved messages. Try again.'
      })
      .finally(() => {
        if (!cancelled) searching = false
      })
  }, 200)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
})
$effect(() => {
  if (searchOpen) searchInput?.focus()
})
/** Restore the conversation and keyboard focus when search closes.
 * @returns Nothing; closing also cancels obsolete results through the search effect.
 */
function closeSearch(): void {
  query = ''
  searchOpen = false
  void tick().then(() => document.getElementById(`${searchId}-toggle`)?.focus())
}
$effect(() => {
  const count =
    timeline.length + model.outbox.length + (model.catalogSends?.length ?? 0)
  const unread = timeline.filter(
    message => !message.fromMe && !message.readByMe && !message.deleted,
  ).length
  if (!query && !quoteLoading && atBottom) {
    void tick().then(() => {
      if (log && atBottom) {
        log.scrollTop = log.scrollHeight
        previousTop = log.scrollTop
        acknowledge()
      }
    })
  }
})
/** Open a quote inside this timeline without moving the page, clearing the draft or marking it read.
 * @param source Message whose native quote the operator clicked.
 * @returns Resolves after loading and highlighting the original, or showing an inline failure.
 */
async function openQuote(source: WhatsAppMessage): Promise<void> {
  const revision = ++quoteNavigation,
    currentModel = model,
    chat = model.selectedChat
  quoteLoading = messageMediaKey(source)
  quoteError = ''
  highlightedMessage = ''
  atBottom = false
  query = ''
  searchOpen = false
  clearTimeout(quoteScrollTimer)
  clearTimeout(highlightTimer)
  quoteScrollTimer = undefined
  quoteScroll = true
  try {
    const original = await currentModel.resolveQuote?.(source)
    if (
      revision !== quoteNavigation ||
      model !== currentModel ||
      model.selectedChat !== chat ||
      query.trim()
    )
      return
    if (!original)
      throw new Error(
        isTelegram
          ? 'The quoted message is no longer available in Telegram.'
          : 'The original is not available in HYPE’s synced WhatsApp history.',
      )
    const key = messageMediaKey(original)
    highlightedMessage = key
    await tick()
    if (revision !== quoteNavigation || !log) return
    const node = Array.from(
      log.querySelectorAll<HTMLElement>('[data-message-key]'),
    ).find(element => element.dataset.messageKey === key)
    if (!node) throw new Error('The quoted message could not be shown.')
    const top =
      log.scrollTop +
      node.getBoundingClientRect().top -
      log.getBoundingClientRect().top -
      (log.clientHeight - Math.min(node.offsetHeight, log.clientHeight)) / 2
    node.focus({ preventScroll: true })
    log.scrollTo({
      top: Math.max(0, top),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
    quoteScrollTimer = setTimeout(() => {
      quoteScroll = false
      if (log) previousTop = log.scrollTop
    }, 1000)
    highlightTimer = setTimeout(() => {
      highlightedMessage = ''
    }, 2200)
  } catch (cause) {
    if (revision === quoteNavigation) {
      quoteError =
        cause instanceof Error ? cause.message : 'Unable to open the quoted message.'
      highlightedMessage = ''
      quoteScroll = false
    }
  } finally {
    if (revision === quoteNavigation) {
      quoteLoading = ''
      if (!quoteScrollTimer) quoteScroll = false
    }
  }
}
onMount(() => () => {
  quoteNavigation++
  clearTimeout(quoteScrollTimer)
  clearTimeout(highlightTimer)
})

/** Mark read only while the user can see the current conversation's newest messages. */
function acknowledge(): void {
  if (
    atBottom &&
    !query &&
    !quoteLoading &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  )
    void model.markRead?.()
}
/** Load Telegram history only in response to upward scrolling; preserve the visible anchor. */
async function scrollHistory(force = false): Promise<void> {
  if (!log) return
  const movingUp = log.scrollTop < previousTop
  previousTop = log.scrollTop
  if (quoteScroll) return
  atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 40
  acknowledge()
  if (
    query ||
    (!movingUp && !force) ||
    log.scrollTop > 80 ||
    !model.historyAvailable ||
    model.historyLoading ||
    model.historyComplete
  )
    return
  const chat = model.selectedChat
  scrollAnchor?.capture()
  await model.loadOlder?.()
  await tick()
  if (log && chat === model.selectedChat) {
    scrollAnchor?.restore()
    previousTop = log.scrollTop
  }
}
onMount(() => {
  window.addEventListener('focus', acknowledge)
  document.addEventListener('visibilitychange', acknowledge)
  return () => {
    window.removeEventListener('focus', acknowledge)
    document.removeEventListener('visibilitychange', acknowledge)
  }
})
const catalogOutgoing = $derived(
  (model.catalogSends ?? []).filter(
    row => row.chat === model.canonicalChat(model.selectedChat),
  ),
)
const outgoing = $derived(
  model.outbox
    .filter(
      row =>
        !catalogOutgoing.some(item => item.id === row.request.requestId) &&
        model.canonicalChat(row.request.to) ===
          model.canonicalChat(model.selectedChat) &&
        row.request.reaction === undefined &&
        !row.request.editTo &&
        !visible.some(message => message.fromMe && message.id === row.messageId),
    )
    .toReversed(),
)
const chatName = $derived(
  displayName ||
    model.conversations.find(chat => chat.id === model.selectedChat)?.name ||
    model.displayName(model.selectedChat),
)
const chatUsername = $derived(
  username !== undefined ? username : model.profiles[model.selectedChat]?.username,
)
const chatPhoto = $derived(
  photo ||
    model.profiles[model.canonicalChat(model.selectedChat)]?.photo ||
    model.profiles[model.selectedChat]?.photo,
)

/** Fold each sender's latest reaction, including removal, for one message.
 * @param target Stored message whose reactions should be displayed.
 * @returns Emoji counts without rendering protocol-only timeline rows.
 */
function reactions(target: WhatsAppMessage): { emoji: string; count: number }[] {
  if (target.reactions) return target.reactions
  const bySender = new Map<string, string>()
  for (const message of model.messages) {
    const reaction = message.content?.reaction
    if (message.chat !== target.chat || reaction?.targetId !== target.id) continue
    if (reaction.targetSender) {
      if (reaction.targetSender !== target.sender) continue
    } else if (
      message.fromMe
        ? reaction.targetFromMe !== target.fromMe
        : reaction.targetFromMe !== (target.sender === message.sender)
    )
      continue
    bySender.set(message.sender, reaction.emoji)
  }
  const counts = new Map<string, number>()
  for (const emoji of bySender.values())
    if (emoji) counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
  return [...counts].map(([emoji, count]) => ({ emoji, count }))
}
</script>

<section
  class="flex min-h-0 min-w-0 flex-col overflow-hidden {fill ? 'h-full flex-1' : ''}"
  aria-label="Conversation"
>
  <WhatsApp.CallControls {model} compact>
    {#snippet header(actions)}
      <header
        class="border-border bg-panel flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3"
      >
        <Avatar name={chatName} src={chatPhoto} />
        <div class="min-w-0 flex-1 basis-24">
          <h3 class="font-semibold [overflow-wrap:anywhere] break-words">{chatName}</h3>
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {#if chatUsername}
              <p class="text-muted-foreground text-xs break-words">
                @{chatUsername.replace(/^@/, '')}
              </p>
            {/if}
            {#if hypeLinked !== undefined && isGroup}
              <MessagingContactStatus
                linked={hypeLinked}
                group={isGroup}
                platform={isTelegram ? 'telegram' : 'whatsapp'}
              />
            {/if}
          </div>
        </div>
        <div class="ml-auto flex shrink-0 items-center gap-1">
          {#if hypeLinked === false && !isGroup}
            <MessagingContactStatus
              linked={false}
              platform={isTelegram ? 'telegram' : 'whatsapp'}
            />
          {/if}
          {#if recipientLocked}
            <span
              class="border-border text-muted-foreground mr-1 shrink-0 rounded-full border px-2 py-1 text-xs"
              >{platformLabel}</span
            >
          {/if}
          {@render actions()}
          <Button
            text="Search messages"
            iconComponent={SearchIcon}
            hideLabel
            hideLabelInstantly
            modifier="circle"
            style={searchOpen ? 'soft' : 'ghost'}
            size="sm"
            attrs={{
              id: `${searchId}-toggle`,
              title: 'Search messages',
              'aria-expanded': searchOpen,
              'aria-controls': searchId,
            }}
            disabled={!model.selectedChat || !model.searchMessages}
            onClick={() => {
              if (searchOpen) closeSearch()
              else searchOpen = true
            }}
          />
        </div>
      </header>
      {#if searchOpen}
        <div id={searchId} class="border-border shrink-0 space-y-1 border-b px-4 py-2">
          <div class="flex items-center gap-2">
            <input
              bind:this={searchInput}
              aria-label="Search conversation"
              bind:value={query}
              maxlength="200"
              placeholder="Search saved messages…"
              class="border-border bg-panel min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
              onkeydown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeSearch()
                }
              }}
            ><Button
              text="Close message search"
              iconComponent={XIcon}
              hideLabel
              hideLabelInstantly
              modifier="circle"
              style="ghost"
              size="sm"
              attrs={{ title: 'Close message search' }}
              onClick={closeSearch}
            />
          </div>
          {#if searching}
            <p role="status" class="text-muted-foreground text-xs">
              Searching messages…
            </p>
          {:else if query.trim() && !searchError}
            <p role="status" class="text-muted-foreground text-xs">
              {matches.length} {matches.length === 1 ? 'match' : 'matches'}
            </p>
          {/if}
          {#if searchError}
            <p role="alert" class="text-muted-foreground text-sm">{searchError}</p>
          {/if}
        </div>
      {/if}
    {/snippet}
  </WhatsApp.CallControls>
  {#if quoteLoading}
    <p
      role="status"
      class="border-border text-muted-foreground shrink-0 border-b px-4 py-2 text-xs"
    >
      Finding quoted message…
    </p>
  {/if}
  {#if quoteError}
    <p role="alert" class="border-border shrink-0 border-b px-4 py-2 text-sm">
      {quoteError}
    </p>
  {/if}
  <div
    bind:this={log}
    onpointerdown={() => {
      quoteScroll = false
    }}
    onscroll={() => void scrollHistory()}
    onwheel={event => {
      quoteScroll = false
      if (event.deltaY < 0 && log && log.scrollTop === 0) void scrollHistory(true)
    }}
    class="flex flex-col gap-3 [overflow-anchor:none] overflow-y-auto overscroll-contain bg-surface bg-[image:linear-gradient(color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask,94%),transparent),color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask,94%),transparent)),var(--chat-background-image,none)] bg-[length:auto,var(--chat-background-size,320px)] bg-repeat p-3 sm:p-4 {fill
      ? 'min-h-0 flex-1'
      : 'min-h-48 max-h-[60vh]'}"
    role="log"
    aria-label="Messages"
    aria-live="polite"
  >
    {#if recipientLocked && model.error}
      <p
        role="alert"
        class="border-border bg-surface rounded-lg border p-3 text-sm break-words"
      >
        {model.error}
      </p>
    {/if}
    {#if model.historyAvailable && model.selectedChat && !query}
      <div class="flex flex-col items-center gap-2">
        {#if model.historyComplete}
          <p class="text-muted-foreground text-sm">Beginning of available history</p>
        {:else}
          <p role="status" class="text-muted-foreground text-xs">
            {#if model.historyLoading}
              <LoadingSkeleton
                label={'Loading older messages…'}
                text="Scroll up for older messages"
              />
            {:else}
              {'Scroll up for older messages'}
            {/if}
          </p>
        {/if}
        {#if model.historyError}
          <p role="alert" class="text-muted-foreground text-sm">{model.historyError}</p>
        {/if}
      </div>
    {/if}
    {#each visible as message, messageIndex (`${message.chat}:${message.sender}:${message.id}`)}
      <WhatsApp.MessageBubble
        {organisationName}
        {platformLabel}
        {message}
        showHeader={Boolean(query) ||
          !sameMessageGroup(visible[messageIndex - 1], message)}
        quoteOriginal={model.quoteOriginal?.(message)}
        onLoadQuote={model.loadQuotePreview
          ? () => model.loadQuotePreview!(message)
          : undefined}
        {now}
        highlighted={highlightedMessage === messageMediaKey(message)}
        quoteLoading={quoteLoading === messageMediaKey(message)}
        onOpenQuote={model.canOpenQuote?.(message)
          ? () => openQuote(message)
          : undefined}
        displayName={message.fromMe
          ? selfProfile?.name || model.status.identity?.name || 'Shared account'
          : model.displayName(message.sender, message.senderName)}
        username={(
          (message.fromMe ? selfProfile : undefined) ??
          model.profiles[model.canonicalChat(message.sender)]
        )?.username}
        photo={(
          (message.fromMe ? selfProfile : undefined) ??
          model.profiles[model.canonicalChat(message.sender)]
        )?.photo}
        quoteName={model.quoteOriginal?.(message)?.fromMe
          ? organisationName || 'Organisation'
          : model.quoteOriginal?.(message)
            ? model.displayName(
                model.quoteOriginal!(message)!.sender,
                model.quoteOriginal!(message)!.senderName,
              )
            : message.content?.quoted?.senderName ||
              (message.content?.quoted?.sender
                ? model.displayName(message.content.quoted.sender)
                : undefined)}
        mediaUrl={model.mediaUrls[messageMediaKey(message)]}
        mediaError={model.mediaErrors[messageMediaKey(message)]}
        onLoadMedia={() => model.loadMedia(message)}
        reactions={reactions(message)}
        disabled={model.busy ||
          model.recording ||
          !model.status.connected ||
          Boolean(model.requestId)}
        reactionDisabled={Boolean(model.text || model.attachment)}
        onEdit={model.canEdit?.(message)
          ? text => model.edit(message, text)
          : undefined}
        onDelete={message.fromMe &&
        model.deleteMessage &&
        (isTelegram || Date.now() - message.timestamp < 48 * 60 * 60 * 1000)
          ? () => model.deleteMessage!(message)
          : undefined}
        onForward={onForward ? () => onForward?.(message) : undefined}
        onReply={selection => model.quote(message, selection)}
        onReact={emoji => void model.react(message, emoji)}
      />
    {/each}
    {#each query ? [] : outgoing as row (row.request.requestId)}
      <PendingSendBubble
        {organisationName}
        {row}
        {now}
        {platformLabel}
        profile={selfProfile}
        preview={model.sendPreviews?.[row.request.requestId]}
        mediaUrl={model.sendPreviews?.[row.request.requestId]
          ? model.mediaUrls[messageMediaKey(model.sendPreviews[row.request.requestId])]
          : undefined}
        error={model.sendErrors?.[row.request.requestId]}
        canReset={!model.busy && model.requestId === row.request.requestId}
        onReset={model.newMessage}
      />
    {/each}
    <!-- Reactions have no outgoing bubble; keep their recovery in history, outside the composer. -->
    {#if model.pendingRequest?.reaction !== undefined && !model.busy}
      <div
        class="text-muted-foreground flex flex-col items-end gap-1 text-right text-xs"
      >
        {#if model.attempt?.state === 'uncertain'}
          <p role="status">
            Reaction delivery is uncertain. Check the conversation before trying again.
          </p>
        {/if}
        <Button
          text="Dismiss reaction attempt"
          size="sm"
          style="ghost"
          onClick={model.newMessage}
        />
      </div>
    {/if}
    {#each query ? [] : catalogOutgoing as row (row.id)}
      <CatalogSendBubble
        {organisationName}
        {row}
        {now}
        {platformLabel}
        profile={selfProfile}
        retry={() => model.retryCatalogSend?.(row.id)}
      />
    {/each}
    {#if query.trim()}
      {#if !searching && !searchError && !visible.length}
        <p class="text-muted-foreground py-10 text-center text-sm">
          No saved messages match “{query.trim()}”.
        </p>
      {/if}
    {:else if !visible.length && !outgoing.length && !catalogOutgoing.length}
      <p class="text-muted-foreground py-10 text-center text-sm">
        {recipientLocked
          ? 'No messages yet. Write a message below to start this conversation.'
          : 'Select a conversation or enter a recipient below to start one.'}
      </p>
    {/if}
  </div>
  <div class="shrink-0">
    <WhatsApp.MessageComposer
      {model}
      disabled={composerDisabled}
      {recipientLocked}
      compact={recipientLocked}
    />
  </div>
</section>
