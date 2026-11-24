// TOC: Alignment contracts | Boundary editing | Directional views
// TYPES
import type { FacadeProposal, Point3 } from './facades'

export const floorTypes = ['basement', 'ground', 'mezzanine', 'floor'] as const
export type FloorDesignation = {
  type: (typeof floorTypes)[number]
  number?: number
  name?: string
}
export type FloorLine = {
  id: string
  elevation: number
  locked: boolean
  designation?: FloorDesignation
}

/** Validate persisted floor metadata while accepting older unnamed boundaries.
 * @param value Stored metadata. @returns Whether the designation is safe to restore.
 */
export function validFloorDesignation(
  value: unknown,
): value is FloorDesignation | undefined {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const item = value as FloorDesignation
  return (
    floorTypes.includes(item.type) &&
    (item.number === undefined
      ? item.type !== 'basement'
      : Number.isInteger(item.number) && item.number >= 1 && item.number <= 999) &&
    (item.name === undefined || typeof item.name === 'string')
  )
}

/** Interpret the mezzanine name used before it had a dedicated floor type.
 * @param designation Stored floor metadata. @returns Effective floor type.
 */
function floorType(designation?: FloorDesignation): FloorDesignation['type'] {
  if (
    designation?.type === 'floor' &&
    designation.name?.trim().toLowerCase() === 'mezzanine'
  )
    return 'mezzanine'
  return designation?.type ?? 'floor'
}

/** Resolve display labels and editor numbers in elevation order.
 * @param lines Ordered boundaries, including the base and top.
 * @returns One floor designation and display label per boundary.
 * @remarks Explicit floor numbers anchor the sequence. Existing named mezzanines
 * predate the mezzanine type and also skip a number.
 */
export function resolveFloorLines(
  lines: readonly FloorLine[],
): { type: FloorDesignation['type']; number: number; label: string }[] {
  let nextNumber = 1
  return lines.map(({ designation }, index) => {
    const name = designation?.name?.trim()
    const type = floorType(designation)
    const number =
      type === 'basement' || type === 'floor'
        ? (designation?.number ?? nextNumber)
        : nextNumber

    if (index === lines.length - 1) return { type, number, label: 'Top' }
    if (index === 0 && !designation) return { type, number, label: 'Base' }

    // Only numbered storeys advance the sequence above ground.
    if (type === 'floor') nextNumber = number + 1
    if (type === 'ground') nextNumber = 1
    const labels = {
      basement: `Basement ${number}`,
      floor: `Floor ${number}`,
      ground: 'Ground floor',
      mezzanine: 'Mezzanine',
    }
    return { type, number, label: name || labels[type] }
  })
}

/** Change a floor designation and keep numbered floors consecutive after a mezzanine edit.
 * @param lines Ordered boundaries. @param index Edited boundary. @param designation New metadata.
 * @returns Updated boundaries with the original heights, locks and custom names.
 */
export function designateFloorLine(
  lines: FloorLine[],
  index: number,
  designation: FloorDesignation,
): FloorLine[] {
  if (index < 0 || index >= lines.length - 1 || !validFloorDesignation(designation))
    return lines
  const next = [...lines]
  next[index] = { ...lines[index], designation }
  const wasMezzanine = floorType(lines[index].designation) === 'mezzanine'
  if (wasMezzanine === (floorType(designation) === 'mezzanine')) return next

  // Release old numbered overrides above the edit so the normal sequence can fill them in.
  for (let i = index + 1; i < next.length - 1; i++) {
    const line = next[i]
    if (
      line.designation?.number === undefined ||
      floorType(line.designation) !== 'floor'
    )
      continue
    const automatic = { ...line.designation }
    delete automatic.number
    next[i] = { ...line, designation: automatic }
  }
  return next
}

export type FacadeView = {
  id: string
  normal: Point3
  right: Point3
  centre: Point3
  width: number
  bottom: number
  top: number
  area: number
  comparisonArea: number
  surfaceIds: string[]
}

/** Distribute free lines between consecutive anchors, preserving order and locked heights.
 * @param lines Ordered floor boundaries. @returns A new set of boundaries.
 * @remarks The lowest and highest lines are always distribution anchors, even when draggable.
 */
export function distributeFloorLines(lines: FloorLine[]): FloorLine[] {
  const result = lines.map(line => ({ ...line }))
  const anchors = result.flatMap((line, i) =>
    i === 0 || i === result.length - 1 || line.locked ? [i] : [],
  )
  for (let i = 1; i < anchors.length; i++) {
    const start = anchors[i - 1],
      end = anchors[i]
    for (let j = start + 1; j < end; j++) {
      result[j].elevation =
        result[start].elevation +
        ((result[end].elevation - result[start].elevation) * (j - start)) /
          (end - start)
    }
  }
  return result
}

/** Add a boundary inside the largest gap, then distribute around existing anchors.
 * @param lines Ordered boundaries. @param id New unique identity. @returns Redistributed boundaries.
 */
export function addFloorLine(lines: FloorLine[], id: string): FloorLine[] {
  if (lines.length < 2 || lines.length >= 100 || lines.some(line => line.id === id))
    return lines
  let gap = 0
  for (let i = 1; i < lines.length - 1; i++)
    if (
      lines[i + 1].elevation - lines[i].elevation >
      lines[gap + 1].elevation - lines[gap].elevation
    )
      gap = i
  const result = lines.map(line => ({ ...line }))
  result.splice(gap + 1, 0, {
    id,
    elevation: (lines[gap].elevation + lines[gap + 1].elevation) / 2,
    locked: false,
  })
  return distributeFloorLines(result)
}

/** Remove an unlocked intermediate boundary without moving the remaining floors.
 * @param lines Ordered boundaries. @param id Boundary to remove. @returns Remaining boundaries.
 * @remarks Base, top and locked boundaries are protected; redistribution is explicit.
 */
export function removeFloorLine(lines: FloorLine[], id: string): FloorLine[] {
  const index = lines.findIndex(line => line.id === id)
  if (index <= 0 || index === lines.length - 1 || lines[index].locked) return lines
  return lines.filter(line => line.id !== id)
}

/** Move just one unlocked boundary; never reorder or redistribute other boundaries.
 * @param lines Ordered boundaries. @param id Boundary identity. @param elevation Requested height.
 * @param bounds Model vertical extent. @returns Updated boundaries, clamped to neighbours.
 */
export function moveFloorLine(
  lines: FloorLine[],
  id: string,
  elevation: number,
  bounds: [number, number],
): FloorLine[] {
  const index = lines.findIndex(line => line.id === id)
  if (index < 0 || lines[index].locked || !Number.isFinite(elevation)) return lines
  const low = index === 0 ? bounds[0] : lines[index - 1].elevation + 0.01
  const high =
    index === lines.length - 1 ? bounds[1] : lines[index + 1].elevation - 0.01
  if (high < low) return lines
  return lines.map((line, i) =>
    i === index
      ? { ...line, elevation: Math.min(high, Math.max(low, elevation)) }
      : line,
  )
}

/** Combine coplanar fragments with similar facing directions into useful building views.
 * @param surfaces Detected surface proposals. @returns Directions ordered around the model, largest face first.
 * @remarks Model axes alone do not establish geographic north or the building's semantic front.
 */
export function facadeViews(surfaces: FacadeProposal[]): FacadeView[] {
  const groups: { normal: Point3; surfaces: FacadeProposal[] }[] = []
  for (const surface of [...surfaces].sort((a, b) => b.area - a.area)) {
    const length = Math.hypot(surface.normal[0], surface.normal[2])
    if (length < 1e-8) continue
    const normal: Point3 = [surface.normal[0] / length, 0, surface.normal[2] / length]
    const group = groups.find(
      group =>
        group.normal[0] * normal[0] + group.normal[2] * normal[2] >
        Math.cos(Math.PI / 12),
    )
    if (group) group.surfaces.push(surface)
    else groups.push({ normal, surfaces: [surface] })
  }
  const views = groups
    .map((group, index) => {
      const right: Point3 = [group.normal[2], 0, -group.normal[0]]
      let left = Infinity,
        rightEdge = -Infinity,
        depth = -Infinity,
        bottom = Infinity,
        top = -Infinity
      for (const surface of group.surfaces) {
        bottom = Math.min(bottom, surface.minimum[1])
        top = Math.max(top, surface.maximum[1])
        for (const x of [surface.minimum[0], surface.maximum[0]])
          for (const z of [surface.minimum[2], surface.maximum[2]]) {
            const horizontal = x * right[0] + z * right[2]
            left = Math.min(left, horizontal)
            rightEdge = Math.max(rightEdge, horizontal)
            depth = Math.max(depth, x * group.normal[0] + z * group.normal[2])
          }
      }
      const mid = (left + rightEdge) / 2
      return {
        id: `view-${index + 1}`,
        normal: group.normal,
        right,
        centre: [
          right[0] * mid + group.normal[0] * depth,
          (bottom + top) / 2,
          right[2] * mid + group.normal[2] * depth,
        ] as Point3,
        width: rightEdge - left,
        bottom,
        top,
        area: group.surfaces.reduce((sum, surface) => sum + surface.area, 0),
        comparisonArea: group.surfaces.reduce(
          (sum, surface) => sum + (surface.comparisonArea ?? 0),
          0,
        ),
        surfaceIds: group.surfaces.map(surface => surface.id),
      }
    })
    .sort(
      (a, b) =>
        Math.atan2(a.normal[0], a.normal[2]) - Math.atan2(b.normal[0], b.normal[2]),
    )
  const front = views.reduce(
    (best, view, index) => (view.area > (views[best]?.area ?? 0) ? index : best),
    0,
  )
  return [...views.slice(front), ...views.slice(0, front)]
}
