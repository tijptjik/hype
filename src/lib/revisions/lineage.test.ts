import { describe, expect, it } from 'vitest'
import { retiredFeatureIds, validateFeatureLineage } from './lineage'
import { galleryRevisionValue, validateRevisionGallery } from './gallery'
import { mergeRevisionContent } from './merge'

const ref = (featureId: string, revisionId: string) => ({ featureId, revisionId })
const entry = (imageRevisionId: string, intent = 'general') => ({
  imageRevisionId,
  intent,
  caption: {},
  alt: {},
})

describe('feature identity lineage', () => {
  it('rejects a cross-feature proposal masquerading as an ordinary edit', () => {
    expect(
      validateFeatureLineage({
        kind: 'edit',
        inputs: [ref('a', 'r1')],
        outputs: [ref('b', 'r2')],
      }).valid,
    ).toBe(false)
  })
  it('retains a merge survivor and identifies the absorbed feature without erasing history', () => {
    const operation = {
      kind: 'merge' as const,
      inputs: [ref('a', 'r1'), ref('b', 'r2')],
      outputs: [ref('a', 'r3')],
    }
    expect(validateFeatureLineage(operation)).toEqual({ valid: true })
    expect(retiredFeatureIds(operation)).toEqual(['b'])
  })
  it('rejects replacing both merge inputs with a new identity', () => {
    expect(
      validateFeatureLineage({
        kind: 'merge',
        inputs: [ref('a', 'r1'), ref('b', 'r2')],
        outputs: [ref('c', 'r3')],
      }).valid,
    ).toBe(false)
  })
  it('records multiple split successors and optionally retains the source', () => {
    expect(
      retiredFeatureIds({
        kind: 'split',
        inputs: [ref('a', 'r1')],
        outputs: [ref('b', 'r2'), ref('c', 'r3')],
      }),
    ).toEqual(['a'])
    expect(
      retiredFeatureIds({
        kind: 'split',
        inputs: [ref('a', 'r1')],
        outputs: [ref('a', 'r2'), ref('b', 'r3')],
      }),
    ).toEqual([])
  })
  it('rejects duplicate inputs, same revisions and incomplete identity operations', () => {
    for (const operation of [
      {
        kind: 'merge' as const,
        inputs: [ref('a', 'r1'), ref('a', 'r2')],
        outputs: [ref('a', 'r3')],
      },
      { kind: 'edit' as const, inputs: [ref('a', 'r1')], outputs: [ref('a', 'r1')] },
      { kind: 'split' as const, inputs: [ref('a', 'r1')], outputs: [ref('b', 'r2')] },
    ])
      expect(validateFeatureLineage(operation).valid).toBe(false)
  })
})

describe('versioned galleries', () => {
  it('pins metadata independently of gallery order', () => {
    const gallery = {
      entries: { a: entry('a-r1'), b: entry('b-r1') },
      order: ['b', 'a'],
    }
    expect(validateRevisionGallery(gallery)).toEqual([])
    expect(galleryRevisionValue(gallery)).toEqual(gallery)
    expect(galleryRevisionValue(gallery)).not.toBe(gallery)
  })
  it('rejects dangling order, duplicate entries and multiple canonical images', () => {
    expect(
      validateRevisionGallery({ entries: { a: entry('r1') }, order: ['a', 'b'] }),
    ).not.toEqual([])
    expect(
      validateRevisionGallery({ entries: { a: entry('r1') }, order: ['a', 'a'] }),
    ).not.toEqual([])
    expect(
      validateRevisionGallery({
        entries: { a: entry('r1', 'canonical'), b: entry('r2', 'canonical') },
        order: ['a', 'b'],
      }),
    ).not.toEqual([])
  })
  it('requires domain validation even after a field-level merge succeeds', () => {
    const base = { entries: { a: entry('r1'), b: entry('r2') }, order: ['a', 'b'] }
    const current = {
      ...base,
      entries: { ...base.entries, a: entry('r1', 'canonical') },
    }
    const proposed = {
      ...base,
      entries: { ...base.entries, b: entry('r2', 'canonical') },
    }
    const merged = mergeRevisionContent(
      galleryRevisionValue(base),
      galleryRevisionValue(current),
      galleryRevisionValue(proposed),
    )
    expect(merged.status).toBe('merged')
    if (merged.status === 'merged') {
      expect(validateRevisionGallery(merged.value as unknown as typeof base)).toEqual([
        'A gallery may have at most one canonical image',
      ])
    }
  })
})
