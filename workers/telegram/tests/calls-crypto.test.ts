import { describe, expect, it, vi } from 'vitest'
import {
  CallKeyExchange,
  CallPacketCipher,
  TELEGRAM_CALL_PRIME,
} from '../src/calls/crypto'

const prime = Uint8Array.from(Buffer.from(TELEGRAM_CALL_PRIME, 'hex'))
const key = Uint8Array.from({ length: 256 }, (_, index) => index)
const payload = new TextEncoder().encode('{"@type":"MediaState","muted":true}')

describe('Telegram call cryptography', () => {
  it('matches independent Python/OpenSSL vectors in both directions', async () => {
    // Generated using Python hashlib + cryptography AES-CTR, independently of the TypeScript implementation.
    const vectors = [
      '90c24487639a68357eb8427e11144e65638f6969b0b85a1c597430fc67eb1872a1dc703783a3924e5fc9605f6f7f47e037859061ed00b3',
      '668da4f2d0b1a2c7ff8211ef7a28b6d5794fb395988470e57f6dcee04961a33bb6c38d2fa4c2bae5eb7cd176e33c4e7eb5539a93f6c8a8',
    ]
    for (const [index, outgoing] of [true, false].entries()) {
      expect(
        Buffer.from(await new CallPacketCipher(key, outgoing).seal(payload)).toString(
          'hex',
        ),
      ).toBe(vectors[index])
      expect(
        await new CallPacketCipher(key, !outgoing).open(
          Buffer.from(vectors[index], 'hex'),
        ),
      ).toEqual({ sequence: 1, payload })
    }
  })

  it('authenticates before consuming counters, rejects reflection and accepts only one concurrent replay', async () => {
    const caller = new CallPacketCipher(key, true)
    const callee = new CallPacketCipher(key, false)
    const packet = await caller.seal(payload)
    await expect(caller.open(packet)).rejects.toThrow('integrity')
    const corrupt = Uint8Array.from(packet)
    corrupt[corrupt.length - 1] ^= 1
    await expect(callee.open(corrupt)).rejects.toThrow('integrity')
    const replies = await Promise.all([callee.open(packet), callee.open(packet)])
    expect(replies.filter(Boolean)).toHaveLength(1)
    expect(replies).toContain(null)
  })

  it('accepts reordering within the replay window but rejects older authenticated packets', async () => {
    const caller = new CallPacketCipher(key, true)
    const callee = new CallPacketCipher(key, false)
    const packets = await Promise.all(
      Array.from({ length: 66 }, () => caller.seal(payload)),
    )
    expect((await callee.open(packets[65]))?.sequence).toBe(66)
    expect((await callee.open(packets[2]))?.sequence).toBe(3)
    expect(await callee.open(packets[1])).toBeNull()
    expect(await callee.open(packets[0])).toBeNull()
    expect(await callee.open(packets[2])).toBeNull()
  })

  it('preserves V2 record flags while using the unflagged counter for replay protection', async () => {
    const caller = new CallPacketCipher(key, true)
    const callee = new CallPacketCipher(key, false)
    const opened = await callee.open(
      await caller.seal(new Uint8Array([0x7f, 0, 0, 0, 1, 65]), 0x40000000),
    )
    expect(opened?.sequence).toBe(0x40000001)
    expect(opened?.payload).toEqual(new Uint8Array([0x7f, 0, 0, 0, 1, 65]))
  })

  it('bounds untrusted packets and drops late results after disposal', async () => {
    const cipher = new CallPacketCipher(key, true)
    await expect(cipher.open(new Uint8Array(20))).rejects.toThrow('length')
    await expect(cipher.open(new Uint8Array(128 * 1024 + 1))).rejects.toThrow('length')
    await expect(cipher.seal(new Uint8Array(16 * 1024))).rejects.toThrow('packet')
    const pending = cipher.seal(payload)
    cipher.dispose()
    await expect(pending).rejects.toThrow('disposed')
    await expect(cipher.seal(payload)).rejects.toThrow('disposed')
  })

  it('matches independent DH commitments, shared key and little-endian fingerprint vectors', async () => {
    // Python pow(3, int.from_bytes(bytes([3])*256), prime), then DH with bytes([13])*256.
    const random = vi.spyOn(crypto, 'getRandomValues')
    let caller: CallKeyExchange
    let callee: CallKeyExchange
    try {
      random.mockImplementation(value => {
        ;(value as Uint8Array).fill(1)
        return value
      })
      caller = CallKeyExchange.create(prime, 3, new Uint8Array(256).fill(2))
      random.mockImplementation(value => {
        ;(value as Uint8Array).fill(5)
        return value
      })
      callee = CallKeyExchange.create(prime, 3, new Uint8Array(256).fill(8))
    } finally {
      random.mockRestore()
    }
    expect(Buffer.from(await caller.commitment()).toString('hex')).toBe(
      '3d91fcedcd1cc634081bdcca48d1c8e5f4985edef34dfef8579db713fea023b3',
    )
    const a = await caller.derive(callee.publicValue)
    const b = await callee.derive(caller.publicValue, await caller.commitment())
    expect(a).toEqual(b)
    expect(
      Buffer.from(await crypto.subtle.digest('SHA-256', a.key)).toString('hex'),
    ).toBe('0cca54299d5b485cb4da1c66332c9558f03dd834d31cba089418a620afd3a474')
    expect(a.fingerprint).toBe('4735407705991057418')
    await expect(callee.derive(caller.publicValue, new Uint8Array(32))).rejects.toThrow(
      'commitment',
    )
    const tooSmall = new Uint8Array(256)
    tooSmall[255] = 2
    await expect(caller.derive(tooSmall)).rejects.toThrow('Unsafe')
    const tooLarge = Uint8Array.from(prime)
    tooLarge[255]--
    await expect(caller.derive(tooLarge)).rejects.toThrow('Unsafe')
    caller.dispose()
    await expect(caller.derive(callee.publicValue)).rejects.toThrow('disposed')
    callee.dispose()
  })

  it('rejects unverified groups, invalid generators and malformed server entropy', () => {
    const altered = Uint8Array.from(prime)
    altered[2] ^= 1
    expect(() => CallKeyExchange.create(altered, 3, new Uint8Array(256))).toThrow(
      'group',
    )
    expect(() => CallKeyExchange.create(prime, 1, new Uint8Array(256))).toThrow(
      'parameters',
    )
    expect(() => CallKeyExchange.create(prime, 3, new Uint8Array(32))).toThrow(
      'parameters',
    )
  })
})
