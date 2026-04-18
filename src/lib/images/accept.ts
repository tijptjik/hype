export const SUPPORTED_UPLOAD_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
  'image/tiff',
  'image/x-tiff',
  'image/jxl',
] as const

const SUPPORTED_UPLOAD_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
  '.jxl',
] as const

const SUPPORTED_UPLOAD_IMAGE_ACCEPT_TOKENS = [
  ...SUPPORTED_UPLOAD_IMAGE_CONTENT_TYPES,
  ...SUPPORTED_UPLOAD_IMAGE_EXTENSIONS,
] as const

const SUPPORTED_UPLOAD_IMAGE_CONTENT_TYPE_SET = new Set(
  SUPPORTED_UPLOAD_IMAGE_CONTENT_TYPES,
)

export const SUPPORTED_UPLOAD_IMAGE_ACCEPT = [...SUPPORTED_UPLOAD_IMAGE_ACCEPT_TOKENS]

export const SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE =
  SUPPORTED_UPLOAD_IMAGE_ACCEPT_TOKENS.join(',')

export const isSupportedUploadImageContentType = (value: string): boolean =>
  SUPPORTED_UPLOAD_IMAGE_CONTENT_TYPE_SET.has(value.trim().toLowerCase())
