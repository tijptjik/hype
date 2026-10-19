// DB
import { transformI18nSafely } from '#lib/db/index.js'
// TYPES
import type { CompactAncestorRow } from '#lib/api/services/resourcePage.types.js'

/** Only public breadcrumb identity is hydrated; role, image and property graphs are excluded. */
export const compactAncestorRelations = {
  columns: { id: true, code: true },
  with: { i18n: { columns: { locale: true, name: true, nameShort: true } } },
}

/** Public project breadcrumbs also carry the organisation-context naming policy. */
export const compactProjectAncestorRelations = {
  ...compactAncestorRelations,
  columns: {
    ...compactAncestorRelations.columns,
    useAllInOrgContext: true,
    cardStyleCode: true,
  },
}

/**
 * Converts directly joined ancestor labels to the client breadcrumb shape.
 * @param row - Resource row with independently joined organisation/project ancestors.
 * @returns Ancestors with normalized locale maps; missing relations remain null.
 */
export function toCompactAncestors(row: CompactAncestorRow) {
  const normalize = (ancestor: CompactAncestorRow['organisation']) =>
    ancestor ? { ...ancestor, i18n: transformI18nSafely(ancestor.i18n ?? []) } : null
  return { organisation: normalize(row.organisation), project: normalize(row.project) }
}
