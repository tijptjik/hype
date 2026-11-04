import { SCTP } from 'werift-sctp'
import { DataChunk, parsePacket } from 'werift-sctp/lib/sctp/src/chunk'
import type { Transport } from 'werift-sctp/lib/sctp/src/transport'

export interface SignalingSctpIO {
  send(packet: Uint8Array): Promise<void>
  receive(payload: Uint8Array): void
  failed(error: Error): void
  keepAlive(task: Promise<void>): void
}

/** SCTP stream 0 / binary PPID 53 over Telegram's MTProto signalling channel.
 * No UDP sockets or DTLS are created here; browser media uses a separate WebRTC connection.
 */
export class SignalingSctp {
  private readonly association: SCTP
  private closed = false
  private connected = false
  private packets: Uint8Array[] = []
  private pendingPayloads: Uint8Array[] = []
  private pendingBytes = 0
  private receivedBytes = 0
  private sentBytes = 0
  private queuedBytes = 0
  private drainTimer?: ReturnType<typeof setTimeout>
  private draining = false
  private incoming: Promise<void> = Promise.resolve()
  private incomingCount = 0
  private readonly unsubscribe: () => void

  constructor(
    initiator: boolean,
    private readonly io: SignalingSctpIO,
  ) {
    const transport: Transport = {
      send: async packet => {
        if (this.closed) return
        if (this.queuedBytes + packet.length > 512 * 1024)
          throw new Error('Call signalling send queue is full')
        this.packets.push(Uint8Array.from(packet))
        this.queuedBytes += packet.length
        // Delivery happens after SCTP updates its local handshake state, even with a loopback peer.
        if (!this.draining && !this.drainTimer)
          this.drainTimer = setTimeout(() => {
            this.drainTimer = undefined
            this.io.keepAlive(this.drain())
          }, 0)
      },
      close: () => {},
    }
    this.association = initiator
      ? SCTP.client(transport, 5000)
      : SCTP.server(transport, 5000)
    this.association._inboundStreamsMax = 1
    this.association._outboundStreamsCount = 1
    this.unsubscribe = this.association.onReceive.subscribe(
      (stream, protocol, payload) => {
        if (!this.closed && stream === 0 && protocol === 53) {
          if (payload.length > 128 * 1024) {
            this.fail(new Error('Call signalling message is too large'))
            return
          }
          this.io.receive(Uint8Array.from(payload))
        }
      },
    ).unSubscribe
    this.association.stateChanged.connected.subscribe(() => {
      this.connected = true
      this.io.keepAlive(this.flushPayloads().catch(error => this.fail(error)))
    })
    this.association.stateChanged.closed.subscribe(() => {
      if (!this.closed) this.fail(new Error('Call signalling transport closed'))
    })
  }

  /** Open the bounded association; caller sends INIT and callee waits for it. */
  async start(): Promise<void> {
    if (!this.closed) await this.association.start(5000)
  }

  /** Queue encrypted signalling until the SCTP handshake finishes. */
  async send(payload: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Call signalling transport closed')
    if (
      !payload.length ||
      payload.length > 128 * 1024 ||
      this.pendingBytes + payload.length > 256 * 1024 ||
      this.sentBytes + payload.length > 4 * 1024 * 1024
    )
      throw new Error('Call signalling queue is full')
    this.sentBytes += payload.length
    this.pendingPayloads.push(Uint8Array.from(payload))
    this.pendingBytes += payload.length
    if (this.connected) await this.flushPayloads()
  }

  /** Validate untrusted framing before serialized library processing, including malformed async errors. */
  receive(packet: Uint8Array): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (
      packet.length < 12 ||
      packet.length > 16 * 1024 ||
      this.incomingCount >= 64 ||
      this.receivedBytes + packet.length > 4 * 1024 * 1024
    ) {
      this.fail(new Error('Call signalling receive limit exceeded'))
      return Promise.resolve()
    }
    this.receivedBytes += packet.length
    this.incomingCount++
    const bytes = Buffer.from(packet)
    const operation = this.incoming
      .then(async () => {
        if (this.closed) return
        const [source, destination, , chunks] = parsePacket(bytes)
        if (source !== 5000 || destination !== 5000 || chunks.length > 32)
          throw new Error('Invalid call signalling packet')
        for (const chunk of chunks) {
          if (
            chunk instanceof DataChunk &&
            (chunk.streamId !== 0 || chunk.protocol !== 53)
          )
            throw new Error('Unexpected call signalling stream')
          // Telegram uses one fixed stream; remote reconfiguration is unnecessary and could grow stream state.
          if (chunk.type === 130)
            throw new Error('Call signalling stream reconfiguration is unsupported')
        }
        // Pinned werift-sctp 0.0.11's onData callback discards this promise. Await the same
        // parser directly so malformed input cannot escape as an unhandled rejection.
        await (
          this.association as unknown as { handleData(data: Buffer): Promise<void> }
        ).handleData(bytes)
      })
      .catch(error => this.fail(error))
      .finally(() => {
        this.incomingCount--
      })
    this.incoming = operation
    return operation
  }

  /** Release SCTP timers and queued encrypted packets when the owning call ends. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.drainTimer)
    this.unsubscribe()
    this.packets = []
    this.pendingPayloads = []
    this.pendingBytes = this.queuedBytes = 0
    await this.association.stop()
  }

  private async flushPayloads(): Promise<void> {
    while (!this.closed && this.connected && this.pendingPayloads.length) {
      const payload = this.pendingPayloads.shift()!
      this.pendingBytes -= payload.length
      await this.association.send(0, 53, Buffer.from(payload), { ordered: true })
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (!this.closed && this.packets.length) {
        const packet = this.packets.shift()!
        this.queuedBytes -= packet.length
        await this.io.send(packet)
      }
    } catch (error) {
      this.fail(error)
    } finally {
      this.draining = false
    }
  }

  private fail(error: unknown): void {
    if (this.closed) return
    this.io.failed(error instanceof Error ? error : new Error('Call signalling failed'))
    this.io.keepAlive(this.close())
  }
}
