import { expect, it } from 'vitest'
import {
  floorTextureAnchors,
  textureHeight,
} from '#lib/locations/exterior/floorTexture.js'

it('transfers photo heights and inverts drags throughout the blend on the registered face only', () => {
  const document = {
    extras: {
      exteriorFloorRegistration: {
        viewId: 'view-4',
        anchors: [
          [5, 5],
          [10, 12],
          [20, 20],
        ],
      },
    },
  }
  const anchors = floorTextureAnchors(document, 'view-4')
  expect(textureHeight(10, anchors, 2)).toBe(12)
  expect(textureHeight(10, anchors, 1.5)).toBe(11)
  expect(textureHeight(10, anchors, 0)).toBe(10)
  for (const blend of [0, 1, 1.25, 1.5, 1.9, 2]) {
    for (const h of [0, 4.999, 5, 7.2, 10, 18.6, 20, 30]) {
      expect(
        textureHeight(textureHeight(h, anchors, blend), anchors, blend, true),
      ).toBeCloseTo(h, 9)
    }
  }
  expect(floorTextureAnchors(document, 'view-1')).toEqual([])
  document.extras.exteriorFloorRegistration.anchors[1] = [10, 4]
  expect(floorTextureAnchors(document, 'view-4')).toEqual([])
})

it('selects independent façade registrations and rejects ambiguous duplicates', () => {
  const front = {
    viewId: 'front',
    anchors: [
      [0, 0],
      [4, 5],
      [10, 10],
    ],
  }
  const side = {
    viewId: 'side',
    anchors: [
      [0, 0],
      [4, 3],
      [10, 10],
    ],
  }
  const document = { extras: { exteriorFloorRegistration: [front, side] } }
  expect(textureHeight(4, floorTextureAnchors(document, 'front'), 2)).toBe(5)
  expect(textureHeight(4, floorTextureAnchors(document, 'side'), 2)).toBe(3)
  expect(floorTextureAnchors(document, 'rear')).toEqual([])
  expect(floorTextureAnchors(document)).toEqual([])
  document.extras.exteriorFloorRegistration.push(front)
  expect(floorTextureAnchors(document, 'front')).toEqual([])
  expect(floorTextureAnchors(document, 'side')).toEqual(side.anchors)
})

it('ignores malformed records and requires invertible continuous mappings', () => {
  for (const anchors of [
    [
      [0, 1],
      [10, 10],
    ],
    [
      [0, 0],
      [10, 11],
    ],
    [
      [0, 0],
      [4, 4],
      [4, 5],
      [10, 10],
    ],
    [
      [0, 0],
      [4, 5],
      [6, 5],
      [10, 10],
    ],
    [
      [0, 0],
      [Number.NaN, 5],
      [10, 10],
    ],
  ]) {
    expect(
      floorTextureAnchors(
        {
          extras: {
            exteriorFloorRegistration: [null, 'invalid', { viewId: 'front', anchors }],
          },
        },
        'front',
      ),
    ).toEqual([])
  }
})
