// @vitest-environment node
import { expect, it } from 'vitest'
import {
  assembleExterior,
  dependencyName,
  type ExteriorSource,
} from '#lib/locations/exterior/assembly.js'

/** Construct a static slice with shared local resource indexes. @param id Model identity. @param x World easting. @returns Source document. */
function slice(id: string, x: number): ExteriorSource {
  return {
    slice: {
      modelId: id,
      sheet: 'test',
      footprintId: 'footprint-' + id,
      evidenceKeys: ['0'],
    },
    document: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ translation: [x, 0, -820000], children: [1] }, { mesh: 0 }],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
      ],
      accessors: [{ bufferView: 0 }, { bufferView: 0 }],
      bufferViews: [{ buffer: 0 }],
      buffers: [{ uri: 'mesh.bin', byteLength: 16 }],
      images: [{ uri: 'texture.png' }],
      samplers: [{}],
      textures: [{ source: 0, sampler: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    },
  }
}
it('preserves shared-world alignment and slice mappings in one scene', () => {
  const sources = [slice('B1', 830000), slice('B2', 830010)]
  const before = structuredClone(sources)
  const result = assembleExterior(sources)
  expect(result.scenes[0].nodes).toHaveLength(2)
  expect(result.nodes[0].translation).toEqual([830000, 0, -820000])
  expect(result.nodes[3].translation).toEqual([830010, 0, -820000])
  expect(result.nodes[5].extras.exteriorSlice.footprintId).toBe('footprint-B2')
  expect(result.nodes[5].extras.exteriorSlice.evidenceKeys).toEqual(['0'])
  expect(sources).toEqual(before)
})
it('remaps every geometry and material resource index for subsequent slices', () => {
  const result = assembleExterior([slice('B1', 0), slice('B2', 10)])
  expect(result.nodes[3].children).toEqual([4])
  expect(result.nodes[4].mesh).toBe(1)
  expect(result.meshes[1].primitives[0]).toMatchObject({
    attributes: { POSITION: 2 },
    indices: 3,
    material: 1,
  })
  expect(result.accessors[2].bufferView).toBe(1)
  expect(result.bufferViews[1].buffer).toBe(1)
  expect(result.textures[1]).toEqual({ source: 1, sampler: 1 })
  expect(result.materials[1].pbrMetallicRoughness.baseColorTexture.index).toBe(1)
  expect(result.buffers.map((item: { uri: string }) => item.uri)).toEqual([
    'B1--mesh.bin',
    'B2--mesh.bin',
  ])
  expect(result.images[1].uri).toBe('B2--texture.png')
})
it('rejects unsupported transforms and dependencies rather than corrupting a model', () => {
  const source = slice('B1', 0)
  source.document.extensionsRequired = ['KHR_draco_mesh_compression']
  expect(() => assembleExterior([source])).toThrow('Unsupported model format')
  expect(() => dependencyName('B1', '../texture.png')).toThrow()
  expect(() => assembleExterior([])).toThrow()
})
