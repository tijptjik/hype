// CONTENT LOCALES
import { adaptContentMap, contentRowsToForm } from '#lib/i18n/contentRecords.js'

type LocaleRow = { locale?: string; [key: string]: unknown }

/** Narrow hydrated translations before adapting a mixed raw/profile response.
 * @param row Candidate translation row. @returns Whether it contains object content.
 */
function isLocaleRow(row: unknown): row is LocaleRow {
  return Boolean(row && typeof row === 'object' && !Array.isArray(row))
}

/** Preserve every content language in raw relations and already hydrated property maps.
 * @param input Relational rows, form-keyed map, or an absent relation.
 * @returns A form-keyed map, rejecting malformed rows and colliding locale identities.
 * @remarks This adapter never sends unknown content languages through the UI locale fallback.
 */
export function propertyLocalesToForm<T extends Record<string, unknown>>(
  input: T[] | Record<string, T> | null | undefined,
): Record<string, T>
export function propertyLocalesToForm(input: unknown): Record<string, LocaleRow>
export function propertyLocalesToForm(input: unknown): Record<string, LocaleRow> {
  if (input == null) return {}
  if (Array.isArray(input)) {
    if (!input.every(isLocaleRow)) throw new Error('Invalid property translations')
    return contentRowsToForm(input)
  }
  if (!isLocaleRow(input)) throw new Error('Invalid property translations')
  const rows: Record<string, LocaleRow> = {}
  for (const [locale, row] of Object.entries(input)) {
    if (!isLocaleRow(row)) throw new Error('Invalid property translation')
    rows[locale] = row
  }
  return adaptContentMap(rows)
}
