// TYPES
export type BreadlineFeatureSourceRow = Record<string, string | number | null>
export type BreadlineFeatureDiagnostic = {
  sourceTable: 'donors' | 'dropoffs'
  sourceId: string
  field: string
  code: string
  remediation: string
}

/**
 * Validate source primitives before generating any destination SQL.
 * @param table Legacy entity being imported.
 * @param rows Eligible source rows; excluded donors must not block an import.
 * @returns Actionable diagnostics without copying personal source values into reports.
 * @remarks Does not reinterpret donor activity as business status or pickup windows as
 * opening hours. Schedule/time-window validation belongs to the schedule importer.
 */
export function validateBreadlineFeatureRows(
  table: 'donors' | 'dropoffs',
  rows: BreadlineFeatureSourceRow[],
): BreadlineFeatureDiagnostic[] {
  const diagnostics: BreadlineFeatureDiagnostic[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const sourceId = String(row.id ?? '')
    const issue = (field: string, code: string, remediation: string): void => {
      diagnostics.push({ sourceTable: table, sourceId, field, code, remediation })
    }
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0)
      issue(
        'id',
        'INVALID_SOURCE_ID',
        'Restore a positive integer source identity from the mirror.',
      )
    if (seen.has(sourceId))
      issue(
        'id',
        'DUPLICATE_SOURCE_ID',
        'Resolve duplicate source rows before generating deterministic IDs.',
      )
    seen.add(sourceId)
    if (typeof row._breadline_row_hash !== 'string' || !row._breadline_row_hash.trim())
      issue(
        '_breadline_row_hash',
        'MISSING_SOURCE_HASH',
        'Regenerate the mirror row hash; do not invent accepted provenance.',
      )
    for (const field of ['longitude', 'latitude'] as const) {
      if (typeof row[field] !== 'number' || !Number.isFinite(row[field]))
        issue(
          field,
          'INVALID_COORDINATE_NUMBER',
          'Supply a finite numeric coordinate or a reviewed source correction.',
        )
    }
    if (typeof row.name_en !== 'string' || !row.name_en.trim())
      issue(
        'name_en',
        'MISSING_ENGLISH_NAME',
        'Review the English title used by the importer and its locale fallback.',
      )
    for (const field of [
      'name_zh',
      'address_full_en',
      'address_full_zh',
      'address_display_en',
      'address_display_zn',
    ]) {
      if (
        row[field] !== undefined &&
        row[field] !== null &&
        typeof row[field] !== 'string'
      )
        issue(
          field,
          'INVALID_LOCALIZED_TEXT',
          'Restore a text value or an explicit missing value in the source mirror.',
        )
    }
    if (table === 'donors' && row.active !== 0 && row.active !== 1)
      issue(
        'active',
        'INVALID_ACTIVITY_FLAG',
        'Review the participation flag; use numeric 0 or 1 without truthy coercion.',
      )
    for (const field of ['created_at', 'last_updated_at'] as const) {
      const value = row[field]
      if (
        field === 'last_updated_at' &&
        (value === null || value === undefined || value === '')
      )
        continue
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString() !== value
      )
        issue(
          field,
          'INVALID_SOURCE_TIMESTAMP',
          'Restore the mirror UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ format.',
        )
    }
  }
  return diagnostics
}
