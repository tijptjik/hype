import { findQuotedMessage, validTextQuote } from '#lib/messaging/quoted-message.js'
import { messageMediaKey } from '#lib/messaging/message-key.js'
// SVELTE
import { onMount } from 'svelte'
// ADAPTERS
import { createMediaPickerModel } from '#lib/adapters/messaging/useMediaPickerModel.svelte.js'
// MEDIA
import { webmOpusToOgg } from './voiceRecording.js'
import { TelegramBrowserCall } from '#lib/adapters/telegram/call.js'
import { BrowserVoiceCall, type VoiceController, type VoiceStart } from './voiceCall.js'
import { BrowserVoiceVideo } from './voiceVideo.js'
import { createMicrophoneModel } from './useMicrophoneModel.svelte.js'
import { microphoneConstraints, microphoneErrorMessage } from './voiceAudio.js'
// TYPES
import type { BridgeDialogCursor, TextQuote } from '#lib/messaging/types.js'
import type { CatalogSend, MediaCatalogItem } from '#lib/messaging/media-catalog.js'
import type { ChatTransport } from '#lib/messaging/chat-transport.js'
import type { MessagingPlatform } from '#lib/messaging/types.js'
import type { WhatsAppAttachment, WhatsAppProfile, WhatsAppMessage, WhatsAppRequest, WhatsAppSend, WhatsAppStatus, WhatsAppCalls } from '#lib/api/services/whatsover.types.js'
import type { Conversation, WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 0. ADDRESS DISPLAY
// - chatAddress
// 1. WHATSAPP VIEW MODEL
// - createWhatsAppModel
//   Identity: canonicalChat, displayName, resolveProfiles
//   Session: refresh, connection, submit, send, newMessage, selectChat, quote, react
//   Media: upload, removeAttachment, releaseMicrophone, stopRecording, record, loadMedia
//   Calls: beginVoice, startCall, answerCall, declineCall, muteCall, endCall
// ---

/** Convert a phone draft to the same chat address used by the bridge.
 * @param value Phone number or existing JID.
 * @returns A display-routing address; the bridge still validates before sending.
 */
function chatAddress(value: string): string {
  const compact = value.replace(/[ ()-]/g, '')
  return /^\+[1-9]\d{6,14}$/.test(compact) ? `${compact.slice(1)}@s.whatsapp.net` : value
}

/** Resolve a device-qualified sender to its contact identity for display only.
 * @param jid WhatsApp sender, contact, or group address.
 * @returns Contact address; stored message targets keep their original sender.
 */
function profileAddress(jid: string): string {
  return jid.replace(/^(\d+):\d+@(s\.whatsapp\.net|lid)$/, '$1@$2')
}

/** Own an organisation account's shared conversation view and immutable send attempts.
 * @param options Explicit provider and organisation-bound transport; no personal-account fallback.
 * @returns Controlled Bits presentation state and explicit user actions.
 * @remarks Polls are discarded after lifecycle mutations or page disposal.
 */
export function createWhatsAppModel(options: { cacheScope?: string; viewId?: string; platform: MessagingPlatform; configurationHref?: string; recipientLocked?: boolean; transport: ChatTransport }): WhatsAppConsoleModel {
  const platform = options.platform
  const platformLabel = platform === 'telegram' ? 'Telegram' : 'WhatsApp'
  const api = options.transport
  let tabId = ''
  let watching = false
  const microphone = createMicrophoneModel()
  let status = $state<WhatsAppStatus>({ connected: false, loggedOut: false, qr: null, qrExpiresAt: null })
  let calls = $state<WhatsAppCalls>({ incoming: [], current: null })
  let voiceAvailable = $state(false)
  let videoCodecAvailable = $state(false)
  const videoAvailable = $derived(videoCodecAvailable && calls.videoSupported === true)
  let localVideo = $state<MediaStream | null>(null)
  let remoteVideo = $state<MediaStream | null>(null)
  let cameraOff = $state(false)
  let ownsCall = $state(false)
  let callMuted = $state(false)
  let callError = $state('')
  let voice: VoiceController | null = null
  let voiceRevision = 0
  const callBusy = $derived(ownsCall || Boolean(calls.current && calls.current.phase !== 'ended'))
  let messages = $state<WhatsAppMessage[]>([])
  let outbox = $state<WhatsAppSend[]>([])
  let localOutbox = $state<Record<string, WhatsAppSend>>({})
  let sendPreviews = $state<Record<string, WhatsAppMessage>>({})
  let sendErrors = $state<Record<string, string>>({})
  const displayedOutbox = $derived([...Object.values(localOutbox).toReversed(), ...outbox.filter(row => !localOutbox[row.request.requestId])])
  let pollError = $state('')
  let actionError = $state('')
  let busy = $state(false)
  let to = $state('')
  let text = $state('')
  let selectedChat = $state('')
  let conversationsLoading = $state(false)
  let conversationsError = $state('')
  let conversationCursor = $state<BridgeDialogCursor | null | undefined>(undefined)
  let historyLoading = $state(false)
  let historyCursors = $state<Record<string, string | null>>({})
  let historyErrors = $state<Record<string, string>>({})
  let profiles = $state<Record<string, WhatsAppProfile>>({})
  const profileAttempts = new Map<string, number>()
  let resolvingProfiles = false
  let reply = $state<WhatsAppMessage | null>(null)
  let replySelection = $state<TextQuote | null>(null)
  let pending = $state<WhatsAppRequest | null>(null)
  let attempt = $state<WhatsAppSend | null>(null)
  let attachment = $state<(WhatsAppAttachment & { name: string }) | null>(null)
  let queuedAttachments = $state<(WhatsAppAttachment & {name:string})[]>([])
  let sendingBatch = $state(false)
  let reading = false
  const deleteAttempts = new Map<string,string>()
  const drafts = new Map<string, { text: string; reply: WhatsAppMessage | null; replySelection: TextQuote | null; pending: WhatsAppRequest | null; attempt: WhatsAppSend | null; attachment: (WhatsAppAttachment & { name: string }) | null; queuedAttachments: (WhatsAppAttachment & {name:string})[]; error: string }>()
  let recording = $state(false)
  let recordingSeconds = $state(0)
  let mediaUrls = $state<Record<string, string>>({})
  let mediaErrors = $state<Record<string, string>>({})
  const loadingMedia = new Set<string>()
  let recorder: MediaRecorder | null = null
  let capture: MediaStream | null = null
  let recordingTimer: ReturnType<typeof setInterval> | undefined
  let discardRecording = false
  let cursor = 0
  let generation = 0
  let active = false
  let refreshing = false
  let catalogSends = $state<CatalogSend[]>([])
  const catalogRetries = new Map<string, () => Promise<void>>()
  const catalogUrls = new Set<string>()
  const mediaPicker = api.searchMedia && api.catalogMedia && api.stageMedia ? createMediaPickerModel({
    transport: api, cacheScope: options.cacheScope,
    available: () => active && status.connected && !pending && !busy && !recording && !sendingBatch && Boolean(to || selectedChat),
    send: sendCatalog,
  }) : undefined

  /** Insert the chosen media immediately, preserving the independent text/file draft.
   * @param item Selected catalogue metadata.
   * @param preview Cached preview borrowed until a message-owned URL is ready.
   * @param resolve Refresh an expired provider reference before staging.
   * @returns Transition cleanup; network completion updates only this message's receipt.
   */
  function sendCatalog(item: MediaCatalogItem, preview: string | undefined, resolve: (refresh?: boolean) => Promise<MediaCatalogItem>): () => void {
    const id = crypto.randomUUID(), chat = canonicalChat(to || selectedChat)
    const quote = reply ? { id: reply.id, sender: reply.sender, ...(replySelection ? { quote: { ...replySelection } } : {}) } : undefined
    catalogSends.push({ id, chat, item, url: preview, timestamp: Date.now(), state: 'pending', messageId: '', error: '', transitioning: true })
    const row = catalogSends.find(value => value.id === id)!
    // The message owns a separate URL so cache eviction or picker disposal cannot blank it.
    if (preview) void fetch(preview).then(response => response.blob()).then(blob => {
      if (!active) return
      const url = URL.createObjectURL(blob); catalogUrls.add(url); row.url = url
      const native = messages.find(message => message.id === row.messageId && canonicalChat(message.chat) === row.chat && message.fromMe)
      if (native) mediaUrls[messageMediaKey(native)] = url
    }).catch(() => {})
    const run = async (): Promise<void> => {
      if (row.state !== 'failed' && row.state !== 'pending') { await refresh(); return }
      row.state = 'pending'; row.error = ''
      let request: WhatsAppRequest
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You are offline. Reconnect, then retry this message.')
        const current = await resolve()
        let staged: WhatsAppAttachment
        try { staged = await api.stageMedia!(current.id) }
        catch (cause) {
          // A bounded bridge catalogue can evict a still-cached preview; renew only before any send.
          if (!(cause instanceof Error) || !/expired|result.*unavailable/i.test(cause.message)) throw cause
          staged = await api.stageMedia!((await resolve(true)).id)
        }
        if (!active) return
        request = { requestId: id, to: chat, text: '', attachmentId: staged.id, ...(quote ? { replyTo: quote } : {}) }
      } catch (cause) { row.state = 'failed'; row.error = cause instanceof Error ? cause.message : 'Could not prepare this media'; return }
      try {
        const result = await api.send(request)
        row.state = result.state; row.messageId = result.messageId
        if (result.state === 'uncertain') row.error = 'Delivery is uncertain. Check the conversation before sending again.'
      } catch { row.state = 'uncertain'; row.error = 'No delivery result received. Check status before sending again.' }
      await refresh()
    }
    catalogRetries.set(id, run)
    void run()
    return () => { row.transitioning = false }
  }

  /** Use only SDK-verified aliases to join PN and LID conversation history.
   * @param jid Existing conversation identity.
   * @returns Phone JID when disclosed, otherwise the original identity.
   */
  function canonicalChat(jid: string): string {
    if (platform === 'telegram') return profiles[jid]?.jid ?? jid
    const address = profileAddress(chatAddress(jid))
    const profile = profiles[address]
    return profile?.aliases.find(alias => alias.endsWith('@s.whatsapp.net')) || address
  }

  /** Prefer saved/display names, then a real handle, then a readable address.
   * @param jid Contact or group identity.
   * @param fallback Push name from a received message.
   * @returns A human display label without presenting a LID as a phone number.
   */
  function displayName(jid: string, fallback?: string | null): string {
    const profile = profiles[profileAddress(jid)]
    if (profile?.name) return profile.name
    if (fallback) return fallback
    if (profile?.username) return `@${profile.username.replace(/^@/, '')}`
    if (profile?.phone) return profile.phone
    if (jid.endsWith('@s.whatsapp.net')) return `+${jid.split('@')[0]}`
    if (jid.endsWith('@g.us')) return `Group · …${jid.split('@')[0].slice(-4)}`
    if (jid.endsWith('@lid')) return `Contact · …${jid.split('@')[0].slice(-4)}`
    return jid || 'New conversation'
  }

  const conversations = $derived.by((): Conversation[] => {
    const chats = new Map<string, Conversation>()
    const latestIds = new Map<string, string>()
    for (const message of messages) {
      if (message.content?.kind === 'protocol' || message.content?.kind === 'reaction') continue
      const id = canonicalChat(message.chat)
      const previous = chats.get(id)
      const older = previous && (previous.timestamp > message.timestamp || (platform === 'telegram' && previous.timestamp === message.timestamp && Number(latestIds.get(id)) > Number(message.id)))
      if (!older) latestIds.set(id, message.id)
      const named = canonicalChat(message.chat) === canonicalChat(message.sender) ? message.senderName : null
      const profile = profiles[message.chat] || profiles[id]
      chats.set(id, {
        id, name: displayName(message.chat, named || (previous?.name !== displayName(id) ? previous?.name : null)),
        username: profile?.username || null, photo: profile?.photo || null,
        preview: older ? previous.preview : message.content?.text || message.text || (message.content?.kind === 'audio' ? 'Voice message' : message.content?.kind) || 'Message',
        timestamp: Math.max(previous?.timestamp ?? 0, message.timestamp),
      })
    }
    for (const row of displayedOutbox) {
      const id = canonicalChat(row.request.to)
      if (!chats.has(id)) chats.set(id, { id, name: displayName(id), username: profiles[id]?.username || null, photo: profiles[id]?.photo || null, preview: row.request.text || (row.request.attachmentId ? 'Attachment' : 'Reaction'), timestamp: 0 })
    }
    return [...chats.values()].sort((a, b) => b.timestamp - a.timestamp)
  })

  /** Resolve visible identities gradually, without holding up message polling.
   * @returns Resolves after a small batch; failures retain readable fallbacks.
   */
  async function resolveProfiles(): Promise<void> {
    if (resolvingProfiles || !status.connected || !active) return
    resolvingProfiles = true
    const candidates = [...new Set([status.identity?.id || '', selectedChat, ...calls.incoming.map(call => call.peer), calls.current?.peer || '', ...messages.filter(message => canonicalChat(message.chat) === canonicalChat(selectedChat)).slice(-20).map(message => message.sender), ...conversations.slice(0, 20).map(chat => chat.id)].map(profileAddress))]
      .filter(jid => jid && (platform === 'telegram' ? /^-?[1-9]\d*$/.test(jid) : /@(s\.whatsapp\.net|lid|g\.us)$/.test(jid)) && Date.now() - (profileAttempts.get(jid) ?? 0) > 10 * 60_000).slice(0, 3)
    try {
      for (const jid of candidates) {
        if (!active || !status.connected) break
        profileAttempts.set(jid, Date.now())
        try {
          const profile = await api.profile(jid)
          if (!active) return
          for (const alias of profile.aliases) { profiles[alias] = profile; profileAttempts.set(alias, Date.now()) }
          profiles[jid] = profile
          selectedChat = canonicalChat(selectedChat)
        } catch { /* A missing/private profile must not interrupt the conversation. */ }
      }
    } finally { resolvingProfiles = false }
  }

  /** Refresh the durable cursor, including rows hidden from the conversation.
   * @returns Resolves after one bounded history page; subsequent polls continue it.
   */
  async function refresh(): Promise<void> {
    if (refreshing || busy) return
    const revision = generation
    const callRevision = voiceRevision
    refreshing = true
    try {
      const snapshot = await api.snapshot(cursor)
      if (!active || revision !== generation) return
      status = snapshot.status
      voiceAvailable = snapshot.voiceAvailable === true
      // Socket events outrank a poll that began before that call-state change.
      if (callRevision === voiceRevision && !ownsCall) calls = snapshot.calls || { incoming: [], current: null }
      outbox = snapshot.outbox
      for (const message of snapshot.messages) {
        if (message.sequence > cursor) {
          // Replays contain edits/deletions too; replace the native message, preserving its newest projection.
          const previous = messages.findIndex(row => row.chat === message.chat && row.id === message.id && row.sender === message.sender)
          if (previous < 0) messages.push(message)
          else if (messages[previous].sequence < message.sequence) messages[previous] = message
          cursor = message.sequence
        }
      }
      // Keep local sends visible across an empty or lagging poll until the exact native echo arrives.
      for (const [id, row] of Object.entries(localOutbox)) {
        const receipt = outbox.find(value => value.request.requestId === id)
        if (receipt && row.state !== 'submitted' && (receipt.state !== 'pending' || row.state === 'pending')) {
          localOutbox[id] = receipt
          if (receipt.state === 'submitted') delete sendErrors[id]
        }
        const result = localOutbox[id]
        if (messages.some(message => message.fromMe && message.id === result.messageId && canonicalChat(message.chat) === canonicalChat(result.request.to))) {
          delete sendErrors[id]
          // A lagging pending receipt must not recreate a second bubble after the native echo.
          if (receipt?.state === 'submitted' && receipt.messageId === result.messageId) {
            delete localOutbox[id]; delete sendPreviews[id]
          }
        }
      }
      // Reconcile by the immutable request and native message ID, never by media/text resemblance.
      for (const row of catalogSends) {
        const receipt = snapshot.outbox.find(value => value.request.requestId === row.id)
        if (receipt && (receipt.state !== 'pending' || row.state === 'pending')) { row.state = receipt.state; row.messageId = receipt.messageId || row.messageId }
        const native = messages.find(message => message.id === row.messageId && canonicalChat(message.chat) === row.chat && message.fromMe)
        if (native) {
          if (row.url) mediaUrls[messageMediaKey(native)] = row.url
          catalogRetries.delete(row.id)
        }
      }
      catalogSends = catalogSends.filter(row => !messages.some(message => message.id === row.messageId && canonicalChat(message.chat) === row.chat && message.fromMe))
      if (snapshot.replayCursor !== undefined) cursor = Math.max(cursor, snapshot.replayCursor)
      if (!options.recipientLocked && !selectedChat && !to && conversations.length) selectedChat = conversations[0].id
      if (pending) {
        const receipt = displayedOutbox.find(row => row.request.requestId === pending?.requestId)
        // Reactions have no optimistic bubble, but lagging polls must not downgrade their acknowledgment either.
        if (receipt && attempt?.state !== 'submitted' && (receipt.state !== 'pending' || attempt?.state !== 'uncertain')) attempt = receipt
        // A delayed acknowledgment also unlocks the composer; retain any remaining attachment draft.
        if (attempt?.state === 'submitted' && !sendingBatch) releaseSubmittedDraft()
      }
      pollError = ''
      void resolveProfiles()
    } catch (error) {
      if (active && revision === generation) pollError = error instanceof Error ? error.message : `Could not reach ${platformLabel}`
    } finally { refreshing = false }
  }

  /** Discover older conversations without moving the live-event cursor or active chat.
   * @returns Resolves after at most two pages, skipping the already imported first page when possible.
   */
  async function loadConversations(): Promise<void> {
    if (!api.dialogs || conversationsLoading || conversationCursor === null || !status.connected) return
    const revision = generation
    conversationsLoading = true
    conversationsError = ''
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (conversationCursor === null) break
        const known = new Set(messages.map(message => message.chat))
        const page = await api.dialogs(conversationCursor)
        if (!active || revision !== generation) return
        for (const message of page.messages) {
          const previous = messages.findIndex(row => row.chat === message.chat && row.id === message.id && row.sender === message.sender)
          if (previous < 0) messages.push(message)
          else if (messages[previous].sequence < message.sequence) messages[previous] = message
        }
        conversationCursor = page.next
        if (!page.next || page.messages.some(message => !known.has(message.chat))) break
      }
      void resolveProfiles()
    } catch (error) {
      if (active && revision === generation) conversationsError = error instanceof Error ? error.message : 'Could not load conversations'
    } finally { conversationsLoading = false }
  }

  /** Load one older page for the selected chat, retaining the independent live replay cursor.
   * @returns Resolves after merging newer projections; a failed page can be retried with the same cursor.
   */
  async function loadOlder(): Promise<void> {
    const chat = selectedChat
    if (!api.history || !chat || historyLoading || historyCursors[chat] === null || !status.connected) return
    const revision = generation
    historyLoading = true
    historyErrors[chat] = ''
    try {
      const page = await api.history(chat, historyCursors[chat])
      if (!active || revision !== generation) return
      for (const message of page.messages) {
        const previous = messages.findIndex(row => row.chat === message.chat && row.id === message.id && row.sender === message.sender)
        if (previous < 0) messages.push(message)
        else if (messages[previous].sequence < message.sequence) messages[previous] = message
      }
      historyCursors[chat] = page.nextBefore
    } catch (error) {
      if (active && revision === generation) historyErrors[chat] = error instanceof Error ? error.message : 'Could not load older messages'
    } finally { historyLoading = false }
  }

  let quoteOriginals = $state<Record<string, WhatsAppMessage | null>>({})
  const quoteRequests = new Map<string, Promise<WhatsAppMessage | null>>()
  let quoteQueue: Promise<unknown> = Promise.resolve()
  /** Scope preview caching to this account, conversation and native target. */
  function quoteKey(source: WhatsAppMessage): string { return JSON.stringify([canonicalChat(source.chat), source.content?.quoted?.chat, source.content?.quoted?.id, source.content?.quoted?.sender]) }
  /** Prefer live projections so later edits and deletion tombstones replace cached previews. */
  function quoteOriginal(source: WhatsAppMessage): WhatsAppMessage | null {
    if (source.content?.quoted?.chat && canonicalChat(source.content.quoted.chat) !== canonicalChat(source.chat)) return null
    return findQuotedMessage(source, messages, canonicalChat) ?? quoteOriginals[quoteKey(source)] ?? null
  }
  /** Resolve visible previews serially without touching timeline, draft, replay or read state. */
  async function loadQuotePreview(source: WhatsAppMessage): Promise<WhatsAppMessage | null> {
    const loaded = quoteOriginal(source), key = quoteKey(source), chat = canonicalChat(source.chat)
    if (loaded || !api.quotedMessage || !canOpenQuote(source)) return loaded
    if (key in quoteOriginals) return null
    const pending = quoteRequests.get(key)
    if (pending) return pending
    const lookup = quoteQueue.then(async () => {
      try {
        if (!active || canonicalChat(selectedChat) !== chat) return null
        const original = await api.quotedMessage!(source.chat, { id: source.id, sender: source.sender })
        if (!active || canonicalChat(selectedChat) !== chat) return null
        const matched = original ? findQuotedMessage(source, [original], canonicalChat) : null
        quoteOriginals[key] = matched
        return matched
      } finally { quoteRequests.delete(key) }
    })
    quoteRequests.set(key, lookup)
    quoteQueue = lookup.catch(() => {})
    return lookup
  }

  /** Offer quote navigation when the original is loaded or the account can look it up. */
  function canOpenQuote(message: WhatsAppMessage): boolean {
    return Boolean(message.content?.quoted?.id && (!message.content.quoted.chat || canonicalChat(message.content.quoted.chat) === canonicalChat(message.chat)) && !message.deleted && !message.content.viewOnce
      && (findQuotedMessage(message, messages, canonicalChat) || api.quotedMessage))
  }

  /** Resolve one original without changing drafts, selection, read state or history/replay cursors.
   * @param source The selected conversation's message containing the quote.
   * @returns The newest available projection of its original, or null when unavailable.
   */
  async function resolveQuote(source: WhatsAppMessage): Promise<WhatsAppMessage | null> {
    const chat = canonicalChat(selectedChat), revision = generation
    if (!canOpenQuote(source) || canonicalChat(source.chat) !== chat) return null
    const loaded = findQuotedMessage(source, messages, canonicalChat)
    if (loaded) return loaded
    const original = quoteOriginal(source) ?? await loadQuotePreview(source)
    if (!active || revision !== generation || canonicalChat(selectedChat) !== chat || !original) return null
    if (!findQuotedMessage(source, [original], canonicalChat)) return null
    const previous = messages.findIndex(message => message.chat === original.chat && message.id === original.id && message.sender === original.sender)
    if (previous < 0) messages.push(original)
    else if (messages[previous].sequence < original.sequence) messages[previous] = original
    return findQuotedMessage(source, messages, canonicalChat)
  }

  const editAttempts = new Map<string, { requestId: string; text: string }>()

  /** Limit editing to outgoing ordinary text; providers enforce their remaining restrictions. */
  function canEdit(message: WhatsAppMessage): boolean {
    return Boolean(!outbox.some(row => row.state !== 'submitted' && row.request.to === message.chat && row.request.editTo?.id === message.id && row.request.editTo.sender === message.sender) && message.fromMe && !message.deleted && !message.content?.viewOnce
      && (!message.content || message.content.kind === 'text')
      && (platform !== 'whatsapp' || Date.now() - message.timestamp < 15 * 60_000))
  }

  /** Save an inline edit without replacing the composer draft or changing its recipient. */
  async function edit(message: WhatsAppMessage, replacement: string): Promise<void> {
    if (busy || recording || pending || !status.connected || !canEdit(message) || !replacement.trim()) throw new Error('This message cannot be edited now')
    if (canonicalChat(message.chat) !== canonicalChat(selectedChat)) throw new Error('Select this conversation before editing')
    const key = `${message.chat}:${message.sender}:${message.id}`
    const previous = editAttempts.get(key)
    if (previous && previous.text !== replacement) throw new Error('The previous edit is uncertain. Check its outcome before making another edit.')
    const editAttempt = previous ?? { requestId: crypto.randomUUID(), text: replacement }
    editAttempts.set(key, editAttempt)
    busy = true; generation++
    try {
      const result = await api.send({ ...editAttempt, to: message.chat, editTo: { id: message.id, sender: message.sender } })
      if (result.state !== 'submitted') throw new Error('Edit outcome is uncertain. Check the conversation before trying again.')
      editAttempts.delete(key)
    } finally { busy = false; await refresh() }
  }

  /** Connect or stop without sending anything.
   * @param start Whether to connect.
   * @returns Resolves once state is refreshed.
   */
  async function connection(start: boolean): Promise<void> {
    if (busy) return
    busy = true; generation++; actionError = ''
    try {
      if (start) status = await api.connect(tabId)
      else { endCall(); await api.disconnect(); status = { connected: false, loggedOut: false, qr: null, qrExpiresAt: null } }
    } catch (error) { actionError = error instanceof Error ? error.message : 'Connection failed' }
    finally { busy = false }
    await refresh()
  }

  /** Submit the immutable request; transport retries reuse its original ID.
   * @returns Resolves after the result; history refresh continues independently.
   */
  async function submit(): Promise<void> {
    if (!pending || busy) return
    const request = $state.snapshot(pending)
    busy = true; generation++; actionError = ''
    // Show an immutable copy before network work; replies and attachments keep their draft metadata.
    if (request.reaction === undefined && !request.editTo) {
      localOutbox[request.requestId] = { request, state: 'pending', messageId: '' }
      delete sendErrors[request.requestId]
      if (!sendPreviews[request.requestId]) {
        const content = request.attachmentId !== undefined && request.attachmentId === attachment?.id ? $state.snapshot(attachment!.content) : {
          kind: 'text' as const, text: request.text, mimeType: null, fileName: null, byteLength: null,
          duration: null, voiceNote: false, viewOnce: false, quoted: null, reaction: null,
        }
        sendPreviews[request.requestId] = {
          id: request.requestId, chat: canonicalChat(request.to), sender: 'self', fromMe: true,
          sequence: 0, timestamp: Date.now(), text: request.text,
          content: { ...content, text: request.text, quoted: request.replyTo ? {
            id: request.replyTo.id, sender: request.replyTo.sender,
            text: request.replyTo.quote?.text || reply?.content?.text || reply?.text || null,
            kind: reply?.content?.kind ?? 'text', senderName: reply ? displayName(reply.sender, reply.senderName) : undefined,
            ...(request.replyTo.quote ? { offset: request.replyTo.quote.offset } : {}),
          } : null },
        }
      }
    }
    try {
      const result = await api.send(request)
      if (!result || !['pending', 'submitted', 'uncertain'].includes(result.state)) throw new Error('No send result was received. Check recent sends before trying again.')
      attempt = { ...result, request }
      if (localOutbox[request.requestId]) localOutbox[request.requestId] = attempt
    }
    catch (error) {
      actionError = error instanceof Error ? error.message : 'No send result was received. Check recent sends before trying again.'
      if (localOutbox[request.requestId]) sendErrors[request.requestId] = actionError
    }
    finally { busy = false }
    // Provider acknowledgment releases the composer without waiting for another history request.
    void refresh()
  }

  /** Clear the acknowledged request while preserving the next staged attachment.
   * @returns Whether another attachment remains ready to send.
   */
  function releaseSubmittedDraft(): boolean {
    const next = attachment && !pending?.attachmentId ? attachment : queuedAttachments.shift() ?? null
    newMessage(true); attachment = next
    return Boolean(next)
  }

  /** Freeze and submit the current draft or check its previous outcome. */
  async function sendOne(): Promise<void> {
    if (busy || recording || !status.connected) return
    if (options.recipientLocked && (!selectedChat || canonicalChat(to) !== canonicalChat(selectedChat))) { actionError = 'Select a HYPE-user conversation before sending'; return }
    if (!pending) {
      if (!to.trim() || (!text.trim() && !attachment)) return
      let recipient = to
      if (platform === 'telegram' && !/^-?[1-9]\d*$/.test(recipient)) {
        busy = true
        try { recipient = (await api.profile(recipient)).jid }
        catch (error) { actionError = error instanceof Error ? error.message : 'Recipient could not be resolved'; return }
        finally { busy = false }
        if (!active) return
      }
      // Stickers have no caption: preserve typed text as a separate, ordered send.
      const textBeforeSticker = attachment?.content.kind === 'sticker' && text.trim().length > 0
      pending = { requestId: crypto.randomUUID(), to: recipient, text, ...(attachment && !textBeforeSticker ? { attachmentId: attachment.id } : {}), ...(reply ? { replyTo: { id: reply.id, sender: reply.sender, ...(replySelection ? { quote: { ...replySelection } } : {}) } } : {}) }
      selectedChat = platform === 'telegram' ? pending.to : chatAddress(to)
    }
    await submit()
    // A confirmed send releases the composer; unknown outcomes keep their fixed request.
    if (attempt?.state === 'submitted') {
      if (releaseSubmittedDraft()) await sendOne()
    }
  }

  /** Submit the staged batch in order, retaining the same request on any uncertain send. */
  async function send(): Promise<void> {
    if (sendingBatch) return
    sendingBatch = true
    try { await sendOne() } finally { sendingBatch = false }
  }

  /** Acknowledge the selected conversation only when its pane asks after visible focus. */
  async function markRead(): Promise<void> {
    if (!api.read || reading || !status.connected || !selectedChat) return
    const chat = selectedChat
    const incoming = messages.filter(message => canonicalChat(message.chat) === canonicalChat(chat) && !message.fromMe && !message.readByMe && !message.deleted && !['reaction','protocol'].includes(message.content?.kind ?? '')).slice(-100)
    if (!incoming.length) return
    reading = true
    try {
      await api.read(chat,incoming.map(({id,sender})=>({id,sender})))
      for (const message of messages) if (incoming.some(row=>row.id===message.id && row.sender===message.sender && row.chat===message.chat)) message.readByMe=true
    } catch (cause) { if(active) actionError = cause instanceof Error ? cause.message : 'Unable to mark messages as read' }
    finally { reading=false }
  }

  /** Retain deletion identity across ambiguous retries without disturbing the draft. */
  async function deleteMessage(message: WhatsAppMessage): Promise<void> {
    if (!api.deleteMessage || busy || sendingBatch || recording || !message.fromMe || message.deleted) return
    const key = `${message.chat}:${message.sender}:${message.id}`
    const requestId = deleteAttempts.get(key) ?? crypto.randomUUID()
    deleteAttempts.set(key,requestId)
    busy=true
    try { await api.deleteMessage(message.chat,{id:message.id,sender:message.sender},requestId); message.deleted=true; deleteAttempts.delete(key) }
    finally { busy=false; await refresh() }
  }

  /** Prepare a bounded copy for forwarding; downloading never sends it. */
  async function downloadForward(message: WhatsAppMessage): Promise<File | null> {
    if (message.deleted || message.content?.viewOnce) throw new Error('This message cannot be forwarded')
    if (!message.content || message.content.kind === 'text') return null
    if (!['image','video','document','audio','sticker'].includes(message.content.kind)) throw new Error('This message type cannot be forwarded')
    const bytes=await api.media(message.chat,{id:message.id,sender:message.sender})
    return new File([Uint8Array.from(bytes)],message.content.fileName || `forwarded-${message.content.kind}`,{type:message.content.mimeType || 'application/octet-stream'})
  }

  /** Clear a draft explicitly; a subsequent send gets a new ID. */
  function newMessage(keepQueue = false): void { if (!busy) { pending = null; attempt = null; text = ''; reply = null; replySelection = null; attachment = null; if (!keepQueue) queuedAttachments = []; actionError = '' } }

  /** Select history without throwing away an existing draft.
   * @param chat Conversation address.
   */
  function selectChat(chat: string): void {
    const next = canonicalChat(chat)
    if (options.recipientLocked) {
      if (busy || sendingBatch || recording) return
      mediaPicker?.close()
      const previous = canonicalChat(to || selectedChat)
      // The hidden recipient always follows the visible conversation; drafts retain their own route.
      if (previous !== next) {
        if (previous) drafts.set(previous, { text, reply, replySelection, pending, attempt, attachment, queuedAttachments, error: actionError })
        const draft = drafts.get(next)
        text = draft?.text ?? ''; reply = draft?.reply ?? null; replySelection = draft?.replySelection ?? null; pending = draft?.pending ?? null
        attempt = draft?.attempt ?? null; attachment = draft?.attachment ?? null; queuedAttachments = draft?.queuedAttachments ?? []; actionError = draft?.error ?? ''
      }
      to = next
    } else if (!pending && !text) { to = chat; reply = null; replySelection = null }
    selectedChat = next
    void resolveProfiles()
  }

  /** Select a stored message for a reply.
   * @param message Quote target, or null to remove it.
   */
  function quote(message: WhatsAppMessage | null, selection?: TextQuote): void {
    if (pending || busy || recording) return
    if (message && (message.deleted || message.content?.viewOnce)) return
    if (selection && (platform !== 'telegram' || !message || !validTextQuote(message.content?.text || message.text || '', selection))) {
      actionError = 'This selection cannot be quoted. Select a shorter passage from the original message.'; return
    }
    reply = message
    replySelection = message && selection ? { ...selection } : null
    if (message) { to = message.chat; selectedChat = message.chat }
  }

  /** React only to the selected stored message, preserving recovery on failure.
   * @param message Stored target.
   * @param emoji Unicode emoji, or an empty string to remove the reaction.
   * @returns Resolves when the durable attempt is known.
   */
  async function react(message: WhatsAppMessage, emoji: string): Promise<void> {
    if (busy || pending || text || attachment || !status.connected) return
    pending = { requestId: crypto.randomUUID(), to: message.chat, text: '', replyTo: { id: message.id, sender: message.sender }, reaction: emoji }
    to = message.chat
    await submit()
    if (attempt?.state === 'submitted') newMessage()
  }

  /** Stage a media file without sending it to a recipient.
   * @param file Selected local file.
   * @param sticker Whether this is a WebP sticker.
   */
  async function upload(file: File, sticker = false): Promise<void> {
    if (pending || busy || recording || !status.connected) return
    if (queuedAttachments.length >= 19) { actionError = 'Select at most 20 attachments per batch'; return }
    if (file.size > 8 * 1024 * 1024) { actionError = 'Files must be at most 8 MiB'; return }
    busy = true; actionError = ''
    try {
      const staged = await api.upload({ kind: sticker ? 'sticker' : ['image/jpeg','image/png','image/webp'].includes(file.type) ? 'image' : file.type === 'video/mp4' ? 'video' : 'document', mimeType: file.type || 'application/octet-stream', fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
      if (active) { const item = { ...staged, name: file.name }; if (attachment) queuedAttachments.push(item); else attachment = item; if (sticker) text = '' }
    } catch (error) { if (active) actionError = error instanceof Error ? error.message : 'Upload failed' }
    finally { busy = false }
  }

  /** Stage multiple selected, dropped or pasted files without sending them. */
  async function uploadFiles(files:File[]):Promise<void> {
    for(const file of files.slice(0,20)) { if(pending || sendingBatch || recording) break; await upload(file); if(actionError) break }
  }
  function removeQueuedAttachment(id:string):void {
    if(pending || busy || sendingBatch) return
    if(attachment?.id===id) attachment=queuedAttachments.shift()??null
    else queuedAttachments=queuedAttachments.filter(item=>item.id!==id)
  }

  /** Discard a staged attachment without sending it. */
  function removeAttachment(): void { if (!pending && !busy) attachment = queuedAttachments.shift() ?? null }

  /** Release microphone ownership on stop, cancel, navigation, or recorder failure. */
  function releaseMicrophone(): void {
    capture?.getTracks().forEach(track => track.stop()); capture = null
    if (recordingTimer) clearInterval(recordingTimer)
    recordingTimer = undefined; recording = false
  }

  /** Stop recording; cancel never uploads or sends captured audio.
   * @param discard Whether to discard the recording entirely.
   */
  function stopRecording(discard = false): void {
    discardRecording ||= discard
    if (recorder?.state === 'recording') { if (!discard) busy = true; recorder.stop() }
    releaseMicrophone()
  }

  /** Capture a voice note only after an explicit Record action.
   * @returns Resolves when microphone recording begins; Stop stages the attachment.
   */
  async function record(): Promise<void> {
    if (busy || pending || recording || callBusy || microphone.testing || !status.connected) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { actionError = 'This browser cannot record audio'; return }
    busy = true; actionError = ''; discardRecording = false
    try {
      const mimeType = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser cannot record Opus audio')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(microphone.selected) }).catch(error => { throw new Error(microphoneErrorMessage(error)) })
      if (!active) { stream.getTracks().forEach(track => track.stop()); return }
      capture = stream
      const current = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 })
      recorder = current
      const chunks: Blob[] = []
      let size = 0
      current.ondataavailable = event => {
        size += event.data.size
        if (size > 7 * 1024 * 1024) { actionError = 'Recording exceeded the size limit'; stopRecording(true); return }
        chunks.push(event.data)
      }
      current.onerror = () => { actionError = 'Microphone recording failed'; stopRecording(true) }
      current.onstop = () => {
        releaseMicrophone(); recorder = null
        if (discardRecording || !active) return
        busy = true
        void (async () => {
          try {
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
            const converted = mimeType.startsWith('audio/webm') ? webmOpusToOgg(bytes) : { bytes, duration: Math.max(1, recordingSeconds) }
            if (!active) return
            const staged = await api.upload({ kind: 'audio', mimeType: 'audio/ogg; codecs=opus', ...converted })
            if (active) { attachment = { ...staged, name: 'Voice message' }; text = '' }
          } catch (error) { if (active) actionError = error instanceof Error ? error.message : 'Voice upload failed' }
          finally { busy = false }
        })()
      }
      recordingSeconds = 0; recording = true
      recordingTimer = setInterval(() => { recordingSeconds++; if (recordingSeconds >= 600) stopRecording() }, 1000)
      current.start(1000)
    } catch (error) { releaseMicrophone(); actionError = error instanceof Error ? error.message : 'Microphone unavailable' }
    finally { busy = false }
  }

  /** Download visible media or an explicit retry and own the private object URL.
   * @param message Stored media message.
   */
  async function loadMedia(message: WhatsAppMessage): Promise<void> {
    const key = messageMediaKey(message)
    if (!active || loadingMedia.has(key) || mediaUrls[key] || message.content?.viewOnce) return
    loadingMedia.add(key); mediaErrors[key] = ''
    try {
      const bytes = await api.media(message.chat, { id: message.id, sender: message.sender })
      if (!active) return
      const candidate = message.content?.mimeType?.split(';')[0].trim() || ''
      const mime = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|webm|wav)|video\/(mp4|webm))$/.test(candidate) ? candidate : 'application/octet-stream'
      mediaUrls[key] = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }))
    } catch (error) { if (active) mediaErrors[key] = error instanceof Error ? error.message : 'Media unavailable' }
    finally { loadingMedia.delete(key) }
  }

  /** Own one explicit call, keeping late permission and ticket responses out of a later attempt.
   * @param input Immutable call request. @param peer Display identity for the pending state.
   */
  async function beginVoice(input: VoiceStart, peer: string): Promise<void> {
    if (!active || busy || recording || callBusy || microphone.testing || !status.connected || !voiceAvailable) return
    if (input.video && !videoAvailable) { callError = 'This browser does not support video calls'; return }
    ownsCall = true; callMuted = false; cameraOff = false; callError = ''; voiceRevision++
    calls.current = { requestId: input.requestId, id: null, peer, phase: 'connecting', muted: false, video: input.video === true, startedAt: Date.now(), connectedAt: null, error: null }
    const current = (platform === 'telegram' ? TelegramBrowserCall : BrowserVoiceCall).create({
      video: (local, remote) => { if (active && voice === current) { localVideo = local; remoteVideo = remote } },
      snapshot: snapshot => {
        if (!active || voice !== current) return
        voiceRevision++
        // Initial state can describe the previous call while this attempt is being admitted.
        calls = { videoSupported: snapshot.videoSupported, incoming: snapshot.incoming, current: snapshot.current?.requestId === input.requestId ? snapshot.current : calls.current }
      },
      error: message => { if (active && voice === current) { callError = message; void microphone.refresh() } },
      closed: () => {
        if (voice !== current) return
        voice = null; ownsCall = false; localVideo = remoteVideo = null; cameraOff = false; voiceRevision++
        if (calls.current?.requestId === input.requestId && calls.current.phase !== 'ended') calls.current = { ...calls.current, phase: 'ending' }
        if (active) void refresh()
      },
    }, () => api.voiceTicket(tabId), microphone.selected)
    voice = current
    await current.start(input)
  }

  /** Start one direct voice call from an explicit button action. */
  async function startCall(recipient: string, video = false): Promise<void> {
    if (!active || busy || callBusy || !recipient || recipient.endsWith('@g.us')) return
    if (platform === 'telegram') {
      if (!/^[1-9]\d*$/.test(recipient)) {
        busy = true; callError = ''
        try { recipient = (await api.profile(recipient)).jid }
        catch (error) { if (active) callError = error instanceof Error ? error.message : 'Recipient could not be resolved'; return }
        finally { busy = false }
      }
      if (!/^[1-9]\d*$/.test(recipient)) { callError = 'Select a Telegram user for a direct call'; return }
    }
    await beginVoice({ kind: 'outgoing', requestId: crypto.randomUUID(), to: recipient, ...(video ? { video: true } : {}) }, recipient)
  }

  /** Answer the offered call selected by the user. */
  async function answerCall(id: string): Promise<void> {
    const incoming = calls.incoming.find(call => call.id === id)
    if (incoming) await beginVoice({ kind: 'answer', requestId: crypto.randomUUID(), id, ...(incoming.video ? { video: true } : {}) }, incoming.peer)
  }

  /** Decline without obtaining a microphone stream. */
  async function declineCall(id: string): Promise<void> {
    callError = ''
    try { await api.declineCall(id); voiceRevision++; calls.incoming = calls.incoming.filter(call => call.id !== id) }
    catch (error) { if (active) callError = error instanceof Error ? error.message : 'Could not decline the call' }
  }

  /** Gate the microphone locally before requesting the corresponding remote state. */
  function muteCall(muted: boolean): void { if (voice) { callMuted = muted; voice.mute(muted) } }

  /** Toggle camera content only for this window’s video call. */
  function camera(enabled: boolean): void { if (voice && calls.current?.video) { cameraOff = !enabled; voice.camera(enabled) } }

  /** End the owned attempt and release its microphone immediately. */
  function endCall(): void { voice?.close() }

  /** Renew this tab without allowing overlapping heartbeats. */
  async function watch(): Promise<void> {
    if (!api.watch || !active || watching) return
    watching = true
    try { await api.watch(tabId) }
    catch (error) { if (active) pollError = error instanceof Error ? error.message : 'Connection could not resume' }
    finally { watching = false; if (!active) void api.unwatch?.(tabId).catch(() => {}) }
  }

  onMount(() => {
    active = true
    tabId = crypto.randomUUID()
    void watch()
    const heartbeat = setInterval(() => { void watch() }, 25_000)
    if (platform === 'telegram') videoCodecAvailable = TelegramBrowserCall.supported()
    else void BrowserVoiceVideo.supported().then(supported => { if (active) videoCodecAvailable = supported })
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 3000)
    return () => { active = false; mediaPicker?.dispose(); for (const url of catalogUrls) URL.revokeObjectURL(url); catalogUrls.clear(); generation++; clearInterval(timer); clearInterval(heartbeat); void api.unwatch?.(tabId).catch(() => {}); endCall(); stopRecording(true); for (const url of Object.values(mediaUrls)) URL.revokeObjectURL(url); mediaUrls = {}; status.qr = null; messages = []; outbox = []; localOutbox = {}; sendPreviews = {}; sendErrors = {} }
  })
  return {
    viewId: options?.viewId, platform, platformLabel, configurationHref: options?.configurationHref,
    microphone,
    mediaPicker,
    get catalogSends() { return catalogSends },
    retryCatalogSend(id) { const row = catalogSends.find(row => row.id === id); if (row?.state === 'failed') void catalogRetries.get(id)?.(); else void refresh() },
    get videoAvailable() { return videoAvailable }, get localVideo() { return localVideo }, get remoteVideo() { return remoteVideo }, get cameraOff() { return cameraOff }, camera,
    get calls() { return calls }, get voiceAvailable() { return voiceAvailable },
    get callBusy() { return callBusy }, get ownsCall() { return ownsCall }, get callMuted() { return callMuted }, get callError() { return callError },
    startCall, answerCall, declineCall, muteCall, endCall,
    get profiles() { return profiles }, displayName, canonicalChat,
    get status() { return status }, get messages() { return messages }, get outbox() { return displayedOutbox },
    get sendPreviews() { return sendPreviews }, get sendErrors() { return sendErrors },
    get conversationDiscoveryAvailable() { return Boolean(api.dialogs) }, get conversationsLoading() { return conversationsLoading },
    get conversationsComplete() { return conversationCursor === null }, get conversationsError() { return conversationsError }, loadConversations,
    get historyAvailable() { return Boolean(api.history) }, get historyLoading() { return historyLoading },
    get historyComplete() { return historyCursors[selectedChat] === null }, get historyError() { return historyErrors[selectedChat] ?? '' }, loadOlder,
    get conversations() { return conversations }, get selectedChat() { return selectedChat },
    get busy() { return busy || sendingBatch }, get error() { return actionError || pollError },
    get requestId() { return pending?.requestId ?? null }, get pendingRequest() { return pending }, get attempt() { return attempt }, get reply() { return reply }, get replySelection() { return replySelection },
    get to() { return to }, set to(value) { if (!pending) { to = value; reply = null; replySelection = null } },
    get text() { return text }, set text(value) { if (!pending) text = value },
    get attachment() { return attachment }, get recording() { return recording }, get recordingSeconds() { return recordingSeconds },
    get mediaUrls() { return mediaUrls }, get mediaErrors() { return mediaErrors },
    get attachments() { return attachment ? [attachment,...queuedAttachments] : queuedAttachments },
    canOpenQuote, resolveQuote, quoteOriginal, loadQuotePreview,
    searchMessages: query => api.search ? api.search(selectedChat,query) : Promise.resolve(messages.filter(message=>message.chat===selectedChat && message.text?.toLowerCase().includes(query.toLowerCase()))),
    uploadFiles, removeQueuedAttachment, markRead, deleteMessage, downloadForward,
    upload, removeAttachment, record, stopRecording, loadMedia,
    refresh, canEdit, edit, connection, send, selectChat, newMessage: () => newMessage(), quote, react,
  }
}
