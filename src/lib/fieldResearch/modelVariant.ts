// 3D
import { Mesh, Texture, type Material } from 'three'
import type { GLTF, GLTFReference } from 'three/addons/loaders/GLTFLoader.js'

type VariantMapping = { material: number; variants: number[] }

/** Select a named glTF material variant without altering geometry or texture coordinates.
 * @param gltf Loaded model and its parser associations.
 * @param name Reviewed variant name, or null to retain the source materials.
 * @returns Whether the requested variant was present.
 * @remarks Three's core loader preserves KHR_materials_variants metadata but does not
 * select its materials. Parser-loaded materials retain TEXCOORD_1 texture transforms.
 */
export async function selectModelVariant(
  gltf: GLTF,
  name?: string | null,
): Promise<boolean> {
  if (!name) return false
  const { parser } = gltf
  const variants: { name: string }[] =
    parser.json.extensions?.KHR_materials_variants?.variants ?? []
  const index = variants.findIndex(variant => variant.name === name)
  if (index < 0) return false
  const pending: Promise<void>[] = []
  const replaced = new Set<Material>()
  // Resolve each primitive through loader associations; node order is not a material identity.
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    // Three records primitive indices at runtime, but its public reference type omits them.
    const reference = parser.associations.get(object) as
      | (GLTFReference & { primitives?: number })
      | undefined
    if (reference?.meshes === undefined || reference.primitives === undefined) return
    const primitive =
      parser.json.meshes[reference.meshes]?.primitives[reference.primitives]
    const mappings: VariantMapping[] =
      primitive?.extensions?.KHR_materials_variants?.mappings ?? []
    const mapping = mappings.find(candidate => candidate.variants.includes(index))
    if (!mapping) return
    pending.push(
      parser.getDependency('material', mapping.material).then((material: Material) => {
        for (const previous of [object.material].flat()) replaced.add(previous)
        object.material = material
        parser.assignFinalMaterial(object)
      }),
    )
  })
  await Promise.all(pending)
  // Release displaced government materials without closing textures still shared by visible meshes.
  const retained = new Set<Material>()
  const retainedTextures = new Set<Texture>()
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const material of [object.material].flat()) {
      retained.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) retainedTextures.add(value)
      }
    }
  })
  const disposedTextures = new Set<Texture>()
  for (const material of replaced) {
    if (retained.has(material)) continue
    for (const value of Object.values(material)) {
      if (
        !(value instanceof Texture) ||
        retainedTextures.has(value) ||
        disposedTextures.has(value)
      )
        continue
      value.dispose()
      disposedTextures.add(value)
    }
    material.dispose()
  }
  return true
}
