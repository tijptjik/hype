import type { NormalizedImageUploadAsset } from '$lib/types'

type Heic2AnyConverter = (params: {
  blob: Blob
  toType: string
  quality?: number
}) => Promise<Blob | Blob[]>

type TiffToJpegConverter = (file: File) => Promise<File>
type JxlToJpegConverter = (file: File) => Promise<File>

type UtifIfd = {
  width?: number
  height?: number
  data?: Uint8Array
}

type UtifModule = {
  decode: (buffer: ArrayBuffer) => UtifIfd[]
  decodeImage: (buffer: ArrayBuffer, ifd: UtifIfd) => void
  toRGBA8: (ifd: UtifIfd) => Uint8Array
}

type JxlDecoder = (buffer: ArrayBuffer) => Promise<ImageData>

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
])

const TIFF_MIME_TYPES = new Set(['image/tiff', 'image/x-tiff'])
const JXL_MIME_TYPES = new Set(['image/jxl'])
const HEIC_FILE_EXTENSION_PATTERN = /\.(heic|heif)$/i
const TIFF_FILE_EXTENSION_PATTERN = /\.(tif|tiff)$/i
const JXL_FILE_EXTENSION_PATTERN = /\.jxl$/i
const MAX_UPLOAD_DIMENSION = 2048
const AVIF_MIME_TYPE = 'image/avif'
const RESIZABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const NON_RESIZABLE_MIME_TYPES = new Set(['image/gif', 'image/svg+xml'])

const isHeicLikeFile = (file: File): boolean =>
  HEIC_MIME_TYPES.has(file.type.toLowerCase()) ||
  HEIC_FILE_EXTENSION_PATTERN.test(file.name)

const isTiffLikeFile = (file: File): boolean =>
  TIFF_MIME_TYPES.has(file.type.toLowerCase()) ||
  TIFF_FILE_EXTENSION_PATTERN.test(file.name)

const isJxlLikeFile = (file: File): boolean =>
  JXL_MIME_TYPES.has(file.type.toLowerCase()) ||
  JXL_FILE_EXTENSION_PATTERN.test(file.name)

const isAvifFile = (file: File): boolean => file.type.toLowerCase() === AVIF_MIME_TYPE

const isResizableRasterFile = (file: File): boolean => {
  const normalizedType = file.type.toLowerCase()
  if (NON_RESIZABLE_MIME_TYPES.has(normalizedType)) {
    return false
  }

  return RESIZABLE_MIME_TYPES.has(normalizedType)
}

const toJpegFilename = (name: string): string =>
  name
    .replace(HEIC_FILE_EXTENSION_PATTERN, '.jpg')
    .replace(TIFF_FILE_EXTENSION_PATTERN, '.jpg')
    .replace(JXL_FILE_EXTENSION_PATTERN, '.jpg')

const loadHeicConverter = async (): Promise<Heic2AnyConverter> => {
  const module = await import('heic2any')
  return module.default as Heic2AnyConverter
}

const loadUtifModule = async (): Promise<UtifModule> => {
  const module = (await import('utif')) as {
    default?: UtifModule
  } & Partial<UtifModule>

  return (module.default ?? module) as UtifModule
}

const loadJxlDecoder = async (): Promise<JxlDecoder> => {
  const module = await import('@jsquash/jxl/decode')
  return module.default as JxlDecoder
}

/**
 * Converts a TIFF upload to JPEG without relying on native browser TIFF support.
 *
 * @param file Source TIFF file.
 * @returns JPEG file with the same logical filename.
 */
const transcodeTiffToJpeg = async (file: File): Promise<File> => {
  const buffer = await file.arrayBuffer()
  const UTIF = await loadUtifModule()
  const ifds = UTIF.decode(buffer)
  const primaryImage = ifds[0]

  if (!primaryImage) {
    throw new Error('TIFF conversion did not find a readable image frame')
  }

  UTIF.decodeImage(buffer, primaryImage)

  const width = primaryImage.width
  const height = primaryImage.height
  if (
    typeof document === 'undefined' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    width < 1 ||
    height < 1
  ) {
    throw new Error('TIFF conversion could not determine image dimensions')
  }

  const context = document.createElement('canvas').getContext('2d')
  if (!context) {
    throw new Error('Could not initialize a 2D canvas context for TIFF conversion')
  }

  context.canvas.width = width
  context.canvas.height = height

  // UTIF normalizes TIFF pixel formats into RGBA bytes that canvas can re-encode.
  const rgba = UTIF.toRGBA8(primaryImage)
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  context.putImageData(imageData, 0, 0)

  return await new Promise((resolve, reject) => {
    context.canvas.toBlob(
      blob => {
        if (!(blob instanceof Blob)) {
          reject(new Error('TIFF conversion did not produce a JPEG blob'))
          return
        }

        resolve(
          new File([blob], toJpegFilename(file.name), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }),
        )
      },
      'image/jpeg',
      0.92,
    )
  })
}

/**
 * Re-encodes a browser-decodable image as JPEG.
 *
 * @param file Source image file.
 * @returns JPEG file with the same logical filename.
 */
const transcodeBrowserDecodableImageToJpeg = async (file: File): Promise<File> =>
  await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height

      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(
          new Error('Could not initialize a 2D canvas context for JPEG conversion'),
        )
        return
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(objectUrl)

          if (!(blob instanceof Blob)) {
            reject(new Error('Canvas conversion did not produce a JPEG blob'))
            return
          }

          resolve(
            new File([blob], toJpegFilename(file.name), {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            }),
          )
        },
        'image/jpeg',
        0.92,
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to decode image during JPEG conversion'))
    }

    image.src = objectUrl
  })

/**
 * Converts a JPEG XL upload to JPEG without relying on native browser JPEG XL support.
 *
 * @param file Source JPEG XL file.
 * @returns JPEG file with the same logical filename.
 */
const transcodeJxlToJpeg = async (file: File): Promise<File> => {
  if (typeof document === 'undefined') {
    throw new Error('JPEG XL conversion requires a browser document context')
  }

  const decode = await loadJxlDecoder()
  const imageData = await decode(await file.arrayBuffer())
  const context = document.createElement('canvas').getContext('2d')

  if (!context) {
    throw new Error('Could not initialize a 2D canvas context for JPEG XL conversion')
  }

  context.canvas.width = imageData.width
  context.canvas.height = imageData.height
  context.putImageData(imageData, 0, 0)

  return await new Promise((resolve, reject) => {
    context.canvas.toBlob(
      blob => {
        if (!(blob instanceof Blob)) {
          reject(new Error('JPEG XL conversion did not produce a JPEG blob'))
          return
        }

        resolve(
          new File([blob], toJpegFilename(file.name), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }),
        )
      },
      'image/jpeg',
      0.92,
    )
  })
}

/**
 * Loads intrinsic dimensions from a browser-readable image file.
 *
 * @param file Source file.
 * @returns Natural width/height when available.
 */
const getImageDimensions = async (
  file: File,
): Promise<{ width: number | null; height: number | null }> =>
  await new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      })
      URL.revokeObjectURL(objectUrl)
    }

    image.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(objectUrl)
    }

    image.src = objectUrl
  })

/**
 * Resizes a raster upload to fit inside the configured max dimension.
 *
 * @param file Source file.
 * @param width Current width.
 * @param height Current height.
 * @returns Resized file plus uploaded dimensions.
 */
const resizeRasterUpload = async (
  file: File,
  width: number,
  height: number,
): Promise<{ file: File; width: number; height: number }> =>
  await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = async () => {
      try {
        const ratio = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(width, height))
        const targetWidth = Math.max(1, Math.round(width * ratio))
        const targetHeight = Math.max(1, Math.round(height * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight

        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Could not initialize a 2D canvas context for image resize'))
          return
        }

        context.drawImage(image, 0, 0, targetWidth, targetHeight)

        const outputType = file.type || 'image/jpeg'
        canvas.toBlob(
          blob => {
            URL.revokeObjectURL(objectUrl)

            if (!(blob instanceof Blob)) {
              reject(new Error('Canvas resize did not produce an image blob'))
              return
            }

            resolve({
              file: new File([blob], file.name, {
                type: outputType,
                lastModified: file.lastModified,
              }),
              width: targetWidth,
              height: targetHeight,
            })
          },
          outputType,
          outputType === 'image/png' ? undefined : 0.9,
        )
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to decode image during client-side resize'))
    }

    image.src = objectUrl
  })

/**
 * Converts upload formats that browsers cannot preview reliably into a preview-safe file.
 *
 * @param file Source file selected by the user.
 * @param convert Optional injected HEIC converter for tests.
 * @param convertTiff Optional injected TIFF converter for tests.
 * @param convertJxl Optional injected JPEG XL converter for tests.
 * @returns Preview-safe file for optimistic rendering.
 */
export async function createPreviewableUploadFile(
  file: File,
  convert: Heic2AnyConverter | null = null,
  convertTiff: TiffToJpegConverter | null = null,
  convertJxl: JxlToJpegConverter | null = null,
): Promise<File> {
  if (isHeicLikeFile(file)) {
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

  if (isTiffLikeFile(file)) {
    const tiffConverter = convertTiff ?? transcodeTiffToJpeg
    return await tiffConverter(file)
  }

  if (isJxlLikeFile(file)) {
    const jxlConverter = convertJxl ?? transcodeJxlToJpeg
    return await jxlConverter(file)
  }

  return file
}

/**
 * Converts HEIC/HEIF and TIFF uploads to JPEG, then caps large raster uploads at 2048px
 * before they enter the asset pipeline.
 *
 * @param file Source file selected by the user.
 * @param convert Optional injected converter for tests.
 * @param convertTiff Optional injected TIFF converter for tests.
 * @param convertJxl Optional injected JPEG XL converter for tests.
 * @returns Upload file plus original/uploaded dimension metadata.
 */
export async function normalizeUploadFileForAssetPipeline(
  file: File,
  convert: Heic2AnyConverter | null = null,
  convertTiff: TiffToJpegConverter | null = null,
  convertJxl: JxlToJpegConverter | null = null,
): Promise<NormalizedImageUploadAsset> {
  const originalDimensions = await getImageDimensions(file)
  const originalFilename = file.name
  const originalExtension = file.name.split('.').pop()?.toLowerCase() ?? null
  let workingFile = await createPreviewableUploadFile(
    file,
    convert,
    convertTiff,
    convertJxl,
  )

  let uploadDimensions = await getImageDimensions(workingFile)

  if (
    isAvifFile(workingFile) &&
    typeof uploadDimensions.width === 'number' &&
    typeof uploadDimensions.height === 'number' &&
    Math.max(uploadDimensions.width, uploadDimensions.height) > MAX_UPLOAD_DIMENSION
  ) {
    workingFile = await transcodeBrowserDecodableImageToJpeg(workingFile)
    uploadDimensions = await getImageDimensions(workingFile)
  }
  const canResize =
    typeof document !== 'undefined' &&
    isResizableRasterFile(workingFile) &&
    typeof uploadDimensions.width === 'number' &&
    typeof uploadDimensions.height === 'number'

  if (
    canResize &&
    Math.max(uploadDimensions.width, uploadDimensions.height) > MAX_UPLOAD_DIMENSION
  ) {
    const resized = await resizeRasterUpload(
      workingFile,
      uploadDimensions.width,
      uploadDimensions.height,
    )

    return {
      file: resized.file,
      originalFilename,
      originalExtension,
      originalWidth: originalDimensions.width ?? uploadDimensions.width,
      originalHeight: originalDimensions.height ?? uploadDimensions.height,
      uploadedWidth: resized.width,
      uploadedHeight: resized.height,
      wasResized: true,
    }
  }

  return {
    file: workingFile,
    originalFilename,
    originalExtension,
    originalWidth: originalDimensions.width ?? uploadDimensions.width,
    originalHeight: originalDimensions.height ?? uploadDimensions.height,
    uploadedWidth: uploadDimensions.width,
    uploadedHeight: uploadDimensions.height,
    wasResized: false,
  }
}
