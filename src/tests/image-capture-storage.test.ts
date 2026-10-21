// TESTING
import { describe, expect, it } from 'vitest'
// IMAGES
import {
  stageImageMetadataRevision,
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
