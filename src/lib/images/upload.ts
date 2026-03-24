type Heic2AnyConverter = (params: {
  blob: Blob
  toType: string
  quality?: number
}) => Promise<Blob | Blob[]>

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
])

const HEIC_FILE_EXTENSION_PATTERN = /\.(heic|heif)$/i

const isHeicLikeFile = (file: File): boolean =>
  HEIC_MIME_TYPES.has(file.type.toLowerCase()) ||
  HEIC_FILE_EXTENSION_PATTERN.test(file.name)

const toJpegFilename = (name: string): string =>
  name.replace(HEIC_FILE_EXTENSION_PATTERN, '.jpg')

const loadHeicConverter = async (): Promise<Heic2AnyConverter> => {
  const module = await import('heic2any')
  return module.default as Heic2AnyConverter
}

/**
 * Converts HEIC/HEIF uploads to JPEG before they enter the asset pipeline.
 *
 * @param file Source file selected by the user.
 * @param convert Optional injected converter for tests.
 * @returns Original file or a converted JPEG file.
 */
export async function normalizeUploadFileForAssetPipeline(
  file: File,
  convert: Heic2AnyConverter | null = null,
): Promise<File> {
  if (!isHeicLikeFile(file)) {
    return file
  }

  const converter = convert ?? (await loadHeicConverter())
  const converted = await converter({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })

  const jpegBlob = Array.isArray(converted) ? converted[0] : converted
  if (!(jpegBlob instanceof Blob)) {
    throw new Error('HEIC conversion did not return a JPEG blob')
  }

  return new File([jpegBlob], toJpegFilename(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}
