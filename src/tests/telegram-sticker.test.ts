// NODE
import { gzipSync } from 'node:zlib'
// TESTS
import { expect, it } from 'vitest'
// MEDIA
import { decodeTelegramSticker } from '#lib/messaging/tgs.js'

const vector = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 180,
  w: 512,
  h: 512,
  layers: [],
  assets: [],
}

it('decodes a native gzipped Telegram vector sticker', async () => {
  expect(await decodeTelegramSticker(gzipSync(JSON.stringify(vector)))).toEqual(vector)
})

it('rejects external assets, expressions and unbounded decompression before rendering', async () => {
  for (const assets of [
    [{ p: 'https://example.invalid/image.png', u: '' }],
    [{ layers: [{ x: 'fetch("private")' }] }],
  ]) {
    await expect(
      decodeTelegramSticker(gzipSync(JSON.stringify({ ...vector, assets }))),
    ).rejects.toThrow('Unsupported')
  }
  await expect(
    decodeTelegramSticker(gzipSync(' '.repeat(3 * 1024 * 1024))),
  ).rejects.toThrow('too complex')
  await expect(decodeTelegramSticker(new Uint8Array([1, 2, 3]))).rejects.toThrow()
})
