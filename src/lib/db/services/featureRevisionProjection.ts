// DRIZZLE
import { eq, getTableColumns, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '../schema/feature'
import { featureImage } from '../schema/image'
import { featureLocation } from '../schema/location'
import { featureLocationMembership } from '../schema/locationRelationships'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import {
  featureRevisionBaseName,
  featureRevisionNameOverride,
} from '#lib/revisions/featureNaming.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { parseFeatureRevisionSource } from './featureRevisionContent'
import { prepareRevisionCheck } from './revisionBatch'
import { featureLayerAfterStatus } from './historicalLayers'
import {
  prepareFeatureGalleryProjection,
  featureGalleryMatches,
} from './featureGalleryRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
import type { RevisionProjection } from './featureRevision'
import type { FeatureRevisionSource } from './featureRevisionSource'

type EditorialRows = {
  i18n: {
    locale: string
    title: string
    baseName: string
    nameOverride: string | null
    autoTranslated: typeof featureI18n.$inferSelect.autoTranslated
    translationProvenance: typeof featureI18n.$inferSelect.translationProvenance
    titleGen: boolean
    description: string | null
    descriptionGen: boolean
    displayAddress: string | null
    displayAddressGen: boolean
    addressProperties: FeatureRevisionContent['translations'][string]['address']['properties']
  }[]
  properties: Omit<typeof featureProperty.$inferSelect, 'featureId'>[]
  propertyI18n: Omit<typeof featurePropertyI18n.$inferSelect, 'featureId'>[]
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. EXACT PROJECTION COMPARISONS
// - jsonEqual
// - exactRows
// - editorialRows
// - editorialGuard
// 2. ATOMIC EDITORIAL PROJECTION
// - prepareFeatureEditorialProjection
// ---

/********************
 *  1. EXACT PROJECTION COMPARISONS
 ************/
// +++ Exact Projection Comparisons

/**
 * Compares JSON meaning without treating object member order as an authored edit.
 * @param left Persisted JSON text or SQL NULL.
 * @param right Expected JSON text or SQL NULL.
 * @returns Symmetric tree comparison; array ordering and JSON types remain significant.
 */
function jsonEqual(left: SQL, right: SQL): SQL {
  return sql`NOT EXISTS (SELECT fullkey,type,atom FROM json_tree(COALESCE(${left},'null'))
    EXCEPT SELECT fullkey,type,atom FROM json_tree(COALESCE(${right},'null')))
    AND NOT EXISTS (SELECT fullkey,type,atom FROM json_tree(COALESCE(${right},'null'))
    EXCEPT SELECT fullkey,type,atom FROM json_tree(COALESCE(${left},'null')))`
}

/**
 * Checks an exact owned row set with a fixed number of SQL bindings.
 * @param table Trusted relation schema with a featureId owner.
 * @param featureId Target Feature identity.
 * @param expected Complete expected rows, excluding the owner key from comparisons.
 * @returns Row-count and value predicate; no unchecked or unexpected children survive.
 */
function exactRows(
  table: SQLiteTable,
  featureId: string,
  expected: Record<string, unknown>[],
  ignoredColumns: readonly string[] = [],
): SQL {
  const columns = getTableColumns(table)
  const comparisons = Object.entries(columns)
    .filter(
      ([key]) =>
        key !== 'featureId' &&
        key !== 'autoTranslated' &&
        key !== 'isAutomaticOnly' &&
        !ignoredColumns.includes(key),
    )
    .map(([key, column]) => {
      const value = sql`json_extract(expected.value,${sql.raw(`'$.${key}'`)})`
      // title is a derived projection; retained title-only rows still have authored bases.
      if (table === featureI18n && key === 'baseName')
        return sql`COALESCE(${featureI18n.baseName},${featureI18n.title}) IS ${value}`
      return column.dataType === 'json'
        ? jsonEqual(sql`${column}`, value)
        : sql`${column} IS ${value}`
    })
  const editorial =
    'isAutomaticOnly' in columns
      ? sql`COALESCE(${columns.isAutomaticOnly},0)=0`
      : sql`1`
  return sql`(SELECT count(*) FROM ${table} WHERE ${columns.featureId}=${featureId} AND ${editorial})=${expected.length}
    AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${columns.featureId}=${featureId} AND ${editorial}
      AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(expected)}) expected
        WHERE ${sql.join(
          comparisons.map(item => sql`(${item})`),
          sql` AND `,
        )}))`
}

/**
 * Converts authored locale/property content into exact compatibility rows.
 * @param content Strict, complete Feature aggregate.
 * @returns Rows without owner IDs; no shared definition or live-control values are projected.
 */
function editorialRows(content: FeatureRevisionContent): EditorialRows {
  return {
    i18n: Object.entries(content.translations).map(([locale, row]) => ({
      locale,
      title: featureRevisionBaseName(content, locale),
      baseName: featureRevisionBaseName(content, locale),
      nameOverride: featureRevisionNameOverride(content, locale),
      autoTranslated: null,
      translationProvenance: row.translationProvenance ?? null,
      titleGen: row.title.generated,
      description: row.description.value,
      descriptionGen: row.description.generated,
      displayAddress: row.address.value,
      displayAddressGen: row.address.generated,
      addressProperties: row.address.properties,
    })),
    properties: Object.entries(content.properties).map(([propertyId, row]) => ({
      propertyId,
      propertyValueId: row.selection.propertyValueId,
      value: row.selection.value,
      valueJson: row.selection.valueJson,
    })),
    propertyI18n: Object.entries(content.properties).flatMap(([propertyId, row]) =>
      Object.entries(row.translations).map(([locale, value]) => ({
        propertyId,
        locale,
        value: value.value,
        valueGen: value.generated,
        autoTranslated: null,
        isAutomaticOnly: false,
        translationProvenance: value.translationProvenance ?? null,
      })),
    ),
  }
}

/**
 * Verifies all editorial parent/child values, independently from live visibility and indexing.
 * @param featureId Target Feature identity.
 * @param content Complete expected authored content.
 * @returns Predicate used before and after applying the projection in the transaction.
 */
function editorialGuard(featureId: string, content: FeatureRevisionContent): SQL {
  const rows = editorialRows(content)
  return sql`EXISTS (SELECT 1 FROM ${feature} WHERE ${feature.id}=${featureId}
    AND ${feature.featureType} IS ${content.profile.featureType ?? null}
    AND (${jsonEqual(sql`${feature.nameTemplate}`, sql`${content.profile.nameTemplate ? JSON.stringify({ rule: content.profile.nameTemplate.rule }) : null}`)})
    AND ${feature.kind} IS ${content.profile.kind ?? null}
    AND ${feature.targetContext} IS ${content.profile.targetContext ?? null}
    AND ${feature.associationRelation} IS ${content.profile.associationRelation ?? null}

    AND ${feature.isIntangible}=${Number(content.profile.isIntangible)}
    AND ${feature.isVisitable}=${Number(content.profile.visitability.isVisitable)}
    AND ${feature.visitableAsOf} IS ${content.profile.visitability.asOf}
    AND (${jsonEqual(sql`${feature.geometry}`, sql`${JSON.stringify(content.placement.geometry)}`)})
    AND (${jsonEqual(sql`${feature.addressMeta}`, sql`${content.placement.addressMeta === null ? null : JSON.stringify(content.placement.addressMeta)}`)}))
    AND (${exactRows(featureI18n, featureId, rows.i18n, ['title'])})
    AND (${exactRows(featureProperty, featureId, rows.properties)})
    AND (${exactRows(featurePropertyI18n, featureId, rows.propertyI18n)})`
}

/**
 * Checks the complete authored projection for trusted Location/cascade/identity writers.
 * @param featureId Exact Feature identity.
 * @param content Validated authored snapshot expected before or after the domain mutation.
 * @returns Transactional predicate excluding workflow controls, derived values and shared labels.
 * @remarks Gallery order/captions and image pins live in the revision itself. Association
 * actor attribution lives in Location history; every accepted reference and owned value is checked.
 */
export function featureContentProjectionMatches(
  featureId: string,
  content: FeatureRevisionContent,
): SQL {
  const accepted = content.placement.location
  const location = accepted
    ? [
        {
          locationId: accepted.locationId,
          version: accepted.associationVersion,
          factsRevisionId: accepted.factsRevisionId,
          locationRevisionId: accepted.locationRevisionId,
          overrides: accepted.acceptedOverrides,
          factsOrganisationRevision: accepted.factsOrganisationRevision,
          locationOrganisationRevision: accepted.locationOrganisationRevision,
          occupancyRevisionId: accepted.occupancyRevisionId,
          addressRevisionId: accepted.addressRevisionId,
          membershipRevisionIds: accepted.membershipRevisionIds,
          placementOverrides: accepted.placementOverrides,
          acceptedGeometry: accepted.acceptedGeometry,
          acceptancePolicy: accepted.acceptancePolicy,
          acceptanceProposalId: accepted.acceptanceProposalId,
        },
      ]
    : []
  return sql`(${editorialGuard(featureId, content)})
    AND (${exactRows(featureLocation, featureId, location, ['actorId'])})
    AND (${exactRows(featureLocationMembership, featureId, accepted?.memberships ?? [])})
    AND (${featureGalleryMatches(featureId, content.gallery)})
    AND EXISTS (SELECT 1 FROM feature WHERE id=${featureId} AND (${jsonEqual(
      sql`json_extract(localLocationBrands,'$.brands')`,
      sql`${content.detachedBrands === null ? null : JSON.stringify(content.detachedBrands)}`,
    )}))`
}

// ---
/********************
 *  2. ATOMIC EDITORIAL PROJECTION
 ************/
// +++ Atomic Editorial Projection

/**
 * Prepares full editorial projection replacement behind exact source and content fences.
 * @param db Request database.
 * @param input Authorized identity, private captured source, current head content and validated result.
 * @returns Unexecuted statements and full verification for atomic acceptance/publication.
 * @remarks This first adapter supports profile, translations, property values and unlinked
 * geometry/address edits. Gallery edits compose a dedicated projection; brand and linked Location changes require their dedicated
 * revision/evidence writers and are refused here. It never writes shared corrections,
 * definitions, image metadata, ancestry or visibility. Execute only inside the acceptance
 * batch; the caller must authorize the actual delta and validate current field eligibility.
 */
export function prepareFeatureEditorialProjection(
  db: Database,
  input: {
    featureId: string
    source: FeatureRevisionSource
    previous: FeatureRevisionContent
    content: FeatureRevisionContent
    gallery?: { actorId: string; attachmentGuard?: SQL }
    /** Trusted identity-review writer, after source selection and scope validation. */
    identity?: { actorId: string; preserveDraft?: boolean }
  },
): RevisionProjection {
  const previous = FeatureRevisionContentSchema.parse(input.previous)
  const content = FeatureRevisionContentSchema.parse(input.content)
  // Ordinary revision edits cannot bypass subject validation through a profile patch.
  if ((previous.profile.featureType ?? null) !== (content.profile.featureType ?? null))
    throw new Error('Feature type changes require explicit reclassification')
  for (const key of ['kind', 'targetContext', 'associationRelation'] as const)
    if ((previous.profile[key] ?? null) !== (content.profile[key] ?? null))
      throw new Error(
        'Feature location intent changes require explicit reclassification',
      )
  const source = parseFeatureRevisionSource(input.source.snapshot)
  if (source.record.id !== input.featureId)
    throw new Error('Projection source belongs to another Feature')
  const galleryChanged = !equalRevisionValue(previous.gallery, content.gallery)
  if (galleryChanged && !input.gallery)
    throw new Error('Gallery edits require the image revision projection')
  const brandsChanged = !equalRevisionValue(
    previous.detachedBrands,
    content.detachedBrands,
  )
  if (
    !input.identity &&
    brandsChanged &&
    (!input.gallery?.actorId ||
      previous.placement.location ||
      content.placement.location)
  )
    throw new Error('Shared brand edits require separate Location review')
  if (
    !input.identity &&
    (previous.placement.location || content.placement.location) &&
    (!equalRevisionValue(
      previous.placement as RevisionValue,
      content.placement as RevisionValue,
    ) ||
      previous.profile.isIntangible !== content.profile.isIntangible)
  )
    throw new Error('Linked Location edits require separate accepted evidence')
  if (!input.identity && previous.placement.location) {
    // Feature-owned properties may change; linked phone overrides require accepted Location evidence.
    for (const id of new Set([
      ...Object.keys(previous.properties),
      ...Object.keys(content.properties),
    ])) {
      const before = previous.properties[id],
        after = content.properties[id]
      if (
        (before?.selection.definition.key === 'phoneNumber' ||
          after?.selection.definition.key === 'phoneNumber') &&
        !equalRevisionValue(before ?? null, after ?? null)
      )
        throw new Error('Linked phone edits require separate Location override review')
    }
    const inherited =
      previous.placement.location.acceptancePolicy?.nameMode !== 'independent'
    for (const locale of new Set([
      ...Object.keys(previous.translations),
      ...Object.keys(content.translations),
    ])) {
      const before = previous.translations[locale],
        after = content.translations[locale]
      if (
        !before ||
        !after ||
        !equalRevisionValue(before.address, after.address) ||
        (inherited && !equalRevisionValue(before.title, after.title))
      )
        throw new Error(
          'Inherited names and addresses require separate Location review',
        )
    }
  }

  const accepted = previous.placement.location
  const expectedLocation = accepted
    ? [
        {
          featureId: input.featureId,
          locationId: accepted.locationId,
          version: accepted.associationVersion,
          actorId: source.location[0]?.actorId ?? null,
          factsRevisionId: accepted.factsRevisionId,
          locationRevisionId: accepted.locationRevisionId,
          overrides: accepted.acceptedOverrides,
          factsOrganisationRevision: accepted.factsOrganisationRevision,
          locationOrganisationRevision: accepted.locationOrganisationRevision,
          occupancyRevisionId: accepted.occupancyRevisionId,
          addressRevisionId: accepted.addressRevisionId,
          membershipRevisionIds: accepted.membershipRevisionIds,
          placementOverrides: accepted.placementOverrides,
          acceptedGeometry: accepted.acceptedGeometry,
          acceptancePolicy: accepted.acceptancePolicy,
          acceptanceProposalId: accepted.acceptanceProposalId,
        },
      ]
    : []
  const detached = source.record.localLocationBrands
  const sourceBrands =
    detached && typeof detached === 'object' && !Array.isArray(detached)
      ? detached.brands
      : null
  if (!equalRevisionValue(sourceBrands ?? null, previous.detachedBrands))
    throw new Error('Detached brand projection differs from its revision')
  if (
    source.galleryLinks.length !== Object.keys(previous.gallery.entries).length ||
    source.galleryLinks.some(row => {
      const entry =
        typeof row.imageId === 'string' &&
        Object.hasOwn(previous.gallery.entries, row.imageId)
          ? previous.gallery.entries[row.imageId]
          : undefined
      return (
        !entry ||
        entry.intent !== row.intent ||
        entry.isPublished !== (row.localIsPublished ?? row.isPublished)
      )
    })
  )
    throw new Error('Gallery projection differs from its revision')

  const rows = editorialRows(content)
  // Cache writes are independent of publication; preserve them while rebuilding editorial rows.
  for (const row of rows.i18n) {
    const stored = source.translations.find(value => value.locale === row.locale)
    row.autoTranslated = (stored?.autoTranslated ?? null) as typeof row.autoTranslated
  }
  const galleryProjection =
    galleryChanged && input.gallery
      ? prepareFeatureGalleryProjection(db, {
          ...input.gallery,
          featureId: input.featureId,
          previous: previous.gallery,
          gallery: content.gallery,
          publication: Object.fromEntries(
            source.galleryLinks.map(row => [
              String(row.imageId),
              {
                publisherId:
                  typeof row.publisherId === 'string' ? row.publisherId : null,
                publishedAt:
                  typeof row.publishedAt === 'string' ? row.publishedAt : null,
              },
            ]),
          ),
        })
      : null
  const properties = JSON.stringify(rows.properties)
  // Recheck reference ownership inside the batch; removed definitions/options cannot create dangling values.
  const references = sql`NOT EXISTS (SELECT 1 FROM json_each(${properties}) expected
    WHERE NOT EXISTS (SELECT 1 FROM property WHERE id=json_extract(expected.value,'$.propertyId'))
    OR (json_extract(expected.value,'$.propertyValueId') IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM propertyValue WHERE id=json_extract(expected.value,'$.propertyValueId')
        AND propertyId=json_extract(expected.value,'$.propertyId')))
    OR EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(expected.value,'$.valueJson'),'{}'), '$.propertyValueIds') selected
      WHERE NOT EXISTS(SELECT 1 FROM propertyValue WHERE id=selected.value AND propertyId=json_extract(expected.value,'$.propertyId'))))`
  const geometryChanged = !equalRevisionValue(
    previous.placement.geometry as RevisionValue,
    content.placement.geometry as RevisionValue,
  )
  const modifiedAt =
    typeof source.record.modifiedAt === 'string'
      ? Date.parse(source.record.modifiedAt)
      : 0
  const recordChanges: Partial<typeof feature.$inferInsert> = {
    modifiedAt: new Date(Math.max(Date.now(), (modifiedAt || 0) + 1)).toISOString(),
  }
  // Reserved children become ordinary identities inside this publication batch before
  // Location scope triggers validate their accepted association; they remain unpublished.
  if (input.identity && !input.identity.preserveDraft && source.record.isDraft)
    recordChanges.isDraft = false
  if (brandsChanged)
    recordChanges.localLocationBrands =
      content.detachedBrands === null
        ? null
        : {
            brands: content.detachedBrands,
            revision: crypto.randomUUID(),
            actorId: input.identity?.actorId ?? input.gallery!.actorId,
          }
  const associationChanged = !equalRevisionValue(
    previous.placement.location,
    content.placement.location,
  )
  if (input.identity && associationChanged && !content.placement.location)
    recordChanges.localLocationBrands = {
      brands: content.detachedBrands ?? [],
      revision: crypto.randomUUID(),
      actorId: input.identity.actorId,
      sourceAssociationRevision: previous.placement.location?.associationVersion,
    }
  if (
    !equalRevisionValue(
      previous.profile.nameTemplate ?? null,
      content.profile.nameTemplate ?? null,
    )
  )
    recordChanges.nameTemplate = content.profile.nameTemplate
      ? { rule: content.profile.nameTemplate.rule }
      : null
  // Avoid firing lifecycle/location triggers for fields this editorial change did not edit.
  if (previous.profile.isIntangible !== content.profile.isIntangible)
    recordChanges.isIntangible = content.profile.isIntangible
  if (
    previous.profile.visitability.isVisitable !==
    content.profile.visitability.isVisitable
  )
    recordChanges.isVisitable = content.profile.visitability.isVisitable
  if (previous.profile.visitability.asOf !== content.profile.visitability.asOf)
    recordChanges.visitableAsOf = content.profile.visitability.asOf
  if (geometryChanged) {
    recordChanges.geometry = content.placement.geometry
    recordChanges.spatialIndex = createFeatureSpatialIndex(content.placement.geometry)
  }
  if (
    !equalRevisionValue(previous.placement.addressMeta, content.placement.addressMeta)
  )
    recordChanges.addressMeta = content.placement
      .addressMeta as typeof feature.$inferInsert.addressMeta
  const retainedControls = [
    'organisationId',
    'projectId',
    'layerId',
    'contributorId',
    'createdAt',
    'isArchived',
    'localIsArchived',
    'localLocationBrands',
  ] as const
  const columns = getTableColumns(feature)
  const controls = retainedControls
    .filter(
      key =>
        !(brandsChanged || (input.identity && associationChanged)) ||
        key !== 'localLocationBrands',
    )
    .map(key =>
      key === 'layerId' &&
      previous.profile.isIntangible !== content.profile.isIntangible
        ? sql`${feature.layerId} IS ${featureLayerAfterStatus(String(source.record.layerId), content.profile.isIntangible)}`
        : columns[key].dataType === 'json'
          ? jsonEqual(
              sql`${columns[key]}`,
              sql`${source.record[key] === null ? null : JSON.stringify(source.record[key])}`,
            )
          : sql`${columns[key]} IS ${typeof source.record[key] === 'boolean' ? Number(source.record[key]) : source.record[key]}`,
    )
  const statements: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`(${input.source.unchanged}) AND (${editorialGuard(input.featureId, previous)}) AND (${references})
      AND (${exactRows(featureLocation, input.featureId, expectedLocation)})
      AND (${exactRows(featureLocationMembership, input.featureId, accepted?.memberships ?? [])})`,
    ),
    db.update(feature).set(recordChanges).where(eq(feature.id, input.featureId)),
    prepareRevisionCheck(db, sql`changes()=1`),
    db
      .delete(featurePropertyI18n)
      .where(
        sql`${featurePropertyI18n.featureId}=${input.featureId} AND (COALESCE(${featurePropertyI18n.isAutomaticOnly},0)=0 OR ${featurePropertyI18n.propertyId} NOT IN (SELECT value FROM json_each(${JSON.stringify(rows.properties.map(row => row.propertyId))})))`,
      ),
    db.delete(featureProperty).where(eq(featureProperty.featureId, input.featureId)),
    db
      .delete(featureI18n)
      .where(
        sql`${featureI18n.featureId}=${input.featureId} AND COALESCE(${featureI18n.isAutomaticOnly},0)=0`,
      ),
  ]
  // Identity review adopts only server-selected, already-accepted Location evidence.
  if (input.identity && associationChanged) {
    statements.push(
      db
        .delete(featureLocationMembership)
        .where(eq(featureLocationMembership.featureId, input.featureId)),
    )
    const next = content.placement.location
    if (!next) {
      statements.push(
        db
          .delete(featureLocation)
          .where(eq(featureLocation.featureId, input.featureId)),
      )
      // The unlink trigger consumes attribution before the temporary wrapper is cleared.
      // A null detached-brand value must remain null in the accepted projection.
      if (content.detachedBrands === null)
        statements.push(
          db
            .update(feature)
            .set({ localLocationBrands: null })
            .where(eq(feature.id, input.featureId)),
        )
    } else {
      const values = {
        featureId: input.featureId,
        locationId: next.locationId,
        version: next.associationVersion,
        actorId: input.identity.actorId,
        factsRevisionId: next.factsRevisionId,
        locationRevisionId: next.locationRevisionId,
        overrides: next.acceptedOverrides,
        factsOrganisationRevision: next.factsOrganisationRevision,
        locationOrganisationRevision: next.locationOrganisationRevision,
        occupancyRevisionId: next.occupancyRevisionId,
        addressRevisionId: next.addressRevisionId,
        membershipRevisionIds: next.membershipRevisionIds,
        placementOverrides: next.placementOverrides,
        acceptedGeometry: next.acceptedGeometry,
        acceptancePolicy: next.acceptancePolicy,
        acceptanceProposalId: next.acceptanceProposalId,
      } as typeof featureLocation.$inferInsert
      statements.push(
        db
          .insert(featureLocation)
          .values(values)
          .onConflictDoUpdate({ target: featureLocation.featureId, set: values }),
      )
      // Legacy grouping triggers derive rows on association writes; restore the exact accepted bindings.
      statements.push(
        db
          .delete(featureLocationMembership)
          .where(eq(featureLocationMembership.featureId, input.featureId)),
      )
      for (const member of next.memberships)
        statements.push(
          db
            .insert(featureLocationMembership)
            .values({ ...member, featureId: input.featureId }),
        )
    }
  }
  // Each child insert stays below the binding limit; all rows execute in this same batch.
  for (const row of rows.i18n)
    statements.push(
      db
        .delete(featureI18n)
        .where(
          sql`${featureI18n.featureId}=${input.featureId} AND ${featureI18n.locale}=${row.locale} AND ${featureI18n.isAutomaticOnly}=1`,
        ),
      db.insert(featureI18n).values({
        ...row,
        featureId: input.featureId,
        addressProperties:
          row.addressProperties as typeof featureI18n.$inferInsert.addressProperties,
      }),
    )
  for (const row of rows.properties)
    statements.push(
      db.insert(featureProperty).values({ ...row, featureId: input.featureId }),
    )
  for (const row of rows.propertyI18n)
    statements.push(
      db
        .delete(featurePropertyI18n)
        .where(
          sql`${featurePropertyI18n.featureId}=${input.featureId} AND ${featurePropertyI18n.propertyId}=${row.propertyId} AND ${featurePropertyI18n.locale}=${row.locale} AND ${featurePropertyI18n.isAutomaticOnly}=1`,
        ),
      db.insert(featurePropertyI18n).values({
        ...row,
        featureId: input.featureId,
        autoTranslated:
          (source.propertyTranslations.find(
            prior => prior.propertyId === row.propertyId && prior.locale === row.locale,
          )
            ?.autoTranslated as typeof featurePropertyI18n.$inferInsert.autoTranslated) ??
          null,
      }),
    )
  if (galleryProjection) statements.push(...galleryProjection.statements)
  return {
    statements,
    afterPublication: [
      db
        .update(featureImage)
        .set({
          isPublished: sql`EXISTS(SELECT 1 FROM feature f WHERE f.id=${input.featureId} AND f.isPublished=1 AND f.isArchived=0)
          AND EXISTS(SELECT 1 FROM image i WHERE i.id=featureImage.imageId AND i.isArchived=0)
          AND EXISTS (SELECT 1 FROM json_each(${JSON.stringify(content.gallery.entries)}) entry
        WHERE entry.key=${featureImage.imageId} AND json_extract(entry.value,'$.isPublished')=1)`,
        })
        .where(eq(featureImage.featureId, input.featureId)),
    ],
    verify: sql`(${featureContentProjectionMatches(input.featureId, content)})
      AND EXISTS (SELECT 1 FROM feature WHERE feature.id=${input.featureId} AND ${sql.join(
        controls.map(item => sql`(${item})`),
        sql` AND `,
      )})
      AND (${galleryProjection?.verify ?? exactRows(featureImage, input.featureId, source.galleryLinks, ['isPublished'])})
      AND (${input.identity ? sql`1` : exactRows(featureLocation, input.featureId, source.location)})
      AND (${input.identity ? sql`1` : exactRows(featureLocationMembership, input.featureId, source.locationMemberships)})`,
  }
}
