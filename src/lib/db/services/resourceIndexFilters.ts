// DRIZZLE
import { not, sql, type SQL } from 'drizzle-orm'
// SERVICES
import { featureIndexLicenseConditions } from './featureIndexFilters.js'
// I18N
import { contentStorageTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  ResourceIndexFilters,
  ResourceIndexType,
} from '#lib/resources/indexQuery.js'

// TABLE OF CONTENTS
// 1. Literal resource search
// 2. Status, content, image, translation and licence predicates

/** Compile literal resource search independently of response hydration.
 * @param type Validated resource family.
 * @param query Literal search text.
 * @returns A predicate over base identity and localized fields.
 */
export function resourceIndexSearchCondition(
  type: ResourceIndexType,
  query: string,
): SQL {
  const table = sql.identifier(type)
  const translations = sql.identifier(`${type}I18n`)
  const foreignKey = sql.identifier(`${type}Id`)
  const needle = query.trim()
  return sql`(instr(lower(${table}.id),lower(${needle}))>0
    ${type !== 'layer' ? sql`OR instr(lower(${table}.code),lower(${needle}))>0` : sql``}
    ${type === 'hub' ? sql`OR instr(lower(${table}.domain),lower(${needle}))>0` : sql``}
    OR EXISTS(SELECT 1 FROM ${translations} ri WHERE ri.${foreignKey}=${table}.id
      AND (instr(lower(ri.name),lower(${needle}))>0
        OR instr(lower(ri.nameShort),lower(${needle}))>0
        OR instr(lower(ri.description),lower(${needle}))>0)))`
}

/** Compile the same view predicates for both matching rows and exact SQL counts.
 * @param db Request database used for canonical licence normalization.
 * @param type Validated resource family.
 * @param filters Current index filters.
 * @returns Predicates that only narrow existing authorization and prism conditions.
 * @remarks Locale sets and licence memberships use JSON bindings, not unbounded IN parameters.
 */
export async function resourceIndexFilterConditions(
  db: Database,
  type: ResourceIndexType,
  filters: ResourceIndexFilters = {},
): Promise<SQL[]> {
  const table = sql.identifier(type)
  const translations = sql.identifier(`${type}I18n`)
  const foreignKey = sql.identifier(`${type}Id`)
  const result: SQL[] = []
  const require = (value: boolean | null | undefined, predicate: SQL): void => {
    if (value != null) result.push(value ? predicate : not(predicate))
  }
  for (const key of ['isArchived', 'isPublished'] as const)
    require(filters[key], sql`${table}.${sql.identifier(key)}=1`)
  const active = Object.entries(filters.translationLocales ?? {})
    .filter(([, enabled]) => enabled)
    .map(([locale]) => locale)

  // Manual authorship uses >1 characters; translation presence uses any nonempty manual text.
  for (const [presence, translation, field] of [
    ['hasName', 'isNameTranslated', 'name'],
    ['hasContextualName', 'isContextualNameTranslated', 'nameShort'],
    ['hasDescription', 'isDescriptionTranslated', 'description'],
  ] as const) {
    const manual = sql`coalesce(ri.${sql.identifier(`${field}Gen`)},0)=0`
    require(filters[presence], sql`EXISTS(SELECT 1 FROM ${translations} ri
      WHERE ri.${foreignKey}=${table}.id AND length(ri.${sql.identifier(field)})>1 AND ${manual})`)
    const values = active
      .map(locale => filters[translation]?.[locale as 'en'])
      .filter(value => value != null)
    if (!values.length) continue
    result.push(sql`EXISTS(SELECT 1 FROM ${translations} ri WHERE ri.${foreignKey}=${table}.id
      AND length(ri.${sql.identifier(field)})>0 AND ${manual})`)
    const complete = sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(active.map(contentStorageTag))}) target
      WHERE NOT EXISTS(SELECT 1 FROM ${translations} ri WHERE ri.${foreignKey}=${table}.id
        AND ri.locale=target.value AND length(ri.${sql.identifier(field)})>0 AND ${manual}))`
    for (const value of new Set(values)) require(value, complete)
  }
  if (type === 'organisation' || type === 'project')
    require(filters.hasImage, sql`EXISTS(SELECT 1 FROM image WHERE image.id=${table}.imageId)`)
  if (type === 'project' || type === 'layer')
    result.push(
      ...(await featureIndexLicenseConditions(
        db,
        filters,
        type === 'project' ? sql`${table}.id` : sql`${table}.projectId`,
      )),
    )
  return result
}
