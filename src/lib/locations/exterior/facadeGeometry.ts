// TYPES
import type { ExteriorTriangle, Point3 } from './facades'

// TOC: Static GLB decoding | Scene transforms
/** Decode the static, uncompressed GLB exported by model-viewer.
 * @param buffer Exported model with embedded geometry. @returns World-transformed triangles.
 * @remarks Rejects unsupported geometry instead of silently producing incomplete proposals.
 */
export function exteriorTriangles(buffer: ArrayBuffer): ExteriorTriangle[] {
  const view = new DataView(buffer)
  if (
    buffer.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error('Invalid GLB model.')
  let document: any, binary: DataView | undefined
  for (let offset = 12; offset < buffer.byteLength; ) {
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true)
    if (offset + 8 + length > buffer.byteLength) throw new Error('Truncated GLB model.')
    if (type === 0x4e4f534a)
      document = JSON.parse(
        new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)).trim(),
      )
    if (type === 0x004e4942) binary = new DataView(buffer, offset + 8, length)
    offset += 8 + length
  }
  if (
    !document ||
    !binary ||
    document.skins?.length ||
    document.animations?.length ||
    document.extensionsRequired?.length
  )
    throw new Error('Only static uncompressed exterior geometry is supported.')
  const data = binary
  /** Read a supported accessor with stride and byte offsets. @param id Accessor index. @param position Read positions rather than indices. @returns Numeric rows. */
  function accessor(id: number, position: boolean): number[][] {
    const a = document.accessors?.[id],
      b = document.bufferViews?.[a?.bufferView]
    const sizes: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }
    if (
      !a ||
      !b ||
      a.sparse ||
      a.normalized ||
      b.buffer !== 0 ||
      a.type !== (position ? 'VEC3' : 'SCALAR') ||
      (position
        ? a.componentType !== 5126
        : ![5121, 5123, 5125].includes(a.componentType)) ||
      !Number.isInteger(a.count) ||
      a.count < 0 ||
      a.count > 750000
    )
      throw new Error('Unsupported geometry accessor.')
    const size = sizes[a.componentType],
      width = position ? 3 : 1,
      stride = b.byteStride ?? size * width
    const start = (b.byteOffset ?? 0) + (a.byteOffset ?? 0)
    if (
      stride < size * width ||
      start < 0 ||
      start + Math.max(0, a.count - 1) * stride + size * width >
        (b.byteOffset ?? 0) + b.byteLength ||
      start + Math.max(0, a.count - 1) * stride + size * width > data.byteLength
    )
      throw new Error('Invalid geometry bounds.')
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: width }, (_, j) => {
        const offset = start + i * stride + j * size
        return a.componentType === 5126
          ? data.getFloat32(offset, true)
          : a.componentType === 5125
            ? data.getUint32(offset, true)
            : a.componentType === 5123
              ? data.getUint16(offset, true)
              : data.getUint8(offset)
      }),
    )
  }
  const result: ExteriorTriangle[] = []
  /** Walk one scene node without losing glTF transforms. @param id Node index. @param parent Parent matrix. @param path Ancestors for cycle rejection and stable instance identity. @returns Nothing. */
  function visit(id: number, parent: number[], path: number[]): void {
    if (path.includes(id) || path.length > 100)
      throw new Error('Invalid scene hierarchy.')
    const node = document.nodes?.[id]
    if (!node || node.skin !== undefined || node.weights)
      throw new Error('Unsupported scene node.')
    const matrix = multiply(
      parent,
      node.matrix ?? transform(node.translation, node.rotation, node.scale),
    )
    if (matrix.length !== 16 || matrix.some(v => !Number.isFinite(v)))
      throw new Error('Invalid model transform.')
    const identity = [...path, id].join('/')
    for (const [primitiveIndex, primitive] of (
      document.meshes?.[node.mesh]?.primitives ?? []
    ).entries()) {
      // Material variants share these vertices. Other extensions may change their interpretation.
      if (
        (primitive.mode ?? 4) !== 4 ||
        primitive.targets ||
        Object.keys(primitive.extensions ?? {}).some(
          ext => ext !== 'KHR_materials_variants',
        )
      )
        throw new Error('Unsupported exterior primitive.')
      const positions = accessor(primitive.attributes.POSITION, true)
      const indices =
        primitive.indices === undefined
          ? positions.map((_, i) => i)
          : accessor(primitive.indices, false).map(row => row[0])
      if (indices.length % 3) throw new Error('Incomplete triangle primitive.')
      for (let i = 0; i < indices.length; i += 3) {
        if (result.length >= 250000)
          throw new Error('Exterior exceeds the 250,000 triangle analysis limit.')
        const vertices = indices.slice(i, i + 3).map(index => {
          const p = positions[index]
          if (!p) throw new Error('Invalid triangle index.')
          return [0, 1, 2].map(
            axis =>
              matrix[axis] * p[0] +
              matrix[axis + 4] * p[1] +
              matrix[axis + 8] * p[2] +
              matrix[axis + 12],
          ) as Point3
        }) as [Point3, Point3, Point3]
        result.push({
          id: `${identity}:${primitiveIndex}:${i / 3}`,
          vertices,
          hasVariants: Boolean(primitive.extensions?.KHR_materials_variants),
        })
      }
    }
    for (const child of node.children ?? []) visit(child, matrix, [...path, id])
  }
  const roots = document.scenes?.[document.scene ?? 0]?.nodes
  if (!roots?.length) throw new Error('Model has no active scene.')
  for (const root of roots) visit(root, transform(), [])
  return result
}

/** Multiply column-major transforms. @param a Parent. @param b Local. @returns Composed matrix. */
function multiply(a: number[], b: number[]): number[] {
  return Array.from({ length: 16 }, (_, i) =>
    [0, 1, 2, 3].reduce(
      (sum, k) => sum + a[(i % 4) + 4 * k] * b[k + 4 * Math.floor(i / 4)],
      0,
    ),
  )
}
/** Construct the glTF TRS matrix. @param t Translation. @param q Quaternion. @param s Scale. @returns Column-major matrix. */
function transform(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]): number[] {
  const [x, y, z, w] = q
  return [
    (1 - 2 * y * y - 2 * z * z) * s[0],
    (2 * x * y + 2 * z * w) * s[0],
    (2 * x * z - 2 * y * w) * s[0],
    0,
    (2 * x * y - 2 * z * w) * s[1],
    (1 - 2 * x * x - 2 * z * z) * s[1],
    (2 * y * z + 2 * x * w) * s[1],
    0,
    (2 * x * z + 2 * y * w) * s[2],
    (2 * y * z - 2 * x * w) * s[2],
    (1 - 2 * x * x - 2 * y * y) * s[2],
    0,
    ...t,
    1,
  ]
}
