// VALIDATION
import { z } from 'zod'
// DOMAIN
import { SharedCorrectionFieldSchema } from './sharedCorrection'
import { equalLocationValue } from './baseline'
// TYPES
import type { SharedCorrectionPatch } from './sharedCorrection'
import type { LocationFacts } from './model'

/** Address and marker are independently lockable even though their corrections share a position envelope. */
export const CurationLockFieldSchema = z.enum([
  ...SharedCorrectionFieldSchema.options.filter(field => field !== 'location'),
  'location.geometry',
  'location.address',
])
export const CurationOpenFieldsSchema = z.partialRecord(
  CurationLockFieldSchema,
  z.boolean(),
)
export type CurationLockField = z.infer<typeof CurationLockFieldSchema>
export type CurationOpenFields = z.infer<typeof CurationOpenFieldsSchema>
export type CurationLocks = {
  revision: string | null
  openFields: CurationOpenFields
  available: boolean
}
export const CURATION_LOCK_LABELS: Record<CurationLockField, string> = {
  names: 'Names',
  brands: 'Brand names',
  brandId: 'Brand link',
  groupId: 'Group link',
  branch: 'Branch',
  format: 'Format',
  branchId: 'Branch ID',
  entity: 'Classification',
  phoneNumber: 'Phone numbers',
  websites: 'Websites',
  socials: 'Social profiles',
  accessibility: 'Accessibility',
  footprint: 'Footprint',
  operatingStatus: 'Operating status',
  buildingStatus: 'Building status',
  successorLocationId: 'Successor Location',
  'location.geometry': 'Map position',
  'location.address': 'Address, floor and unit',
}

/** Reject changes to closed community fields; SuperAdmin must explicitly unlock before editing.
 * @param patch Validated community edit intent.
 * @param current Current curated values, used to distinguish address from marker changes.
 * @param openFields Boolean permissions; omission means open.
 * @returns Nothing; throws with the locked field identities before any writes are prepared.
 */
export function assertCurationFieldsOpen(
  patch: SharedCorrectionPatch,
  current: LocationFacts,
  openFields: CurationOpenFields,
): void {
  const touched = new Set<CurationLockField>()
  for (const field of Object.keys(patch) as Array<keyof SharedCorrectionPatch>) {
    if (field !== 'location') touched.add(field)
    else {
      const choice = patch.location
      for (const key of ['geometry', 'address'] as const)
        if (
          choice?.mode !== 'override' ||
          !equalLocationValue(
            current.location[key],
            (choice.value as LocationFacts['location'])[key],
          )
        )
          touched.add(`location.${key}`)
    }
  }
  // The typed entity envelope also carries establishment details; it cannot bypass their locks.
  if (patch.entity)
    for (const field of [
      'brands',
      'brandId',
      'groupId',
      'branch',
      'format',
      'branchId',
      'operatingStatus',
      'buildingStatus',
    ] as const)
      touched.add(field)
  const closed = [...touched].filter(field => openFields[field] === false)
  if (closed.length)
    throw new Error(`COMMUNITY_CURATION_FIELD_LOCKED: ${closed.join(', ')}`)
}
