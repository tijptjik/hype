// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { OrganisationRevisionActor } from './organisationRevision'
// PROPERTY SELECTION
import {
  selectedPropertyValueIds,
  encodePropertySelection,
} from '#lib/properties/selection.js'

/**
 * Captures Feature values removed or cleared by a shared catalogue's FK cascades.
 * @param db Request database.
 * @param input Exact field/option identities scheduled for deletion and trusted catalogue author.
 * @returns Statements enclosing the catalogue deletion in the SAME transaction.
 * @remarks Label-only edits create no Feature revisions. Existing history retains old
 * labels; deleting an option clears its selected interpretation with its FK value.
 * Every affected identity and source is fenced, including concurrent enrollment.
 */
export async function prepareFeaturePropertyCascadeCapture(
  db: Database,
  input: {
    propertyIds: readonly string[]
    optionIds: readonly string[]
    actor?: OrganisationRevisionActor
  },
): Promise<{ before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] }> {
  const empty = {
    before: [] as BatchItem<'sqlite'>[],
    after: [] as BatchItem<'sqlite'>[],
  }
  if (!input.propertyIds.length && !input.optionIds.length) return empty
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`,
  )
  if (!storage?.n && !(await hasFeatureLifecycleStorage(db))) return empty
  const selected = sql`SELECT DISTINCT featureId FROM featureProperty WHERE
    propertyId IN (SELECT value FROM json_each(${JSON.stringify(input.propertyIds)})) OR
    propertyValueId IN (SELECT value FROM json_each(${JSON.stringify(input.optionIds)})) OR
    EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(valueJson) THEN valueJson ELSE '{}' END,'$.propertyValueIds') selected
      WHERE selected.value IN (SELECT value FROM json_each(${JSON.stringify(input.optionIds)})))`
  const affected = await db.all<{ featureId: string }>(
    sql`${selected} ORDER BY featureId`,
  )
  const ids = affected.map(row => row.featureId)
  const removed = new Set(input.propertyIds),
    options = new Set(input.optionIds)
  // An additional child assignment after preparation must not escape the deletion's audit capture.
  empty.before.push(
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS (
    SELECT featureId FROM (${selected}) EXCEPT SELECT value FROM json_each(${JSON.stringify(ids)}))`,
    ),
  )
  for (const featureId of ids) {
    const capture = await prepareFeatureAcceptedCapture(db, {
      featureId,
      actorId: input.actor?.actorId ?? 'unattributed',
      guard: sql`1`,
      origin: input.actor?.origin,
      reason: input.actor?.reason ?? 'Shared catalogue removed Feature values',
      derive: previous => {
        if (!input.actor?.actorId)
          throw new Error('Feature catalogue cascades require an attributed editor')
        const content = structuredClone(previous)
        for (const [id, row] of Object.entries(content.properties)) {
          if (removed.has(id)) delete content.properties[id]
          else if (
            row.selection.definition.component === 'SelectField' &&
            row.selection.valueJson
          ) {
            const retained = selectedPropertyValueIds(row.selection).filter(
              id => !options.has(id),
            )
            row.selection.valueJson = encodePropertySelection(retained)
            row.selection.definition.selectedOptions =
              row.selection.definition.selectedOptions?.filter(
                option => !options.has(option.id),
              )
          } else if (
            row.selection.propertyValueId &&
            options.has(row.selection.propertyValueId)
          ) {
            row.selection.propertyValueId = null
            row.selection.definition.selectedOption = null
          }
        }
        return content
      },
    })
    empty.before.push(...capture.before)
    if (capture.revisionId) {
      const now = new Date().toISOString()
      empty.after.push(
        db
          .update(feature)
          .set({
            modifiedAt: sql`CASE WHEN modifiedAt>=${now}
        THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds') ELSE ${now} END`,
          })
          .where(eq(feature.id, featureId)),
      )
    }
    empty.after.push(...capture.after)
  }
  return empty
}
