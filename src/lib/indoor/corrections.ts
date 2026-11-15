// DOMAIN
import {
  assessConnectionCorrection,
  applyConnectionCorrection,
} from './connectionCorrections'
import { layerNames, type IndoorFeature, type LayerName } from './model'
// TYPES
import type { MapBundle } from './releases'

export type MapCorrection = {
  sourceDataset: string
  sourceLayer: string
  sourceEntityId: string
  field: string
  originalValue: string | null
  correctedValue: string
  sourceSnapshotHash: string
  reason: string
}
export type CorrectionResult =
  | 'applied'
  | 'upstream-adopted'
  | 'missing'
  | 'changed'
  | 'baseline-unavailable'

/** Find a source polygon by its publisher identity, never by geometry or display name.
 * @param bundle Source snapshot. @param correction Exact source selector. @returns Unique matching polygon.
 */
export function correctionTarget(
  bundle: MapBundle,
  correction: MapCorrection,
): IndoorFeature | undefined {
  if (!layerNames.includes(correction.sourceLayer as LayerName)) return undefined
  const key = `${correction.sourceLayer.split('_')[0]}_id`
  const matches = bundle.data[correction.sourceLayer as LayerName].features.filter(
    feature => feature.properties[key] === correction.sourceEntityId,
  )
  return matches.length === 1 ? matches[0] : undefined
}

/** Compare one correction with a fresh source before materializing it into a release.
 * @param source Fresh upstream bundle. @param baseline Retained original snapshot. @param correction Current correction.
 * @returns Replay outcome. @remarks Geometry comparison is deliberately conservative: any coordinate change needs attention.
 */
export function assessMapCorrection(
  source: MapBundle,
  baseline: MapBundle | undefined,
  correction: MapCorrection,
): CorrectionResult {
  if (correction.sourceLayer === 'connection')
    return assessConnectionCorrection(source, baseline, correction)
  const target = correctionTarget(source, correction)
  if (!target) return 'missing'
  const original = baseline && correctionTarget(baseline, correction)
  if (!original) return 'baseline-unavailable'
  if (JSON.stringify(target.geometry) !== JSON.stringify(original.geometry))
    return 'changed'
  const prefix = correction.sourceLayer.split('_')[0]
  const structuralFields = [
    `${prefix}_category`,
    'venue_id',
    'building_id',
    'level_id',
    'level_ordinal',
    'level_z_value',
  ]
  if (
    structuralFields.some(
      field => target.properties[field] !== original.properties[field],
    )
  )
    return 'changed'
  const current = target.properties[correction.field] ?? null
  if (current === correction.correctedValue) return 'upstream-adopted'
  if (current !== correction.originalValue) return 'changed'
  return 'applied'
}

/** Apply a label consistently to the level and its denormalized child properties.
 * @param bundle Mutable derived bundle, never the raw snapshot. @param correction Exact label override. @returns Nothing.
 */
export function applyMapCorrection(bundle: MapBundle, correction: MapCorrection): void {
  if (correction.sourceLayer === 'connection') {
    applyConnectionCorrection(bundle, correction)
    return
  }
  const target = correctionTarget(bundle, correction)
  if (!target) throw new Error('CORRECTION_TARGET_MISSING')
  target.properties[correction.field] = correction.correctedValue
  if (
    correction.sourceLayer === 'level_polygon' &&
    correction.field.startsWith('level_')
  ) {
    for (const layer of layerNames)
      for (const feature of bundle.data[layer].features) {
        if (feature.properties.level_id === correction.sourceEntityId)
          feature.properties[correction.field] = correction.correctedValue
      }
  }
}
