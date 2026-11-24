// TOC: Geometry contracts | Surface segmentation | Floor alignment
export type Point3 = [number, number, number]
export type ExteriorTriangle = {
  id: string
  vertices: [Point3, Point3, Point3]
  hasVariants?: boolean
}
export type FloorElevation = { id: string; label: string; elevation: number }
export type FacadeProposal = {
  id: string
  triangleIds: string[]
  normal: Point3
  area: number
  comparisonArea?: number
  minimum: Point3
  maximum: Point3
  bands: { floorId: string; label: string; bottom: number; top: number; area: number }[]
}
export type FacadeAnalysis = {
  version: 1
  assetId: string
  coordinateSystem: 'gltf-y-up-metres'
  floorSource: 'entered-elevations' | 'inferred-height'
  floors: FloorElevation[]
  facades: FacadeProposal[]
  excludedTriangles: number
}

/** Compute vector subtraction. @param a End point. @param b Origin. @returns Difference. */
function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
/** Compute a dot product. @param a First vector. @param b Second vector. @returns Scalar. */
function dot(a: Point3, b: Point3): number {
  return a.reduce((sum, value, i) => sum + value * b[i], 0)
}
/** Measure a polygon in three dimensions. @param points Ordered coplanar vertices. @returns Area in square metres. */
function area(points: Point3[]): number {
  let result = 0
  for (let i = 1; i + 1 < points.length; i++) {
    const a = subtract(points[i], points[0]),
      b = subtract(points[i + 1], points[0])
    result +=
      Math.hypot(
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ) / 2
  }
  return result
}
/** Clip a surface to one horizontal half-space. @param points Polygon vertices. @param height Plane elevation. @param above Keep above rather than below. @returns Clipped polygon. */
function clip(points: Point3[], height: number, above: boolean): Point3[] {
  const result: Point3[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length]
    const insideA = above ? a[1] >= height : a[1] <= height
    const insideB = above ? b[1] >= height : b[1] <= height
    if (insideA) result.push(a)
    if (insideA !== insideB) {
      const t = (height - a[1]) / (b[1] - a[1])
      result.push(a.map((value, j) => value + t * (b[j] - value)) as Point3)
    }
  }
  return result
}

/** Segment connected near-vertical planar surfaces and intersect them with floor bands.
 * @param triangles World-transformed triangles in glTF metre coordinates.
 * @param options Pinned asset and either explicit elevations or an estimated storey height.
 * @returns Reviewable proposals, never canonical building parts or unit associations.
 * @remarks Floors are half-open bands. Entered elevations use the same datum as the model.
 * Disconnected coplanar surfaces remain separate; roofs and degenerate triangles are excluded.
 */
export function segmentFacades(
  triangles: ExteriorTriangle[],
  options: {
    assetId: string
    floors?: FloorElevation[]
    storeyHeight?: number
    baseElevation?: number
  },
): FacadeAnalysis {
  if (!triangles.length || triangles.length > 250000)
    throw new Error('Model must contain 1–250,000 triangles.')
  if (!options.assetId) throw new Error('A pinned model asset is required.')
  const ids = new Set<string>()
  let minimumY = Infinity,
    maximumY = -Infinity
  const surfaces = triangles.flatMap(triangle => {
    if (ids.has(triangle.id)) throw new Error('Duplicate triangle identifier.')
    ids.add(triangle.id)
    if (
      triangle.vertices.some(
        point => point.length !== 3 || point.some(v => !Number.isFinite(v)),
      )
    )
      throw new Error('Invalid model coordinates.')
    for (const point of triangle.vertices) {
      minimumY = Math.min(minimumY, point[1])
      maximumY = Math.max(maximumY, point[1])
    }
    const a = subtract(triangle.vertices[1], triangle.vertices[0]),
      b = subtract(triangle.vertices[2], triangle.vertices[0])
    const cross: Point3 = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ]
    const length = Math.hypot(...cross)
    if (length < 1e-8 || Math.abs(cross[1] / length) > Math.sin((15 * Math.PI) / 180))
      return []
    const normal = cross.map(v => v / length) as Point3
    return [{ triangle, normal, area: length / 2 }]
  })
  let floors = options.floors?.map(floor => ({ ...floor })) ?? []
  const explicit = floors.length > 0
  if (!explicit) {
    const height = options.storeyHeight ?? 3
    const base = options.baseElevation ?? minimumY
    if (
      !Number.isFinite(height) ||
      height < 1 ||
      height > 20 ||
      !Number.isFinite(base) ||
      base > minimumY ||
      Math.ceil((maximumY - base) / height) > 300
    )
      throw new Error('Invalid inferred floor alignment.')
    floors = Array.from(
      { length: Math.max(1, Math.ceil((maximumY - base) / height)) },
      (_, i) => ({
        id: `band-${i + 1}`,
        label: `Inferred band ${i + 1}`,
        elevation: base + i * height,
      }),
    )
  }
  floors.sort((a, b) => a.elevation - b.elevation)
  if (
    floors.length > 300 ||
    new Set(floors.map(f => f.id)).size !== floors.length ||
    floors.some(
      (f, i) =>
        !f.id ||
        !f.label ||
        !Number.isFinite(f.elevation) ||
        (i > 0 && f.elevation <= floors[i - 1].elevation),
    )
  )
    throw new Error(
      'Floor elevations must be finite and distinct, with unique identifiers.',
    )

  // Shared quantized edges establish connectivity; plane checks prevent curved-surface chaining.
  const edges = new Map<string, number[]>()
  const neighbours = surfaces.map(() => new Set<number>())
  const key = (p: Point3) => p.map(v => Math.round(v * 1000)).join(',')
  surfaces.forEach((surface, i) => {
    const vertices = surface.triangle.vertices
    for (let j = 0; j < 3; j++) {
      const edge = [key(vertices[j]), key(vertices[(j + 1) % 3])].sort().join('|')
      const previous = edges.get(edge) ?? []
      if (previous.length > 32)
        throw new Error('Non-manifold edge exceeds the analysis limit.')
      for (const other of previous) {
        neighbours[i].add(other)
        neighbours[other].add(i)
      }
      previous.push(i)
      edges.set(edge, previous)
    }
  })
  const visited = new Set<number>(),
    facades: FacadeProposal[] = []
  for (let seed = 0; seed < surfaces.length; seed++) {
    if (visited.has(seed)) continue
    const reference = surfaces[seed],
      queue = [seed],
      members: number[] = []
    visited.add(seed)
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      members.push(current)
      for (const neighbour of neighbours[current]) {
        if (visited.has(neighbour)) continue
        const candidate = surfaces[neighbour]
        if (
          Math.abs(dot(reference.normal, candidate.normal)) <
            Math.cos((5 * Math.PI) / 180) ||
          candidate.triangle.vertices.some(
            p =>
              Math.abs(
                dot(reference.normal, subtract(p, reference.triangle.vertices[0])),
              ) > 0.02,
          )
        )
          continue
        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
    const points = members.flatMap(i => surfaces[i].triangle.vertices)
    const minimum = [0, 1, 2].map(axis =>
      points.reduce((v, p) => Math.min(v, p[axis]), Infinity),
    ) as Point3
    const maximum = [0, 1, 2].map(axis =>
      points.reduce((v, p) => Math.max(v, p[axis]), -Infinity),
    ) as Point3
    const bands = floors.flatMap((floor, i) => {
      const bottom = floor.elevation,
        top = floors[i + 1]?.elevation ?? maximumY
      if (top <= bottom) return []
      const bandArea = members.reduce(
        (sum, index) =>
          sum +
          area(clip(clip(surfaces[index].triangle.vertices, bottom, true), top, false)),
        0,
      )
      return bandArea > 1e-8
        ? [{ floorId: floor.id, label: floor.label, bottom, top, area: bandArea }]
        : []
    })
    facades.push({
      id: `facade-${facades.length + 1}`,
      triangleIds: members.map(i => surfaces[i].triangle.id),
      normal: reference.normal,
      area: members.reduce((sum, i) => sum + surfaces[i].area, 0),
      comparisonArea: members.reduce(
        (sum, i) => sum + (surfaces[i].triangle.hasVariants ? surfaces[i].area : 0),
        0,
      ),
      minimum,
      maximum,
      bands,
    })
  }
  return {
    version: 1,
    assetId: options.assetId,
    coordinateSystem: 'gltf-y-up-metres',
    floorSource: explicit ? 'entered-elevations' : 'inferred-height',
    floors,
    facades,
    excludedTriangles: triangles.length - surfaces.length,
  }
}
