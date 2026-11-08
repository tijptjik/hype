// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'
import type { NewFeatureProperty } from '#lib/db/zod/schema/feature.types.js'

// TABLE OF CONTENTS
// 1. Destination scope and property guards
// 2. Complete transfer property reconciliation

/** Server-resolved destination; never use caller-supplied ancestry without probing its layer. */
export type FeatureDestinationScope = {
  organisationId: string
  projectId: string
  layerId: string
  resourceHubId: string | null
}

/**
 * Fences a transfer against destination reparenting or archival after authorization.
 * @param destination Server-probed layer ancestry and hub.
 * @returns Predicate evaluated inside the Feature save transaction.
 */
export function featureDestinationGuard(destination: FeatureDestinationScope): SQL {
  return sql`EXISTS (SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId
    JOIN organisation o ON o.id=p.organisationId WHERE l.id=${destination.layerId}
    AND l.projectId=${destination.projectId} AND l.organisationId=${destination.organisationId}
    AND p.organisationId=${destination.organisationId} AND o.hubId IS ${destination.resourceHubId}
    AND l.isArchived=0 AND p.isArchived=0 AND o.isArchived=0 AND l.historicalSourceLayerId IS NULL)`
}

/**
 * Checks every retained field, including hidden fields, against the destination namespace.
 * @param featureId Stable Feature identity after its form properties have been saved.
 * @param destination Authorized destination scope.
 * @returns Predicate that prevents private project/organisation/hub fields crossing scope.
 * @remarks Reconciliation drops unsupported fields first; this final guard prevents stale definitions crossing namespaces.
 */
export function featureDestinationPropertiesGuard(featureId: string, destination: FeatureDestinationScope): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM featureProperty fp LEFT JOIN property p ON p.id=fp.propertyId
    WHERE fp.featureId=${featureId} AND (p.id IS NULL
      OR (p.projectId IS NOT NULL AND p.projectId IS NOT ${destination.projectId})
      OR (p.organisationId IS NOT NULL AND p.organisationId IS NOT ${destination.organisationId})
      OR (p.hubId IS NOT NULL AND p.hubId IS NOT ${destination.resourceHubId}
        AND NOT EXISTS(SELECT 1 FROM hub h WHERE h.id=p.hubId AND h.code='core'))))`
}

/**
 * Reconciles a transfer against the destination's actual field assignments.
 * @param db Request database.
 * @param featureId Existing Feature whose omitted supported values must survive.
 * @param destination Authorized destination ancestry.
 * @param submitted Form values, including potentially stale source-only fields.
 * @param allowedInternalIds Fields the caller may explicitly edit; other internal values remain server-owned.
 * @returns Complete destination property rows and an atomic assignment-drift guard.
 * @remarks Fields have no configured value default today, so newly assigned fields start null.
 * Identity is matched by property ID, never by labels or keys from another namespace.
 */
export async function reconcileFeatureTransferProperties(
  db: Database,
  featureId: string,
  destination: FeatureDestinationScope,
  submitted: readonly NewFeatureProperty[] = [],
  allowedInternalIds: ReadonlySet<string> = new Set(),
): Promise<{
  properties: NewFeatureProperty[]
  ids: string[]
  unchanged: SQL
}> {
  const supported = sql`SELECT p.id, p.audience FROM layerProperty lp JOIN property p ON p.id=lp.propertyId
    WHERE lp.layerId=${destination.layerId} AND p.type IN ('classifier','specifier')
      AND (p.projectId IS NULL OR p.projectId=${destination.projectId})
      AND (p.organisationId IS NULL OR p.organisationId=${destination.organisationId})
      AND (p.hubId IS NULL OR p.hubId=${destination.resourceHubId}
        OR EXISTS(SELECT 1 FROM hub h WHERE h.id=p.hubId AND h.code='core')) ORDER BY p.id`
  const fields = await db.all<{ id: string; audience: string }>(supported)
  const existing = await db.all<{ propertyId: string; value: string | null; propertyValueId: string | null; valueJson: string | null }>(sql`SELECT propertyId,value,propertyValueId,valueJson FROM featureProperty WHERE featureId=${featureId}`)
  // Retained translations stay in storage; only explicit submitted locale edits replace them.
  const current = new Map(existing.map(row => [row.propertyId, row]))
  const supplied = new Map(submitted.map(row => [row.propertyId, row]))
  const properties = fields.map(field => {
    const row = (field.audience !== 'internal' || allowedInternalIds.has(field.id) ? supplied.get(field.id) : undefined)
      ?? current.get(field.id)
    return {
      propertyId: field.id,
      value: !current.has(field.id) && row?.value === '' ? null : (row?.value ?? null),
      propertyValueId: row?.propertyValueId || null,
      valueJson: row?.valueJson || null,
      i18n: row && 'i18n' in row ? row.i18n : {},
    }
  })
  return {
    properties,
    ids: fields.map(field => field.id),
    // One JSON parameter covers arbitrarily many assignments, including internal visibility changes.
    unchanged: sql`(SELECT json_group_array(json_object('id',id,'audience',audience)) FROM (${supported}))=${JSON.stringify(fields)}`,
  }
}
