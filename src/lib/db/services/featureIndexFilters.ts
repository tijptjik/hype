// DRIZZLE
import { eq, not, sql, type SQL } from 'drizzle-orm'
// DB
import { feature, project } from '#lib/db/schema/index.js'
import { normalizeProjectLicense } from './licence.js'
// I18N
import { contentStorageTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureIndexFilters } from '#lib/features/indexQuery.js'

// TABLE OF CONTENTS
// 1. Status and content predicates
// 2. Translation and field predicates
// 3. Project licence predicates

export const featureIndexStatusKeys = [
  'isPublished',
  'isArchived',
  'isPendingReview',
  'isIntangible',
  'isVisitable',
] as const

/** Compile view predicates without hydrating features or relation graphs.
 * @param filters Validated view filters, also used by optimistic local filtering.
 * @returns SQL predicates ANDed with trusted authorization, hub and prism conditions.
 * @remarks All variable field IDs travel in one JSON binding; only fixed column names enter SQL.
 */
export function featureIndexFilterConditions(filters: FeatureIndexFilters = {}): SQL[] {
  const result: SQL[] = []
  if (filters.origin === 'unknown')
    result.push(
      sql`NOT EXISTS(SELECT 1 FROM featureOrigin fo WHERE fo.featureId=${feature.id})`,
    )
  else if (filters.origin)
    result.push(
      sql`EXISTS(SELECT 1 FROM featureOrigin fo WHERE fo.featureId=${feature.id} AND fo.origin=${filters.origin})`,
    )
  if (filters.origin === 'field_research' && filters.originId)
    result.push(
      sql`EXISTS(SELECT 1 FROM featureOrigin fo WHERE fo.featureId=${feature.id} AND fo.originId=${filters.originId} AND fo.origin='field_research')`,
    )
  const require = (state: boolean | null | undefined, predicate: SQL): void => {
    if (state != null) result.push(state ? predicate : not(predicate))
  }
  for (const key of featureIndexStatusKeys) {
    const value = filters[key]
    if (value != null)
      result.push(eq(feature[key], key === 'isPendingReview' ? !value : value))
  }
  for (const [key, field, generated] of [
    ['hasTitle', 'title', 'titleGen'],
    ['hasDescription', 'description', 'descriptionGen'],
    ['hasDisplayAddress', 'displayAddress', null],
  ] as const) {
    require(filters[
      key
    ], sql`exists(select 1 from featureI18n fi where fi.featureId = ${feature.id}
      and length(fi.${sql.identifier(field)}) > 1
      ${generated ? sql`and coalesce(fi.${sql.identifier(generated)}, 0) = 0` : sql``})`)
  }
  require(filters.hasLocation, sql`exists(select 1 from featureLocation fl where fl.featureId=${feature.id})`)
  const images = sql`exists(select 1 from featureImage fi where fi.featureId = ${feature.id})`
  const published = sql`exists(select 1 from featureImage fi where fi.featureId = ${feature.id} and fi.isPublished = 1)`
  const unpublished = sql`exists(select 1 from featureImage fi where fi.featureId = ${feature.id} and fi.isPublished = 0)`
  require(filters.hasImage, images)
  if (filters.isOneImagePublished != null || filters.isAllImagePublished != null)
    result.push(images)
  require(filters.isOneImagePublished, published)
  require(filters.isAllImagePublished, not(unpublished))

  // Translation controls describe the combined status across all selected locales.
  const active = Object.entries(filters.translationLocales ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
  for (const [key, field, generated] of [
    ['isTitleTranslated', 'title', 'titleGen'],
    ['isDescriptionTranslated', 'description', 'descriptionGen'],
    ['isAddressTranslated', 'displayAddress', 'displayAddressGen'],
  ] as const) {
    const values = active
      .map(locale => filters[key]?.[locale as 'en'])
      .filter(value => value != null)
    if (!values.length) continue
    const manual = sql`length(fi.${sql.identifier(field)}) > 0 and coalesce(fi.${sql.identifier(generated)}, 0) = 0`
    const hasSource = sql`exists(select 1 from featureI18n fi where fi.featureId = ${feature.id} and ${manual})`
    const allTranslated = sql`not exists(select 1 from json_each(${JSON.stringify(active.map(contentStorageTag))}) target
      where not exists(select 1 from featureI18n fi where fi.featureId = ${feature.id}
        and fi.locale = target.value and ${manual}))`
    result.push(hasSource)
    for (const value of new Set(values)) require(value, allTranslated)
  }
  const specifierValues = active
    .map(locale => filters.isSpecifierTranslated?.[locale as 'en'])
    .filter(value => value != null)
  if (specifierValues.length) {
    const source = sql`exists(select 1 from featurePropertyI18n fp where fp.featureId = ${feature.id} and length(trim(fp.value)) > 0)`
    const generated = sql`exists(select 1 from featurePropertyI18n fp where fp.featureId = ${feature.id} and coalesce(fp.valueGen, 1) != 0)`
    for (const value of new Set(specifierValues))
      require(value, sql`(not ${source} or not ${generated})`)
  }

  // Correlated PK lookups preserve absence semantics without multiplying feature rows.
  const properties = Object.entries(filters.properties ?? {}).filter(
    ([, state]) => state != null,
  )
  if (properties.length)
    result.push(sql`not exists(
    select 1 from json_each(${JSON.stringify(Object.fromEntries(properties))}) wanted
    join property p on p.id = wanted.key
    where p.type in ('classifier', 'specifier') and wanted.value != exists(
      select 1 from featureProperty fp where fp.featureId = ${feature.id} and fp.propertyId = p.id and (
        (p.type = 'classifier' and p.component = 'RangeField' and length(fp.value) > 0) or
        (p.type = 'classifier' and p.component != 'RangeField' and length(fp.propertyValueId) > 0) or
        (p.type = 'specifier' and p.isTranslatable = 0 and length(fp.value) > 0) or
        (p.type = 'specifier' and p.isTranslatable = 1 and exists(
          select 1 from featurePropertyI18n pi where pi.featureId = fp.featureId and pi.propertyId = fp.propertyId and length(pi.value) > 0))
      )
    )
  )`)
  return result
}

/** Resolve licence semantics through the canonical normalizer, once per project.
 * @param db Request database.
 * @param filters Validated view filters.
 * @param projectColumn Project identity on the resource being filtered.
 * @returns A compact project-membership predicate, never a feature hydration query.
 * @remarks Legacy licence labels and defaults must match the client normalizer exactly.
 */
export async function featureIndexLicenseConditions(
  db: Database,
  filters: FeatureIndexFilters = {},
  projectColumn: SQL = sql`${feature.projectId}`,
): Promise<SQL[]> {
  const keys = [
    'isAllRightsReserved',
    'isPublicDomain',
    'hasLicenseBy',
    'hasLicenseSa',
    'hasLicenseNc',
    'hasLicenseNd',
  ] as const
  const active = keys.filter(key => filters[key] != null)
  if (!active.length) return []
  const projects = await db
    .select({ id: project.id, license: project.license })
    .from(project)
  const ids = projects
    .filter(row => {
      if (!row.license) return false
      const license = normalizeProjectLicense(row.license)
      const values = {
        isAllRightsReserved: license.meta.isAllRightsReserved,
        isPublicDomain: license.meta.isPublicDomain,
        hasLicenseBy: license.media.all.BY,
        hasLicenseSa: license.media.all.SA,
        hasLicenseNc: license.media.all.NC,
        hasLicenseNd: license.media.all.ND,
      }
      return active.every(key => values[key] === filters[key])
    })
    .map(row => row.id)
  return [
    sql`${projectColumn} in (select value from json_each(${JSON.stringify(ids)}))`,
  ]
}
