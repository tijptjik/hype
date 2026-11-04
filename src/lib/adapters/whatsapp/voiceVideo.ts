const config: VideoEncoderConfig = {
  codec: 'avc1.42E01F',
  width: 640,
  height: 360,
  bitrate: 500_000,
  framerate: 15,
  latencyMode: 'realtime',
  avc: { format: 'annexb' },
}
const maximumFrame = 512 * 1024 + 7

export interface VoiceVideo {
  start(): Promise<void>
  play(packet: ArrayBuffer): void
  keyframe(): void
  camera(enabled: boolean): void
  close(): void
}

/** Browser H.264 endpoints. Only encoded Annex-B units cross the private call socket.
 * @remarks Camera capture begins only after an explicit video call or video answer action.
 */
export class BrowserVoiceVideo implements VoiceVideo {
  private closed = false
  private stream?: MediaStream
  private preview?: HTMLVideoElement
  private encoder?: VideoEncoder
  private decoder?: VideoDecoder
  private capture?: HTMLCanvasElement
  private remote?: HTMLCanvasElement
  private remoteStream?: MediaStream
  private animation = 0
  private lastCapture = 0
  private lastKeyframe = 0
  private needsKeyframe = true
  private waitingForKeyframe = true
  private decodeTimestamp = 0
  private orientation = new Map<number, number>()
  private announcedRemote = false
  private peerPaused = false

  /** @param send Returns false when transport drops a frame. @param streams Own local/remote preview state.
   * @param fail Close the call on capture failure. @param requestKeyframe Ask the peer to recover decoding.
   */
  constructor(
    private readonly send: (packet: ArrayBuffer) => boolean,
    private readonly streams: (
      local: MediaStream | null,
      remote: MediaStream | null,
    ) => void,
    private readonly fail: (message: string) => void,
    private readonly requestKeyframe: () => void,
  ) {}

  /** Check codecs without opening a camera or issuing network requests. */
  static async supported(): Promise<boolean> {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof VideoEncoder === 'undefined' ||
      typeof VideoDecoder === 'undefined'
    )
      return false
    try {
      return Boolean(
        (await VideoEncoder.isConfigSupported(config)).supported &&
          (
            await VideoDecoder.isConfigSupported({
              codec: config.codec,
              optimizeForLatency: true,
            })
          ).supported,
      )
    } catch {
      return false
    }
  }

  /** Acquire the camera and prepare both directions, disposing late permission results. */
  async start(): Promise<void> {
    if (!(await BrowserVoiceVideo.supported()))
      throw new Error(
        'This browser cannot encode WhatsApp video. Use a recent Chrome or Edge browser.',
      )
    if (this.closed) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 15 },
          facingMode: 'user',
        },
        audio: false,
      })
      if (this.closed) {
        stream.getTracks().forEach(track => {
          track.stop()
        })
        return
      }
      this.stream = stream
      this.preview = document.createElement('video')
      this.preview.muted = true
      this.preview.playsInline = true
      this.preview.srcObject = stream
      await this.preview.play()
      if (this.closed) return
      this.capture = document.createElement('canvas')
      this.capture.width = 640
      this.capture.height = 360
      this.remote = document.createElement('canvas')
      this.remote.width = 640
      this.remote.height = 360
      this.remoteStream = this.remote.captureStream(15)
      this.decoder = this.makeDecoder()
      this.encoder = new VideoEncoder({
        output: chunk => {
          if (this.closed) return
          if (chunk.byteLength > maximumFrame - 7) {
            this.needsKeyframe = true
            return
          }
          const packet = new Uint8Array(chunk.byteLength + 7)
          packet[0] = 2
          packet[1] = chunk.type === 'key' ? 1 : 0
          new DataView(packet.buffer).setUint32(
            3,
            Math.floor(chunk.timestamp * 0.09) >>> 0,
          )
          chunk.copyTo(packet.subarray(7))
          if (!this.send(packet.buffer)) this.needsKeyframe = true
        },
        error: () => {
          if (!this.closed)
            this.fail('Camera encoding failed. End the call and try again.')
        },
      })
      this.encoder.configure(config)
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (!this.closed) this.fail('The camera disconnected')
        })
      })
      this.streams(stream, null)
      this.animation = requestAnimationFrame(this.captureFrame)
    } catch (error) {
      this.close()
      if (error instanceof DOMException && error.name === 'NotAllowedError')
        throw new Error(
          'Camera access is blocked. Allow the camera in browser site settings before starting a video call.',
        )
      if (
        error instanceof DOMException &&
        ['NotReadableError', 'NotFoundError'].includes(error.name)
      )
        throw new Error(
          'The browser could not open the camera. Check that it is connected and available.',
        )
      throw error
    }
  }

  /** Pace capture at 15 fps; do not accumulate encoder work while a tab is busy. */
  private captureFrame = (now: number): void => {
    if (this.closed) return
    this.animation = requestAnimationFrame(this.captureFrame)
    if (
      !this.encoder ||
      this.encoder.state !== 'configured' ||
      !this.capture ||
      !this.preview ||
      this.preview.readyState < 2 ||
      now - this.lastCapture < 1000 / 15 ||
      this.encoder.encodeQueueSize >= 2
    )
      return
    this.lastCapture = now
    const context = this.capture.getContext('2d')!
    const scale = Math.min(
      640 / this.preview.videoWidth,
      360 / this.preview.videoHeight,
    )
    const width = this.preview.videoWidth * scale,
      height = this.preview.videoHeight * scale
    context.fillStyle = 'black'
    context.fillRect(0, 0, 640, 360)
    context.drawImage(
      this.preview,
      (640 - width) / 2,
      (360 - height) / 2,
      width,
      height,
    )
    const frame = new VideoFrame(this.capture, { timestamp: Math.floor(now * 1000) })
    try {
      const keyFrame = this.needsKeyframe || now - this.lastKeyframe >= 2000
      this.encoder.encode(frame, { keyFrame })
      if (keyFrame) {
        this.needsKeyframe = false
        this.lastKeyframe = now
      }
    } catch {
      this.fail('Could not capture camera video')
    } finally {
      frame.close()
    }
  }

  /** Build a recoverable Annex-B decoder; a bad access unit does not kill audio. */
  private makeDecoder(): VideoDecoder {
    const decoder = new VideoDecoder({
      output: frame => {
        try {
          const rotation = this.orientation.get(frame.timestamp) ?? 0
          this.orientation.delete(frame.timestamp)
          if (
            this.closed ||
            this.peerPaused ||
            !this.remote ||
            frame.displayWidth > 1920 ||
            frame.displayHeight > 1920
          )
            return
          this.remote.width = rotation % 2 ? frame.displayHeight : frame.displayWidth
          this.remote.height = rotation % 2 ? frame.displayWidth : frame.displayHeight
          const context = this.remote.getContext('2d')!
          context.translate(this.remote.width / 2, this.remote.height / 2)
          context.rotate((rotation * Math.PI) / 2)
          context.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2)
          if (!this.announcedRemote) {
            this.announcedRemote = true
            this.streams(this.stream ?? null, this.remoteStream ?? null)
          }
        } finally {
          frame.close()
        }
      },
      error: () => {
        this.waitingForKeyframe = true
        this.orientation.clear()
        if (!this.closed) this.requestKeyframe()
      },
    })
    decoder.configure({ codec: config.codec, optimizeForLatency: true })
    return decoder
  }

  /** Decode bounded, ordered video units; request recovery after a dropped reference frame. */
  play(packet: ArrayBuffer): void {
    if (this.closed) return
    const bytes = new Uint8Array(packet)
    if (bytes.length === 2 && bytes[0] === 4 && bytes[1] <= 1) {
      this.peerPaused = bytes[1] === 0
      this.waitingForKeyframe = true
      if (this.peerPaused) {
        this.announcedRemote = false
        this.streams(this.stream ?? null, null)
      } else this.requestKeyframe()
      return
    }
    if (
      bytes.length <= 7 ||
      bytes.length > maximumFrame ||
      bytes[0] !== 2 ||
      bytes[1] > 1 ||
      bytes[2] > 3
    )
      throw new Error('Invalid video frame')
    if (!this.decoder || this.decoder.state === 'closed') {
      this.decoder = this.makeDecoder()
      this.waitingForKeyframe = true
    }
    if (this.decoder.decodeQueueSize >= 3) {
      this.waitingForKeyframe = true
      this.requestKeyframe()
      return
    }
    const key = bytes[1] === 1
    if (this.waitingForKeyframe && !key) {
      this.requestKeyframe()
      return
    }
    if (this.waitingForKeyframe) {
      this.decoder.reset()
      this.decoder.configure({ codec: config.codec, optimizeForLatency: true })
      this.orientation.clear()
    }
    this.waitingForKeyframe = false
    const timestamp = ++this.decodeTimestamp * 66667
    this.orientation.set(timestamp, bytes[2])
    if (this.orientation.size > 16)
      this.orientation.delete(this.orientation.keys().next().value!)
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: key ? 'key' : 'delta',
          timestamp,
          data: bytes.subarray(7),
        }),
      )
    } catch {
      this.waitingForKeyframe = true
      this.requestKeyframe()
    }
  }

  /** Force the next encoded picture to include a decoder recovery point. */
  keyframe(): void {
    this.needsKeyframe = true
  }
  /** Disable outgoing camera content immediately; keep the call and remote picture. */
  camera(enabled: boolean): void {
    this.stream?.getVideoTracks().forEach(track => {
      track.enabled = enabled
    })
    this.keyframe()
  }
  /** Release camera, decoder frames and preview tracks on every call exit path. */
  close(): void {
    if (this.closed) return
    this.closed = true
    cancelAnimationFrame(this.animation)
    this.stream?.getTracks().forEach(track => {
      track.stop()
    })
    this.remoteStream?.getTracks().forEach(track => {
      track.stop()
    })
    if (this.preview) {
      this.preview.pause()
      this.preview.srcObject = null
    }
    if (this.encoder?.state !== 'closed') this.encoder?.close()
    if (this.decoder?.state !== 'closed') this.decoder?.close()
    this.orientation.clear()
    this.streams(null, null)
  }
}
