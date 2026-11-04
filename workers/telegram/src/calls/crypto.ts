/** Telegram call key exchange and packet encryption.
 * Wire specification: https://core.telegram.org/api/end-to-end/video-calls
 * This module does not establish calls or negotiate browser media by itself.
 */

// Telegram's published, audited 2048-bit safe prime. Unknown groups fail closed.
export const TELEGRAM_CALL_PRIME =
  'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b'
const PRIME = BigInt(`0x${TELEGRAM_CALL_PRIME}`)
const SAFE_VALUE = 1n << 1984n
const COUNTER_MASK = 0x3fffffff
const REPLAY_WINDOW = 64

/** Concatenate small, already bounded protocol fields. */
function concat(...values: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0))
  let offset = 0
  for (const value of values) {
    result.set(value, offset)
    offset += value.length
  }
  return result
}

/** Convert the protocol's unsigned big-endian integers. */
function integer(bytes: Uint8Array): bigint {
  if (!bytes.length || bytes.length > 256)
    throw new Error('Invalid call DH value length')
  return BigInt(
    `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`,
  )
}

/** Pad shared secrets and public values to the exact 256-byte protocol width. */
function padded(value: bigint): Uint8Array<ArrayBuffer> {
  const hex = value.toString(16).padStart(512, '0')
  return Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16))
}

/** Fixed-width modular exponentiation, matching the SDK's big-integer DH representation. */
function power(base: bigint, exponent: bigint): bigint {
  let result = 1n
  for (let bit = 2047n; bit >= 0n; bit--) {
    result = (result * result) % PRIME
    const multiplied = (result * base) % PRIME
    if ((exponent >> bit) & 1n) result = multiplied
  }
  return result
}

/** Reject confinement and boundary values using Telegram's 2^(2048-64) margin. */
function validatePublic(value: bigint): void {
  if (value <= SAFE_VALUE || value >= PRIME - SAFE_VALUE)
    throw new Error('Unsafe call DH public value')
}

/** Compare fixed-size authenticated values without early exit on their contents. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i]
  return different === 0
}

/** Hash a bounded protocol field using Workers Web Crypto. */
async function digest(
  algorithm: 'SHA-1' | 'SHA-256',
  bytes: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, Uint8Array.from(bytes)))
}

/** One ephemeral key exchange; it is never stored as part of the account session. */
export class CallKeyExchange {
  readonly publicValue: Uint8Array<ArrayBuffer>
  private constructor(
    private exponent: bigint,
    publicValue: Uint8Array<ArrayBuffer>,
  ) {
    this.publicValue = publicValue
  }

  /** Validate the group and mix independent local entropy with the server's random bytes. */
  static create(
    prime: Uint8Array,
    generator: number,
    serverRandom: Uint8Array,
  ): CallKeyExchange {
    if (prime.length !== 256 || integer(prime) !== PRIME)
      throw new Error('Unsupported call DH group')
    const allowed =
      generator === 2
        ? PRIME % 8n === 7n
        : generator === 3
          ? PRIME % 3n === 2n
          : generator === 4
            ? true
            : generator === 5
              ? [1n, 4n].includes(PRIME % 5n)
              : generator === 6
                ? [19n, 23n].includes(PRIME % 24n)
                : generator === 7
                  ? [3n, 5n, 6n].includes(PRIME % 7n)
                  : false
    if (!allowed || serverRandom.length !== 256)
      throw new Error('Invalid call DH parameters')
    for (let attempt = 0; attempt < 16; attempt++) {
      const entropy = crypto.getRandomValues(new Uint8Array(256))
      for (let i = 0; i < entropy.length; i++) entropy[i] ^= serverRandom[i]
      const exponent = integer(entropy)
      entropy.fill(0)
      if (exponent <= 1n || exponent >= PRIME - 1n) continue
      const publicValue = power(BigInt(generator), exponent)
      if (publicValue <= SAFE_VALUE || publicValue >= PRIME - SAFE_VALUE) continue
      return new CallKeyExchange(exponent, padded(publicValue))
    }
    throw new Error('Could not generate a call DH key')
  }

  /** Commit to g_a before the callee reveals g_b. */
  commitment(): Promise<Uint8Array<ArrayBuffer>> {
    return digest('SHA-256', this.publicValue)
  }

  /** Validate the caller's commitment when supplied, then derive the key and signed TL fingerprint. */
  async derive(
    peer: Uint8Array,
    commitment?: Uint8Array,
  ): Promise<{ key: Uint8Array<ArrayBuffer>; fingerprint: string }> {
    if (!this.exponent) throw new Error('Call DH key has been disposed')
    if (peer.length !== 256) throw new Error('Invalid call DH public value length')
    const publicValue = integer(peer)
    validatePublic(publicValue)
    if (commitment && !equal(await digest('SHA-256', peer), commitment))
      throw new Error('Call DH commitment mismatch')
    if (!this.exponent) throw new Error('Call DH key has been disposed')
    const key = padded(power(publicValue, this.exponent))
    const hash = await digest('SHA-1', key) // SHA-1 is mandated solely for the TL key fingerprint.
    if (!this.exponent) {
      key.fill(0)
      throw new Error('Call DH key has been disposed')
    }
    return {
      key,
      fingerprint: new DataView(hash.buffer).getBigInt64(12, true).toString(),
    }
  }

  /** Drop the ephemeral exponent when the attempt ends. */
  dispose(): void {
    this.exponent = 0n
  }
}

/** Directional tgcalls AES-CTR packets with integrity checks and bounded replay memory.
 * Payload framing (V2 records or V3 gzip/SCTP) belongs to the negotiated transport.
 */
export class CallPacketCipher {
  private readonly key: Uint8Array<ArrayBuffer>
  private sequence = 0
  private largest = 0
  private readonly received = new Set<number>()
  private disposed = false

  constructor(
    key: Uint8Array,
    private readonly outgoing: boolean,
  ) {
    if (key.length !== 256) throw new Error('Invalid call encryption key')
    this.key = Uint8Array.from(key)
  }

  /** Compute the direction-dependent MTProto-style AES key and CTR IV. */
  private async parameters(
    messageKey: Uint8Array,
    offset: number,
  ): Promise<{ key: CryptoKey; counter: Uint8Array<ArrayBuffer> }> {
    const [a, b] = await Promise.all([
      digest('SHA-256', concat(messageKey, this.key.subarray(offset, offset + 36))),
      digest(
        'SHA-256',
        concat(this.key.subarray(offset + 40, offset + 76), messageKey),
      ),
    ])
    const bytes = concat(a.subarray(0, 8), b.subarray(8, 24), a.subarray(24, 32))
    return {
      key: await crypto.subtle.importKey('raw', bytes, 'AES-CTR', false, [
        'encrypt',
        'decrypt',
      ]),
      counter: concat(b.subarray(0, 4), a.subarray(8, 16), b.subarray(24, 28)),
    }
  }

  /** Encrypt one bounded packet, reserving its sequence before asynchronous crypto begins. */
  async seal(payload: Uint8Array, flags = 0): Promise<Uint8Array<ArrayBuffer>> {
    if (this.disposed) throw new Error('Call cipher has been disposed')
    if (
      !payload.length ||
      payload.length > 16 * 1024 - 20 ||
      ![0, 0x40000000, 0x80000000, 0xc0000000].includes(flags)
    )
      throw new Error('Invalid call packet')
    if (this.sequence >= COUNTER_MASK) throw new Error('Call packet counter exhausted')
    const body = concat(new Uint8Array(4), payload)
    new DataView(body.buffer).setUint32(0, (++this.sequence | flags) >>> 0, false)
    const offset = this.outgoing ? 128 : 136
    const messageKey = (
      await digest(
        'SHA-256',
        concat(this.key.subarray(88 + offset, 120 + offset), body),
      )
    ).slice(8, 24)
    const { key, counter } = await this.parameters(messageKey, offset)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CTR', counter, length: 128 },
      key,
      body,
    )
    if (this.disposed) throw new Error('Call cipher has been disposed')
    return concat(messageKey, new Uint8Array(encrypted))
  }

  /** Authenticate before accepting a counter; out-of-order packets have a 64-counter window. */
  async open(
    packet: Uint8Array,
  ): Promise<{ sequence: number; payload: Uint8Array<ArrayBuffer> } | null> {
    if (this.disposed) throw new Error('Call cipher has been disposed')
    if (packet.length < 21 || packet.length > 128 * 1024)
      throw new Error('Invalid call packet length')
    const offset = this.outgoing ? 136 : 128
    const messageKey = Uint8Array.from(packet.subarray(0, 16))
    const { key, counter } = await this.parameters(messageKey, offset)
    const body = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter, length: 128 },
        key,
        Uint8Array.from(packet.subarray(16)),
      ),
    )
    const expected = (
      await digest(
        'SHA-256',
        concat(this.key.subarray(88 + offset, 120 + offset), body),
      )
    ).subarray(8, 24)
    if (!equal(expected, messageKey)) throw new Error('Call packet integrity failed')
    if (this.disposed) throw new Error('Call cipher has been disposed')
    const sequence = new DataView(body.buffer).getUint32(0, false)
    const serial = sequence & COUNTER_MASK
    if (!serial || this.received.has(serial) || serial + REPLAY_WINDOW <= this.largest)
      return null
    this.largest = Math.max(serial, this.largest)
    for (const old of this.received)
      if (old + REPLAY_WINDOW <= this.largest) this.received.delete(old)
    this.received.add(serial)
    return { sequence, payload: body.slice(4) }
  }

  /** Clear key material and reject late in-flight results. */
  dispose(): void {
    this.disposed = true
    this.key.fill(0)
    this.received.clear()
  }
}
