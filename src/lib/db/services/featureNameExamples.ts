// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

/** Read saved short-text examples within an authorized naming-policy scope.
 * @param db Request database. @param projectId Authorized project. @param layerId Optional layer restriction.
 * @returns One nonblank saved value per property and locale; `*` denotes a scalar value.
 * @remarks Callers must authorize settings access and filter results to resolved project properties.
 */
export async function readFeatureNameExamples(
  db: Database,
  projectId: string,
  layerId?: string,
): Promise<Record<string, Record<string, string>>> {
  // Rank populated values inside the owner scope, returning only one example per locale.
  const rows = await db.all<{ propertyId: string; locale: string; value: string }>(sql`
    WITH candidates AS (
      SELECT fp.propertyId, f.id featureId, '*' locale, fp.value
      FROM featureProperty fp JOIN feature f ON f.id=fp.featureId
      JOIN property p ON p.id=fp.propertyId
      WHERE f.projectId=${projectId} AND (${layerId ?? null} IS NULL OR f.layerId=${layerId ?? null})
        AND f.isArchived=0 AND p.dataType='text' AND p.component IN ('InputField','TextField','PhoneField')
      UNION ALL
      SELECT fp.propertyId, f.id featureId, fp.locale, fp.value
      FROM featurePropertyI18n fp JOIN feature f ON f.id=fp.featureId
      JOIN property p ON p.id=fp.propertyId
      WHERE f.projectId=${projectId} AND (${layerId ?? null} IS NULL OR f.layerId=${layerId ?? null})
        AND f.isArchived=0 AND p.dataType='text' AND p.component IN ('InputField','TextField','PhoneField')
    ), ranked AS (
      SELECT propertyId, locale, value,
        row_number() OVER (PARTITION BY propertyId, lower(locale) ORDER BY featureId) position
      FROM candidates WHERE length(trim(value, char(9)||char(10)||char(13)||' '))>0
    ) SELECT propertyId, locale, value FROM ranked WHERE position=1
  `)
  const examples: Record<string, Record<string, string>> = {}
  for (const row of rows) {
    examples[row.propertyId] ??= {}
    examples[row.propertyId][row.locale] = row.value
  }
  return examples
}
