// I18N
import * as m from '#lib/paraglide/messages.js'
// ROUTING
import { mtrCatalog } from '#lib/routing/mtr.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { FeaturePropertyItem } from './components/FeatureCardContent.types'

/**
 * Formats core walking access consistently across full and compact cards.
 * @param feature - Persisted station, entrance and walking distance.
 * @param locale - Active locale used for the station name.
 * @returns A read-only card field, or null when access is unavailable.
 */
export function getFeatureMtrProperty(
  feature: Pick<Feature, 'mtrStation' | 'mtrExit' | 'mtrDistance'>,
  locale: string,
): FeaturePropertyItem | null {
  const station = mtrCatalog.stations.find(item => item.id === feature.mtrStation)
  const exit = mtrCatalog.exits.find(item => item.id === feature.mtrExit)
  if (!station || !exit || feature.mtrDistance == null) return null
  return {
    id: 'core-mtr-access',
    label: m.feature_mtr_access(),
    value: m.feature_mtr_access_value({
      station: locale.startsWith('zh') ? station.nameZh || station.name : station.name,
      exit: exit.ref || '—',
      distance: String(feature.mtrDistance),
    }),
  }
}
