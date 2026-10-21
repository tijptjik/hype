// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { featureI18n, featureProperty, featurePropertyI18n } from '../schema/feature'
// DOMAIN
import { normalizeI18nLocaleRecord, toLocaleKebab } from '#lib/i18n/localeRecords.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database, LocaleKey } from '#lib/types.js'
import type {
  FeatureI18nPartial,
  NewFeatureProperty,
} from '#lib/db/zod/schema/feature.types.js'

/**
 * Prepare replacement relations conditional on a successful Location association save.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity; payload identities are ignored.
 * @param revision Unique new association token returned by the preceding write plan.
 * @param translations Validated full locale map from the Feature form.
 * @param properties Validated, phone-normalized property snapshot, or undefined to retain it.
 * @returns Batch statements; execute in the same atomic batch as the association and Feature writes.
 * @remarks Every statement checks the new token, including deletes. One row per insert
 * keeps each query under D1's 100-parameter limit regardless of collection size. Never
 * split the returned statements across batches: a late error must roll back all rows.
 */
export function prepareFeatureLocationRelations(
  db: Database,
  featureId: string,
  revision: string,
  translations: Record<string, FeatureI18nPartial>,
  properties?: Array<
    Omit<NewFeatureProperty, 'i18n'> & {
      i18n?: Partial<NonNullable<NewFeatureProperty['i18n']>>
    }
  >,
): BatchItem<'sqlite'>[] {
  if (!featureId || !revision) throw new Error('Feature association token is required')
  const guard = sql`EXISTS (SELECT 1 FROM featureLocation
    WHERE featureId = ${featureId} AND revision = ${revision})`
  return prepareFeatureFormRelations(db, featureId, guard, translations, properties)
}

/**
 * Prepare complete relation replacement behind an internal transaction guard.
 * @param db Request-local database.
 * @param featureId Authorized parent identity.
 * @param guard Unique successful parent/association write predicate, supplied only by server code.
 * @param translations Validated complete translation snapshot.
 * @param properties Validated property snapshot, or undefined to leave properties untouched.
 * @returns Statements to execute in the same atomic batch as the guarded parent write.
 * @remarks Guard every delete and insert; never execute these statements in separate batches.
 */
export function prepareFeatureFormRelations(
  db: Database,
  featureId: string,
  guard: SQL,
  translations: Record<string, FeatureI18nPartial>,
  properties?: Parameters<typeof prepareFeatureLocationRelations>[4],
): BatchItem<'sqlite'>[] {
  const queries: BatchItem<'sqlite'>[] = [
    db.delete(featureI18n).where(and(eq(featureI18n.featureId, featureId), guard)),
  ]
  const locales = normalizeI18nLocaleRecord(translations)
  // SELECT column order follows the explicit schema order used by Drizzle INSERT.
  for (const [locale, value] of Object.entries(locales)) {
    if (!value) continue
    queries.push(
      db.insert(featureI18n).select(sql`SELECT
      ${featureId}, ${locale}, ${value.title ?? ''}, ${Number(value.titleGen ?? true)},
      ${value.description ?? null}, ${Number(value.descriptionGen ?? true)},
      ${value.displayAddress ?? null}, ${Number(value.displayAddressGen ?? true)},
      ${value.addressProperties == null ? null : JSON.stringify(value.addressProperties)}
      WHERE ${guard}`),
    )
  }
  if (properties === undefined) return queries
  // Preserve omitted internal fields when a public editor saves the visible snapshot.
  const replaceable = sql`(propertyId NOT IN (SELECT id FROM property WHERE audience = 'internal') OR propertyId IN (SELECT value FROM json_each(${JSON.stringify(properties.map(row => row.propertyId))})))`
  // Remove children before parents, keeping unrelated Features outside the guard.
  queries.push(
    db
      .delete(featurePropertyI18n)
      .where(and(eq(featurePropertyI18n.featureId, featureId), guard, replaceable)),
    db
      .delete(featureProperty)
      .where(and(eq(featureProperty.featureId, featureId), guard, replaceable)),
  )
  for (const property of properties) {
    let propertyValueId = property.propertyValueId || null
    let value = property.value ?? null
    // Checkbox transport uses true/false as direct values, not classifier identities.
    if (propertyValueId === 'true' || propertyValueId === 'false') {
      value ??= propertyValueId
      propertyValueId = null
    }
    queries.push(
      db.insert(featureProperty).select(sql`SELECT
      ${featureId}, ${property.propertyId}, ${propertyValueId}, ${value}, ${property.valueJson || null} WHERE ${guard}`),
    )
    for (const [locale, translation] of Object.entries(property.i18n ?? {})) {
      if (!translation) continue
      queries.push(
        db.insert(featurePropertyI18n).select(sql`SELECT
        ${featureId}, ${property.propertyId}, ${toLocaleKebab(locale as LocaleKey)},
        ${translation.value ?? null}, ${Number(translation.valueGen ?? false)} WHERE ${guard}`),
      )
    }
  }
  return queries
}
