// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
// IMAGE
import sharp from 'sharp'
import ts from 'typescript'
import { rotatePixels } from '../../workers/asset-service/src/rotation'

// Exercise the Worker route with real raster codecs without importing its WASM bindings into Node.
const source = readFileSync('workers/asset-service/src/index.ts', 'utf8')
const section = source.slice(
  source.indexOf('const handleRawRequest ='),
  source.indexOf('const resolveIntermediateAsset ='),
)
const filenameSection = source.slice(
  source.indexOf('const extensionFromContentType ='),
  source.indexOf('const resolveQuality ='),
)
const javascript = ts.transpileModule(`${section}\n${filenameSection}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

afterEach(() => vi.unstubAllGlobals())

it.each([0, 90, 180, 270, null] as const)(
  'downloads full-resolution pixels in saved orientation %s',
  async rotation => {
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    )
    const pixels = Buffer.from(
      [1, 2, 3, 4, 5, 6].flatMap(value => [value * 30, 0, 0, value === 1 ? 0 : 255]),
    )
    const original = await sharp(pixels, { raw: { width: 2, height: 3, channels: 4 } })
      .png()
      .toBuffer()
    const originalBefore = Buffer.from(original)
    const decode = vi.fn(async () => {
      const { data, info } = await sharp(original)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      return {
        data: new ImageData(new Uint8ClampedArray(data), info.width, info.height),
        hasAlpha: true,
      }
    })
    const encode = vi.fn(async (image: ImageData) => ({
      body: await sharp(Buffer.from(image.data), {
        raw: { width: image.width, height: image.height, channels: 4 },
      })
        .png()
        .toBuffer(),
    }))
    const handle = new Function(
      'resolveMetadataDocument',
      'resolveRawDownloadAsset',
      'decodeSourceImage',
      'encodeOutput',
      'rotatePixels',
      'CACHE_CONTROL_IMMUTABLE',
      'CACHE_CONTROL_SHORT',
      `${javascript}; return handleRawRequest`,
    )(
      async () => ({
        document:
          rotation === null
            ? null
            : { renderRotation: rotation, originalFilename: 'logo.jpg' },
      }),
      async () => ({
        body: original,
        contentType: 'image/png',
        objectKey: 'logo.raw',
        stage: 'production',
        version: 7,
      }),
      decode,
      encode,
      rotatePixels,
      'public, immutable',
      'max-age=60',
    )
    const request = { publicId: 'logo', requestedStage: 'production', version: 7 }
    const response: Response = await handle(
      new Request('https://assets.test/image/raw/v7/logo'),
      {},
      request,
      {},
    )
    const body = Buffer.from(await response.arrayBuffer())
    const result = await sharp(body)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const expected = await sharp(original)
      .rotate(rotation ?? 0)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(result.info.width).toBe(expected.info.width)
    expect(result.info.height).toBe(expected.info.height)
    expect(result.data).toEqual(expected.data)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="logo.png"',
    )
    expect(original).toEqual(originalBefore)
    if (!rotation) {
      expect(body).toEqual(original)
      expect(decode).not.toHaveBeenCalled()
    }
    decode.mockClear()
    const head: Response = await handle(
      new Request('https://assets.test/image/raw/v7/logo', { method: 'HEAD' }),
      {},
      request,
      {},
    )
    expect(head.headers.get('content-type')).toBe(response.headers.get('content-type'))
    expect(head.headers.get('content-disposition')).toBe(
      response.headers.get('content-disposition'),
    )
    expect(await head.text()).toBe('')
    expect(decode).not.toHaveBeenCalled()
  },
)
