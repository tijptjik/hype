import { describe, expect, it, vi } from 'vitest'

// `images.ts` imports SvelteKit remote modules that require SSR runtime
// globals not available under vitest. Mock them so the pure
// `parseImageFilename` function can be tested in isolation.
vi.mock('$lib/api/server/feature.remote', () => ({
  getFeatureForImport: vi.fn(),
}))
vi.mock('$lib/api/server/image.remote', () => ({
  getFeatureCanonicalImageOccupancy: vi.fn(),
}))
vi.mock('$lib/api/server/organisation.remote', () => ({
  getOrganisation: vi.fn(),
}))
vi.mock('$lib/api/server/project.remote', () => ({
  getProject: vi.fn(),
}))
vi.mock('$lib/client/services/image', () => ({
  calculateImageContentHash: vi.fn(),
  uploadAndProcessImage: vi.fn(),
}))

import { parseImageFilename } from '$lib/client/services/import/images'

describe('parseImageFilename', () => {
  describe('dash separator', () => {
    it('parses `featureId-123` into featureId and sequence', () => {
      expect(parseImageFilename('featureId-123')).toEqual({
        featureId: 'featureId',
        imageSequence: '123',
      })
    })

    it('parses `featureId-123.webp` into featureId and sequence', () => {
      expect(parseImageFilename('featureId-123.webp')).toEqual({
        featureId: 'featureId',
        imageSequence: '123',
      })
    })

    it('parses `0Gd7fU4rEvRM-00.webp` (the original bug case) correctly', () => {
      expect(parseImageFilename('0Gd7fU4rEvRM-00.webp')).toEqual({
        featureId: '0Gd7fU4rEvRM',
        imageSequence: '00',
      })
    })

    it('preserves leading zeros in the sequence', () => {
      expect(parseImageFilename('feat-007.webp')).toEqual({
        featureId: 'feat',
        imageSequence: '007',
      })
    })
  })

  describe('dot separator', () => {
    it('parses `featureId.123.webp` into featureId and sequence', () => {
      expect(parseImageFilename('featureId.123.webp')).toEqual({
        featureId: 'featureId',
        imageSequence: '123',
      })
    })

    it('parses `abc123.456.webp` (featureId ending in digits) correctly', () => {
      expect(parseImageFilename('abc123.456.webp')).toEqual({
        featureId: 'abc123',
        imageSequence: '456',
      })
    })

    // The extension-stripper (`/\.[^/.]+$/`) consumes the trailing `.123` as
    // if it were a file extension, so a bare dot-separated name with no real
    // extension cannot be split. This is a known limitation of the
    // extension-removal step, not the separator regex. Use a real extension
    // (e.g. `.webp`) for dot-separated filenames.
    it('treats bare `featureId.123` (no real extension) as featureId only', () => {
      expect(parseImageFilename('featureId.123')).toEqual({
        featureId: 'featureId',
        imageSequence: null,
      })
    })
  })

  describe('feature IDs ending in digits', () => {
    it('parses `abc123-456` into featureId `abc123` and sequence `456`', () => {
      expect(parseImageFilename('abc123-456')).toEqual({
        featureId: 'abc123',
        imageSequence: '456',
      })
    })

    it('parses `abc123-456.webp` into featureId `abc123` and sequence `456`', () => {
      expect(parseImageFilename('abc123-456.webp')).toEqual({
        featureId: 'abc123',
        imageSequence: '456',
      })
    })
  })

  describe('greedy capture with multiple potential separators', () => {
    it('parses `0Gd7fU4rEvRM-00` so the last numeric span is the sequence', () => {
      expect(parseImageFilename('0Gd7fU4rEvRM-00')).toEqual({
        featureId: '0Gd7fU4rEvRM',
        imageSequence: '00',
      })
    })

    it('parses `featureId-1-2` so the last numeric span wins', () => {
      expect(parseImageFilename('featureId-1-2')).toEqual({
        featureId: 'featureId-1',
        imageSequence: '2',
      })
    })

    it('parses `a-b-c-99` so the last numeric span wins', () => {
      expect(parseImageFilename('a-b-c-99')).toEqual({
        featureId: 'a-b-c',
        imageSequence: '99',
      })
    })
  })

  describe('no numeric sequence', () => {
    it('treats `featureId-abc` as the entire featureId', () => {
      expect(parseImageFilename('featureId-abc')).toEqual({
        featureId: 'featureId-abc',
        imageSequence: null,
      })
    })

    it('treats `featureId.webp` as featureId with no sequence', () => {
      expect(parseImageFilename('featureId.webp')).toEqual({
        featureId: 'featureId',
        imageSequence: null,
      })
    })

    it('treats a bare nanoid-style id as featureId with no sequence', () => {
      expect(parseImageFilename('0Gd7fU4rEvRM')).toEqual({
        featureId: '0Gd7fU4rEvRM',
        imageSequence: null,
      })
    })

    it('treats `abc-12def` (non-numeric trailing segment) as featureId only', () => {
      expect(parseImageFilename('abc-12def')).toEqual({
        featureId: 'abc-12def',
        imageSequence: null,
      })
    })
  })

  describe('edge cases', () => {
    it('returns null parts for an empty filename', () => {
      expect(parseImageFilename('')).toEqual({
        featureId: null,
        imageSequence: null,
      })
    })

    it('returns null parts for a whitespace-only filename', () => {
      expect(parseImageFilename('   ')).toEqual({
        featureId: null,
        imageSequence: null,
      })
    })

    it('returns null parts for an extension-only filename', () => {
      expect(parseImageFilename('.webp')).toEqual({
        featureId: null,
        imageSequence: null,
      })
    })

    it('trims whitespace around the featureId and sequence', () => {
      expect(parseImageFilename('  featureId-123  ')).toEqual({
        featureId: 'featureId',
        imageSequence: '123',
      })
    })
  })
})
