// TYPES
import type { BatchUploadResult } from './types'

export type UploadStatusBadgeTone = 'neutral' | 'success' | 'warning' | 'error'

/**
 * Formats a byte count for compact import row metadata.
 *
 * @param size - File size in bytes.
 * @returns Human-readable size string.
 */
export function formatImportFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Maps upload status to the closest badge tone.
 *
 * @param status - Current upload row status.
 * @returns Badge tone for the row status.
 */
export function getUploadStatusBadgeTone(
  status: BatchUploadResult['status'],
): UploadStatusBadgeTone {
  if (status === 'success') return 'success'
  if (status === 'uploading' || status === 'conflict') return 'warning'
  if (status === 'error') return 'error'
  return 'neutral'
}

/**
 * Maps upload status to concise user-facing badge copy.
 *
 * @param status - Current upload row status.
 * @returns Badge text for the row status.
 */
export function getUploadStatusBadgeText(status: BatchUploadResult['status']): string {
  if (status === 'pending') return 'analysing'
  if (status === 'conflict') return 'duplicate'
  return status
}
