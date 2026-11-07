// TYPES
import type { EmbedConfig } from './config'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

/** Reads a localized label without touching account preferences.
 * @param value Translation-bearing resource. @param lang Embed language. @param field Label field.
 * @param fallback Missing-label fallback. @returns Plain text for safe rendering.
 */
export function embedLabel(
  value: unknown,
  lang: EmbedConfig['lang'],
  field = 'name',
  fallback = '',
): string {
  if (!value || typeof value !== 'object' || !('i18n' in value)) return fallback
  const i18n = value.i18n as Record<string, Record<string, unknown>> | null
  const key = lang === 'zh-Hant' ? 'zhHant' : lang === 'zh-Hans' ? 'zhHans' : 'en'
  for (const locale of [key, lang, lang.toLowerCase(), 'en', 'zhHant', 'zhHans']) {
    const text = i18n?.[locale]?.[field]
    if (typeof text === 'string' && text.trim()) return text
  }
  return fallback
}

/** Finds a representative coordinate for point and polygon map records.
 * @param feature Public feature. @returns First finite coordinate, or null.
 */
export function embedCoordinate(
  feature: FeatureFromCollection,
): [number, number] | null {
  const geometry = feature.geometry
  if (!geometry || !('coordinates' in geometry)) return null
  let point: unknown = geometry.coordinates
  while (Array.isArray(point) && Array.isArray(point[0])) point = point[0]
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
    ? [point[0], point[1]]
    : null
}
