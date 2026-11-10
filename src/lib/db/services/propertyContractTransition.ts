// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { propertyValueRegistry } from '#lib/properties/value.js'
import { readPhoneNumbers } from '#lib/utils/phone-property.js'
import { prepareRevisionCheck } from './revisionBatch.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Scalar compatibility
// 2. Transaction validation

type Contract = {
  component: string
  dataType: string
  cardinality: string
  isTranslatable: boolean
  dateResolution: string
  timeMaxHour: number
  min?: number | null
  max?: number | null
}
const textEditors = new Set(['TextField', 'InputField', 'TextareaField'])
const scalarTypes = new Set(['text', 'number', 'date', 'boolean'])

/** Decide whether an edit can retain each stored scalar without conversion.
 * @param before Persisted contract.
 * @param after Proposed contract.
 * @param rows Stored value tuples with translated values in their final element.
 * @returns Whether every value is compatible with an explicitly allowed transition.
 * @remarks Phone collections cannot be reinterpreted as ordinary scalar text.
 */
export function isCompatiblePropertyTransition(
  before: Contract,
  after: Contract,
  rows: Array<[string, string | null, string | null, string | null, string[]]>,
): boolean {
  if (
    before.cardinality !== after.cardinality ||
    before.dateResolution !== after.dateResolution ||
    before.timeMaxHour !== after.timeMaxHour ||
    !textEditors.has(before.component) ||
    !scalarTypes.has(before.dataType) ||
    !(textEditors.has(after.component) || after.component === 'PhoneField') ||
    !scalarTypes.has(after.dataType) ||
    (after.component === 'PhoneField' && after.dataType !== 'text')
  )
    return false
  try {
    return rows.every(([, value, option, structured, translations]) => {
      if (option || structured) return false
      if (
        (!after.isTranslatable ||
          after.dataType !== 'text' ||
          after.component === 'PhoneField') &&
        translations.some(value => value !== '')
      )
        return false
      if (after.component === 'PhoneField') return readPhoneNumbers(value) !== null
      const type = after.dataType as 'text' | 'number' | 'date' | 'boolean'
      propertyValueRegistry[type].normalize(value)
      return true
    })
  } catch {
    return false
  }
}

/** Validate a populated transition and guard the inspected values through commit.
 * @param db Authorized catalogue database.
 * @param id Persisted property identity.
 * @param before Persisted contract.
 * @param after Proposed contract.
 * @returns A transaction guard that rejects concurrent feature-value edits.
 */
export async function preparePropertyContractTransition(
  db: Database,
  id: string,
  before: Contract,
  after: Contract,
): Promise<{ check: BatchItem<'sqlite'> }> {
  if (!isCompatiblePropertyTransition(before, after, []))
    throw error(400, 'PROPERTY_CONTRACT_HAS_VALUES')
  // Capture canonical and translated storage together, including archived features.
  const snapshot = sql`(SELECT json_group_array(json(value)) FROM (
    SELECT json_array(v.featureId,v.value,v.propertyValueId,v.valueJson,json((
      SELECT json_group_array(value) FROM (SELECT i.value FROM featurePropertyI18n i
      WHERE i.featureId=v.featureId AND i.propertyId=v.propertyId ORDER BY i.locale)
    ))) AS value FROM featureProperty v WHERE v.propertyId=${id} ORDER BY v.featureId))`
  const row = await db.get<{ content: string }>(sql`SELECT ${snapshot} AS content`)
  const content = row?.content ?? '[]'
  if (!isCompatiblePropertyTransition(before, after, JSON.parse(content)))
    throw error(400, 'PROPERTY_CONTRACT_HAS_VALUES')
  return { check: prepareRevisionCheck(db, sql`${snapshot}=${content}`) }
}
