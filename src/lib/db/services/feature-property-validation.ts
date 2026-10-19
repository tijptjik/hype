// DRIZZLE
import { eq } from 'drizzle-orm'
// SCHEMA
import { property } from '../schema/property'
// VALIDATION
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
import { m } from '#lib/i18n.js'
// TYPES
import type { Database } from '#lib/types.js'

type PropertyInput = {
  propertyId: string
  value?: string | null
  propertyValueId?: string | null
  i18n?: unknown
}

/**
 * Validates phone values against persisted definitions and canonicalizes them.
 * @param db - Database containing the authoritative property definitions.
 * @param properties - Submitted feature properties, including imports and drafts.
 * @returns Cloned rows with phone numbers normalized to E.164.
 * @remarks Run before any feature writes or relation deletions. Client-supplied
 * property metadata cannot bypass validation; empty phone values remain optional.
 */
export async function validateFeaturePhoneProperties<T extends PropertyInput>(
  db: Database,
  properties: T[],
): Promise<T[]> {
  if (properties.length === 0) return properties
  // Read the typed catalog without an unbounded SQL parameter list.
  const definitions = await db.query.property.findMany({
    where: eq(property.component, 'PhoneField'),
    columns: { id: true },
  })
  const phoneIds = new Set(definitions.map(definition => definition.id))
  return properties.map(row => {
    if (!phoneIds.has(row.propertyId)) return row
    const value = row.value?.trim() ?? ''
    const normalized = value ? normalizeHongKongPhoneNumber(value) : null
    if ((value && !normalized) || row.propertyValueId) {
      throw new Error(m.property__phone_hk_invalid())
    }
    // A phone has one canonical value, never locale-specific alternatives.
    return { ...row, value: normalized, propertyValueId: null, i18n: undefined }
  })
}
