import { TelegramCatalog } from './catalog'
import { ConversationJournal } from '@hype/messaging-bridge/conversations'
import type { MediaCatalogQuery } from '@hype/messaging-bridge/media-catalog'
import { avatarImage } from './avatar'
import { PhoneLookupCache, type PhoneLookup } from '@hype/messaging-bridge/phone-lookup'
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import {
  FileLocation,
  InputMedia,
  Long,
  MtPeerNotFoundError,
  User,
  type Message,
} from '@mtcute/core'
import { getMarkedPeerId } from '@mtcute/core/utils.js'
import { TelegramClient } from '@mtcute/core/client.js'
import { WebCryptoProvider } from '@mtcute/web'
import cryptoWasm from '@mtcute/wasm/mtcute.wasm'
import { ViewerPresence } from '@hype/messaging-bridge/presence'
import type {
  BridgeConversationState,
  BridgeDialogCursor,
  BridgeProfile,
  BridgeSnapshot,
  BridgeStatus,
  BridgeUpload,
  LoginInput,
  MessageTarget,
  SendRequest,
  SendResult,
} from '@hype/messaging-bridge/types'
import { TelegramJournal } from './journal'
import { emptyContent, projectMessage } from './projection'
import { createTelegramStorage, type TelegramStorageDriver } from './storage'
import { WorkersTelegramTransport } from './transport'
import { workersPlatform } from './platform'
import { loadDialogPage, loadHistoryPage } from './history'
import { sessionMiddlewares } from './lifecycle'
import { TelegramCalls } from './calls/controller'
import { CallSocket, CallTickets } from './calls/socket'

const MEDIA_LIMIT = 8 * 1024 * 1024

/** Keep protocol errors useful without returning phone numbers, tokens, or wire payloads. */
function authFailure(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'text' in cause ? cause.text : ''
  return typeof code === 'string' &&
    /^(SESSION_PASSWORD_NEEDED|PASSWORD_HASH_INVALID|PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PHONE_NUMBER_INVALID|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|FLOOD_WAIT_\d+)$/.test(
      code,
    )
    ? code
    : 'Telegram operation failed'
}

/** Only canonical numeric peer IDs are accepted once a contact has been resolved. */
function peerId(value: string): number {
  const id = Number(value)
  if (!/^-?[1-9]\d*$/.test(value) || !Number.isSafeInteger(id))
    throw new Error('Invalid Telegram peer')
  return id
}

/** Bound and normalize immutable send attempts before journal comparison. */
function sendRequest(input: SendRequest): SendRequest {
  if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.requestId))
    throw new Error('Invalid request ID')
  peerId(input.to)
  if (typeof input.text !== 'string' || input.text.length > 16_384)
    throw new Error('Invalid message length')
  if (
    input.editTo &&
    (!/^[1-9]\d{0,9}$/.test(input.editTo.id) ||
      !input.editTo.sender ||
      input.replyTo ||
      input.reaction !== undefined ||
      input.attachmentId)
  )
    throw new Error('Invalid edit target')
  if (
    input.replyTo &&
    (!/^[1-9]\d{0,9}$/.test(input.replyTo.id) || !input.replyTo.sender)
  )
    throw new Error('Invalid reply target')
  const quote = input.replyTo?.quote
  if (
    quote &&
    (typeof quote.text !== 'string' ||
      !quote.text.trim() ||
      new TextEncoder().encode(quote.text).length > 1024 ||
      !Number.isSafeInteger(quote.offset) ||
      quote.offset < 0 ||
      input.reaction !== undefined)
  )
    throw new Error('Invalid selected-text quote')
  if (input.attachmentId && !/^[a-f0-9-]{36}$/.test(input.attachmentId))
    throw new Error('Invalid attachment')
  if (input.reaction !== undefined) {
    if (
      !input.replyTo ||
      input.text ||
      input.attachmentId ||
      new TextEncoder().encode(input.reaction).length > 64
    )
      throw new Error('Invalid reaction')
  } else if (!input.text.trim() && !input.attachmentId)
    throw new Error('Message is empty')
  return {
    requestId: input.requestId,
    to: input.to,
    text: input.text,
    ...(input.editTo
      ? { editTo: { id: input.editTo.id, sender: input.editTo.sender } }
      : {}),
    ...(input.replyTo
      ? {
          replyTo: {
            id: input.replyTo.id,
            sender: input.replyTo.sender,
            ...(quote ? { quote: { text: quote.text, offset: quote.offset } } : {}),
          },
        }
      : {}),
    ...(input.reaction !== undefined ? { reaction: input.reaction } : {}),
    ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}),
  }
}

/** One Telegram session per organisation messaging account, independent of the operator. */
export class TelegramAccount extends DurableObject<Env> {
  readonly conversations: ConversationJournal
  readonly journal: TelegramJournal
  readonly catalog: TelegramCatalog
  readonly presence: ViewerPresence
  readonly calls: TelegramCalls
  readonly callSocket: CallSocket
  readonly callTickets: CallTickets
  private readonly phoneLookups = new PhoneLookupCache()
  private client?: TelegramClient
  private driver?: TelegramStorageDriver
  private operations: Promise<void> = Promise.resolve()
  private previewReads = 0
  private readonly previewWaiters: (() => void)[] = []
  private loginAbort?: AbortController
  private loginTask?: Promise<void>
  private historyTask?: Promise<void>
  private networkAbort?: AbortController
  private state: BridgeStatus = {
    connected: false,
    loggedOut: false,
    qr: null,
    qrExpiresAt: null,
    authState: 'disconnected',
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.journal = new TelegramJournal(ctx.storage)
    this.conversations = new ConversationJournal(ctx.storage)
    this.catalog = new TelegramCatalog(ctx.storage)
    this.journal.recover()
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS bridge_viewers (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
    )
    this.presence = new ViewerPresence({
      list: () =>
        ctx.storage.sql
          .exec<{ id: string; expires: number }>(
            'SELECT id, expires FROM bridge_viewers',
          )
          .toArray(),
      put: (id, expires) => {
        ctx.storage.sql.exec(
          'INSERT INTO bridge_viewers VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires',
          id,
          expires,
        )
      },
      remove: id => {
        ctx.storage.sql.exec('DELETE FROM bridge_viewers WHERE id=?', id)
      },
    })
    this.callTickets = new CallTickets(ctx.storage)
    this.calls = new TelegramCalls(ctx.storage, {
      client: () => this.client,
      self: () => this.state.identity?.id,
      owner: (owner, event) => this.callSocket.deliver(owner, event),
      publish: snapshot => this.callSocket.publish(snapshot),
      keepAlive: task => ctx.waitUntil(task),
    })
    this.callSocket = new CallSocket(
      this.calls,
      viewer => this.viewerActive(viewer),
      task => ctx.waitUntil(task),
    )
  }

  /** Serialize mutations while still admitting network callbacks and viewer heartbeats. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.then(operation)
    this.operations = next.then(
      () => {},
      () => {},
    )
    return next
  }

  private async engine(): Promise<TelegramClient> {
    if (this.client) {
      this.networkAbort?.signal.throwIfAborted()
      return this.client
    }
    const apiId = Number(this.env.TELEGRAM_API_ID)
    if (!Number.isSafeInteger(apiId) || apiId <= 0 || !this.env.TELEGRAM_API_HASH)
      throw new Error('Telegram API credentials are not configured')
    const storage = createTelegramStorage(this.ctx.storage)
    this.driver = storage.driver as TelegramStorageDriver
    this.networkAbort = new AbortController()
    const client = new TelegramClient({
      apiId,
      apiHash: this.env.TELEGRAM_API_HASH,
      storage,
      crypto: new WebCryptoProvider({ wasmInput: cryptoWasm }),
      platform: workersPlatform,
      transport: new WorkersTelegramTransport(),
      initConnectionOptions: {
        deviceModel: 'HYPE',
        appVersion: '1.0',
        systemVersion: 'Cloudflare Workers',
      },
      updates: { catchUp: true },
      logLevel: 0,
      network: { middlewares: sessionMiddlewares(this.networkAbort.signal) },
    })
    // Persist the projection synchronously before SDK update-state checkpointing.
    const record = (message: Message) => this.journal.record(projectMessage(message))
    client.onNewMessage.add(record)
    client.onEditMessage.add(record)
    client.onDeleteMessage.add(update =>
      this.journal.deleteMessages(
        update.messageIds,
        update.channelId === null ? null : String(update.channelId),
      ),
    )
    client.onRawUpdate.add(({ update }) => {
      if (this.client !== client || this.networkAbort?.signal.aborted) return
      if (update._ === 'updateFolderPeers') {
        for (const folder of update.folderPeers)
          this.conversations.record(
            String(getMarkedPeerId(folder.peer)),
            folder.folderId === 1,
          )
        return
      }
      if (update._ === 'updateReadHistoryInbox') {
        this.journal.readIncomingThrough(
          String(getMarkedPeerId(update.peer)),
          update.maxId,
        )
        return
      }
      if (update._ === 'updateReadHistoryOutbox') {
        this.journal.readThrough(String(getMarkedPeerId(update.peer)), update.maxId)
        return
      }
      if (update._ === 'updatePhoneCall') {
        this.ctx.waitUntil(this.calls.update(update.phoneCall))
        return
      }
      if (update._ === 'updatePhoneCallSignalingData') {
        this.ctx.waitUntil(
          this.calls.signal(update.phoneCallId.toString(), update.data),
        )
        return
      }
      if (update._ !== 'updateMessageReactions') return
      this.journal.reactions(
        String(getMarkedPeerId(update.peer)),
        String(update.msgId),
        update.reactions.results.flatMap(result =>
          result.reaction._ === 'reactionEmoji'
            ? [{ emoji: result.reaction.emoticon, count: result.count }]
            : [],
        ),
      )
    })
    client.onConnectionState.add(connection => {
      if (this.client !== client) return
      this.state.connected =
        !this.networkAbort?.signal.aborted &&
        Boolean(this.state.identity) &&
        connection === 'connected'
      if (connection === 'connected') this.state.lastEvent = null
    })
    client.onError.add(() => {
      if (this.client === client && !this.networkAbort?.signal.aborted)
        this.state.lastEvent = 'Telegram connection interrupted'
    })
    this.client = client
    return client
  }

  private async ready(user: User): Promise<void> {
    this.networkAbort?.signal.throwIfAborted()
    const identity = {
      id: String(user.id),
      name: user.displayName,
      username: user.username,
      phone: user.phoneNumber,
    }
    await this.driver?.flush()
    await this.ctx.storage.put('identity', identity)
    await this.ctx.storage.delete('phoneLogin')
    this.networkAbort?.signal.throwIfAborted()
    this.state = {
      connected: true,
      loggedOut: false,
      qr: null,
      qrExpiresAt: null,
      authState: 'ready',
      identity,
    }
    const client = this.client!
    await client.startUpdatesLoop()
    // A bounded initial page discovers existing conversations; catch-up handles subsequent updates.
    if (!this.historyTask) {
      this.historyTask = this.importRecentHistory(client)
        .catch(() => {
          if (this.client === client && !this.networkAbort?.signal.aborted)
            this.state.lastEvent = 'Some conversation history could not be loaded'
        })
        .finally(() => {
          this.historyTask = undefined
        })
      this.ctx.waitUntil(this.historyTask)
    }
  }

  /** Discover recent dialogs without holding the lifecycle queue across the entire import. */
  private async importRecentHistory(client: TelegramClient): Promise<void> {
    // Enumerate both native folders in pages; only recent threads trigger message-history reads.
    let imported = 0
    const changedDuringImport = new Set<string>()
    const track = ({
      update,
    }: Parameters<Parameters<typeof client.onRawUpdate.add>[0]>[0]) => {
      if (update._ === 'updateFolderPeers')
        for (const folder of update.folderPeers)
          changedDuringImport.add(String(getMarkedPeerId(folder.peer)))
    }
    client.onRawUpdate.add(track)
    try {
      for await (const dialog of client.iterDialogs({
        archived: 'keep',
        chunkSize: 100,
      })) {
        if (this.client !== client || this.networkAbort?.signal.aborted) return
        const chat = String(dialog.peer.id)
        if (!changedDuringImport.has(chat))
          this.conversations.record(chat, dialog.isArchived)
        if (imported++ >= 30) continue
        this.journal.readThrough(String(dialog.peer.id), dialog.lastReadOutgoing)
        this.journal.readIncomingThrough(String(dialog.peer.id), dialog.lastReadIngoing)
        if (dialog.lastMessage)
          this.journal.record(projectMessage(dialog.lastMessage), 'history')
        const history = await client.getHistory(dialog.peer.id, { limit: 30 })
        if (this.client !== client || this.networkAbort?.signal.aborted) return
        for (const message of Array.from(history).reverse())
          this.journal.record(projectMessage(message), 'history')
      }
    } finally {
      client.onRawUpdate.remove(track)
    }
  }

  /** Heartbeats resume an authorised session; they never initiate account registration. */
  async watch(viewer: string): Promise<BridgeStatus> {
    this.presence.renew(viewer, Date.now())
    await this.ctx.storage.setAlarm(this.presence.nextExpiry(Date.now())!)
    return this.serial(async () => {
      const identity = await this.ctx.storage.get<BridgeStatus['identity']>('identity')
      this.state.identity = identity ?? null
      if (
        !this.client &&
        identity &&
        (await this.ctx.storage.get<boolean>('enabled'))
      ) {
        try {
          await this.ready(await (await this.engine()).getMe())
        } catch (cause) {
          this.state.lastEvent = authFailure(cause)
        }
      }
      return this.status()
    })
  }

  async unwatch(viewer: string): Promise<void> {
    this.presence.leave(viewer, Date.now())
    await this.ctx.storage.setAlarm(
      this.presence.nextExpiry(Date.now()) ?? Date.now() + 1,
    )
  }

  /** Registration is explicitly requested by a permitted organisation operator. */
  async login(input: LoginInput): Promise<BridgeStatus> {
    return this.serial(async () => {
      if (!this.presence.nextExpiry(Date.now()))
        throw new Error('Open the account configuration before signing in')
      const client = await this.engine()
      await this.ctx.storage.put('enabled', true)
      if (input.kind === 'qr') {
        if (this.loginTask) return this.status()
        this.loginAbort = new AbortController()
        this.state.authState = 'qr'
        const task = client
          .signInQr({
            onUrlUpdated: (url, expires) => {
              this.state.qr = url
              this.state.qrExpiresAt = expires.getTime()
            },
            abortSignal: this.loginAbort.signal,
          })
          .then(user => this.ready(user))
          .catch(cause => {
            const failure = authFailure(cause)
            this.state.lastEvent = failure
            this.state.authState =
              failure === 'SESSION_PASSWORD_NEEDED' ? 'password' : 'disconnected'
            this.state.qr = null
          })
          .finally(() => {
            this.loginTask = undefined
          })
        this.loginTask = task
        this.ctx.waitUntil(task)
      } else if (input.kind === 'phone') {
        if (!/^\+[1-9]\d{6,14}$/.test(input.phone))
          throw new Error('Use an international phone number')
        this.loginAbort?.abort()
        await this.loginTask
        const sent = await client.sendCode({ phone: input.phone })
        if (sent instanceof User) await this.ready(sent)
        else {
          await this.ctx.storage.put('phoneLogin', {
            phone: input.phone,
            hash: sent.phoneCodeHash,
            expires: Date.now() + 600_000,
          })
          this.state.authState = 'code'
        }
      } else if (input.kind === 'code') {
        const login = await this.ctx.storage.get<{
          phone: string
          hash: string
          expires: number
        }>('phoneLogin')
        if (!login || login.expires < Date.now() || !/^\d{3,10}$/.test(input.code))
          throw new Error('Request a new login code')
        try {
          await this.ready(
            await client.signIn({
              phone: login.phone,
              phoneCodeHash: login.hash,
              phoneCode: input.code,
            }),
          )
        } catch (cause) {
          if (authFailure(cause) !== 'SESSION_PASSWORD_NEEDED')
            throw new Error(authFailure(cause))
          this.state.authState = 'password'
        }
      } else {
        if (
          this.state.authState !== 'password' ||
          !input.password ||
          input.password.length > 1024
        )
          throw new Error('No password challenge is pending')
        await this.ready(await client.checkPassword(input.password))
      }
      return this.status()
    })
  }

  status(): BridgeStatus {
    return { ...this.state }
  }

  /** Cancellation bypasses the mutation queue so a stalled request cannot block shutdown. */
  private interrupt(): void {
    this.state.connected = false
    this.loginAbort?.abort()
    this.networkAbort?.abort(new Error('Telegram session suspended'))
  }

  /** Stop the connection while retaining the authorised session for a future viewer. */
  private async suspend(): Promise<void> {
    this.interrupt()
    await this.callSocket.close()
    await this.calls.end()
    await this.loginTask
    await this.historyTask
    await this.driver?.flush()
    await this.client?.destroy()
    this.client = undefined
    this.driver = undefined
    this.networkAbort = undefined
    this.state = {
      connected: false,
      loggedOut: false,
      qr: null,
      qrExpiresAt: null,
      authState: 'disconnected',
      identity: this.state.identity,
    }
  }

  async stop(): Promise<void> {
    this.interrupt()
    await this.serial(async () => {
      await this.ctx.storage.put('enabled', false)
      await this.suspend()
    })
  }

  async start(): Promise<BridgeStatus> {
    return this.serial(async () => {
      if (!this.presence.nextExpiry(Date.now()))
        throw new Error('Open the inbox before connecting')
      await this.ctx.storage.put('enabled', true)
      const client = await this.engine()
      const identity = await this.ctx.storage.get('identity')
      if (identity) await this.ready(await client.getMe())
      return this.status()
    })
  }

  /** Revoke this linked session explicitly; ordinary disconnect never logs out. */
  async unlink(): Promise<void> {
    await this.serial(async () => {
      const client = await this.engine()
      await client.logOut()
      await this.ctx.storage.delete('identity')
      await this.ctx.storage.put('enabled', false)
      await this.suspend()
      this.state.identity = null
      this.state.loggedOut = true
    })
  }

  async alarm(): Promise<void> {
    // Abort active work immediately once all leases have expired; disposal still waits for its borrowers.
    const interrupted = !this.presence.nextExpiry(Date.now())
    if (interrupted) this.interrupt()
    await this.serial(async () => {
      const next = this.presence.nextExpiry(Date.now())
      if (next && !interrupted) {
        await this.ctx.storage.setAlarm(next)
        return
      }
      await this.suspend()
      // A viewer arriving during shutdown renews its own lease and reconnects on the next heartbeat.
      const resumed = this.presence.nextExpiry(Date.now())
      if (resumed) await this.ctx.storage.setAlarm(resumed)
    })
  }

  snapshot(after = 0, archiveAfter = 0): BridgeSnapshot {
    return {
      status: this.status(),
      messages: this.journal.messages(after),
      conversations: this.conversations.updates(archiveAfter),
      outbox: this.journal.outbox(),
      calls: this.calls.snapshot(),
      voiceAvailable: this.state.connected,
    }
  }

  /** Change native Telegram archive membership before publishing its confirmed projection.
   * @param chat Canonical Telegram peer. @param archived Desired native folder.
   * @returns The acknowledged state, independently sequenced from messages.
   */
  async archive(chat: string, archived: boolean): Promise<BridgeConversationState> {
    const peer = peerId(chat)
    if (typeof archived !== 'boolean') throw new Error('Invalid archive state')
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      const previous = this.conversations.get(chat)?.sequence
      if (archived) await this.client.archiveChats(peer)
      else await this.client.unarchiveChats(peer)
      const current = this.conversations.get(chat)
      // SDK-emitted folder updates outrank a late response to this request.
      return current && current.sequence !== previous
        ? current
        : this.conversations.record(chat, archived)
    })
  }

  /** Calls require the issuing browser's still-live organisation inbox lease. */
  private viewerActive(viewer: string): boolean {
    return (
      this.state.connected &&
      this.ctx.storage.sql
        .exec(
          'SELECT 1 FROM bridge_viewers WHERE id=? AND expires>?',
          viewer,
          Date.now(),
        )
        .toArray().length === 1
    )
  }

  async callTicket(origin: string, viewer: string) {
    if (!this.viewerActive(viewer))
      throw new Error('Open the organisation inbox before calling')
    return {
      account: this.ctx.id.toString(),
      ...(await this.callTickets.issue(origin, viewer)),
    }
  }

  async rejectCall(id: string): Promise<void> {
    await this.calls.reject(id)
  }

  /** Only the capability gateway can reach this object; account RPC stays private. */
  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    )
      return new Response('Not found', { status: 404 })
    const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
      .split(',')
      .map(value => value.trim())
    const token = protocols.find(value => /^token\.[a-f0-9]{64}$/.test(value))?.slice(6)
    if (protocols.length !== 2 || !protocols.includes('hype.telegram.v1') || !token)
      return new Response('Unauthorized', { status: 401 })
    const viewer = await this.callTickets.consume(
      token,
      request.headers.get('origin') ?? '',
    )
    if (!viewer) return new Response('Unauthorized', { status: 401 })
    return this.callSocket.open(viewer)
  }

  /** Fetch older messages through the same shared session and durable projection journal. */
  async history(chat: string, before?: string) {
    const peer = peerId(chat)
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      return loadHistoryPage(this.client, this.journal, peer, before)
    })
  }

  /** Explicitly discover conversations beyond the automatic initial import. */
  async dialogs(cursor?: BridgeDialogCursor) {
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      return loadDialogPage(this.client, this.journal, cursor)
    })
  }

  async send(input: SendRequest): Promise<SendResult> {
    const request = sendRequest(input)
    return this.serial(async () => {
      const previous = this.journal.result(request.requestId)
      if (previous) {
        if (JSON.stringify(previous.request) !== JSON.stringify(request))
          throw new Error('Request ID already belongs to a different send')
        return previous
      }
      if (!this.state.connected || !this.client)
        throw new Error('Telegram is not connected')
      if (request.replyTo) {
        const target = this.journal.message(request.to, request.replyTo.id)
        if (
          !target ||
          target.sender !== request.replyTo.sender ||
          target.deleted ||
          target.content?.viewOnce
        )
          throw new Error('Reply target does not belong to this conversation')
        const quote = request.replyTo.quote,
          original = target.content?.text || target.text || ''
        if (
          quote &&
          original.slice(quote.offset, quote.offset + quote.text.length) !== quote.text
        )
          throw new Error('The selected quote no longer matches the original message')
      }
      if (request.editTo) {
        const target = this.journal.message(request.to, request.editTo.id)
        if (
          !target?.fromMe ||
          target.sender !== request.editTo.sender ||
          target.deleted ||
          target.content?.viewOnce ||
          (target.content && target.content.kind !== 'text')
        )
          throw new Error('Only your own text messages can be edited')
      }
      const selected = request.attachmentId
        ? this.catalog.attachment(request.attachmentId)
        : null
      // Reject unsupported emoji before recording an intent or contacting the send endpoint.
      if (request.reaction) {
        const available = await this.client.call({
          _: 'messages.getAvailableReactions',
          hash: 0,
        })
        if (
          available._ === 'messages.availableReactions' &&
          !available.reactions.some(
            reaction => reaction.reaction === request.reaction && !reaction.inactive,
          )
        ) {
          throw new Error(
            'Telegram does not support this reaction. Choose another emoji.',
          )
        }
      }
      const staged =
        request.attachmentId && !selected
          ? this.journal.attachment(request.attachmentId)
          : null
      const bytes = crypto.getRandomValues(new Uint32Array(2))
      const randomId = Long.fromBits(bytes[0], bytes[1])
      await this.journal.begin(request, randomId.toString())
      try {
        const chat = peerId(request.to)
        // Preserve the native excerpt for text, uploaded files and catalogue media alike.
        const quote = request.replyTo?.quote
        const replyOptions = {
          replyTo: request.replyTo ? Number(request.replyTo.id) : undefined,
          ...(quote
            ? { quote: { text: quote.text, entities: [] }, quoteOffset: quote.offset }
            : {}),
          randomId,
        }
        let message: Message | null
        if (request.editTo) {
          message = await this.client.editMessage({
            chatId: chat,
            message: Number(request.editTo.id),
            text: request.text,
          })
        } else if (request.reaction !== undefined) {
          // Reaction-only responses may contain no message; dispatch their updates to the journal listener.
          message = await this.client.sendReaction({
            chatId: chat,
            message: Number(request.replyTo!.id),
            emoji: request.reaction || null,
            shouldDispatch: true,
          })
        } else if (selected) {
          message = await this.client.sendMedia(chat, selected, {
            caption: request.text,
            ...replyOptions,
          })
        } else if (staged) {
          const media =
            staged.input.kind === 'image'
              ? InputMedia.photo(staged.bytes)
              : staged.input.kind === 'audio'
                ? InputMedia.voice(staged.bytes, {
                    duration: staged.input.duration ?? 1,
                  })
                : staged.input.kind === 'video'
                  ? InputMedia.video(staged.bytes, {
                      fileName: staged.input.fileName ?? 'video.mp4',
                    })
                  : staged.input.kind === 'document'
                    ? InputMedia.document(staged.bytes, {
                        fileName: staged.input.fileName ?? 'attachment',
                      })
                    : InputMedia.sticker(staged.bytes)
          message = await this.client.sendMedia(chat, media, {
            caption: request.text,
            ...replyOptions,
          })
        } else {
          message = await this.client.sendText(chat, request.text, replyOptions)
        }
        if (message) this.journal.record(projectMessage(message))
        const result = await this.journal.finish(
          request.requestId,
          message
            ? String(message.id)
            : (request.editTo?.id ?? request.replyTo?.id ?? ''),
          'submitted',
        )
        if (selected && request.attachmentId) this.catalog.release(request.attachmentId)
        return result
      } catch {
        return this.journal.finish(request.requestId, '', 'uncertain')
      }
    })
  }

  /** Apply an explicit read or sender revoke to a stored, account-owned message. */
  async messageAction(
    chat: string,
    target: MessageTarget,
    action: 'read' | 'delete',
    requestId: string,
  ): Promise<void> {
    if (
      !['read', 'delete'].includes(action) ||
      !/^[a-zA-Z0-9_.:-]{1,128}$/.test(requestId)
    )
      throw new Error('Invalid message action')
    return this.serial(async () => {
      const message = this.journal.message(chat, target.id)
      if (
        !message ||
        message.sender !== target.sender ||
        (action === 'read' ? message.fromMe : !message.fromMe)
      )
        throw new Error('Invalid action target')
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      if (action === 'read') {
        if (message.readByMe) return
        await this.client.readHistory(peerId(chat), { maxId: Number(target.id) })
        this.journal.readIncomingThrough(chat, Number(target.id))
      } else {
        if (message.deleted) return
        const key = `delete:${requestId}`
        const intent = JSON.stringify({ chat, target })
        const previous = await this.ctx.storage.get<{ intent: string; done: boolean }>(
          key,
        )
        if (previous) {
          if (previous.intent !== intent) throw new Error('Action ID already used')
          if (previous.done) return
          throw new Error('Delete outcome uncertain; refresh before retrying')
        }
        await this.ctx.storage.put(key, { intent, done: false })
        await this.client.deleteMessagesById(peerId(chat), [Number(target.id)], {
          revoke: true,
        })
        this.journal.deleteMessages([Number(target.id)], chat)
        await this.ctx.storage.put(key, { intent, done: true })
      }
    })
  }

  /** Search only through this connected account. @param input Search intent. @returns Opaque results. */
  async searchMedia(input: MediaCatalogQuery) {
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      return this.catalog.search(this.client, input)
    })
  }

  /** Read installed sticker pack names. @returns Public pack descriptors. */
  async stickerPacks() {
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      return this.catalog.packs(this.client)
    })
  }

  /** Read an account-local result's format without exposing the provider reference. */
  async catalogItem(id: string) {
    return this.catalog.metadata(id)
  }

  /** Fetch a bounded private preview. @param id Search result ID. @returns Media bytes. */
  async catalogMedia(id: string): Promise<ArrayBuffer> {
    if (this.previewWaiters.length >= 16)
      throw new Error('Media previews are busy. Try again.')
    if (this.previewReads >= 2)
      await new Promise<void>(resolve => this.previewWaiters.push(resolve))
    else this.previewReads++
    try {
      const client = this.client
      if (!client || !this.state.connected) throw new Error('Telegram is not connected')
      return await this.catalog.preview(client, id)
    } finally {
      const next = this.previewWaiters.shift()
      if (next) next()
      else this.previewReads--
    }
  }

  /** Select media without sending it. @param id Search result ID. @returns Durable attachment. */
  async stageMedia(id: string) {
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      return this.catalog.stage(id)
    })
  }

  async upload(input: BridgeUpload, bytes: ArrayBuffer) {
    if (
      !bytes.byteLength ||
      bytes.byteLength > MEDIA_LIMIT ||
      !['image', 'audio', 'sticker', 'video', 'document'].includes(input.kind)
    )
      throw new Error('Invalid media upload')
    if (
      input.kind === 'image' &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType)
    )
      throw new Error('Images must be JPEG, PNG, or WebP')
    if (
      input.kind === 'sticker' &&
      (bytes.byteLength > 512 * 1024 || input.mimeType !== 'image/webp')
    )
      throw new Error('Stickers must be WebP up to 512 KiB')
    if (
      input.kind === 'audio' &&
      (!input.mimeType.startsWith('audio/ogg') ||
        !input.duration ||
        input.duration > 600)
    )
      throw new Error('Voice notes must be Ogg Opus up to 10 minutes')
    // Reject control characters deliberately: filenames cross provider and HTTP boundaries.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are the invalid filename input being rejected.
    const invalidFileNameControlCharacters = /[\u0000-\u001f]/
    if (
      input.fileName &&
      (input.fileName.length > 255 ||
        invalidFileNameControlCharacters.test(input.fileName))
    )
      throw new Error('Invalid filename')
    if (
      input.kind === 'video' &&
      (input.mimeType !== 'video/mp4' ||
        new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp')
    )
      throw new Error('Videos must be MP4')
    const content = emptyContent(input.kind === 'audio' ? 'audio' : input.kind)
    content.fileName = input.fileName ?? null
    content.mimeType = input.mimeType
    content.byteLength = bytes.byteLength
    content.duration = input.duration ?? null
    content.voiceNote = input.kind === 'audio'
    return this.journal.stage(input, content, bytes)
  }

  async media(chat: string, target: MessageTarget): Promise<ArrayBuffer> {
    return this.serial(async () => {
      const stored = this.journal.message(chat, target.id)
      if (
        !stored ||
        stored.sender !== target.sender ||
        stored.content?.viewOnce ||
        stored.deleted
      )
        throw new Error('Media is unavailable')
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      const [message] = await this.client.getMessages(peerId(chat), Number(target.id))
      if (!message || !(message.media instanceof FileLocation))
        throw new Error('Media is unavailable')
      if (
        projectMessage(message).content?.viewOnce ||
        (message.media.fileSize ?? 0) > MEDIA_LIMIT
      )
        throw new Error('Media cannot be downloaded')
      const chunks: Uint8Array[] = []
      let length = 0
      for await (const chunk of this.client.downloadAsIterable(message.media)) {
        length += chunk.byteLength
        if (length > MEDIA_LIMIT) throw new Error('Media exceeds 8 MiB')
        chunks.push(chunk)
      }
      const result = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      return result.buffer
    })
  }

  /** Resolve a saved phone using Telegram's privacy-aware API, without importing contacts. */
  async lookupPhone(phone: string): Promise<PhoneLookup> {
    return this.serial(async () => {
      if (!this.client || !this.state.connected) return { status: 'unavailable' }
      return this.phoneLookups.resolve(phone, async () => {
        try {
          const input = await this.client!.resolvePhoneNumber(phone, true)
          const peer = await this.client!.getPeer(input)
          if (!(peer instanceof User) || peer.isBot || peer.isDeleted)
            return { status: 'unresolved' }
          return { status: 'registered', address: String(peer.id) }
        } catch (cause) {
          const code =
            cause && typeof cause === 'object' && 'text' in cause ? cause.text : ''
          if (
            cause instanceof MtPeerNotFoundError ||
            code === 'PHONE_NOT_OCCUPIED' ||
            code === 'PHONE_NUMBER_UNOCCUPIED'
          )
            return { status: 'unresolved' }
          throw cause
        }
      })
    })
  }

  async profile(address: string): Promise<BridgeProfile> {
    return this.serial(async () => {
      if (!this.client || !this.state.connected)
        throw new Error('Telegram is not connected')
      const input = /^-?\d+$/.test(address) ? peerId(address) : address
      if (
        typeof input === 'string' &&
        !/^@[a-zA-Z0-9_]{5,32}$/.test(input) &&
        !/^\+[1-9]\d{6,14}$/.test(input)
      )
        throw new Error('Invalid Telegram address')
      const peer = await this.client.getPeer(input)
      const photo = await avatarImage(this.client, peer.photo)
      return {
        jid: String(peer.id),
        name: peer.displayName,
        username: peer.username,
        phone: peer instanceof User ? peer.phoneNumber : null,
        aliases: [String(peer.id)],
        photo,
      }
    })
  }
}

/** Private service binding. Hype authorises the organisation before choosing an account. */
export default class TelegramService extends WorkerEntrypoint<Env> {
  private account(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid account ID')
    return this.env.ACCOUNTS.getByName(id)
  }
  async watch(account: string, viewer: string) {
    return this.account(account).watch(viewer)
  }
  async unwatch(account: string, viewer: string) {
    return this.account(account).unwatch(viewer)
  }
  async start(account: string) {
    return this.account(account).start()
  }
  async stop(account: string) {
    return this.account(account).stop()
  }
  async unlink(account: string) {
    return this.account(account).unlink()
  }
  async login(account: string, input: LoginInput) {
    return this.account(account).login(input)
  }
  async snapshot(
    account: string,
    after = 0,
    archiveAfter = 0,
  ): Promise<BridgeSnapshot> {
    return this.account(account).snapshot(after, archiveAfter)
  }
  /** Archive or restore through the selected account's native Telegram session. */
  async archive(account: string, chat: string, archived: boolean) {
    return this.account(account).archive(chat, archived)
  }
  async history(account: string, chat: string, before?: string) {
    return this.account(account).history(chat, before)
  }
  async dialogs(account: string, cursor?: BridgeDialogCursor) {
    return this.account(account).dialogs(cursor)
  }
  async callTicket(account: string, origin: string, viewer: string) {
    return this.account(account).callTicket(origin, viewer)
  }
  async rejectCall(account: string, id: string) {
    return this.account(account).rejectCall(id)
  }
  async lookupPhone(account: string, phone: string) {
    return this.account(account).lookupPhone(phone)
  }
  async profile(account: string, address: string) {
    return this.account(account).profile(address)
  }
  async send(account: string, request: SendRequest) {
    return this.account(account).send(request)
  }
  async messageAction(
    account: string,
    chat: string,
    target: MessageTarget,
    action: 'read' | 'delete',
    requestId: string,
  ) {
    await this.account(account).messageAction(chat, target, action, requestId)
  }
  async upload(account: string, input: BridgeUpload, bytes: ArrayBuffer) {
    return this.account(account).upload(input, bytes)
  }
  /** @param account Authorized account. @returns Installed public sticker packs. */
  async stickerPacks(account: string) {
    return this.account(account).stickerPacks()
  }
  /** @param account Authorized account. @param id Result ID. @returns Public media metadata. */
  async catalogItem(account: string, id: string) {
    return this.account(account).catalogItem(id)
  }
  /** @param account Authorized account. @param input Search intent. @returns Opaque catalogue page. */
  async searchMedia(account: string, input: MediaCatalogQuery) {
    return this.account(account).searchMedia(input)
  }
  /** @param account Authorized account. @param id Opaque result. @returns Bounded preview bytes. */
  async catalogMedia(account: string, id: string) {
    return this.account(account).catalogMedia(id)
  }
  /** @param account Authorized account. @param id Opaque result. @returns Staged attachment. */
  async stageMedia(account: string, id: string) {
    return this.account(account).stageMedia(id)
  }
  async media(account: string, chat: string, target: MessageTarget) {
    return this.account(account).media(chat, target)
  }
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 })
  }
}

/** Upgrade-only binding exposes no account-control methods to the public call gateway. */
export class CallGateway extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const match = /^\/calls\/([a-f0-9]{64})$/.exec(url.pathname)
    if (
      !match ||
      url.search ||
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    )
      return new Response('Not found', { status: 404 })
    try {
      return await this.env.ACCOUNTS.get(
        this.env.ACCOUNTS.idFromString(match[1]),
      ).fetch(request)
    } catch {
      return new Response('Call connection unavailable', { status: 503 })
    }
  }
}
