// TESTING
import { describe, expect, it } from 'vitest'
// IMAGES
import {
  stageImageMetadataRevision,
  readMetadataDocument,
  toMetadataProfilePayload,
} from '#lib/images/storage.js'
import type { ImageMetadataDocument } from '#lib/images/storage.js'

type RevisionBucket = Parameters<typeof stageImageMetadataRevision>[0]['bucket']

function bucket(initial: Record<string, string> = {}, corruptReadback = false) {
  const objects = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    objects,
    writes,
    binding: {
      async put(
        key: string,
        body: string,
        options: { onlyIf: { etagDoesNotMatch: string } },
      ) {
        expect(options.onlyIf).toEqual({ etagDoesNotMatch: '*' })
        writes.push(key)
        if (objects.has(key)) return null
        objects.set(key, body)
        return { key }
      },
      async get(key: string) {
        const value = objects.get(key)
        return value === undefined
          ? null
          : { text: async () => (corruptReadback ? 'wrong body' : value) }
      },
    } as unknown as RevisionBucket,
  }
}

const document: ImageMetadataDocument = {
  capturedAt: null,
  capture: {
    value: '2025-03',
    precision: 'month',
    endValue: null,
    endPrecision: null,
    approximate: true,
    originalText: 'Photographed in circa 2025-03',
  },
  captureSources: [
    {
      featureId: 'feature',
      locale: 'en',
      descriptionHash: 'hash',
      revision: 'revision',
      start: 0,
      end: 30,
      quotedText: 'Photographed in circa 2025-03',
      orderedImageIds: ['image'],
      orderEvidence: 'reviewed-import-order',
    },
  ],
  metadata: { DateTimeOriginal: 'raw evidence', Artist: 'original attribution' },
}

describe('capture metadata storage', () => {
  it('exposes precise capture values in basic metadata and retains source evidence in full metadata', () => {
    const basic = toMetadataProfilePayload(document, 'basic')
    expect(basic.capture).toEqual(document.capture)
    expect(basic).not.toHaveProperty('captureSources')
    expect(toMetadataProfilePayload(document, 'full')).toBe(document)
  })

  it('stages only a fresh immutable sidecar and preserves old revisions, alias and manifest', async () => {
    const b = bucket({
      'images/test.v1.json': 'old revision',
      'images/test.json': 'alias',
      'images/test.manifest.json': 'manifest',
    })
    expect(
      await stageImageMetadataRevision({
        bucket: b.binding,
        publicId: 'images/test',
        version: 2,
        document,
      }),
    ).toBe('images/test.v2.json')
    expect(b.writes).toEqual(['images/test.v2.json'])
    expect(b.objects.get('images/test.v1.json')).toBe('old revision')
    expect(b.objects.get('images/test.json')).toBe('alias')
    expect(b.objects.get('images/test.manifest.json')).toBe('manifest')
    expect(JSON.parse(b.objects.get('images/test.v2.json')!)).toEqual(document)
    await stageImageMetadataRevision({
      bucket: b.binding,
      publicId: 'images/test',
      version: 2,
      document,
    })
    expect(b.objects.size).toBe(4)
  })

  it('rejects revision collisions and readback failures', async () => {
    const b = bucket({ 'images/test.v2.json': 'other writer' })
    await expect(
      stageImageMetadataRevision({
        bucket: b.binding,
        publicId: 'images/test',
        version: 2,
        document,
      }),
    ).rejects.toThrow('different content')
    expect(b.objects.get('images/test.v2.json')).toBe('other writer')
    const corrupt = bucket({}, true)
    await expect(
      stageImageMetadataRevision({
        bucket: corrupt.binding,
        publicId: 'images/test',
        version: 2,
        document,
      }),
    ).rejects.toThrow('readback failed')
  })
})


describe('exact metadata reads', () => {
  it('never substitutes a latest alias, manifest or another environment for a missing pin', async () => {
    const reads: string[] = []
    const binding = (stage: string) => ({ get: async (key: string) => {
      reads.push(stage + ':' + key)
      return key.endsWith('.v1.json') && stage === 'local' ? null : { json: async () => ({ credit: 'Wrong fallback' }) }
    } })
    const platform = { env: { ASSET_RAW_DEV: binding('local'), ASSET_RAW_PREVIEW: binding('preview'), ASSET_RAW_PRODUCTION: binding('production') } } as unknown as App.Platform
    expect(await readMetadataDocument({ platform, env: 'local', publicId: 'images/pin', version: 1, exact: true })).toEqual({ document: null, resolvedEnv: 'local', resolvedVersion: 1 })
    expect(reads).toEqual(['local:images/pin.v1.json'])
  })
  it('returns the exact requested sidecar without consulting its manifest', async () => {
    const reads: string[] = []
    const platform = { env: { ASSET_RAW_DEV: { get: async (key: string) => {
      reads.push(key)
      return { json: async () => ({ credit: 'Pinned' }) }
    } } } } as unknown as App.Platform
    expect((await readMetadataDocument({ platform, env: 'local', publicId: 'images/pin', version: 12, exact: true })).document).toEqual({ credit: 'Pinned' })
    expect(reads).toEqual(['images/pin.v12.json'])
  })
})
