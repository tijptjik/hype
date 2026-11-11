// DRIZZLE
import { eq, ne, or } from 'drizzle-orm'
// SCHEMA
import { property } from '../schema/property'
import { layerProperty } from '../schema/layer'
// VALIDATION
// PROPERTY CONTRACT
import { normalizeRangeValue, isRangeProperty } from '#lib/properties/range.js'
import { normalizePhoneNumber, readPhoneNumbers } from '#lib/utils/phone-property.js'
import { m } from '#lib/i18n.js'
import { normalizeLinkValue, propertyValueRegistry } from '#lib/properties/value.js'
// TYPES
import type { Database } from '#lib/types.js'

type PropertyInput = {
  propertyId: string
  value?: string | null
  propertyValueId?: string | null
  valueJson?: string | null
  i18n?: unknown
}

/**
 * Validates scalar, structured and phone values against persisted definitions.
 * @param db - Database containing the authoritative property definitions.
 * @param properties - Submitted feature properties, including imports and drafts.
 * @param allowedInternalIds Optional authorized internal IDs; remote callers must provide this set.
 * @param layerId Optional persisted target layer for structured-field assignment checks.
 * @returns Cloned rows with ordered E.164 phone arrays serialized for property storage.
 * @remarks Run before any feature writes or relation deletions. Client-supplied
 * property metadata cannot bypass validation; empty phone values remain optional.
 */
export async function validateFeaturePhoneProperties<T extends PropertyInput>(
  db: Database,
  properties: T[],
  allowedInternalIds?: ReadonlySet<string>,
  layerId?: string,
): Promise<T[]> {
  if (properties.length === 0) return properties
  // Read the typed catalog without an unbounded SQL parameter list.
  const definitions = await db.query.property.findMany({
    where: or(
      eq(property.component, 'PhoneField'),
      ne(property.dataType, 'text'),
      eq(property.audience, 'internal'),
    ),
  })
  const assignments =
    layerId && properties.some(row => row.valueJson)
      ? await db.query.layerProperty.findMany({
          where: eq(layerProperty.layerId, layerId),
        })
      : undefined
  const assignedIds = assignments
    ? new Set(assignments.map(row => row.propertyId))
    : undefined
  const byId = new Map(definitions.map(definition => [definition.id, definition]))
  const phoneIds = new Set(
    definitions
      .filter(definition => definition.component === 'PhoneField')
      .map(definition => definition.id),
  )
  return properties
    .map(row => {
      const definition = byId.get(row.propertyId)
      if (
        allowedInternalIds &&
        definition?.audience === 'internal' &&
        !allowedInternalIds.has(row.propertyId)
      )
        throw new Error('This property is internal')
      if (
        definition &&
        (definition.dataType === 'link' ||
          definition.dataType === 'dateRange' ||
          definition.dataType === 'timeRange')
      ) {
        if (row.valueJson && assignedIds && !assignedIds.has(row.propertyId))
          throw new Error(
            'This structured property is not assigned to the feature layer',
          )
        if (
          row.value ||
          row.propertyValueId ||
          (row.i18n &&
            Object.values(row.i18n).some(
              entry =>
                entry && typeof entry === 'object' && 'value' in entry && entry.value,
            ))
        )
          throw new Error('This property uses structured values only')
        return {
          ...row,
          value: null,
          propertyValueId: null,
          i18n: undefined,
          valueJson:
            definition.dataType === 'link'
              ? normalizeLinkValue(definition, row.valueJson)
              : normalizeRangeValue(definition, row.valueJson),
        }
      }
      if (row.valueJson)
        throw new Error('Structured values require a link or range property')
      if (
        definition?.dataType === 'number' ||
        definition?.dataType === 'date' ||
        definition?.dataType === 'boolean'
      ) {
        if (
          row.propertyValueId ||
          (row.i18n &&
            Object.values(row.i18n).some(
              entry =>
                entry && typeof entry === 'object' && 'value' in entry && entry.value,
            ))
        )
          throw new Error(
            'Typed scalar values cannot reference classifier options or translations',
          )
        return {
          ...row,
          value: propertyValueRegistry[definition.dataType].normalize(row.value),
          valueJson: null,
        }
      }
      if (!phoneIds.has(row.propertyId)) return { ...row, valueJson: null }
      const value = row.value?.trim() ?? ''
      const numbers = readPhoneNumbers(value)
      const normalized = numbers?.map(number => normalizePhoneNumber(number))
      if (
        numbers === null ||
        normalized?.some(number => !number) ||
        row.propertyValueId
      ) {
        throw new Error(m.property__phone_invalid())
      }
      // A phone collection has one canonical ordered value, never locale-specific alternatives.
      return {
        ...row,
        value: value ? JSON.stringify(normalized) : null,
        valueJson: null,
        propertyValueId: null,
        i18n: undefined,
      }
    })
    .filter(
      row =>
        (byId.get(row.propertyId)?.dataType !== 'link' &&
          !isRangeProperty(byId.get(row.propertyId) ?? {})) ||
        Boolean(row.valueJson),
    )
}
