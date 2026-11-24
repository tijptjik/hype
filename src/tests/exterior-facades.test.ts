// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  segmentFacades,
  type ExteriorTriangle,
} from '../lib/locations/exterior/facades'
import { exteriorTriangles } from '../lib/locations/exterior/facadeGeometry'
const wall: ExteriorTriangle[] = [
  {
    id: 'a',
    vertices: [
      [0, 0, 0],
      [4, 0, 0],
      [4, 6, 0],
    ],
  },
  {
    id: 'b',
    vertices: [
      [0, 0, 0],
      [4, 6, 0],
      [0, 6, 0],
    ],
  },
]
describe('exterior façade proposals', () => {
  it('merges a triangulated wall and clips exact areas at known floor elevations', () => {
    const result = segmentFacades(wall, {
      assetId: 'asset',
      floors: [
        { id: 'g', label: 'Ground', elevation: 0 },
        { id: '1', label: 'First', elevation: 2 },
      ],
    })
    expect(result.facades).toHaveLength(1)
    expect(result.facades[0].area).toBe(24)
    expect(result.facades[0].bands[0].area).toBeCloseTo(8, 8)
    expect(result.facades[0].bands[1].area).toBeCloseTo(16, 8)
    expect(result.floorSource).toBe('entered-elevations')
  })
  it('keeps disconnected and perpendicular surfaces separate and excludes roofs', () => {
    const result = segmentFacades(
      [
        ...wall,
        {
          id: 'side',
          vertices: [
            [4, 0, 0],
            [4, 0, 4],
            [4, 6, 0],
          ],
        },
        {
          id: 'detached',
          vertices: [
            [10, 0, 0],
            [14, 0, 0],
            [14, 6, 0],
          ],
        },
        {
          id: 'roof',
          vertices: [
            [0, 6, 0],
            [4, 6, 0],
            [4, 6, 4],
          ],
        },
      ],
      { assetId: 'asset', storeyHeight: 3 },
    )
    expect(result.facades).toHaveLength(3)
    expect(result.excludedTriangles).toBe(1)
    expect(result.floorSource).toBe('inferred-height')
    expect(result.facades[0].bands.map(b => b.area)).toEqual([12, 12])
  })
  it('preserves an elevated datum and does not invent coverage below entered floors', () => {
    const raised = wall.map(t => ({
      ...t,
      vertices: t.vertices.map(p => [p[0], p[1] + 50, p[2]]),
    })) as ExteriorTriangle[]
    const result = segmentFacades(raised, {
      assetId: 'asset',
      floors: [{ id: 'f', label: 'Floor', elevation: 52 }],
    })
    expect(result.facades[0].bands[0]).toMatchObject({ bottom: 52, top: 56, area: 16 })
    expect(segmentFacades(raised, { assetId: 'asset' }).floors[0].elevation).toBe(50)
  })
  it('rejects ambiguous alignment and nonfinite coordinates', () => {
    expect(() => segmentFacades(wall, { assetId: 'a', storeyHeight: 0 })).toThrow()
    expect(() =>
      segmentFacades(wall, {
        assetId: 'a',
        floors: [
          { id: 'a', label: 'A', elevation: 0 },
          { id: 'b', label: 'B', elevation: 0 },
        ],
      }),
    ).toThrow()
    expect(() =>
      segmentFacades(
        [
          {
            id: 'a',
            vertices: [
              [NaN, 0, 0],
              [1, 0, 0],
              [1, 1, 0],
            ],
          },
        ],
        { assetId: 'a' },
      ),
    ).toThrow()
  })
  it('decodes GLB node transforms before floor alignment', () => {
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 4, 6, 0])
    const json = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ translation: [0, 50, 0], children: [1] }, { mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    })
    const encoded = new TextEncoder().encode(
      json.padEnd(Math.ceil(json.length / 4) * 4, ' '),
    )
    const buffer = new ArrayBuffer(12 + 8 + encoded.length + 8 + 36),
      view = new DataView(buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, buffer.byteLength, true)
    view.setUint32(12, encoded.length, true)
    view.setUint32(16, 0x4e4f534a, true)
    new Uint8Array(buffer, 20, encoded.length).set(encoded)
    view.setUint32(20 + encoded.length, 36, true)
    view.setUint32(24 + encoded.length, 0x004e4942, true)
    new Uint8Array(buffer, 28 + encoded.length).set(new Uint8Array(positions.buffer))
    const triangles = exteriorTriangles(buffer)
    expect(triangles[0].vertices).toEqual([
      [0, 50, 0],
      [4, 50, 0],
      [4, 56, 0],
    ])
    expect(segmentFacades(triangles, { assetId: 'a' }).floors[0].elevation).toBe(50)
  })
})
