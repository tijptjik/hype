import { PhoneLookupCache, type PhoneLookup } from '@hype/messaging-bridge/phone-lookup'
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import wasm from '@hype/whatsapp-engine/wasm.wasm'
import { instantiateEngine } from '@hype/whatsapp-engine/factory'
import { ProfileDirectory, type DisplayProfile, type PrivateProfile } from './profiles'
import { AccountDatabase } from './database'
import { deviceStage, linkedDeviceName } from './device-name'
import { RelayHost } from './relay'
import { RelayPrewarmer } from './prewarm'
import { VoiceConnection, VoiceTickets } from './voice'
import { copyRpcValue } from './rpc-value'
import {
  MessageJournal,
  sameRequest,
  type MessageProjection,
  type MessageTarget,
  type Outbound,
  type TextRequest,
} from './journal'
import type { WorkerSession } from '@hype/whatsapp-engine/bindings'
import { ViewerPresence } from '@hype/messaging-bridge/presence'

import type { BridgeConversationState } from '@hype/messaging-bridge/types'

interface SessionStatus {
  connected: boolean
  loggedOut: boolean
  qr: string | null
  qrExpiresAt: number | null
  lastEvent?: string | null
  identity?: {
    id: string
    name: string
    username: string | null
    phone: string | null
  } | null
}

export class WhatsoverAccount extends DurableObject<Env> {
  readonly database: AccountDatabase
  readonly engine = instantiateEngine(wasm)
  readonly journal: MessageJournal
  readonly profiles: ProfileDirectory
  readonly voiceTickets: VoiceTickets
  readonly voice: VoiceConnection
  private readonly relayPrewarmer: RelayPrewarmer
  private prewarmOnView = false
  private readonly phoneLookups = new PhoneLookupCache()
  private session?: WorkerSession
  private operations: Promise<void> = Promise.resolve()
  private stopping = false
  private archiveSync?: Promise<void>
  private archiveSyncRetry = 0
  private archiveReadySession?: WorkerSession
  readonly presence: ViewerPresence

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.relayPrewarmer = new RelayPrewarmer(
      async () => {
        const response = await this.env.RELAY.fetch(
          new Request(`https://relay.internal/${this.ctx.id.toString()}/prewarm`, {
            method: 'POST',
            signal: AbortSignal.timeout(35_000),
          }),
        )
        await response.body?.cancel()
        if (!response.ok) throw new Error('Relay prewarm unavailable')
      },
      task => this.ctx.waitUntil(task),
    )
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS messaging_viewers (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
    )
    this.presence = new ViewerPresence({
      list: () =>
        ctx.storage.sql
          .exec<{ id: string; expires: number }>(
            'SELECT id, expires FROM messaging_viewers',
          )
          .toArray(),
      put: (id, expires) => {
        ctx.storage.sql.exec(
          'INSERT INTO messaging_viewers VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires',
          id,
          expires,
        )
      },
      remove: id => {
        ctx.storage.sql.exec('DELETE FROM messaging_viewers WHERE id=?', id)
      },
    })
    this.database = new AccountDatabase(ctx.storage, chat =>
      this.journal.linkArchiveAliases(chat),
    )
    this.journal = new MessageJournal(
      ctx.storage,
      payload => JSON.parse(this.engine.projectMessage(payload)),
      chat => this.database.archiveAliases(chat),
    )
    this.profiles = new ProfileDirectory(ctx.storage, this.journal)
    this.voiceTickets = new VoiceTickets(ctx.storage)
    this.voice = new VoiceConnection(
      ctx.storage,
      {
        snapshot: () => this.callSnapshot(),
        begin: (input, output, cancelled) =>
          this.serial(async () => {
            if (cancelled()) return
            if (!this.session || !this.status().connected)
              throw new Error('WhatsApp is not connected')
            await this.session.beginCall(JSON.stringify(input), output)
          }),
        audio: bytes => {
          this.session?.callAudio(bytes)
        },
        video: bytes => {
          this.session?.callVideo(bytes)
        },
        keyframe: () => {
          this.session?.requestVideoKeyframe()
        },
        mute: async muted => {
          if (!this.session) throw new Error('WhatsApp is not connected')
          await this.session.muteCall(muted)
        },
        reject: id =>
          this.serial(async () => {
            if (!this.session) throw new Error('WhatsApp is not connected')
            await this.session.rejectCall(id)
          }),
        end: async () => {
          await this.session?.endCall()
        },
      },
      task => this.ctx.waitUntil(task),
    )
  }

  /** Platform qualification: real Rust timers/crypto inside a SQLite DO. */
  async probe() {
    const result = JSON.parse(await this.engine.probeRuntime()) as {
      runtime: string
      registrationId: number
      clocks: boolean
    }
    return {
      runtime: result.runtime,
      entropy: result.registrationId > 0,
      clocks: result.clocks,
      storage: 'sqlite',
    }
  }

  validate(json: string): string {
    return this.engine.validateTextRequest(json)
  }
  diagnostics(): string[] {
    return JSON.parse(this.engine.diagnosticLocations())
  }

  /** Serialize lifecycle and sends without blocking the incoming event loop. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation)
    this.operations = result.then(
      () => {},
      () => {},
    )
    return result
  }

  private async ensureSession(): Promise<void> {
    if (!this.session) {
      const stage = (await this.ctx.storage.get<string>('stage')) ?? 'production'
      this.session = await this.engine.startSession(
        this.database,
        this.journal,
        linkedDeviceName(stage),
      )
      this.session.configureRelay(
        new RelayHost(request => this.env.RELAY.fetch(request), this.ctx.id.toString()),
      )
    }
  }

  async start(stage?: string): Promise<SessionStatus> {
    const requestedStage = stage === undefined ? undefined : deviceStage(stage)
    return this.serial(async () => {
      if (requestedStage !== undefined)
        await this.ctx.storage.put('stage', requestedStage)
      await this.ctx.storage.put('enabled', true)
      await this.ctx.storage.setAlarm(Date.now() + 60_000)
      const status = this.status()
      // Terminal SDK sessions cannot resume. A signed-out account needs fresh
      // protocol credentials; retain its journal and archived protocol state.
      if (
        this.session &&
        !status.connected &&
        (status.loggedOut || status.lastEvent === 'PairingQrCodesExhausted')
      ) {
        const expired = this.session
        try {
          await expired.stop()
        } finally {
          expired.free()
          this.session = undefined
        }
        if (status.loggedOut) {
          this.database.archiveRevokedSession()
          await this.ctx.storage.sync()
        }
      }
      await this.ensureSession()
      this.stopping = false
      return this.status()
    })
  }

  async stop(preserveEnabled = false): Promise<void> {
    this.stopping = true
    // Drain voice borrows before joining the lifecycle queue and freeing WASM.
    await this.voice.close()
    return this.serial(async () => {
      // A viewer may arrive while voice borrows are draining. Do not tear down its session or alarm.
      if (preserveEnabled && this.presence.nextExpiry(Date.now())) {
        this.stopping = false
        await this.ctx.storage.setAlarm(
          Math.min(this.presence.nextExpiry(Date.now())!, Date.now() + 60_000),
        )
        return
      }
      if (!preserveEnabled) await this.ctx.storage.put('enabled', false)
      await this.ctx.storage.deleteAlarm()
      const session = this.session
      if (session) {
        // Do not free a WASM object while another exported call borrows it.
        try {
          await session.stop()
          this.profiles.contacts(session.contactUpdates())
        } finally {
          session.free()
          this.session = undefined
        }
      }
    })
  }

  /** Organisation viewers share a session; legacy personal accounts keep their existing lifecycle. */
  async watch(viewer: string, stage?: string): Promise<SessionStatus> {
    const previous = this.ctx.storage.sql
      .exec<{ expires: number }>(
        'SELECT expires FROM messaging_viewers WHERE id=?',
        viewer,
      )
      .toArray()[0]
    this.presence.renew(viewer, Date.now())
    if (!previous || previous.expires <= Date.now()) this.prewarmOnView = true
    await this.ctx.storage.put('viewerManaged', true)
    await this.ctx.storage.setAlarm(
      Math.min(this.presence.nextExpiry(Date.now())!, Date.now() + 60_000),
    )
    const status = (await this.ctx.storage.get<boolean>('enabled'))
      ? await this.start(stage)
      : this.status()
    this.prewarmView(status.connected)
    return status
  }

  /** A departing tab never stops another operator's live session. */
  async unwatch(viewer: string): Promise<void> {
    this.presence.leave(viewer, Date.now())
    await this.ctx.storage.setAlarm(
      this.presence.nextExpiry(Date.now()) ?? Date.now() + 1,
    )
  }

  status(): SessionStatus {
    if (this.session) this.profiles.contacts(this.session.contactUpdates())
    return this.session
      ? JSON.parse(this.session.status())
      : { connected: false, loggedOut: false, qr: null, qrExpiresAt: null }
  }

  /** Poll incoming calls without activating the microphone or a voice socket. */
  callSnapshot(): unknown {
    const snapshot = {
      videoSupported: true,
      ...(this.session
        ? JSON.parse(this.session.callSnapshot())
        : { incoming: [], current: null }),
    }
    const connected = !this.stopping && this.status().connected
    this.prewarmView(connected)
    this.relayPrewarmer.incoming(connected ? snapshot.incoming : [])
    return snapshot
  }

  private prewarmView(connected: boolean): void {
    if (
      !this.stopping &&
      connected &&
      this.prewarmOnView &&
      this.presence.nextExpiry(Date.now())
    ) {
      this.prewarmOnView = false
      this.relayPrewarmer.request()
    }
  }

  /** Decline an incoming offer without activating a browser media connection. */
  async rejectCall(id: string): Promise<void> {
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(id)) throw new Error('Invalid call ID')
    return this.serial(async () => {
      if (this.stopping || !this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      await this.session.rejectCall(id)
    })
  }

  /** Mint only through authenticated Hype RPC; account identity never comes from the browser. */
  async voiceTicket(origin: string) {
    if (this.stopping || !this.session || !this.status().connected)
      throw new Error('WhatsApp is not connected')
    return {
      account: this.ctx.id.toString(),
      ...(await this.voiceTickets.issue(origin)),
    }
  }

  /** The private gateway forwards upgrades; each account verifies and burns its own ticket. */
  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    )
      return new Response('Not found', { status: 404 })
    const protocols = (request.headers.get('sec-websocket-protocol') || '')
      .split(',')
      .map(value => value.trim())
    const token = protocols.find(value => /^token\.[a-f0-9]{64}$/.test(value))?.slice(6)
    if (
      protocols.length !== 2 ||
      !protocols.includes('whatsover.v1') ||
      !token ||
      !(await this.voiceTickets.consume(token, request.headers.get('origin') || ''))
    )
      return new Response('Unauthorized', { status: 401 })
    if (this.stopping || !this.session || !this.status().connected)
      return new Response('WhatsApp is not connected', { status: 409 })
    return this.voice.open()
  }

  async send(input: TextRequest): Promise<Outbound> {
    // Rust owns normalization so the desktop and cloud accept the same inputs.
    const { editTo, ...base } = input
    const request: TextRequest = JSON.parse(this.validate(JSON.stringify(base)))
    if (editTo) {
      if (
        request.replyTo ||
        request.reaction !== undefined ||
        request.attachmentId ||
        !editTo.id ||
        editTo.id.length > 128 ||
        !editTo.sender
      )
        throw new Error('Invalid edit target')
      request.editTo = { id: editTo.id, sender: editTo.sender }
    }
    return this.serial(async () => {
      const previous = this.journal.result(request.requestId)
      if (previous) {
        if (!sameRequest(previous.request, request))
          throw new Error('requestId already belongs to a different message')
        return previous
      }
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      if (request.editTo) {
        const target = JSON.parse(
          await this.journal.lookup(
            request.to,
            request.editTo.sender,
            request.editTo.id,
          ),
        )
        if (!target?.fromMe)
          throw new Error('Only your own text messages can be edited')
        const projection = JSON.parse(this.engine.projectMessage(target.payload))
        if (
          projection.content.kind !== 'text' ||
          projection.content.viewOnce ||
          Date.now() - target.timestamp > 15 * 60_000
        )
          throw new Error('This message can no longer be edited')
        await this.journal.claim(
          JSON.stringify({ request, state: 'pending', messageId: request.editTo.id }),
        )
        let state: 'submitted' | 'uncertain' = 'uncertain'
        try {
          await this.session.editText(
            request.to,
            request.editTo.id,
            request.editTo.sender,
            request.text,
          )
          state = 'submitted'
        } catch {
          /* Preserve uncertain outcomes; never issue a fresh edit automatically. */
        }
        const result = { request, state, messageId: request.editTo.id }
        await this.journal.finish(JSON.stringify(result))
        if (state === 'submitted')
          await this.journal.editText(request.to, request.editTo, request.text)
        return result
      }
      return JSON.parse(await this.session.send(JSON.stringify(request)))
    })
  }

  /** Resolve a HYPE-supplied profile phone without sending a message or adding a contact. */
  async lookupPhone(phone: string): Promise<PhoneLookup> {
    return this.serial(async () => {
      if (!this.session || !this.status().connected) return { status: 'unavailable' }
      return this.phoneLookups.resolve(phone, async () =>
        JSON.parse(await this.session!.lookupPhone(phone)),
      )
    })
  }

  /** Cached, read-only identity lookup for this linked WhatsApp account. */
  async profile(jid: string): Promise<DisplayProfile> {
    const normalized = JSON.parse(
      this.validate(JSON.stringify({ requestId: 'profile', to: jid, text: 'lookup' })),
    ).to as string
    return this.serial(async () => {
      if (this.session) this.profiles.contacts(this.session.contactUpdates())
      const cached = this.profiles.cached(normalized)
      if (cached) return cached
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      const profile: PrivateProfile = JSON.parse(await this.session.profile(normalized))
      return this.profiles.save(profile)
    })
  }

  /** Read/delete only journal-owned direct messages; deletion retries never issue a fresh revoke. */
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
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      const stored = JSON.parse(
        await this.journal.lookup(chat, target.sender, target.id),
      )
      if (!stored || (action === 'read' ? stored.fromMe : !stored.fromMe))
        throw new Error('Invalid action target')
      if (action === 'read') {
        if (stored.readByMe) return
        await this.session.readMessage(chat, target.id, target.sender)
        await this.journal.updateMessage(chat, target, { readByMe: true })
      } else {
        if (stored.deleted) return
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
        await this.session.deleteMessage(chat, target.id, target.sender)
        await this.journal.updateMessage(chat, target, { deleted: true })
        await this.ctx.storage.put(key, { intent, done: true })
      }
    })
  }

  /** Upload bytes through the SDK; expose only an opaque account-local ID. */
  async upload(
    input: {
      animated?: boolean
      kind: string
      mimeType: string
      duration?: number
      fileName?: string
    },
    bytes: ArrayBuffer,
  ): Promise<{ id: string; content: MessageProjection['content'] }> {
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024)
      throw new Error('media must be 1 byte to 8 MiB')
    return this.serial(async () => {
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      const payload = await this.session.prepareMedia(
        JSON.stringify(input),
        new Uint8Array(bytes),
      )
      const id = crypto.randomUUID()
      await this.journal.stage(id, payload)
      const projection = JSON.parse(
        this.engine.projectMessage(JSON.stringify({ message: JSON.parse(payload) })),
      )
      return { id, content: projection.content }
    })
  }

  /** Serial admission bounds per-account media memory and protects session lifetime. */
  async media(chat: string, target: MessageTarget): Promise<ArrayBuffer> {
    return this.serial(async () => {
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      const bytes = await this.session.downloadMedia(chat, JSON.stringify(target))
      // Copy out of WASM memory before another call can grow or free it.
      return Uint8Array.from(bytes).buffer
    })
  }

  inbox(after = 0, limit = 100) {
    return this.journal.inbox(after, limit)
  }
  outbox(limit = 50) {
    return this.journal.outbox(limit)
  }
  result(requestId: string): Outbound | null {
    return this.journal.result(requestId)
  }

  /** Read the console's bounded state in one turn without four RPC lifetimes. */
  snapshot(after = 0, archiveAfter = 0) {
    this.syncArchiveState()
    return {
      status: this.status(),
      messages: this.inbox(after, 100),
      outbox: this.outbox(50),
      conversations: this.journal.conversations.updates(archiveAfter),
      calls: this.callSnapshot(),
      voiceAvailable: true,
    }
  }

  /** Bootstrap archive state for already-paired sessions, then follow native app-state callbacks. */
  private syncArchiveState(): void {
    if (
      this.archiveSync ||
      !this.session ||
      !this.status().connected ||
      Date.now() < this.archiveSyncRetry
    )
      return
    this.archiveSyncRetry = Date.now() + 60_000
    this.archiveSync = this.serial(async () => {
      if (!this.session || !this.status().connected) return
      if (this.archiveReadySession === this.session && !this.session.archiveNeedsSync())
        return
      await this.session.syncArchiveState()
      this.archiveReadySession = this.session
    })
      .catch(() => {
        /* A later connected snapshot retries without changing saved folder state. */
      })
      .finally(() => {
        this.archiveSync = undefined
      })
    this.ctx.waitUntil(this.archiveSync)
  }

  /** Archive or restore with WhatsApp before publishing a confirmed native projection.
   * @param chat Canonical native peer. @param archived Desired archive membership.
   * @returns The acknowledged state and its independent replay position.
   */
  async archive(chat: string, archived: boolean): Promise<BridgeConversationState> {
    if (
      !/^[1-9]\d{6,14}@(s\.whatsapp\.net|lid)$/.test(chat) ||
      typeof archived !== 'boolean'
    )
      throw new Error('Invalid archive target')
    return this.serial(async () => {
      if (!this.session || !this.status().connected)
        throw new Error('WhatsApp is not connected')
      const previous = this.journal.conversations.get(chat)?.sequence
      await this.session.archiveChat(chat, archived)
      const current = this.journal.conversations.get(chat)
      if (current && current.sequence !== previous) return current
      this.journal.archiveUpdate(
        JSON.stringify({ chats: [chat], isArchived: archived }),
      )
      return this.journal.conversations.get(chat)!
    })
  }

  async alarm(): Promise<void> {
    if (
      (await this.ctx.storage.get<boolean>('viewerManaged')) &&
      !this.presence.nextExpiry(Date.now())
    ) {
      await this.stop(true)
      return
    }
    await this.serial(async () => {
      if (!(await this.ctx.storage.get<boolean>('enabled'))) return
      if (this.status().loggedOut) {
        // Provider logout does not cancel the organisation's intent to connect.
        // Keep lease cleanup scheduled; a viewer, not an alarm, starts fresh pairing.
        await this.ctx.storage.setAlarm(Date.now() + 60_000)
        return
      }
      // Re-arm before external I/O so a failed startup retains recovery.
      await this.ctx.storage.setAlarm(Date.now() + 60_000)
      await this.ensureSession()
    })
  }
}

/** Private service binding. Hype must authorize the administrator before RPC. */
export default class WhatsoverService extends WorkerEntrypoint<Env> {
  async probe() {
    return copyRpcValue(this.env.ACCOUNTS.getByName('platform-probe').probe())
  }
  async watch(account: string, viewer: string, stage?: string) {
    return copyRpcValue(this.account(account).watch(viewer, stage))
  }
  async unwatch(account: string, viewer: string) {
    return this.account(account).unwatch(viewer)
  }

  private account(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || id === 'platform-probe')
      throw new Error('invalid account ID')
    return this.env.ACCOUNTS.getByName(id)
  }

  async start(account: string, stage?: string) {
    return copyRpcValue(this.account(account).start(stage))
  }
  async stop(account: string) {
    return this.account(account).stop()
  }
  async status(account: string) {
    return copyRpcValue(this.account(account).status())
  }
  async snapshot(account: string, after = 0, archiveAfter = 0) {
    return copyRpcValue(this.account(account).snapshot(after, archiveAfter))
  }
  /** Archive or restore through the selected account's native WhatsApp session. */
  async archive(account: string, chat: string, archived: boolean) {
    return copyRpcValue(this.account(account).archive(chat, archived))
  }
  async send(account: string, request: TextRequest) {
    return copyRpcValue(this.account(account).send(request))
  }
  async lookupPhone(account: string, phone: string) {
    return copyRpcValue<PhoneLookup>(this.account(account).lookupPhone(phone))
  }
  async profile(account: string, jid: string) {
    return copyRpcValue(this.account(account).profile(jid))
  }
  async callSnapshot(account: string) {
    return copyRpcValue(this.account(account).callSnapshot())
  }
  async rejectCall(account: string, id: string) {
    return this.account(account).rejectCall(id)
  }
  async voiceTicket(account: string, origin: string) {
    return copyRpcValue(this.account(account).voiceTicket(origin))
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
  async upload(
    account: string,
    input: {
      animated?: boolean
      kind: string
      mimeType: string
      duration?: number
      fileName?: string
    },
    bytes: ArrayBuffer,
  ) {
    return copyRpcValue(this.account(account).upload(input, bytes))
  }
  async media(account: string, chat: string, target: MessageTarget) {
    return copyRpcValue<ArrayBuffer>(this.account(account).media(chat, target))
  }
  async inbox(account: string, after = 0, limit = 100) {
    return copyRpcValue(this.account(account).inbox(after, limit))
  }
  async outbox(account: string, limit = 50) {
    return copyRpcValue(this.account(account).outbox(limit))
  }
  async result(account: string, requestId: string) {
    return copyRpcValue(this.account(account).result(requestId))
  }
  async diagnostics(account: string) {
    return copyRpcValue(this.account(account).diagnostics())
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('Not found', { status: 404 })
  }
}

/** Separate binding entrypoint: the public voice gateway cannot invoke account RPC. */
export class VoiceGateway extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const match = /^\/voice\/([a-f0-9]{64})$/.exec(url.pathname)
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
      return new Response('Voice connection unavailable', { status: 503 })
    }
  }
}
