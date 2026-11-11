import { describe, expect, it } from 'vitest'
import {
  coordinateChangeCamera,
  revisionCoordinates,
} from '../lib/revisions/coordinateChange'
import type { RevisionDifference } from '../lib/revisions/diff'

const change = (before: number[], after: number[]): RevisionDifference => ({
  path: ['placement', 'geometry', 'coordinates'],
  before: { present: true, value: before },
  after: { present: true, value: after },
})

describe('historical coordinate maps', () => {
  it('only accepts valid explicit point fields', () => {
    for (const value of [
      [181, 22],
      [114, 91],
      [NaN, 22],
      [[114, 22]],
      [114],
      [114, 22, 1],
    ])
      expect(revisionCoordinates(['coordinates'], { present: true, value })).toBeNull()
    expect(
      revisionCoordinates(['counts'], { present: true, value: [114, 22] }),
    ).toBeNull()
    expect(
      revisionCoordinates(['markerCoordinates'], { present: true, value: [114, 22] }),
    ).toEqual([114, 22])
    expect(revisionCoordinates(['coordinates'], { present: false })).toBeNull()
  })
  it('zooms out for longer moves and narrower viewports', () => {
    const short = change(
      [114.17268795589794, 22.299860199999998],
      [114.17321553153181, 22.299890502759055],
    )
    const far = change([114.17, 22.3], [115.17, 23.3])
    expect(coordinateChangeCamera(short, 700, 256)?.zoom ?? NaN).toBeGreaterThan(
      coordinateChangeCamera(far, 700, 256)?.zoom ?? NaN,
    )
    expect(coordinateChangeCamera(short, 250, 256)?.zoom ?? NaN).toBeLessThan(
      coordinateChangeCamera(short, 700, 256)?.zoom ?? NaN,
    )
  })
  it('uses the same camera regardless of movement direction', () => {
    const a = [114.17, 22.3],
      b = [114.18, 22.31]
    expect(coordinateChangeCamera(change(a, b), 400, 256)).toEqual(
      coordinateChangeCamera(change(b, a), 400, 256),
    )
  })
  it('fits the short crossing of the date line', () => {
    const camera = coordinateChangeCamera(change([179.99, 0], [-179.99, 0]), 400, 256)
    if (!camera) throw new Error('Missing camera')
    expect(Math.abs(camera.center[0])).toBe(180)
    expect(camera.zoom).toBeGreaterThan(10)
  })
  it('handles unchanged, added and polar points without infinite cameras', () => {
    const added = change([0, 90], [0, 90])
    added.before = { present: false }
    const camera = coordinateChangeCamera(added, 400, 256)
    if (!camera) throw new Error('Missing camera')
    expect(camera.zoom).toBe(19)
    expect(Number.isFinite(camera.center[1])).toBe(true)
  })
})
