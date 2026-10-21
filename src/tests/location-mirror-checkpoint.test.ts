import { describe, expect, it } from 'vitest'
import { readMirrorCheckpoint } from '../../scripts/locations/lib/mirror-checkpoint'
const pin = {
  releaseSet: 'release',
  catalogRevision: 'catalog',
  knownAt: '2026-10-01T00:00:00Z',
}
const filters = { taxonomyPrimary: 'bakery' }
const complete = {
  version: 2,
  pin,
  filters,
  offset: 2,
  total: 2,
  complete: true,
  revisions: ['a', 'b'],
}

describe('hydrated source mirror checkpoint', () => {
  it.each([true, false])('replays old progress even when complete=%s', done => {
    expect(
      readMirrorCheckpoint({ ...complete, version: 1, complete: done }, pin, filters),
    ).toEqual({
      version: 2,
      pin,
      filters,
      offset: 0,
      total: null,
      complete: false,
      revisions: [],
    })
  })
  it('retains verified hydration progress and copies revision receipts', () => {
    const result = readMirrorCheckpoint(complete, pin, filters)
    expect(result).toEqual(complete)
    expect(result.revisions).not.toBe(complete.revisions)
  })
  it('does not move legacy progress to a different publication or subset', () => {
    expect(() =>
      readMirrorCheckpoint(
        { ...complete, version: 1 },
        { ...pin, catalogRevision: 'other' },
        filters,
      ),
    ).toThrow('another publication')
    expect(() => readMirrorCheckpoint(complete, pin, {})).toThrow('another publication')
  })
  it.each([
    { revisions: ['a'] },
    { revisions: ['a', 'a'] },
    { revisions: ['a', null] },
    { offset: -1 },
    { offset: 1.5 },
    { total: 3 },
    { total: null },
    { complete: 'true' },
  ])('rejects progress that cannot prove hydrated completion: %j', change => {
    expect(() =>
      readMirrorCheckpoint({ ...complete, ...change }, pin, filters),
    ).toThrow('Invalid hydrated')
  })
  it('accepts partial pages without a known total and starts new mirrors at zero', () => {
    expect(
      readMirrorCheckpoint({ ...complete, complete: false, total: null }, pin, filters)
        .offset,
    ).toBe(2)
    expect(readMirrorCheckpoint(undefined, pin, filters).offset).toBe(0)
  })
})
