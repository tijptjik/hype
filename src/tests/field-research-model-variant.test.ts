// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Texture } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { selectModelVariant } from '#lib/fieldResearch/modelVariant.js'

it('selects AI materials by primitive association while retaining corrected UV channels and untouched roofs', async () => {
  const photo = new MeshStandardMaterial()
  const photoDisposed = vi.spyOn(photo, 'dispose')
  const ai = new MeshStandardMaterial()
  const texture = new Texture()
  texture.channel = 1
  ai.map = texture
  const wall = new Mesh(new BoxGeometry(), photo)
  const roofMaterial = new MeshStandardMaterial()
  const roof = new Mesh(new BoxGeometry(), roofMaterial)
  const scene = new Scene()
  scene.add(roof, wall)
  const geometry = wall.geometry
  const assignFinalMaterial = vi.fn()
  const getDependency = vi.fn().mockResolvedValue(ai)
  const model = {
    scene,
    parser: {
      json: {
        extensions: {
          KHR_materials_variants: {
            variants: [{ name: 'Revised' }, { name: 'AI-generated' }],
          },
        },
        meshes: [
          {
            primitives: [
              {
                extensions: {
                  KHR_materials_variants: {
                    mappings: [{ material: 7, variants: [1] }],
                  },
                },
              },
              {},
            ],
          },
        ],
      },
      associations: new Map([
        [wall, { meshes: 0, primitives: 0 }],
        [roof, { meshes: 0, primitives: 1 }],
      ]),
      getDependency,
      assignFinalMaterial,
    },
  } as unknown as GLTF
  expect(await selectModelVariant(model, 'AI-generated')).toBe(true)
  expect(getDependency).toHaveBeenCalledWith('material', 7)
  expect(assignFinalMaterial).toHaveBeenCalledWith(wall)
  expect(wall.material).toBe(ai)
  expect(photoDisposed).toHaveBeenCalledOnce()
  expect(wall.material.map?.channel).toBe(1)
  expect(wall.geometry).toBe(geometry)
  expect(roof.material).toBe(roofMaterial)
  expect(await selectModelVariant(model, 'Missing')).toBe(false)
})

it('keeps ordinary government models unchanged without a reviewed variant', async () => {
  const getDependency = vi.fn()
  const model = {
    scene: new Scene(),
    parser: { json: {}, getDependency },
  } as unknown as GLTF
  expect(await selectModelVariant(model, null)).toBe(false)
  expect(await selectModelVariant(model, 'AI-generated')).toBe(false)
  expect(getDependency).not.toHaveBeenCalled()
})
