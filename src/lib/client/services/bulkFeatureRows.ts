// TYPES
import type { FeatureBulkStateResult } from './bulkEdit.types.js'

/**
 * Merges confirmed bulk state and attribution without replacing hydrated relations.
 * @param rows Currently rendered Feature rows.
 * @param results Ordered command outcomes containing persisted scalar values.
 * @returns Patched rows; failed, unrelated and newer rows retain their identities.
 * @remarks A newer refreshed revision wins over a delayed command response. Publisher
 * display data is cleared if its identity no longer matches the persisted attribution.
 */
export function patchBulkFeatureRows<
  T extends {
    id: string
    modifiedAt?: string | null
    publisher?: { id: string } | null
  },
>(rows: T[], results: FeatureBulkStateResult[]): T[] {
  const persisted = new Map(
    results.flatMap(result => (result.ok ? [[result.id, result.data] as const] : [])),
  )
  return rows.map(row => {
    const saved = persisted.get(row.id)
    if (!saved || Date.parse(row.modifiedAt ?? '') > Date.parse(saved.modifiedAt ?? ''))
      return row
    return {
      ...row,
      isPublished: saved.isPublished,
      isArchived: saved.isArchived,
      isIntangible: saved.isIntangible,
      isVisitable: saved.isVisitable,
      publishedAt: saved.publishedAt,
      publisherId: saved.publisherId,
      publisher: row.publisher?.id === saved.publisherId ? row.publisher : null,
      modifiedAt: saved.modifiedAt,
    }
  })
}
