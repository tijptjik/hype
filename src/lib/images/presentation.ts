/** Stored presentation choices; `contain` retains the existing blurred treatment. */
export const IMAGE_PRESENTATION_MODES = ['cover', 'contain', 'cast-edges'] as const
export type ImagePresentation = (typeof IMAGE_PRESENTATION_MODES)[number]
export type ImageBackdropMode = 'blur' | 'edges'

/**
 * Keeps legacy or absent preferences on the established full-image treatment.
 * @param mode - Untrusted or optional stored preference.
 * @returns Supported presentation choice.
 */
export function normalizeImagePresentation(mode?: string | null): ImagePresentation {
  return mode === 'cover' || mode === 'cast-edges' ? mode : 'contain'
}

/**
 * Resolves persisted presentation into independent foreground and backdrop policies.
 * @param mode - Saved policy, including older records without a preference.
 * @returns Foreground fit and the treatment for any unoccupied space.
 */
export function resolveImagePresentation(mode?: string | null): {
  fit: 'cover' | 'fit'
  backdrop: ImageBackdropMode
} {
  return {
    fit: mode === 'cover' ? 'cover' : 'fit',
    backdrop: mode === 'cast-edges' ? 'edges' : 'blur',
  }
}

/**
 * Steps past thin export rims before extending a source edge across a large gap.
 * @param size - Intrinsic dimension along the sampling axis.
 * @returns One-percent inset, bounded so a one-pixel slice stays inside tiny images.
 * @remarks The foreground is unchanged; only the background's sampling position moves.
 */
export function getImageEdgeInset(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0
  return Math.min(Math.ceil(size * 0.01), Math.floor((size - 1) / 2))
}

/**
 * Computes the letterbox gaps into which one-pixel source borders are stretched.
 * @param imageWidth - Intrinsic source width.
 * @param imageHeight - Intrinsic source height.
 * @param width - Available width in CSS pixels.
 * @param height - Available height in CSS pixels.
 * @returns Symmetric horizontal and vertical gaps; invalid sizes produce no fill.
 */
export function getImageEdgeGaps(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (
    ![imageWidth, imageHeight, width, height].every(
      value => Number.isFinite(value) && value > 0,
    )
  ) {
    return { x: 0, y: 0 }
  }
  const scale = Math.min(width / imageWidth, height / imageHeight)
  return {
    x: Math.max(0, (width - imageWidth * scale) / 2),
    y: Math.max(0, (height - imageHeight * scale) / 2),
  }
}
