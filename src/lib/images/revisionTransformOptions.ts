/** The bounded display operations supported by the app-owned asset Worker. */
export type RevisionTransformOptions = {
  cropMode: 'c_fit' | 'c_fill' | 'c_thumb'
  withoutEnlargement: boolean
  width?: number
  height?: number
  gravity: 'g_auto' | 'g_center'
  quality: string
  format: 'webp' | 'jpeg' | 'png' | 'avif'
}

/**
 * Validates revision display options at both ends of the private service boundary.
 * @param url Requested display options; no source locator or metadata is accepted here.
 * @returns Bounded resize, crop and encode options.
 * @throws Error when an option is unsupported or ambiguous.
 */
export function parseRevisionTransformOptions(url: URL): RevisionTransformOptions {
  let mode = 'c_fit',
    width: number | undefined,
    height: number | undefined
  const seen = new Set<string>()
  const transformation = url.searchParams.get('t')
  if (!transformation) throw new Error('Invalid image transformation')
  for (const part of transformation.split(',')) {
    if (['c_fit', 'c_fill', 'c_thumb', 'c_limit'].includes(part)) {
      if (seen.has('c')) throw new Error('Invalid image transformation')
      seen.add('c')
      mode = part
    } else {
      const match = /^(w|h)_(\d+)$/.exec(part)
      if (!match || seen.has(match[1])) throw new Error('Invalid image transformation')
      const value = Number(match[2])
      if (value < 1 || value > 2048)
        throw new Error('Image dimensions are outside the supported range')
      seen.add(match[1])
      if (match[1] === 'w') width = value
      else height = value
    }
  }
  const requestedFormat = url.searchParams.get('format') ?? 'auto'
  const format =
    requestedFormat === 'auto'
      ? 'webp'
      : requestedFormat === 'jpg'
        ? 'jpeg'
        : requestedFormat
  if (!['webp', 'jpeg', 'png', 'avif'].includes(format))
    throw new Error('Unsupported image format')
  const quality = url.searchParams.get('quality') ?? 'auto'
  if (
    quality !== 'auto' &&
    (!/^\d+$/.test(quality) || Number(quality) < 1 || Number(quality) > 100)
  )
    throw new Error('Invalid image quality')
  return {
    cropMode:
      mode === 'c_limit' ? 'c_fit' : (mode as RevisionTransformOptions['cropMode']),
    withoutEnlargement: mode === 'c_limit',
    width,
    height,
    gravity: url.searchParams.get('gravity') === 'center' ? 'g_center' : 'g_auto',
    quality,
    format: format as RevisionTransformOptions['format'],
  }
}
