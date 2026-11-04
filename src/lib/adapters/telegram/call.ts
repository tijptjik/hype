// NEGOTIATION
import {
  localSetup,
  parseSignal,
  TelegramNegotiation,
  type InitialSetup,
  type Negotiation,
  type Signal,
} from './negotiation.js'
// TYPES
import type {
  VoiceStart,
  VoiceCallbacks,
  VoiceController,
} from '#lib/adapters/whatsapp/voiceCall.js'
import type { WhatsAppVoiceTicket } from '#lib/api/services/whatsover.types.js'

interface Setup {
  outgoing: boolean
  video: boolean
  p2pAllowed: boolean
  iceServers: RTCIceServer[]
  fingerprint: string
}
interface Dependencies {
  ticket(): Promise<WhatsAppVoiceTicket>
  socket(url: string, protocols: string[]): WebSocket
  media(constraints: MediaStreamConstraints): Promise<MediaStream>
  peer(configuration: RTCConfiguration): RTCPeerConnection
  audio(): HTMLAudioElement
}

/** Browser media remains WebRTC end-to-end; the Worker socket carries signalling only. */
export class TelegramBrowserCall implements VoiceController {
  private closed = false
  private started = false
  private input?: VoiceStart
  private socket?: WebSocket
  private peer?: RTCPeerConnection
  private stream?: MediaStream
  private remote?: MediaStream
  private audio?: HTMLAudioElement
  private setup?: Setup
  private remoteSetup?: InitialSetup
  private localSetupSent = false
  private readonly negotiation = new TelegramNegotiation()
  private pendingOffer?: string
  private sentOwnOffer = false
  private tracksAdded = false
  private handled = new Set<string>()
  private pendingNegotiations: Negotiation[] = []
  private candidates: string[] = []
  private candidateCount = 0
  private signalCount = 0
  private queued = 0
  private processing: Promise<void> = Promise.resolve()
  private heartbeat?: ReturnType<typeof setInterval>
  private deadline?: ReturnType<typeof setTimeout>
  private disconnectDeadline?: ReturnType<typeof setTimeout>
  private lastPong = 0
  private rejectReady?: (error: Error) => void
  private muted = false
  private cameraEnabled = false

  /** @param callbacks UI projections. @param deps Browser IO, injectable for cancellation tests. @param microphoneId User-selected input. */
  constructor(
    private readonly callbacks: VoiceCallbacks,
    private readonly deps: Dependencies,
    private readonly microphoneId = 'default',
  ) {}

  /** @param callbacks Shared inbox callbacks. @param ticket Account-scoped ticket issuer. @param microphoneId Selected microphone. @returns An unstarted call attempt. */
  static create(
    callbacks: VoiceCallbacks,
    ticket: Dependencies['ticket'],
    microphoneId = 'default',
  ): TelegramBrowserCall {
    return new TelegramBrowserCall(
      callbacks,
      {
        ticket,
        socket: (url, protocols) => new WebSocket(url, protocols),
        media: constraints => navigator.mediaDevices.getUserMedia(constraints),
        peer: config => new RTCPeerConnection(config),
        audio: () => new Audio(),
      },
      microphoneId,
    )
  }

  /** @returns Whether native WebRTC and microphone capture exist; WebCodecs is not required. */
  static supported(): boolean {
    return (
      typeof RTCPeerConnection !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    )
  }

  /** @param input Immutable explicit call action. @returns After submitting once; errors are shown through callbacks. */
  async start(input: VoiceStart): Promise<void> {
    if (this.started || this.closed)
      throw new Error('This call attempt cannot be reused')
    this.started = true
    this.input = input
    this.cameraEnabled = input.video === true
    try {
      const stream = await this.deps.media({
        audio: {
          ...(this.microphoneId === 'default'
            ? {}
            : { deviceId: { exact: this.microphoneId } }),
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: input.video
          ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
      })
      if (this.closed) {
        stream.getTracks().forEach(track => {
          track.stop()
        })
        return
      }
      this.stream = stream
      this.audio = this.deps.audio()
      this.audio.autoplay = true
      this.callbacks.video?.(input.video ? stream : null, null)
      const ticket = await this.deps.ticket()
      if (this.closed) return
      if (ticket.expiresAt <= Date.now()) throw new Error('The call connection expired')
      const socket = this.deps.socket(ticket.url, [
        'hype.telegram.v1',
        `token.${ticket.token}`,
      ])
      this.socket = socket
      socket.addEventListener('message', this.message)
      socket.addEventListener('error', this.disconnected)
      socket.addEventListener('close', this.disconnected)
      await new Promise<void>((resolve, reject) => {
        this.rejectReady = reject
        this.deadline = setTimeout(
          () => this.fail('The Telegram call connection timed out'),
          15_000,
        )
        socket.addEventListener(
          'open',
          () => {
            if (this.closed) return
            if (socket.protocol !== 'hype.telegram.v1') {
              this.fail('The Telegram call protocol was not accepted')
              return
            }
            clearTimeout(this.deadline)
            this.rejectReady = undefined
            this.lastPong = Date.now()
            this.deadline = setTimeout(
              () => this.fail('The Telegram call did not connect'),
              90_000,
            )
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastPong > 25_000) this.disconnected()
              else this.send('ping')
            }, 10_000)
            this.send(input)
            resolve()
          },
          { once: true },
        )
      })
    } catch (error) {
      if (!this.closed)
        this.fail(
          error instanceof Error ? error.message : 'Could not start the Telegram call',
        )
    }
  }

  /** @param muted Immediately gate the microphone and inform the peer and shared inbox. */
  mute(muted: boolean): void {
    this.muted = muted
    this.stream?.getAudioTracks().forEach(track => {
      track.enabled = !muted
    })
    if (this.setup) {
      this.send({ kind: 'mute', muted })
      this.mediaState()
    }
  }
  /** @param enabled Gate camera capture without renegotiating channels. */
  camera(enabled: boolean): void {
    this.cameraEnabled = enabled
    this.stream?.getVideoTracks().forEach(track => {
      track.enabled = enabled
    })
    this.mediaState()
  }

  /** Release resources even when permission or ticket promises resolve after cancellation. */
  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      if (this.socket?.readyState === 1 && this.socket.bufferedAmount <= 256 * 1024)
        this.socket.send('{"kind":"end"}')
    } catch {
      /* Transport already failed. */
    }
    clearInterval(this.heartbeat)
    clearTimeout(this.deadline)
    clearTimeout(this.disconnectDeadline)
    this.rejectReady?.(new Error('Call cancelled'))
    this.rejectReady = undefined
    this.peer?.close()
    this.stream?.getTracks().forEach(track => {
      track.stop()
    })
    this.remote?.getTracks().forEach(track => {
      track.stop()
    })
    if (this.audio) {
      this.audio.pause()
      this.audio.srcObject = null
    }
    this.socket?.removeEventListener('message', this.message)
    this.socket?.removeEventListener('error', this.disconnected)
    this.socket?.removeEventListener('close', this.disconnected)
    try {
      this.socket?.close(1000, 'Call ended')
    } catch {
      /* Already closed. */
    }
    this.candidates = []
    this.pendingNegotiations = []
    this.callbacks.video?.(null, null)
    this.callbacks.closed()
  }

  /** Bound and serialize peer-controlled messages, including async browser SDP operations. */
  private message = (event: MessageEvent): void => {
    if (this.closed) return
    if (event.data === 'pong') {
      this.lastPong = Date.now()
      return
    }
    if (
      typeof event.data !== 'string' ||
      event.data.length > 65536 ||
      ++this.queued > 64
    ) {
      this.fail('Invalid Telegram call event')
      return
    }
    this.processing = this.processing
      .then(async () => {
        if (this.closed) return
        const value = JSON.parse(event.data)
        if (value.kind === 'error') {
          this.fail(
            typeof value.message === 'string' ? value.message : 'Telegram call failed',
          )
          return
        }
        if (value.kind === 'snapshot' && Array.isArray(value.incoming)) {
          this.callbacks.snapshot({
            incoming: value.incoming,
            current: value.current ?? null,
            videoSupported: value.videoSupported === true,
          })
          if (
            value.current?.requestId === this.input?.requestId &&
            value.current.phase === 'ended'
          )
            this.close()
        } else if (value.kind === 'setup') await this.initialize(value.setup)
        else if (value.kind === 'signal') {
          if (++this.signalCount > 512)
            throw new Error('Too many Telegram media events')
          await this.signal(parseSignal(value.message))
        } else throw new Error('Invalid Telegram call state')
      })
      .catch(() => this.fail('Telegram media negotiation failed'))
      .finally(() => {
        this.queued--
      })
  }

  /** Allocate a peer only after the bridge verifies Telegram's DH commitment and fingerprint. */
  private async initialize(setup: Setup): Promise<void> {
    if (
      this.peer ||
      !setup ||
      typeof setup.outgoing !== 'boolean' ||
      typeof setup.p2pAllowed !== 'boolean' ||
      !Array.isArray(setup.iceServers) ||
      setup.iceServers.length > 128 ||
      setup.outgoing !== (this.input?.kind === 'outgoing')
    )
      throw new Error('Invalid Telegram call setup')
    this.setup = setup
    const peer = this.deps.peer({
      iceServers: setup.iceServers,
      iceTransportPolicy: setup.p2pAllowed ? 'all' : 'relay',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    this.peer = peer
    peer.onicecandidate = event => {
      if (event.candidate && !this.closed)
        this.emit({
          '@type': 'Candidates',
          candidates: [{ sdpString: event.candidate.candidate }],
        })
    }
    peer.ontrack = event => {
      if (this.closed) {
        event.track.stop()
        return
      }
      this.remote ??= new MediaStream()
      this.remote.addTrack(event.track)
      if (event.track.kind === 'audio' && this.audio) {
        this.audio.srcObject = new MediaStream(this.remote.getAudioTracks())
        void this.audio
          .play()
          .catch(() =>
            this.fail('Allow audio playback in your browser to hear the call'),
          )
      }
      this.callbacks.video?.(
        this.input?.video ? (this.stream ?? null) : null,
        new MediaStream(this.remote.getVideoTracks()),
      )
    }
    peer.onconnectionstatechange = () => {
      if (this.closed) return
      if (peer.connectionState === 'connected') {
        clearTimeout(this.deadline)
        clearTimeout(this.disconnectDeadline)
        this.send({ kind: 'connected' })
        this.mediaState()
      } else if (peer.connectionState === 'failed')
        this.fail('Telegram media connection failed')
      else if (peer.connectionState === 'disconnected') {
        clearTimeout(this.disconnectDeadline)
        this.disconnectDeadline = setTimeout(
          () => this.fail('Telegram media connection lost'),
          15_000,
        )
      }
    }
    if (setup.outgoing) {
      this.addTracks()
      await this.offer()
    }
  }

  /** Add distinct send-only transceivers; Telegram offers its receive direction separately. */
  private addTracks(): void {
    if (this.tracksAdded || !this.peer || !this.stream) return
    this.tracksAdded = true
    for (const track of this.stream.getTracks()) {
      const transceiver = this.peer.addTransceiver(track, {
        direction: 'sendonly',
        streams: [this.stream],
      })
      const codecs = RTCRtpSender.getCapabilities(track.kind)?.codecs.filter(
        c =>
          c.mimeType.toLowerCase() ===
          (track.kind === 'audio' ? 'audio/opus' : 'video/vp8'),
      )
      if (!codecs?.length || !transceiver.setCodecPreferences)
        throw new Error('This browser lacks the required Telegram codec')
      transceiver.setCodecPreferences(codecs)
    }
  }

  /** Create the one initial local media offer; call initiator wins simultaneous offers. */
  private async offer(): Promise<void> {
    const peer = this.peer!
    if (this.sentOwnOffer || this.closed) return
    this.sentOwnOffer = true
    await peer.setLocalDescription(await peer.createOffer())
    if (this.closed) return
    const sdp = peer.localDescription!.sdp
    this.sendSetup(sdp)
    this.pendingOffer = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
    this.emit({
      '@type': 'NegotiateChannels',
      exchangeId: this.pendingOffer,
      contents: this.negotiation.offer(sdp),
    })
  }

  /** Apply transport before buffered channels/candidates; never change an authenticated fingerprint. */
  private async signal(message: Signal): Promise<void> {
    if (!this.peer || !this.setup) throw new Error('Telegram media is not ready')
    if (message['@type'] === 'InitialSetup') {
      if (
        this.remoteSetup &&
        JSON.stringify(message) !== JSON.stringify(this.remoteSetup)
      )
        throw new Error('Telegram transport changed during the call')
      this.remoteSetup = message
      for (const pending of this.pendingNegotiations.splice(0))
        await this.negotiate(pending)
    } else if (message['@type'] === 'NegotiateChannels') {
      if (!this.remoteSetup) {
        if (this.pendingNegotiations.length >= 4)
          throw new Error('Too many early negotiations')
        this.pendingNegotiations.push(message)
      } else await this.negotiate(message)
    } else if (message['@type'] === 'Candidates') {
      for (const candidate of message.candidates) {
        if (++this.candidateCount > 128)
          throw new Error('Too many Telegram ICE candidates')
        // Native reflector endpoints are not RFC TURN. Browser transport uses
        // the standard Telegram-issued WebRTC TURN endpoints from call setup.
        if (candidate.sdpString.includes('.reflector')) continue
        this.candidates.push(candidate.sdpString.replace(/^a=/, ''))
      }
      await this.flushCandidates()
    }
  }

  /** Translate independent channel offers into stable browser send/receive sections. */
  private async negotiate(message: Negotiation): Promise<void> {
    if (this.handled.has(message.exchangeId)) return
    const peer = this.peer!,
      outgoing = this.setup!.outgoing,
      answer = message.exchangeId === this.pendingOffer
    if (!answer && this.pendingOffer && outgoing) return
    if (!answer && peer.signalingState === 'have-local-offer') {
      await peer.setLocalDescription({ type: 'rollback' })
      this.pendingOffer = undefined
      this.sentOwnOffer = false
    }
    const sdp = this.negotiation.description(
      this.remoteSetup!,
      message,
      peer.localDescription?.sdp ?? '',
      answer,
      outgoing,
    )
    await peer.setRemoteDescription({ type: answer ? 'answer' : 'offer', sdp })
    if (this.closed) return
    await this.flushCandidates()
    if (answer) this.pendingOffer = undefined
    else {
      // Newly created remote transceivers receive only. Add local senders after
      // applying the first offer so the browser cannot consume them as receivers.
      for (const t of peer.getTransceivers())
        if (!t.sender.track) t.direction = 'recvonly'
      this.addTracks()
      const localAnswer = await peer.createAnswer()
      localAnswer.sdp = localAnswer.sdp!.replace(
        /a=setup:active/g,
        `a=setup:${outgoing ? 'active' : 'passive'}`,
      )
      await peer.setLocalDescription(localAnswer)
      if (this.closed) return
      this.sendSetup(peer.localDescription!.sdp)
      this.emit({
        '@type': 'NegotiateChannels',
        exchangeId: message.exchangeId,
        contents: this.negotiation.answer(peer.localDescription!.sdp, message),
      })
      await this.offer()
    }
    this.handled.add(message.exchangeId)
    this.mediaState()
  }

  /** Flush trickle ICE only once the browser has a remote transport description. */
  private async flushCandidates(): Promise<void> {
    if (!this.peer?.remoteDescription) return
    const mid = this.peer.remoteDescription.sdp.match(/a=mid:([^\r\n]+)/)?.[1]
    for (const candidate of this.candidates.splice(0)) {
      if (this.closed) return
      await this.peer.addIceCandidate({ candidate, sdpMid: mid, sdpMLineIndex: 0 })
    }
  }

  /** Send stable transport once, independent of later media-only negotiations. */
  private sendSetup(sdp: string): void {
    if (!this.localSetupSent) {
      this.localSetupSent = true
      this.emit(localSetup(sdp))
    }
  }
  /** Report media gating over the encrypted signalling channel. */
  private mediaState(): void {
    if (this.setup)
      this.emit({
        '@type': 'MediaState',
        muted: this.muted,
        lowBattery: false,
        videoState: this.input?.video
          ? this.cameraEnabled
            ? 'active'
            : 'suspended'
          : 'inactive',
        screencastState: 'inactive',
        videoRotation: 0,
      })
  }
  /** Wrap a validated negotiation message for the private call owner socket. */
  private emit(message: Signal): void {
    this.send({ kind: 'signal', message })
  }
  /** Bound outbound buffering; a failed socket is never automatically retried. */
  private send(value: unknown): void {
    if (this.closed || this.socket?.readyState !== 1) return
    try {
      if (this.socket.bufferedAmount > 256 * 1024)
        throw new Error('Call transport overloaded')
      this.socket.send(typeof value === 'string' ? value : JSON.stringify(value))
    } catch {
      this.fail('Telegram call connection lost')
    }
  }
  private disconnected = (): void => {
    this.fail('Telegram call connection lost. Check call status before trying again.')
  }
  /** Surface one sanitized failure and close all media resources. */
  private fail(message: string): void {
    if (!this.closed) {
      this.callbacks.error(message)
      this.close()
    }
  }
}
