// DOMAIN
import { featurePlusCode } from '#lib/addresses/plusCode.js'
// TYPES
import type { FeatureType } from './intents.js'

/** Choose the initial naming mode for a newly selected feature type.
 * @param type The configured feature type.
 * @returns Location inheritance for represented places or a location-based naming rule.
 */
export function draftNameMode(type: FeatureType | null): 'inherit' | 'independent' {
  return type?.relation === 'represents' || type?.nameRule?.base === 'location'
    ? 'inherit'
    : 'independent'
}

/** Recognize coordinate placeholders, including codes generated before the pin moved.
 * @param input Restored naming data and marker coordinates.
 * @returns Whether location inheritance can replace only empty or coordinate-placeholder titles.
 */
export function hasStaleCoordinateTitle(input: {
  relation?: string | null
  names: Record<string, string>
  titles: Record<string, { title?: string | null }>
  coordinates?: readonly number[] | null
}): boolean {
  return (
    Object.values(input.names).some(name => name.trim()) &&
    Object.values(input.titles).every(
      value =>
        !value.title ||
        value.title === featurePlusCode(input.coordinates) ||
        /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/.test(value.title),
    )
  )
}

/** Use an explicitly created Location name instead of an untouched coordinate title.
 * @param type Configured Feature naming policy.
 * @param input Accepted creation and current authored titles.
 * @returns Initial naming mode, preserving independently authored titles.
 */
export function selectedDraftNameMode(
  type: FeatureType | null,
  input: {
    created: boolean
    names: Record<string, string>
    titles: Record<string, { title?: string | null }>
    coordinates?: readonly number[] | null
  },
): 'inherit' | 'independent' {
  return input.created && hasStaleCoordinateTitle({ ...input, relation: 'represents' })
    ? 'inherit'
    : draftNameMode(type)
}
