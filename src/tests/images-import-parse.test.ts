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

// A real nanoid(12) feature ID used across cases.
const FEATURE_ID = '0Gd7fU4rEvRM'

describe('parseImageFilename', () => {
  describe('dash separator (only recognised when feature ID is 12 chars)', () => {
    it('parses `<12charId>-00.webp` into featureId and sequence', () => {
      expect(parseImageFilename(`${FEATURE_ID}-00.webp`)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '00',
      })
    })

    it('parses `<12charId>-00` (no extension) into featureId and sequence', () => {
      expect(parseImageFilename(`${FEATURE_ID}-00`)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '00',
      })
    })

    it('preserves leading zeros in the sequence', () => {
      expect(parseImageFilename(`${FEATURE_ID}-007.webp`)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '007',
      })
    })

    it('parses `<12charId>-123.webp` (non-zero-padded sequence) when ID is full length', () => {
      expect(parseImageFilename(`${FEATURE_ID}-123.webp`)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '123',
      })
    })
  })

  describe('dot separator (always recognised, nanoid never contains `.`)', () => {
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

  describe('hyphenated feature IDs kept intact', () => {
    it('keeps `abc-123.jpg` as the entire featureId (P2 badge case)', () => {
      expect(parseImageFilename('abc-123.jpg')).toEqual({
        featureId: 'abc-123',
        imageSequence: null,
      })
    })

    it('keeps `abc-123` (no extension) as the entire featureId', () => {
      expect(parseImageFilename('abc-123')).toEqual({
        featureId: 'abc-123',
        imageSequence: null,
      })
    })

    it('keeps `featureId-123` as the entire featureId (leading segment not 12 chars)', () => {
      expect(parseImageFilename('featureId-123')).toEqual({
        featureId: 'featureId-123',
        imageSequence: null,
      })
    })

    it('keeps `abc123-456` as the entire featureId (leading segment not 12 chars)', () => {
      expect(parseImageFilename('abc123-456')).toEqual({
        featureId: 'abc123-456',
        imageSequence: null,
      })
    })

    it('keeps `featureId-1-2` as the entire featureId (no full-length segment before last dash)', () => {
      expect(parseImageFilename('featureId-1-2')).toEqual({
        featureId: 'featureId-1-2',
        imageSequence: null,
      })
    })
  })

  describe('greedy capture with full-length feature ID', () => {
    it('parses `<12charId>-00` so the last numeric span is the sequence', () => {
      expect(parseImageFilename(`${FEATURE_ID}-00`)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '00',
      })
    })

    it('does not split `<12charId>-1-2` (segment before last dash is not 12 chars)', () => {
      expect(parseImageFilename(`${FEATURE_ID}-1-2`)).toEqual({
        featureId: `${FEATURE_ID}-1-2`,
        imageSequence: null,
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
      expect(parseImageFilename(FEATURE_ID)).toEqual({
        featureId: FEATURE_ID,
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
      expect(parseImageFilename(`  ${FEATURE_ID}-00  `)).toEqual({
        featureId: FEATURE_ID,
        imageSequence: '00',
      })
    })
  })
})
