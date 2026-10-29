// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { featureI18n, featureProperty, featurePropertyI18n } from '../schema/feature'
// DOMAIN
import { contentMapToStorage } from '#lib/i18n/contentRecords.js'
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
 * @param editIndependentNames Explicit Feature-form name edits, never source projection.
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
  editIndependentNames = false,
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
 * @param preserveIndependentNames Retain Feature-owned names during source projection.
 * @returns Statements to execute in the same atomic batch as the guarded parent write.
 * @remarks Guard every delete and insert; never execute these statements in separate batches.
 */
export function prepareFeatureFormRelations(
  db: Database,
  featureId: string,
  guard: SQL,
  translations: Record<string, FeatureI18nPartial>,
  properties?: Parameters<typeof prepareFeatureLocationRelations>[4],
  preserveIndependentNames = false,
): BatchItem<'sqlite'>[] {
  const locales = contentMapToStorage(translations)
  // Source projection must not overwrite independently authored Feature names.
  const keepNames = preserveIndependentNames
    ? sql`EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${featureId} AND json_extract(acceptancePolicy,'$.nameMode')='independent')`
    : sql`0`
  // Omitted locales belong to older/partial clients and are retained, never deleted.
  const queries: BatchItem<'sqlite'>[] = []
  // SELECT column order follows the explicit schema order used by Drizzle INSERT.
  for (const [locale, value] of Object.entries(locales)) {
    if (!value) continue
    const updateValues = {
      title: sql`CASE WHEN ${keepNames} THEN ${featureI18n.title} ELSE ${value.title === undefined ? featureI18n.title : value.title} END`,
      titleGen: sql`CASE WHEN ${keepNames} THEN ${featureI18n.titleGen} ELSE ${value.titleGen === undefined ? featureI18n.titleGen : Number(value.titleGen)} END`,
      description: value.description, descriptionGen: value.descriptionGen,
      displayAddress: value.displayAddress, displayAddressGen: value.displayAddressGen,
      addressProperties: value.addressProperties,
    }
    queries.push(
      db.update(featureI18n).set(updateValues).where(and(eq(featureI18n.featureId, featureId), eq(featureI18n.locale, locale as LocaleKey), guard)),
      db.insert(featureI18n).select(sql`SELECT
      ${featureId}, ${locale}, CASE WHEN ${keepNames} THEN '' ELSE ${value.title ?? ''} END, ${Number(value.titleGen ?? true)},
      ${value.description ?? null}, ${Number(value.descriptionGen ?? true)},
      ${value.displayAddress ?? null}, ${Number(value.displayAddressGen ?? true)},
      ${value.addressProperties == null ? null : JSON.stringify(value.addressProperties)}
      WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM featureI18n WHERE featureId=${featureId} AND locale=${locale})`),
    )
  }
  if (properties === undefined) return queries
  // Preserve omitted internal fields when a public editor saves the visible snapshot.
  const replaceable = sql`(propertyId NOT IN (SELECT id FROM property WHERE audience = 'internal') OR propertyId IN (SELECT value FROM json_each(${JSON.stringify(properties.map(row => row.propertyId))})))`
  // Remove only omitted properties; retained property translations may contain hidden locales.
  const removed = sql`propertyId NOT IN (SELECT value FROM json_each(${JSON.stringify(properties.map(row => row.propertyId))}))`
  // Remove children before parents, keeping unrelated Features outside the guard.
  queries.push(
    db
      .delete(featurePropertyI18n)
      .where(and(eq(featurePropertyI18n.featureId, featureId), guard, replaceable, removed)),
    db
      .delete(featureProperty)
      .where(and(eq(featureProperty.featureId, featureId), guard, replaceable, removed)),
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
      db.update(featureProperty).set({ propertyValueId, value, valueJson: property.valueJson || null }).where(and(eq(featureProperty.featureId, featureId), eq(featureProperty.propertyId, property.propertyId), guard)),
      db.insert(featureProperty).select(sql`SELECT
      ${featureId}, ${property.propertyId}, ${propertyValueId}, ${value}, ${property.valueJson || null} WHERE ${guard}
      AND NOT EXISTS(SELECT 1 FROM featureProperty WHERE featureId=${featureId} AND propertyId=${property.propertyId})`),
    )
    for (const [locale, translation] of Object.entries(contentMapToStorage(property.i18n ?? {}))) {
      if (!translation) continue
      queries.push(
        db.update(featurePropertyI18n).set({ value: translation.value, valueGen: translation.valueGen }).where(and(eq(featurePropertyI18n.featureId, featureId), eq(featurePropertyI18n.propertyId, property.propertyId), eq(featurePropertyI18n.locale, locale), guard)),
        db.insert(featurePropertyI18n).select(sql`SELECT
        ${featureId}, ${property.propertyId}, ${locale},
        ${translation.value ?? null}, ${Number(translation.valueGen ?? false)} WHERE ${guard}
        AND NOT EXISTS(SELECT 1 FROM featurePropertyI18n WHERE featureId=${featureId} AND propertyId=${property.propertyId} AND locale=${locale})`),
      )
    }
  }
  return queries
}
