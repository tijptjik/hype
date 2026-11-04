// MEDIA
import { BrowserVoiceAudio } from './voiceAudio.js'
import { BrowserVoiceVideo, type VoiceVideo } from './voiceVideo.js'
// TYPES
import type { VoiceAudio } from './voiceAudio.js'
import type { WhatsAppCalls, WhatsAppVoiceTicket } from '#lib/api/services/whatsover.types.js'

export type VoiceStart = { kind: 'outgoing'; requestId: string; to: string; video?: boolean } | { kind: 'answer'; requestId: string; id: string; video?: boolean }
export interface VoiceCallbacks {
  snapshot(value: WhatsAppCalls): void
  error(message: string): void
  closed(): void
  video?(local: MediaStream | null, remote: MediaStream | null): void
}
/** Common call actions shared by provider-specific browser transports. */
export interface VoiceController {
  start(input: VoiceStart): Promise<void>
  mute(muted: boolean): void
  camera(enabled: boolean): void
  close(): void
}
interface VoiceDependencies {
  ticket(): Promise<WhatsAppVoiceTicket>
  socket(url: string, protocols: string[]): WebSocket
  video?(send: (packet: ArrayBuffer) => boolean, streams: (local: MediaStream | null, remote: MediaStream | null) => void, fail: (message: string) => void, keyframe: () => void): VoiceVideo
  audio(send: (packet: ArrayBuffer) => void, fail: (message: string) => void): VoiceAudio
}

/** One explicit call attempt; disconnect never automatically retries signaling.
 * @remarks Ticket data stays in memory and WebSocket subprotocols, never in URLs.
 */
export class BrowserVoiceCall {
  private video?: VoiceVideo
  private videoMode = false
  private lastKeyframeRequest = 0
  private audio?: VoiceAudio
  private socket?: WebSocket
  private closed = false
  private heartbeat?: ReturnType<typeof setInterval>
  private deadline?: ReturnType<typeof setTimeout>
  private lastPong = 0
  private requestId = ''
  private submitted = false
  private rejectReady?: (error: Error) => void

  /** @param callbacks UI projections and sanitized failures. @param deps Account ticket issuer and optional test IO. */
  constructor(private readonly callbacks: VoiceCallbacks, private readonly deps: VoiceDependencies) {}

  /** Create the production browser adapters without starting audio or network activity. */
  static create(callbacks: VoiceCallbacks, ticket: VoiceDependencies['ticket'], microphoneId = 'default'): BrowserVoiceCall {
    return new BrowserVoiceCall(callbacks, { ticket, socket: (url, protocols) => new WebSocket(url, protocols), audio: (send, fail) => new BrowserVoiceAudio(send, fail, microphoneId), video: (send, streams, fail, keyframe) => new BrowserVoiceVideo(send, streams, fail, keyframe) })
  }

  /** Capture audio, obtain a ticket, and submit exactly one start or answer action.
   * @param input Immutable user-approved call attempt.
   */
  async start(input: VoiceStart): Promise<void> {
    if (this.audio || this.closed) throw new Error('This call attempt cannot be reused')
    this.requestId = input.requestId
    this.videoMode = input.video === true
    this.audio = this.deps.audio(packet => {
      if (!this.closed && this.submitted && this.socket?.readyState === 1 && this.socket.bufferedAmount < (this.videoMode ? 256 * 1024 : 4 * 1920)) {
        if (this.videoMode) { const framed = new Uint8Array(packet.byteLength + 1); framed.set(new Uint8Array(packet), 1); this.socket.send(framed) }
        else this.socket.send(packet)
      }
    }, message => this.fail(message))
    try {
      await this.audio.start()
      if (this.closed) return
      if (this.videoMode) {
        if (!this.deps.video) throw new Error('Video is not supported in this browser')
        this.video = this.deps.video(packet => {
          if (this.closed || !this.submitted || this.socket?.readyState !== 1 || this.socket.bufferedAmount > 128 * 1024) return false
          try { this.socket.send(packet); return true } catch { this.fail('Video connection lost'); return false }
        }, (local, remote) => this.callbacks.video?.(local, remote), message => this.fail(message), () => {
          if (!this.closed && this.socket?.readyState === 1 && Date.now() - this.lastKeyframeRequest >= 1000) {
            this.lastKeyframeRequest = Date.now(); this.socket.send('{"kind":"keyframe"}')
          }
        })
        await this.video.start()
        if (this.closed) return
      }
      const ticket = await this.deps.ticket()
      if (this.closed) return
      if (ticket.expiresAt <= Date.now()) throw new Error('The voice connection expired. Please try again.')
      const socket = this.deps.socket(ticket.url, ['whatsover.v1', `token.${ticket.token}`])
      this.socket = socket; socket.binaryType = 'arraybuffer'
      socket.addEventListener('message', this.message)
      socket.addEventListener('error', this.disconnected)
      socket.addEventListener('close', this.disconnected)
      await new Promise<void>((resolve, reject) => {
        this.rejectReady = reject
        this.deadline = setTimeout(() => { this.fail('Could not establish the voice connection'); }, 15_000)
        socket.addEventListener('open', () => {
          if (this.closed) return
          if (socket.protocol !== 'whatsover.v1') { this.fail('The voice connection protocol was not accepted'); return }
          clearTimeout(this.deadline); this.rejectReady = undefined
          this.lastPong = Date.now()
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastPong > 25_000) { this.fail('Voice connection lost. Check call status before trying again.'); return }
            try { socket.send('ping') } catch { this.disconnected() }
          }, 10_000)
          try { socket.send(JSON.stringify(input)); this.submitted = true; resolve() }
          catch { reject(new Error('Could not submit the call')); this.close() }
        }, { once: true })
      })
    } catch (error) {
      if (!this.closed) this.fail(error instanceof Error ? error.message : 'Could not start the call')
    }
  }

  /** Apply local microphone gating immediately and request matching remote mute state. */
  mute(muted: boolean): void {
    if (this.closed) return
    this.audio?.mute(muted)
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ kind: 'mute', muted }))
  }

  /** Toggle outgoing camera content without ending audio or the peer video. */
  camera(enabled: boolean): void { if (!this.closed) this.video?.camera(enabled) }

  /** Hang up, close transport and release the microphone, including during permission/ticket waits. */
  close(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat); clearTimeout(this.deadline)
    this.rejectReady?.(new Error('Call cancelled')); this.rejectReady = undefined
    this.audio?.close()
    this.video?.close()
    const socket = this.socket
    if (socket) {
      socket.removeEventListener('message', this.message)
      socket.removeEventListener('close', this.disconnected)
      socket.removeEventListener('error', this.disconnected)
      try { if (socket.readyState === 1 && this.submitted) socket.send('{"kind":"end"}') } catch {}
      try { socket.close(1000, 'Call ended') } catch {}
    }
    this.callbacks.closed()
  }

  /** Parse only the account's bounded UI projection, never protocol internals. */
  private message = (event: MessageEvent): void => {
    if (this.closed) return
    try {
      if (event.data instanceof ArrayBuffer) {
        const kind = new Uint8Array(event.data)[0]
        if (kind === 2) {
          try { this.video?.play(event.data) } finally { if (this.socket?.readyState === 1) this.socket.send('video-ack') }
        } else if (kind === 4) this.video?.play(event.data)
        else if (kind === 3) this.video?.keyframe()
        else this.audio?.play(event.data)
        return
      }
      if (typeof event.data !== 'string' || event.data.length > 8192) throw new Error('Invalid voice event')
      if (event.data === 'pong') { this.lastPong = Date.now(); return }
      const value = JSON.parse(event.data)
      if (value.kind === 'error' && typeof value.message === 'string') { this.fail(value.message); return }
      if (value.kind !== 'snapshot' || !Array.isArray(value.incoming)) throw new Error('Invalid voice state')
      this.callbacks.snapshot({ videoSupported: value.videoSupported === true, incoming: value.incoming, current: value.current ?? null })
      if (value.current?.requestId === this.requestId && value.current.phase === 'ended') this.close()
    } catch (error) { this.fail(error instanceof Error ? error.message : 'Could not play call audio') }
  }

  private disconnected = (): void => { this.fail('Voice connection lost. Check call status before trying again.') }
  private fail(message: string): void { if (!this.closed) { this.callbacks.error(message); this.close() } }
}
