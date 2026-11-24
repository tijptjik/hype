// TOC: Image references | Piecewise vertical registration
export type FloorImageReference =
  | 'model'
  | 'government-model'
  | { blend: number; viewId: string }
type Anchor = [number, number]
const labels = ['Government', 'Revised', 'AI-generated']

/** Describe the texture mixture used when positioning a line.
 * @param blend Slider position from the government to generated image. @returns Accessible layer names and weights.
 */
export function textureLabel(blend: number): string {
  if (Number.isInteger(blend)) return labels[blend]
  const percent = Math.round(100 * (blend % 1))
  return `${100 - percent}% ${labels[Math.floor(blend)]}, ${percent}% ${labels[Math.ceil(blend)]}`
}

/** Read ordered photo and generated elevation correspondences for this exact façade.
 * @param document Metadata from the currently loaded comparison GLB. @param viewId Displayed façade.
 * @returns Valid registration anchors, or an empty array for unregistered imagery.
 * @remarks Accepts legacy single records and per-façade arrays. Ambiguous duplicate
 * registrations are rejected rather than transferring lines against an arbitrary image.
 */
export function floorTextureAnchors(document: unknown, viewId?: string): Anchor[] {
  const extras = (document as { extras?: unknown } | null)?.extras
  const data = (
    extras as {
      exteriorFloorRegistration?: unknown
    } | null
  )?.exteriorFloorRegistration
  if (!viewId) return []
  // Select exactly one registration for this view; metadata for other façades cannot move its lines.
  const matches = (Array.isArray(data) ? data : [data]).filter(
    (item): item is { viewId: string; anchors?: unknown } =>
      !!item && typeof item === 'object' && item.viewId === viewId,
  )
  if (matches.length !== 1) return []
  const anchors = matches[0].anchors
  if (!Array.isArray(anchors) || anchors.length < 2 || anchors.length > 301) return []
  // Both directions must be invertible and join the unregistered geometry continuously at the ends.
  for (const [i, a] of anchors.entries()) {
    if (
      !Array.isArray(a) ||
      a.length !== 2 ||
      !a.every(Number.isFinite) ||
      (i > 0 && (a[0] <= anchors[i - 1][0] || a[1] <= anchors[i - 1][1]))
    )
      return []
  }
  if ([anchors[0], anchors[anchors.length - 1]].some(([a, b]) => a !== b)) return []
  return anchors
}

/** Project a canonical height into the selected image, or invert a pointer edit back to model space.
 * @param height Input elevation in metres. @param anchors Ordered pairs of revised and generated image heights.
 * @param blend Visible slider position. @param inverse Convert display height to canonical height when true.
 * @returns Interpolated elevation, with identity outside the calibrated band.
 */
export function textureHeight(
  height: number,
  anchors: Anchor[],
  blend: number,
  inverse = false,
): number {
  if (
    blend <= 1 ||
    anchors.length < 2 ||
    height <= anchors[0][0] ||
    height >= anchors[anchors.length - 1][0]
  )
    return height
  const mix = blend - 1
  const displayed = ([photo, ai]: Anchor) => photo + mix * (ai - photo)
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1],
      b = anchors[i]
    const x0 = inverse ? displayed(a) : a[0],
      x1 = inverse ? displayed(b) : b[0]
    if (height > x1) continue
    const y0 = inverse ? a[0] : displayed(a),
      y1 = inverse ? b[0] : displayed(b)
    return y0 + ((height - x0) / (x1 - x0)) * (y1 - y0)
  }
  return height
}
