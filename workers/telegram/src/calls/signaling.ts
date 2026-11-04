import { CallPacketCipher } from './crypto'
import { SignalingSctp } from './sctp'

/** Only advertise versions whose framing and compression we actually implement. */
export const CALL_VERSIONS = ['13.0.0', '12.0.0'] as const
export type CallSignalMessage = {
  '@type': 'InitialSetup' | 'Candidates' | 'MediaState' | 'NegotiateChannels'
  [key: string]: unknown
}
const TYPES = new Set(['InitialSetup', 'Candidates', 'MediaState', 'NegotiateChannels'])

export interface CallSignalingIO {
  send(packet: Uint8Array): Promise<void>
  receive(message: CallSignalMessage): void
  failed(error: Error): void
  keepAlive(task: Promise<void>): void
}

/** Strict outer envelope; browser SDP conversion validates the individual message fields. */
export function signalMessage(value: unknown): CallSignalMessage {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('@type' in value) ||
    !TYPES.has(String(value['@type']))
  )
    throw new Error('Invalid call signalling message')
  return value as CallSignalMessage
}

/** Stream through gzip with a hard output limit, including decompression-bomb protection. */
async function gzip(
  bytes: Uint8Array,
  decompress: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new Blob([Uint8Array.from(bytes)]).stream()
  const reader = (
    decompress
      ? source.pipeThrough(new DecompressionStream('gzip'))
      : source.pipeThrough(new CompressionStream('gzip'))
  ).getReader()
  const limit = decompress ? 256 * 1024 : 16 * 1024 - 20
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      length += result.value.length
      if (length > limit) throw new Error('Call signalling message is too large')
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** tgcalls V3: JSON → gzip → authenticated packet → SCTP stream 0. */
export class CallSignaling {
  private readonly cipher: CallPacketCipher
  private readonly sctp?: SignalingSctp
  private incoming: Promise<void> = Promise.resolve()
  private pending = 0
  private closed = false

  constructor(
    key: Uint8Array,
    outgoing: boolean,
    private readonly io: CallSignalingIO,
    useSctp = true,
  ) {
    this.cipher = new CallPacketCipher(key, outgoing)
    if (useSctp)
      this.sctp = new SignalingSctp(outgoing, {
        ...io,
        receive: packet => {
          this.io.keepAlive(this.decrypt(packet))
        },
        failed: error => this.fail(error),
      })
  }

  /** Start only after the DH commitment and final call fingerprint have been verified. */
  async start(): Promise<void> {
    await this.sctp?.start()
  }

  /** Encrypt one browser negotiation message; no account or call key enters the browser. */
  async send(message: CallSignalMessage): Promise<void> {
    if (this.closed) throw new Error('Call signalling closed')
    const json = new TextEncoder().encode(JSON.stringify(signalMessage(message)))
    if (json.length > 256 * 1024)
      throw new Error('Call signalling message is too large')
    const encrypted = await this.cipher.seal(await gzip(json, false))
    if (this.closed) return
    if (this.sctp) await this.sctp.send(encrypted)
    else await this.io.send(encrypted)
  }

  /** Consume only packets routed by the verified active call ID. */
  async receive(packet: Uint8Array): Promise<void> {
    if (this.closed) return
    if (this.sctp) await this.sctp.receive(packet)
    else await this.decrypt(packet)
  }

  /** Release replay state, keys and SCTP timers when the operator leaves or hangs up. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.cipher.dispose()
    await this.sctp?.close()
  }

  private decrypt(packet: Uint8Array): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.pending >= 64) {
      this.fail(new Error('Call signalling receive queue is full'))
      return Promise.resolve()
    }
    this.pending++
    const operation = this.incoming
      .then(async () => {
        if (this.closed) return
        const opened = await this.cipher.open(packet)
        if (!opened) return
        // Native tgcalls detects gzip after authentication and also accepts plain JSON.
        // Keep the same interoperability without attempting to parse unauthenticated bytes.
        const decompressed =
          opened.payload[0] === 0x1f && opened.payload[1] === 0x8b
            ? await gzip(opened.payload, true)
            : opened.payload
        const message = signalMessage(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decompressed)),
        )
        if (!this.closed) this.io.receive(message)
      })
      .catch(error => this.fail(error))
      .finally(() => {
        this.pending--
      })
    this.incoming = operation
    return operation
  }

  private fail(error: unknown): void {
    if (this.closed) return
    this.io.failed(error instanceof Error ? error : new Error('Call signalling failed'))
    this.io.keepAlive(this.close())
  }
}
