// DRIZZLE
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  hub,
  hubI18n,
  organisation,
  organisationI18n,
  project,
  projectI18n,
  layer,
  layerI18n,
  featurePropertyI18n,
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema'
// TRANSLATION
import { translateContentField } from '#lib/api/external/translation.js'
import {
  adaptContentMap,
  canonicalContentTag,
  contentStorageTag,
} from '#lib/i18n/contentRecords.js'
import { resolveContentField, type AutomaticTranslation } from '#lib/i18n/automatic.js'
import { signAutomaticTranslation } from '#lib/i18n/automaticReceipt.server.js'
// TYPES
import type { Database } from '#lib/types.js'

export type TranslationResource =
  | 'feature'
  | 'hub'
  | 'organisation'
  | 'project'
  | 'layer'
  | 'property'
  | 'propertyValue'
  | 'featureProperty'
const configurations = {
  featureProperty: {
    table: featurePropertyI18n,
    parent: feature,
    owner: featurePropertyI18n.featureId,
    fields: ['value'],
  },
  property: {
    table: propertyI18n,
    parent: property,
    owner: propertyI18n.propertyId,
    fields: ['label', 'placeholder'],
  },
  propertyValue: {
    table: propertyValueI18n,
    parent: property,
    owner: propertyValueI18n.propertyValueId,
    fields: ['value'],
  },
  feature: {
    table: featureI18n,
    parent: feature,
    owner: featureI18n.featureId,
    fields: ['title', 'description'],
  },
  hub: {
    table: hubI18n,
    parent: hub,
    owner: hubI18n.hubId,
    fields: [
      'name',
      'nameShort',
      'description',
      'subscriptionBenefits',
      'privacyPolicy',
      'termsOfService',
    ],
  },
  organisation: {
    table: organisationI18n,
    parent: organisation,
    owner: organisationI18n.organisationId,
    fields: ['name', 'nameShort', 'description'],
  },
  project: {
    table: projectI18n,
    parent: project,
    owner: projectI18n.projectId,
    fields: ['name', 'nameShort', 'description'],
  },
  layer: {
    table: layerI18n,
    parent: layer,
    owner: layerI18n.layerId,
    fields: ['name', 'nameShort', 'description'],
  },
} as const

/** Generate reusable translations from current published fields, independently of editorial approval.
 * @param options Already-authorized record, requested targets and provider bindings.
 * @returns Current locale rows after bounded generation; failures leave published fallbacks usable.
 * @remarks Never writes published text or revision content. Each cache write rechecks the source
 * text and parent modification token, and merges one field without overwriting concurrent jobs.
 */
export async function cacheResourceTranslations(options: {
  db: Database
  resource: TranslationResource
  id: string
  targets: readonly string[]
  key?: string
  region?: string
  secret?: string
  expectedModifiedAt?: string
  candidates?: Record<string, Record<string, AutomaticTranslation>>
  authorizedRows?: Record<string, unknown>
  propertyId?: string
}): Promise<Record<string, unknown>> {
  const { db, resource, id, key, secret } = options
  const config = configurations[resource]
  if (resource === 'featureProperty' && !options.propertyId) return {}
  const scope =
    resource === 'featureProperty'
      ? eq(featurePropertyI18n.propertyId, options.propertyId ?? '')
      : sql`1`
  const parentId =
    resource === 'propertyValue'
      ? (
          await db
            .select({ id: propertyValue.propertyId })
            .from(propertyValue)
            .where(eq(propertyValue.id, id))
            .limit(1)
        )[0]?.id
      : id
  if (!parentId) return {}
  const parent = (
    await db
      .select({ modifiedAt: config.parent.modifiedAt })
      .from(config.parent)
      .where(eq(config.parent.id, parentId))
      .limit(1)
  )[0]
  if (
    !parent ||
    (options.expectedModifiedAt && options.expectedModifiedAt !== parent.modifiedAt)
  )
    return {}
  const read = async (): Promise<Record<string, unknown>> =>
    Object.fromEntries(
      (
        await db
          .select()
          .from(config.table)
          .where(and(eq(config.owner, id), scope))
      ).map(row => [row.locale, row]),
    )
  const stored = await read()
  // Reader requests use only the normal query's projected content as translation sources.
  const rows = options.authorizedRows
    ? adaptContentMap(options.authorizedRows, contentStorageTag)
    : stored
  const columns = getTableColumns(config.table)
  const targets = [...new Set(options.targets.map(canonicalContentTag))].slice(0, 32)
  // Sequential fields bound provider spend; callers schedule this outside the save response.
  for (const target of targets)
    for (const field of config.fields) {
      const resolved = resolveContentField(rows, field, target, true)
      if (resolved.locale === target && resolved.kind !== 'missing') continue
      const source = resolveContentField(rows, field, target)
      if (source.kind !== 'published' || !source.locale || source.value.length > 16_000)
        continue
      let automatic = options.candidates?.[target]?.[field]
      if (
        automatic &&
        (automatic.sourceText !== source.value ||
          canonicalContentTag(automatic.sourceLocale) !== source.locale)
      )
        automatic = undefined
      if (!automatic) {
        if (!key || !secret) continue
        const result = await translateContentField(
          { text: source.value, source: source.locale, target },
          options.region ?? 'eastasia',
          key,
        )
        if (result.status !== 'translated') continue
        automatic = result.automatic
        automatic.receipt = await signAutomaticTranslation(automatic, target, secret)
      }
      const required = Object.entries(columns).filter(
        ([name, column]) =>
          column.notNull &&
          column.default === undefined &&
          column !== config.owner &&
          name !== 'locale',
      )
      const insertColumns = [
        config.owner,
        columns.locale,
        ...required.map(([, column]) => column),
        columns.isAutomaticOnly,
        columns.autoTranslated,
      ]
      const insertValues = [
        sql`${id}`,
        sql`${contentStorageTag(target)}`,
        ...required.map(
          ([name]) => sql`${name === 'propertyId' ? options.propertyId : ''}`,
        ),
        sql`1`,
        sql`${JSON.stringify({ [field]: automatic })}`,
      ]
      const fieldColumn = columns[field as keyof typeof columns]
      const genColumn = columns[`${field}Gen` as keyof typeof columns]
      const jsonPath = `$.${field}`
      // Source identity, approval and parent version must still match after the provider returns.
      await db.run(sql`INSERT INTO ${config.table} (${sql.join(
        insertColumns.map(column => sql.identifier(column.name)),
        sql`, `,
      )})
      SELECT ${sql.join(insertValues, sql`, `)} WHERE EXISTS
      (SELECT 1 FROM ${config.parent} WHERE ${config.parent.id}=${parentId} AND ${config.parent.modifiedAt}=${parent.modifiedAt})
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE ${config.owner}=${id} AND ${scope} AND ${columns.locale}=${contentStorageTag(source.locale)}
        AND ${fieldColumn}=${source.value} AND COALESCE(${genColumn},0)=0 AND COALESCE(${columns.isAutomaticOnly},0)=0)
      ON CONFLICT (${sql.join(
        [
          config.owner.name,
          ...(resource === 'featureProperty' ? ['propertyId'] : []),
          columns.locale.name,
        ].map(name => sql.identifier(name)),
        sql`, `,
      )}) DO UPDATE SET autoTranslated=json_set(COALESCE(${columns.autoTranslated},'{}'),${jsonPath},json(${JSON.stringify(automatic)}))
      WHERE COALESCE(${fieldColumn},'')='' OR ${genColumn}=1`)
    }
  const latest = await read()
  if (!options.authorizedRows) return latest
  const visible: Record<string, unknown> = Object.fromEntries(
    Object.entries(rows).map(([locale, row]) => [
      locale,
      { ...(row as Record<string, unknown>), locale, autoTranslated: undefined },
    ]),
  )
  // Return only authorized content and cache entries whose original is still visible.
  for (const target of targets) {
    const locale = contentStorageTag(target)
    const automatic =
      (
        latest[locale] as
          | { autoTranslated?: Record<string, AutomaticTranslation> }
          | undefined
      )?.autoTranslated ?? {}
    const safe = Object.fromEntries(
      Object.entries(automatic).filter(([field, candidate]) => {
        if (!(config.fields as readonly string[]).includes(field)) return false
        const source = resolveContentField(rows, field, candidate.sourceLocale)
        return (
          source.kind === 'published' &&
          source.locale === canonicalContentTag(candidate.sourceLocale) &&
          source.value === candidate.sourceText
        )
      }),
    )
    if (Object.keys(safe).length)
      visible[locale] = {
        ...((visible[locale] as object) ?? { locale, isAutomaticOnly: true }),
        autoTranslated: safe,
      }
  }
  return visible
}
