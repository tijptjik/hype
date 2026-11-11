import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '../formParentSection/formParentSection.types'

export type FeatureSetupResults = {
  organisations: ParentSectionOrganisationItem[]
  projects: ParentSectionProjectItem[]
  layers: ParentSectionLayerItem[]
}
export type FeatureSetupScope = { organisationId?: string; projectId?: string }

/** Use the compact hierarchy labels already provided by parent resource records.
 * @param item A selectable parent resource. @returns Short name, name, or stable code.
 */
export function setupResourceLabel(item: {
  code?: string
  id: string
  i18n?: { en?: { name?: string; nameShort?: string } } | null
}): string {
  return item.i18n?.en?.nameShort || item.i18n?.en?.name || item.code || item.id
}

/** Match both full and compact names so hierarchy abbreviations do not hide search results.
 * @param item Parent resource. @param query User search text. @returns Whether any label matches.
 */
export function setupResourceMatches(
  item: Parameters<typeof setupResourceLabel>[0],
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase()
  return [item.code, item.i18n?.en?.name, item.i18n?.en?.nameShort].some(value =>
    value?.toLocaleLowerCase().includes(needle),
  )
}
