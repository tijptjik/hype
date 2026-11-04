import { isIP } from 'node:net'
import { Long, type tl } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/core/client.js'
import type { BridgeCalls } from '@hype/messaging-bridge/types'
import { CallKeyExchange } from './crypto'
import { CALL_VERSIONS, CallSignaling, type CallSignalMessage } from './signaling'

export type CallStart =
  | { kind: 'outgoing'; requestId: string; to: string; video?: boolean }
  | { kind: 'answer'; requestId: string; id: string; video?: boolean }
export interface CallMediaSetup {
  outgoing: boolean
  video: boolean
  p2pAllowed: boolean
  iceServers: { urls: string[]; username?: string; credential?: string }[]
  fingerprint: string
}
export type CallOwnerEvent =
  | { kind: 'setup'; setup: CallMediaSetup }
  | { kind: 'signal'; message: CallSignalMessage }
  | { kind: 'error'; message: string }
export interface CallControllerIO {
  client(): TelegramClient | undefined
  self(): string | undefined
  owner(owner: string, event: CallOwnerEvent): void
  publish(snapshot: BridgeCalls): void
  keepAlive(task: Promise<void>): void
}

interface ActiveCall {
  owner: string
  client: TelegramClient
  outgoing: boolean
  status: NonNullable<BridgeCalls['current']>
  step: 'starting' | 'waiting' | 'deriving' | 'ready' | 'ended'
  protocol: tl.RawPhoneCallProtocol
  input?: tl.RawInputPhoneCall
  requested?: tl.RawPhoneCallRequested
  dh?: CallKeyExchange
  key?: Uint8Array
  fingerprint?: string
  signaling?: CallSignaling
  earlyUpdates: tl.TypePhoneCall[]
  earlyPackets: { id: string; bytes: Uint8Array }[]
  earlyBytes: number
}

/** Advertise only implemented versions, intersecting incoming protocol capabilities. */
function protocol(peer?: tl.TypePhoneCallProtocol): tl.RawPhoneCallProtocol {
  const libraryVersions = CALL_VERSIONS.filter(
    version => !peer || peer.libraryVersions.includes(version),
  )
  const minLayer = Math.max(65, peer?.minLayer ?? 65),
    maxLayer = Math.min(92, peer?.maxLayer ?? 92)
  if (!libraryVersions.length || minLayer > maxLayer)
    throw new Error('This Telegram client uses an unsupported call protocol')
  return {
    _: 'phoneCallProtocol',
    udpP2p: true,
    udpReflector: true,
    minLayer,
    maxLayer,
    libraryVersions,
  }
}

/** Convert only Telegram-issued WebRTC endpoints to browser ICE configuration. */
function mediaSetup(
  call: tl.RawPhoneCall,
  outgoing: boolean,
  fingerprint: string,
): CallMediaSetup {
  const iceServers: CallMediaSetup['iceServers'] = []
  for (const endpoint of call.connections.slice(0, 32)) {
    if (
      endpoint._ !== 'phoneConnectionWebrtc' ||
      !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65535
    )
      continue
    for (const ip of [endpoint.ip, endpoint.ipv6]) {
      if (!isIP(ip)) continue
      const address = isIP(ip) === 6 ? `[${ip}]` : ip
      if (endpoint.stun) iceServers.push({ urls: [`stun:${address}:${endpoint.port}`] })
      if (
        endpoint.turn &&
        endpoint.username.length <= 4096 &&
        endpoint.password.length <= 4096
      )
        iceServers.push({
          urls: [
            `turn:${address}:${endpoint.port}?transport=udp`,
            `turn:${address}:${endpoint.port}?transport=tcp`,
          ],
          username: endpoint.username,
          credential: endpoint.password,
        })
    }
  }
  if (
    !iceServers.length ||
    (!call.p2pAllowed && !iceServers.some(server => server.credential !== undefined))
  )
    throw new Error('Telegram did not provide a usable call relay')
  return {
    outgoing,
    video: call.video === true,
    p2pAllowed: call.p2pAllowed === true,
    iceServers,
    fingerprint,
  }
}

/** One organisation account's call state, with exclusive ownership and immutable attempts. */
export class TelegramCalls {
  private active?: ActiveCall
  private readonly incoming = new Map<string, tl.RawPhoneCallRequested>()
  private updates: Promise<void> = Promise.resolve()
  private updateCount = 0
  private starting = false

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly io: CallControllerIO,
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS telegram_call_attempts (request_id TEXT PRIMARY KEY, created INTEGER NOT NULL)',
    )
  }

  snapshot(): BridgeCalls {
    const now = Date.now()
    for (const [id, call] of this.incoming)
      if (now - call.date * 1000 > 90_000) this.incoming.delete(id)
    return {
      videoSupported: true,
      current: this.active ? { ...this.active.status } : null,
      incoming: [...this.incoming.values()].map(call => ({
        id: call.id.toString(),
        peer: String(call.adminId),
        name: null,
        receivedAt: call.date * 1000,
        video: call.video === true,
      })),
    }
  }

  /** Reserve ownership synchronously, before any DH or provider request can yield. */
  async begin(owner: string, input: CallStart): Promise<void> {
    const client = this.io.client(),
      self = this.io.self()
    if (!client || !self) throw new Error('Telegram is not connected')
    if (
      this.starting ||
      this.updateCount ||
      (this.active && this.active.step !== 'ended')
    )
      throw new Error('Another operator already owns the call')
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.requestId))
      throw new Error('Invalid call request')
    const requested = input.kind === 'answer' ? this.incoming.get(input.id) : undefined
    if (input.kind === 'answer' && !requested)
      throw new Error('This incoming call is no longer available')
    if (requested?.video && input.video !== true)
      throw new Error('Answer this call using the video action')
    const peer = requested
      ? String(requested.adminId)
      : input.kind === 'outgoing'
        ? input.to
        : ''
    if (
      !/^[1-9]\d*$/.test(peer) ||
      !Number.isSafeInteger(Number(peer)) ||
      peer === self
    )
      throw new Error('Select a Telegram user to call')
    const chosenProtocol = protocol(requested?.protocol)
    const inserted = this.storage.sql
      .exec(
        'INSERT OR IGNORE INTO telegram_call_attempts VALUES (?, ?) RETURNING request_id',
        input.requestId,
        Date.now(),
      )
      .toArray()
    if (!inserted.length)
      throw new Error(
        'This call attempt was already submitted; check its status before starting another',
      )
    const call: ActiveCall = {
      owner,
      client,
      outgoing: !requested,
      requested,
      protocol: chosenProtocol,
      step: 'starting',
      earlyUpdates: [],
      earlyPackets: [],
      earlyBytes: 0,
      status: {
        requestId: input.requestId,
        id: requested?.id.toString() ?? null,
        peer,
        phase: 'connecting',
        muted: false,
        video: requested?.video === true || input.video === true,
        startedAt: Date.now(),
        connectedAt: null,
        error: null,
      },
      input: requested
        ? { _: 'inputPhoneCall', id: requested.id, accessHash: requested.accessHash }
        : undefined,
    }
    this.active = call
    this.starting = true
    if (requested) this.incoming.delete(requested.id.toString())
    this.publish()
    try {
      await this.storage.sync()
      this.assertCurrent(call)
      const config = await client.call({
        _: 'messages.getDhConfig',
        version: 0,
        randomLength: 256,
      })
      this.assertCurrent(call)
      if (config._ !== 'messages.dhConfig')
        throw new Error('Telegram did not return call DH parameters')
      call.dh = CallKeyExchange.create(config.p, config.g, config.random)
      if (requested) {
        call.step = 'waiting'
        const accepted = await client.call({
          _: 'phone.acceptCall',
          peer: call.input!,
          gB: call.dh.publicValue,
          protocol: call.protocol,
        })
        if (!this.isCurrent(call)) {
          await this.discard(
            client,
            call.input!,
            'phoneCallDiscardReasonHangup',
            call.status.video,
          )
          return
        }
        await this.enqueue(() => this.apply(call, accepted.phoneCall))
      } else {
        const userId = await client.resolveUser(Number(peer))
        const gAHash = await call.dh.commitment()
        this.assertCurrent(call)
        const response = await client.call({
          _: 'phone.requestCall',
          userId,
          randomId: crypto.getRandomValues(new Int32Array(1))[0],
          gAHash,
          protocol: call.protocol,
          video: call.status.video,
        })
        const issued = response.phoneCall
        if ('accessHash' in issued)
          call.input = {
            _: 'inputPhoneCall',
            id: issued.id,
            accessHash: issued.accessHash,
          }
        if (!this.isCurrent(call)) {
          if (call.input)
            await this.discard(
              client,
              call.input,
              'phoneCallDiscardReasonHangup',
              call.status.video,
            )
          return
        }
        if (issued._ === 'phoneCallDiscarded') {
          await this.finish(call)
          return
        }
        if (!call.input) throw new Error('Telegram did not create the call')
        call.status.id = issued.id.toString()
        call.step = 'waiting'
        await this.enqueue(async () => {
          await this.apply(call, issued)
          for (const update of call.earlyUpdates.splice(0))
            await this.apply(call, update)
        })
      }
    } catch (error) {
      if (this.isCurrent(call)) await this.fail(call, error)
      throw error
    } finally {
      this.starting = false
    }
  }

  /** Process SDK updates serially, independently of the account's login/send queue. */
  update(update: tl.TypePhoneCall): Promise<void> {
    return this.enqueue(async () => {
      if (
        update._ === 'phoneCallRequested' &&
        String(update.participantId) === this.io.self()
      ) {
        if (
          Date.now() - update.date * 1000 > 90_000 ||
          update.date * 1000 > Date.now() + 300_000
        )
          return
        if (this.active?.step !== 'ended' && this.active?.input?.id.equals(update.id))
          return
        const id = update.id.toString(),
          fresh = !this.incoming.has(id)
        if (this.incoming.size >= 8 && fresh) return
        this.incoming.set(id, update)
        this.publish()
        // Receipt acknowledges ringing only; accepting still requires the operator's explicit action.
        if (fresh)
          await this.io
            .client()
            ?.call(
              {
                _: 'phone.receivedCall',
                peer: {
                  _: 'inputPhoneCall',
                  id: update.id,
                  accessHash: update.accessHash,
                },
              },
              { timeout: 5000, maxRetryCount: 0 },
            )
            .catch(() => {})
        return
      }
      if (update._ === 'phoneCallDiscarded') {
        this.incoming.delete(update.id.toString())
        this.publish()
      }
      const call = this.active
      if (!call || call.step === 'ended') return
      if (!call.input && call.outgoing) {
        if (call.earlyUpdates.length < 16) call.earlyUpdates.push(update)
        return
      }
      try {
        await this.apply(call, update)
      } catch (error) {
        if (this.isCurrent(call)) await this.fail(call, error)
      }
    })
  }

  /** Route encrypted updates only to the matching call; bound packets arriving before key verification. */
  async signal(id: string, bytes: Uint8Array): Promise<void> {
    const call = this.active
    if (
      !call ||
      call.step === 'ended' ||
      (call.input && call.input.id.toString() !== id)
    )
      return
    if (
      bytes.length > 128 * 1024 ||
      call.earlyBytes + bytes.length > 256 * 1024 ||
      call.earlyPackets.length >= 64
    ) {
      await this.fail(call, new Error('Too much early call signalling'))
      return
    }
    if (call.signaling) await call.signaling.receive(bytes)
    else {
      call.earlyPackets.push({ id, bytes: Uint8Array.from(bytes) })
      call.earlyBytes += bytes.length
    }
  }

  /** Accept negotiation messages from the sole owning browser. */
  async sendSignal(owner: string, message: CallSignalMessage): Promise<void> {
    const call = this.owned(owner)
    if (!call.signaling) throw new Error('Call keys are not ready')
    await call.signaling.send(message)
  }

  /** Browser media connectivity controls the public active-call phase. */
  connected(owner: string): void {
    const call = this.owned(owner)
    if (call.step !== 'ready') throw new Error('Call keys are not ready')
    call.status.phase = 'active'
    call.status.connectedAt ??= Date.now()
    this.publish()
  }

  mute(owner: string, muted: boolean): void {
    const call = this.owned(owner)
    call.status.muted = muted
    this.publish()
  }

  /** Only the owning socket can end an accepted or outgoing call. */
  async end(owner?: string): Promise<void> {
    const call = this.active
    if (!call || call.step === 'ended') return
    if (owner !== undefined && call.owner !== owner)
      throw new Error('Another operator owns this call')
    call.status.phase = 'ending'
    this.publish()
    await this.finish(call)
    if (call.input)
      await this.discard(
        call.client,
        call.input,
        'phoneCallDiscardReasonHangup',
        call.status.video,
        call.status.connectedAt
          ? Math.floor((Date.now() - call.status.connectedAt) / 1000)
          : 0,
      ).catch(() => {})
  }

  /** Other authorised operators may decline ringing calls, but cannot hang up the owner. */
  async reject(id: string): Promise<void> {
    const requested = this.incoming.get(id),
      client = this.io.client()
    if (!requested || !client)
      throw new Error('This incoming call is no longer available')
    this.incoming.delete(id)
    this.publish()
    await this.discard(
      client,
      { _: 'inputPhoneCall', id: requested.id, accessHash: requested.accessHash },
      'phoneCallDiscardReasonBusy',
      requested.video,
    )
  }

  /** Expire unanswered calls without timers that outlive the account connection. */
  async tick(): Promise<void> {
    const call = this.active
    if (
      call &&
      call.step !== 'ended' &&
      (Date.now() - call.status.startedAt > 2 * 60 * 60_000 ||
        (!call.status.connectedAt && Date.now() - call.status.startedAt > 90_000))
    )
      await this.fail(
        call,
        new Error('The call did not connect or exceeded its duration limit'),
      )
  }

  private async apply(call: ActiveCall, update: tl.TypePhoneCall): Promise<void> {
    if (!this.isCurrent(call) || !call.input?.id.equals(update.id)) return
    if (update._ === 'phoneCallDiscarded') {
      await this.finish(call)
      return
    }
    if (!('accessHash' in update)) return
    if (
      !update.accessHash.equals(call.input.accessHash) ||
      String(call.outgoing ? update.adminId : update.participantId) !==
        this.io.self() ||
      String(call.outgoing ? update.participantId : update.adminId) !== call.status.peer
    )
      throw new Error('Telegram call identity changed')
    if (update._ === 'phoneCallWaiting') {
      if (call.step === 'waiting') {
        call.status.phase = 'ringing'
        this.publish()
      }
      return
    }
    if (update._ === 'phoneCallAccepted' && call.outgoing && call.step === 'waiting') {
      call.step = 'deriving'
      call.protocol = protocol(update.protocol)
      const derived = await call.dh!.derive(update.gB)
      if (!this.isCurrent(call)) {
        derived.key.fill(0)
        return
      }
      call.key = derived.key
      call.fingerprint = derived.fingerprint
      const confirmed = await call.client.call({
        _: 'phone.confirmCall',
        peer: call.input,
        gA: call.dh!.publicValue,
        keyFingerprint: Long.fromString(derived.fingerprint),
        protocol: call.protocol,
      })
      await this.apply(call, confirmed.phoneCall)
      return
    }
    if (update._ !== 'phoneCall' || call.step === 'ready') return
    if (
      update.protocol.libraryVersions.length !== 1 ||
      !call.protocol.libraryVersions.includes(update.protocol.libraryVersions[0])
    )
      throw new Error('Telegram chose an unsupported call protocol')
    if (!call.outgoing) {
      call.step = 'deriving'
      const derived = await call.dh!.derive(update.gAOrB, call.requested!.gAHash)
      if (!this.isCurrent(call)) {
        derived.key.fill(0)
        return
      }
      call.key = derived.key
      call.fingerprint = derived.fingerprint
    }
    if (
      !call.key ||
      !call.fingerprint ||
      update.keyFingerprint.toString() !== call.fingerprint
    )
      throw new Error('Telegram call fingerprint did not match')
    const setup = mediaSetup(update, call.outgoing, call.fingerprint)
    let useSctp = true
    if (update.customParameters) {
      if (update.customParameters.data.length > 8192)
        throw new Error('Invalid call parameters')
      const custom = JSON.parse(update.customParameters.data)
      if (custom.network_kcp_experiment === true)
        throw new Error('Telegram requested an unsupported signalling transport')
      useSctp = custom.network_signaling_nosctp !== true
    }
    call.signaling = new CallSignaling(
      call.key,
      call.outgoing,
      {
        send: async bytes => {
          this.assertCurrent(call)
          await call.client.call({
            _: 'phone.sendSignalingData',
            peer: call.input!,
            data: bytes,
          })
        },
        receive: message => {
          if (this.isCurrent(call))
            this.io.owner(call.owner, { kind: 'signal', message })
        },
        failed: error => {
          if (this.isCurrent(call)) this.io.keepAlive(this.fail(call, error))
        },
        keepAlive: task => this.io.keepAlive(task),
      },
      useSctp,
    )
    call.key.fill(0)
    call.key = undefined
    call.dh?.dispose()
    call.dh = undefined
    call.step = 'ready'
    this.io.owner(call.owner, { kind: 'setup', setup })
    await call.signaling.start()
    for (const packet of call.earlyPackets.splice(0))
      if (packet.id === call.input.id.toString())
        await call.signaling.receive(packet.bytes)
    call.earlyBytes = 0
    this.publish()
  }

  private owned(owner: string): ActiveCall {
    const call = this.active
    if (!call || call.owner !== owner || call.step === 'ended')
      throw new Error('This browser does not own the call')
    return call
  }
  private isCurrent(call: ActiveCall): boolean {
    return (
      this.active === call && call.step !== 'ended' && this.io.client() === call.client
    )
  }
  private assertCurrent(call: ActiveCall): void {
    if (!this.isCurrent(call)) throw new Error('Call attempt was cancelled')
  }
  private publish(): void {
    this.io.publish(this.snapshot())
  }

  /** Provider responses and push updates share one transition queue, including duplicate confirmations. */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.updateCount++
    const task = this.updates.then(operation).finally(() => {
      this.updateCount--
    })
    this.updates = task.catch(() => {})
    return task
  }

  private async finish(call: ActiveCall): Promise<void> {
    call.step = 'ended'
    call.status.phase = 'ended'
    call.dh?.dispose()
    call.dh = undefined
    call.key?.fill(0)
    call.key = undefined
    call.earlyPackets = []
    call.earlyUpdates = []
    call.earlyBytes = 0
    await call.signaling?.close()
    call.signaling = undefined
    this.publish()
  }

  private async fail(call: ActiveCall, _error: unknown): Promise<void> {
    call.status.error =
      'Telegram could not complete this call. Check its status before trying again.'
    this.io.owner(call.owner, { kind: 'error', message: call.status.error })
    await this.finish(call)
    if (call.input)
      await this.discard(
        call.client,
        call.input,
        'phoneCallDiscardReasonDisconnect',
        call.status.video,
      ).catch(() => {})
  }

  private async discard(
    client: TelegramClient,
    peer: tl.RawInputPhoneCall,
    reason:
      | 'phoneCallDiscardReasonHangup'
      | 'phoneCallDiscardReasonBusy'
      | 'phoneCallDiscardReasonDisconnect',
    video?: boolean,
    duration = 0,
  ): Promise<void> {
    await client.call(
      {
        _: 'phone.discardCall',
        peer,
        reason: { _: reason },
        video,
        duration,
        connectionId: Long.ZERO,
      },
      { timeout: 5000, maxRetryCount: 0 },
    )
  }
}
