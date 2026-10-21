// TYPES
import type { ImageCapture } from './capture'

/** Format an expressed capture value without inventing a time or changing calendar precision.
 * @param capture Authored capture assertion. @returns Date, approximate date or interval as supplied.
 */
export function captureLabel(capture: ImageCapture): string {
  const value = capture.endValue
    ? `${capture.value} – ${capture.endValue}`
    : capture.value
  return `${capture.approximate ? '≈ ' : ''}${value}`
}

/** Format EXIF/record dates while keeping date-only values independent of timezone conversion.
 * @param value Date or timestamp. @param locale Interface language tag.
 * @returns Readable date/time or the original nonstandard EXIF expression.
 */
export function imageDateLabel(
  value: string | null | undefined,
  locale = 'en',
): string | null {
  if (!value) return null
  if (/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Hong_Kong',
      }).format(date)
}
