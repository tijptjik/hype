// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '../schema/feature'
import { featureImage, image } from '../schema/image'
import { featureLocation } from '../schema/location'
import { featureLocationMembership } from '../schema/locationRelationships'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema/property'
// SERVICES
import { rowSnapshot } from './revisionSnapshot'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. COMPLETE SOURCE EVIDENCE
// - rows
// - sourceExpression
// 2. AUTHORIZED CAPTURE AND TRANSACTIONAL DRIFT FENCE
// - readFeatureRevisionSource
// ---

/********************
 *  1. COMPLETE SOURCE EVIDENCE
 ************/
// +++ Complete Source Evidence

/** Private onboarding evidence, not a publishable revision or client response. */
export type FeatureRevisionSource = {
  snapshot: RevisionValue
  unchanged: SQL
}

/**
 * Captures related rows in a deterministic order without joining away empty children.
 * @param table Trusted schema table.
 * @param predicate Correlation to the owning Feature or its related row.
 * @param keys Unique ordering columns from the trusted table schema.
 * @returns JSON array retaining nulls, booleans and structured values.
 */
function rows(table: SQLiteTable, predicate: SQL, keys: readonly string[]): SQL {
  const columns = getTableColumns(table)
  return sql`json((SELECT json_group_array(json(content)) FROM (
    SELECT ${rowSnapshot(table, [])} AS content FROM ${table}
    WHERE ${predicate} ORDER BY ${sql.join(
      keys.map(key => sql`${columns[key]}`),
      sql`, `,
    )})))`
}

/**
 * Builds the complete mutable source comparison for initial Feature enrollment.
 * @param additionalPropertyIds Server-validated proposed property identities to fence alongside assigned fields.
 * @returns Expression correlated to the outer Feature, evaluated in one SQL statement.
 * @remarks This deliberately includes live controls and shared definition evidence to
 * fence races. NEVER store this object directly as revision content, expose it to
 * contributors, or use it as a restoration payload. An explicit authored-content
 * adapter must separate controls, internal properties and derived data. Location
 * source histories are immutable and remain referenced through their accepted IDs.
 * Image bytes/remote metadata still require verified immutable asset ingestion.
 */
function sourceExpression(additionalPropertyIds: readonly string[] = []): SQL {
  const id = sql`${feature.id}`
  const assigned = sql`SELECT ${featureProperty.propertyId} FROM ${featureProperty}
    WHERE ${featureProperty.featureId}=${id}
    UNION SELECT value FROM json_each(${JSON.stringify(additionalPropertyIds)})`
  const options = sql`SELECT ${propertyValue.id} FROM ${propertyValue}
    WHERE ${propertyValue.propertyId} IN (${assigned})`
  // One correlated statement observes parent, children and shared dependencies together.
  return sql`json_object(
    'record',json(${rowSnapshot(feature, [])}),
    'translations',${rows(featureI18n, sql`${featureI18n.featureId}=${id}`, ['locale'])},
    'properties',${rows(featureProperty, sql`${featureProperty.featureId}=${id}`, ['propertyId'])},
    'propertyTranslations',${rows(featurePropertyI18n, sql`${featurePropertyI18n.featureId}=${id}`, ['propertyId', 'locale'])},
    'location',${rows(featureLocation, sql`${featureLocation.featureId}=${id}`, ['featureId'])},
    'locationMemberships',${rows(featureLocationMembership, sql`${featureLocationMembership.featureId}=${id}`, ['containerLocationId', 'role'])},
    'galleryLinks',${rows(featureImage, sql`${featureImage.featureId}=${id}`, ['imageId'])},
    'images',${rows(image, sql`${image.id} IN (SELECT ${featureImage.imageId} FROM ${featureImage} WHERE ${featureImage.featureId}=${id})`, ['id'])},
    'fieldDefinitions',${rows(property, sql`${property.id} IN (${assigned})`, ['id'])},
    'fieldTranslations',${rows(propertyI18n, sql`${propertyI18n.propertyId} IN (${assigned})`, ['propertyId', 'locale'])},
    'fieldOptions',${rows(propertyValue, sql`${propertyValue.propertyId} IN (${assigned})`, ['id'])},
    'fieldOptionTranslations',${rows(propertyValueI18n, sql`${propertyValueI18n.propertyValueId} IN (${options})`, ['propertyValueId', 'locale'])}
  )`
}

// ---
/********************
 *  2. AUTHORIZED CAPTURE AND TRANSACTIONAL DRIFT FENCE
 ************/
// +++ Authorized Capture And Transactional Drift Fence

/**
 * Reads complete Feature source evidence and prepares an exact transactional fence.
 * @param db Request database.
 * @param featureId Persisted Feature identity.
 * @param guard Server-built authorization and current ancestry predicate.
 * @param additionalPropertyIds Proposed field identities whose definitions/options must also be fenced.
 * @returns Private captured source and a guard, or null for missing/revoked scope.
 * @remarks Preparation performs no writes. The caller must execute `unchanged` inside
 * the SAME atomic batch as enrollment, after converting evidence to validated content.
 * Checking only feature.modifiedAt misses child-only and FK-cascade mutations. SQL
 * subqueries keep the binding count independent of relation/option/gallery size.
 */
export async function readFeatureRevisionSource(
  db: Database,
  featureId: string,
  guard: SQL,
  additionalPropertyIds: readonly string[] = [],
): Promise<FeatureRevisionSource | null> {
  const expression = sourceExpression(additionalPropertyIds)
  // Raw SQL preserves qualified correlation inside nested Drizzle JSON expressions.
  const row = await db.get<{ content: string }>(sql`SELECT ${expression} AS content
    FROM ${feature} WHERE ${feature.id}=${featureId} AND (${guard})`)
  if (!row) return null
  return {
    snapshot: JSON.parse(row.content) as RevisionValue,
    unchanged: sql`(${guard}) AND EXISTS (SELECT 1 FROM ${feature}
      WHERE ${feature.id}=${featureId} AND ${expression}=${row.content})`,
  }
}
