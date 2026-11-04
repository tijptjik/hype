// MEDIA
import captureUrl from './voiceCapture.worklet.js?url&no-inline'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// - Audio IO contract and WebCodecs boundary
// - BrowserVoiceAudio
// - opusDuration

export interface VoiceAudio {
  start(): Promise<void>
  play(packet: ArrayBuffer): void
  mute(muted: boolean): void
  close(): void
}
interface DecodedAudio {
  numberOfFrames: number; numberOfChannels: number; sampleRate: number
  copyTo(destination: Float32Array, options: { planeIndex: number; format: 'f32-planar' }): void
  close(): void
}
interface OpusDecoder {
  configure(config: { codec: 'opus'; sampleRate: number; numberOfChannels: number }): void
  decode(chunk: unknown): void
  close(): void
  decodeQueueSize: number
}
interface Codecs {
  AudioDecoder?: new (options: { output(frame: DecodedAudio): void; error(error: Error): void }) => OpusDecoder
  EncodedAudioChunk?: new (options: { type: 'key'; timestamp: number; duration: number; data: Uint8Array }) => unknown
}

/** Own microphone and bounded playback resources for one explicit call.
 * @remarks AudioContext starts inside the click handler, before remote ticket I/O.
 */
export class BrowserVoiceAudio implements VoiceAudio {
  private context?: AudioContext
  private stream?: MediaStream
  private source?: MediaStreamAudioSourceNode
  private capture?: AudioWorkletNode
  private closed = false
  private muted = false
  private nextPlayback = 0
  private playing = new Set<AudioBufferSourceNode>()
  private decoder?: OpusDecoder
  private channels = 0
  private opusTimestamp = 0

  /** @param send Deliver one 960-sample microphone frame. @param fail End the call on unusable media. */
  constructor(private readonly send: (packet: ArrayBuffer) => void, private readonly fail: (message: string) => void, private readonly microphoneId = 'default') {}

  /** Acquire the microphone only on explicit start/answer; late permission grants are disposed. */
  async start(): Promise<void> {
    if (this.closed) return
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') throw new Error('This browser cannot make voice calls')
    const context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' })
    this.context = context
    if (context.sampleRate !== 16000) { this.close(); throw new Error('This browser does not support the call audio format') }
    const resumed = context.resume()
    // Avoid an unhandled rejection while the microphone permission prompt is open.
    void resumed.catch(() => {})
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(this.microphoneId) }).catch(error => { throw new Error(microphoneErrorMessage(error)) })
      if (this.closed) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      await resumed
      await context.audioWorklet.addModule(captureUrl)
      if (this.closed) return
      this.source = context.createMediaStreamSource(stream)
      this.capture = new AudioWorkletNode(context, 'whatsover-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' })
      this.capture.port.onmessage = event => {
        if (!this.closed && event.data instanceof ArrayBuffer) {
          this.send(event.data)
          this.capture?.port.postMessage('ack')
        }
      }
      this.capture.onprocessorerror = () => this.fail('Microphone audio processing failed')
      this.source.connect(this.capture)
      this.capture.connect(context.destination) // Worklet output is silence; no microphone feedback.
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => { if (!this.closed) this.fail('The microphone disconnected') })
      context.addEventListener('statechange', () => { if (!this.closed && context.state !== 'running') this.fail('Audio was interrupted. Please start the call again.') })
      this.mute(this.muted)
    } catch (error) { this.close(); throw error }
  }

  /** Play private PCM or Opus frames; cap queued audio to avoid accumulating latency.
   * @param packet Leading byte 0 is 16 kHz PCM; 1 is a standard Opus packet.
   */
  play(packet: ArrayBuffer): void {
    if (this.closed || !this.context) return
    const bytes = new Uint8Array(packet)
    if (bytes.length < 2 || bytes.length > 8192) throw new Error('Invalid call audio frame')
    if (bytes[0] === 0) {
      if ((bytes.length - 1) % 2) throw new Error('Invalid PCM frame')
      const view = new DataView(packet, 1)
      const samples = new Float32Array((bytes.length - 1) / 2)
      for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768
      this.enqueue(samples, 16000)
      return
    }
    if (bytes[0] !== 1) throw new Error('Unsupported call audio format')
    const codecs = globalThis as unknown as Codecs
    if (!codecs.AudioDecoder || !codecs.EncodedAudioChunk) throw new Error('This browser cannot decode the caller’s audio. Use a recent Chrome or Edge browser.')
    const payload = bytes.subarray(1)
    const channels = payload[0] & 4 ? 2 : 1
    if (!this.decoder || channels !== this.channels) {
      this.decoder?.close()
      this.channels = channels
      this.decoder = new codecs.AudioDecoder({ output: frame => {
        try {
          if (this.closed) return
          const mono = new Float32Array(frame.numberOfFrames)
          for (let channel = 0; channel < frame.numberOfChannels; channel++) {
            const plane = new Float32Array(frame.numberOfFrames)
            frame.copyTo(plane, { planeIndex: channel, format: 'f32-planar' })
            for (let index = 0; index < mono.length; index++) mono[index] += plane[index] / frame.numberOfChannels
          }
          this.enqueue(mono, frame.sampleRate)
        } catch { this.fail('Could not play the caller’s audio') }
        finally { frame.close() }
      }, error: () => this.fail('Could not decode the caller’s audio') })
      this.decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: channels })
    }
    if (this.decoder.decodeQueueSize >= 8) return
    const duration = opusDuration(payload)
    this.decoder.decode(new codecs.EncodedAudioChunk({ type: 'key', timestamp: this.opusTimestamp, duration, data: payload }))
    this.opusTimestamp += duration
  }

  /** Stop microphone samples immediately, independently of remote mute acknowledgement. */
  mute(muted: boolean): void { this.muted = muted; this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted }) }

  /** Release every media resource, including a late microphone permission result. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = undefined
    this.source?.disconnect()
    if (this.capture) { this.capture.port.onmessage = null; this.capture.port.close(); this.capture.disconnect() }
    for (const source of this.playing) { try { source.stop() } catch {} }
    this.playing.clear()
    try { this.decoder?.close() } catch {}
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
  }

  /** Schedule only a short playback window; discard stale queued audio after a stall. */
  private enqueue(samples: Float32Array, rate: number): void {
    const context = this.context
    if (!context || this.closed || !samples.length) return
    if (this.nextPlayback - context.currentTime > 0.3) {
      for (const source of this.playing) { try { source.stop() } catch {} }
      this.playing.clear(); this.nextPlayback = context.currentTime
    }
    const buffer = context.createBuffer(1, samples.length, rate)
    buffer.copyToChannel(Float32Array.from(samples), 0)
    const source = context.createBufferSource()
    source.buffer = buffer; source.connect(context.destination)
    this.playing.add(source)
    source.onended = () => { source.disconnect(); this.playing.delete(source) }
    const at = Math.max(context.currentTime + 0.015, this.nextPlayback)
    source.start(at); this.nextPlayback = at + buffer.duration
  }
}

/** Request the chosen input without silently switching to a different microphone.
 * @param deviceId Browser-scoped input ID, or the system default.
 * @returns Voice-friendly capture constraints; the AudioContext handles resampling.
 */
export function microphoneConstraints(deviceId: string): MediaTrackConstraints {
  return { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}) }
}

/** Translate capture failures into actions the user can take before dialing.
 * @param error Browser capture error.
 * @returns User-facing microphone guidance.
 */
export function microphoneErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
  if (name === 'NotReadableError' || name === 'AbortError') return 'The browser could not open this microphone. It may be busy or unavailable. Choose another input and use Test microphone before calling again.'
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access is blocked. Allow microphone access in the browser’s site settings, then test it again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'The selected microphone is unavailable. Connect it or choose another input.'
  return error instanceof Error ? error.message : 'Could not open the microphone. Choose an input and test it again.'
}

/** Decode Opus TOC duration, in microseconds, for monotonic WebCodecs timestamps.
 * @param packet Standard Opus payload, without the transport discriminator.
 */
export function opusDuration(packet: Uint8Array): number {
  if (!packet.length) throw new Error('Empty Opus frame')
  const config = packet[0] >> 3
  const frame = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3]
  const code = packet[0] & 3
  const count = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 63 : 2
  const duration = frame * count
  if (!count || duration > 120) throw new Error('Invalid Opus duration')
  return duration * 1000
}
