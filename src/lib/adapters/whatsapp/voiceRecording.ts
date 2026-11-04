/** Repackage Chrome's WebM Opus packets into WhatsApp's Ogg Opus container.
 * No decoding, transcoding, codec relabeling, or audio quality loss is involved.
 */
const MAX_BYTES = 8 * 1024 * 1024
const encoder = new TextEncoder()
interface ElementValue { value: number; length: number; unknown: boolean }
interface Track { number?: number; codec?: string; head?: Uint8Array }

/** Decode one bounded EBML integer, retaining marker bits for element IDs. */
function vint(bytes: Uint8Array, start: number, id = false): ElementValue {
  const first = bytes[start]
  if (!first) throw new Error('Invalid WebM integer')
  let length = 1
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++
  if (length > 8 || start + length > bytes.length) throw new Error('Truncated WebM integer')
  let value = id ? first : first & ((1 << (8 - length)) - 1)
  let unknown = !id && value === (1 << (8 - length)) - 1
  for (let i = 1; i < length; i++) { value = value * 256 + bytes[start + i]; unknown &&= bytes[start + i] === 255 }
  if (!unknown && !Number.isSafeInteger(value)) throw new Error('WebM integer is too large')
  return { value, length, unknown }
}

/** Read bounded unsigned TrackNumber data. */
function uint(bytes: Uint8Array): number {
  if (bytes.length > 4) throw new Error('Invalid WebM track')
  return bytes.reduce((value, byte) => value * 256 + byte, 0)
}

/** Opus packet duration in 48 kHz granule units, from RFC 6716 section 3. */
function samples(packet: Uint8Array): number {
  if (!packet.length) throw new Error('Empty Opus packet')
  const config = packet[0] >> 3
  const perFrame = config >= 16 ? 120 << (config & 3) : config >= 12 ? 480 << (config & 1) : [480, 960, 1920, 2880][config & 3]
  const code = packet[0] & 3
  const count = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 63 : 2
  const total = perFrame * count
  if (!count || total > 5760) throw new Error('Invalid Opus duration')
  return total
}

/** Create a checksummed Ogg page containing one complete packet. */
function page(packet: Uint8Array, serial: number, sequence: number, granule: number, flags: number): Uint8Array {
  const segments = Math.floor(packet.length / 255) + 1
  if (segments > 255) throw new Error('Opus packet is too large')
  const result = new Uint8Array(27 + segments + packet.length)
  result.set(encoder.encode('OggS'))
  result[5] = flags
  const view = new DataView(result.buffer)
  view.setBigUint64(6, BigInt(granule), true)
  view.setUint32(14, serial, true)
  view.setUint32(18, sequence, true)
  result[26] = segments
  result.fill(255, 27, 27 + segments - 1)
  result[27 + segments - 1] = packet.length % 255
  result.set(packet, 27 + segments)
  let crc = 0
  for (const byte of result) {
    crc ^= byte << 24
    for (let bit = 0; bit < 8; bit++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0)
  }
  view.setUint32(22, crc >>> 0, true)
  return result
}

/** Convert a finished MediaRecorder WebM/Opus recording to Ogg/Opus.
 * @param bytes Complete bounded WebM recording; unsupported lacing fails explicitly.
 * @returns Ogg bytes with packet-derived duration for the SDK voice-note message.
 */
export function webmOpusToOgg(bytes: Uint8Array): { bytes: Uint8Array<ArrayBuffer>; duration: number } {
  if (bytes.length > MAX_BYTES || bytes.length < 4 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) !== 0x1a45dfa3) throw new Error('Invalid WebM recording')
  const tracks: Track[] = []
  const blocks: { track: number; packet: Uint8Array }[] = []
  const masters = new Set([0x18538067, 0x1654ae6b, 0x1f43b675, 0xa0])
  /** Walk only known media containers, bounding depth and every element range. */
  function walk(start: number, end: number, depth: number, track?: Track): void {
    if (depth > 12) throw new Error('WebM nesting is too deep')
    for (let offset = start; offset < end;) {
      const id = vint(bytes, offset, true); offset += id.length
      const size = vint(bytes, offset); offset += size.length
      const stop = size.unknown ? end : offset + size.value
      if (stop > end || stop < offset) throw new Error('Truncated WebM element')
      if (id.value === 0xae) { const entry: Track = {}; tracks.push(entry); walk(offset, stop, depth + 1, entry) }
      else if (masters.has(id.value)) walk(offset, stop, depth + 1, track)
      else if (track && id.value === 0xd7) track.number = uint(bytes.subarray(offset, stop))
      else if (track && id.value === 0x86) track.codec = new TextDecoder().decode(bytes.subarray(offset, stop))
      else if (track && id.value === 0x63a2) track.head = bytes.slice(offset, stop)
      else if (id.value === 0xa3 || id.value === 0xa1) {
        const number = vint(bytes, offset)
        const packetStart = offset + number.length + 3
        if (packetStart >= stop || bytes[packetStart - 1] & 0x06) throw new Error('Unsupported WebM audio block lacing')
        blocks.push({ track: number.value, packet: bytes.subarray(packetStart, stop) })
      }
      offset = stop
    }
  }
  walk(0, bytes.length, 0)
  const track = tracks.find(candidate => candidate.codec === 'A_OPUS')
  const head = track?.head
  if (!track?.number || !head || head.length < 19 || new TextDecoder().decode(head.subarray(0, 8)) !== 'OpusHead' || head[9] > 2 || head[18] !== 0) throw new Error('Recording has no supported Opus audio track')
  const packets = blocks.filter(block => block.track === track.number).map(block => block.packet)
  if (!packets.length) throw new Error('Recording contains no audio')
  const serial = crypto.getRandomValues(new Uint32Array(1))[0]
  const tags = new Uint8Array(16)
  tags.set(encoder.encode('OpusTags')) // Empty vendor and zero comments are valid.
  const pages = [page(head, serial, 0, 0, 2), page(tags, serial, 1, 0, 0)]
  let granule = 0
  packets.forEach((packet, index) => { granule += samples(packet); pages.push(page(packet, serial, index + 2, granule, index === packets.length - 1 ? 4 : 0)) })
  const duration = Math.max(1, Math.ceil((granule - new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true)) / 48000))
  const length = pages.reduce((total, item) => total + item.length, 0)
  if (duration > 600 || length > MAX_BYTES) throw new Error('Voice messages must be at most 10 minutes and 8 MiB')
  const output = new Uint8Array(length)
  let offset = 0
  for (const item of pages) { output.set(item, offset); offset += item.length }
  return { bytes: output, duration }
}
