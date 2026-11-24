// TOC: Source metadata | Static glTF assembly
export type ExteriorSlice = {
  modelId: string
  sheet: string
  footprintId?: string
  label?: string
  sourceVersion?: {
    etag: string
    lastModified: string | null
    revisionDate: number | null
    fetchedAt: string
    textureCount: number
  }
  evidenceKeys: string[]
}

/** glTF's JSON representation; unsupported animated/compressed extensions are rejected. */
type Json = { [key: string]: any }
export type ExteriorSource = { slice: ExteriorSlice; document: Json }

/** Assemble static CSDI slices, retaining their source transforms and semantic root nodes.
 * @param sources Reviewed model documents. @returns One glTF scene and its per-slice metadata.
 * @remarks Dependency filenames are prefixed per model. No automatic spatial matching is performed.
 */
export function assembleExterior(sources: ExteriorSource[]): Json {
  if (!sources.length || sources.length > 20)
    throw new Error('Choose between 1 and 20 model slices.')
  if (new Set(sources.map(source => source.slice.modelId)).size !== sources.length)
    throw new Error('Duplicate model slice.')
  const keys = [
    'buffers',
    'bufferViews',
    'accessors',
    'images',
    'samplers',
    'textures',
    'materials',
    'meshes',
    'nodes',
  ] as const
  const output: Json = {
    asset: { version: '2.0', generator: 'HYPE reviewed building assembly' },
    scene: 0,
    scenes: [{ nodes: [] }],
    extras: { exteriorSlices: sources.map(source => source.slice) },
  }
  for (const key of keys) output[key] = []
  for (const { slice, document } of sources) {
    const model = structuredClone(document)
    if (
      model.asset?.version !== '2.0' ||
      model.skins?.length ||
      model.animations?.length ||
      model.extensionsUsed?.length ||
      model.extensionsRequired?.length
    )
      throw new Error('Unsupported model format; cannot safely assemble this slice.')
    const offsets = Object.fromEntries(keys.map(key => [key, output[key].length]))
    for (const buffer of model.buffers ?? [])
      buffer.uri = dependencyName(slice.modelId, buffer.uri)
    for (const view of model.bufferViews ?? []) view.buffer += offsets.buffers
    for (const accessor of model.accessors ?? []) {
      if (accessor.bufferView !== undefined) accessor.bufferView += offsets.bufferViews
      if (accessor.sparse) {
        accessor.sparse.indices.bufferView += offsets.bufferViews
        accessor.sparse.values.bufferView += offsets.bufferViews
      }
    }
    for (const image of model.images ?? []) {
      if (image.uri) image.uri = dependencyName(slice.modelId, image.uri)
      if (image.bufferView !== undefined) image.bufferView += offsets.bufferViews
    }
    for (const texture of model.textures ?? []) {
      if (texture.source !== undefined) texture.source += offsets.images
      if (texture.sampler !== undefined) texture.sampler += offsets.samplers
    }
    for (const material of model.materials ?? []) {
      for (const texture of [
        material.normalTexture,
        material.occlusionTexture,
        material.emissiveTexture,
        material.pbrMetallicRoughness?.baseColorTexture,
        material.pbrMetallicRoughness?.metallicRoughnessTexture,
      ])
        if (texture) texture.index += offsets.textures
    }
    for (const mesh of model.meshes ?? [])
      for (const primitive of mesh.primitives ?? []) {
        if (primitive.indices !== undefined) primitive.indices += offsets.accessors
        if (primitive.material !== undefined) primitive.material += offsets.materials
        for (const attributes of [primitive.attributes, ...(primitive.targets ?? [])])
          for (const key of Object.keys(attributes ?? {}))
            attributes[key] += offsets.accessors
      }
    for (const node of model.nodes ?? []) {
      if (node.mesh !== undefined) node.mesh += offsets.meshes
      if (node.camera !== undefined) throw new Error('Model cameras are unsupported.')
      if (node.children)
        node.children = node.children.map((id: number) => id + offsets.nodes)
    }
    for (const key of keys) output[key].push(...(model[key] ?? []))
    const roots = model.scenes?.[model.scene ?? 0]?.nodes
    if (!roots?.length) throw new Error('Model has no scene.')
    const root = output.nodes.length
    output.nodes.push({
      name: slice.label || slice.modelId,
      extras: { exteriorSlice: slice },
      children: roots.map((id: number) => id + offsets.nodes),
    })
    output.scenes[0].nodes.push(root)
  }
  return output
}

/** Namespace a validated local glTF dependency. @param modelId Source model ID. @param name Relative dependency. @returns Collision-free filename. */
export function dependencyName(modelId: string, name: string): string {
  if (
    !/^B[a-zA-Z0-9]+$/.test(modelId) ||
    !/^[a-zA-Z0-9_.-]+\.(bin|jpg|jpeg|png)$/i.test(name)
  )
    throw new Error('Unsupported model dependency.')
  return modelId + '--' + name
}
